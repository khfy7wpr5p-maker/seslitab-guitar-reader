import { test } from 'node:test'
import assert from 'node:assert/strict'
import mockProvider from '../backend/providers/MockProvider.js'
import { createHttpOmrProvider } from '../backend/providers/HttpOmrProvider.js'
import { registerRunningOperation, cancelRunningJob, getRunningOperation, releaseRunningOperation, processJob, runQueueEntry } from '../backend/workers/omrWorker.js'
import { handleCancelJob } from '../backend/api/cancelJob.js'
import { handleDeleteJob } from '../backend/api/deleteJob.js'
import * as jobManager from '../backend/jobs/jobManager.js'
import * as storage from '../backend/storage/musicXmlStorage.js'

function validPdf() {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>']
  let pdf = '%PDF-1.7\n'; const offsets = [0]
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n` }
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 4\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf)
}

async function processingJob() {
  const jobId = jobManager.generateJobId()
  await jobManager.createJob({ jobId, fileName: 'test.pdf', provider: 'mock', pdfPath: `/tmp/${jobId}.pdf` })
  await jobManager.updateStatus(jobId, 'queued')
  await jobManager.updateStatus(jobId, 'processing')
  await storage.writePdf(jobId, validPdf())
  return jobId
}

async function discard(jobId) {
  releaseRunningOperation(jobId)
  await storage.deleteJob(jobId)
  await jobManager.deleteJobRecord(jobId)
}

test('gateway job maps cancellation to the exact provider operation', async () => {
  const calls = []
  const provider = { async cancelJob(id) { calls.push(id); return { success: true, terminationConfirmed: true } } }
  registerRunningOperation('job_a', provider, 'provider_a')
  try { assert.equal((await cancelRunningJob('job_a')).success, true); assert.deepEqual(calls, ['provider_a']); assert.equal(getRunningOperation('job_a').cancellationRequested, true) }
  finally { releaseRunningOperation('job_a') }
})

test('repeated gateway cancellation shares one provider request', async () => {
  let calls = 0
  const provider = { async cancelJob() { calls++; return { success: true, terminationConfirmed: true } } }
  registerRunningOperation('job_b', provider, 'provider_b')
  try { await Promise.all([cancelRunningJob('job_b'), cancelRunningJob('job_b')]); assert.equal(calls, 1) }
  finally { releaseRunningOperation('job_b') }
})

test('unconfirmed provider cancellation remains a truthful failure', async () => {
  registerRunningOperation('job_c', { async cancelJob() { return { success: true, terminationConfirmed: false } } }, 'provider_c')
  try { const result = await cancelRunningJob('job_c'); assert.equal(result.success, false); assert.equal(result.terminationConfirmed, false) }
  finally { releaseRunningOperation('job_c') }
})

test('cancellation waits for an active job to publish its provider operation', async () => {
  let releaseRegistration
  const registrationGate = new Promise((resolve) => { releaseRegistration = resolve })
  let cancelCalls = 0
  const provider = {
    async cancelJob(providerJobId) {
      cancelCalls++
      assert.equal(providerJobId, 'provider_race')
      return { success: true, terminationConfirmed: true }
    },
  }

  const worker = runQueueEntry({ jobId: 'race_wait', provider: 'mock' }, 'race-test', {
    processJob: async () => {
      await registrationGate
      registerRunningOperation('race_wait', provider, 'provider_race')
    },
  })

  let settled = false
  const cancellation = cancelRunningJob('race_wait').then((result) => {
    settled = true
    return result
  })

  try {
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(settled, false)

    releaseRegistration()
    const result = await cancellation

    assert.equal(result.success, true)
    assert.equal(result.terminationConfirmed, true)
    assert.equal(cancelCalls, 1)
    await worker
  } finally {
    releaseRegistration()
    await worker
    releaseRunningOperation('race_wait')
  }
})

test('mock provider confirms absence of a live child idempotently', async () => {
  const up = await mockProvider.uploadPdf(Buffer.from('pdf'), 'x.pdf')
  const first = await mockProvider.cancelJob(up.providerJobId)
  const second = await mockProvider.cancelJob(up.providerJobId)
  assert.equal(first.noLiveProcess, true); assert.equal(first.terminationConfirmed, true); assert.equal(second.alreadyClosed, true)
})

test('HTTP provider maps explicit remote confirmation', async () => {
  const provider = createHttpOmrProvider({ apiUrl: 'https://unused.invalid', apiKey: '', timeoutMs: 100 }, { cancelRemote: async () => ({ terminationConfirmed: true }) })
  const up = await provider.uploadPdf(Buffer.from('pdf'), 'x.pdf')
  const result = await provider.cancelJob(up.providerJobId)
  assert.equal(result.success, true); assert.equal(result.terminationConfirmed, true)
})

test('HTTP provider does not confuse local abort with remote confirmation', async () => {
  const provider = createHttpOmrProvider({ apiUrl: 'https://unused.invalid', apiKey: '', timeoutMs: 100 })
  const up = await provider.uploadPdf(Buffer.from('pdf'), 'x.pdf')
  const result = await provider.cancelJob(up.providerJobId)
  assert.equal(result.success, false); assert.equal(result.terminationConfirmed, false)
})

test('cancellation failure preserves processing status and storage', async () => {
  const jobId = await processingJob()
  registerRunningOperation(jobId, { async cancelJob() { return { success: false, terminationConfirmed: false, error: { code: 'CANCELLATION_FAILED', message: 'not closed' } } } }, 'provider_failure')
  try {
    await assert.rejects(handleCancelJob({ jobId }), (err) => err.code === 'CANCELLATION_FAILED')
    assert.equal((await jobManager.getJob(jobId)).status, 'processing')
    assert.equal(await storage.exists(jobId), true)
  } finally { await discard(jobId) }
})

test('confirmed cancellation produces failed/CANCELLED and repeated API call sends one request', async () => {
  const jobId = await processingJob()
  let calls = 0
  registerRunningOperation(jobId, { async cancelJob() { calls++; return { success: true, terminationConfirmed: true } } }, 'provider_confirmed')
  try {
    const first = await handleCancelJob({ jobId })
    const second = await handleCancelJob({ jobId })
    const job = await jobManager.getJob(jobId)
    assert.equal(first.success, true); assert.equal(second.success, true)
    assert.equal(job.status, 'failed'); assert.equal(job.error.code, 'CANCELLED')
    assert.equal(calls, 1)
  } finally { await discard(jobId) }
})

test('running delete waits for confirmed cancellation before deleting', async () => {
  const jobId = await processingJob()
  let confirm
  const gate = new Promise((resolve) => { confirm = resolve })
  registerRunningOperation(jobId, { async cancelJob() { await gate; return { success: true, terminationConfirmed: true } } }, 'provider_delete')
  try {
    const deletion = handleDeleteJob({ jobId })
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(await storage.exists(jobId), true)
    assert.equal((await jobManager.getJob(jobId)).status, 'processing')
    confirm()
    assert.equal((await deletion).success, true)
    assert.equal(await storage.exists(jobId), false)
    await assert.rejects(jobManager.getJob(jobId), (err) => err.code === 'JOB_NOT_FOUND')
  } finally { await discard(jobId) }
})

test('failed running delete preserves job record and storage', async () => {
  const jobId = await processingJob()
  registerRunningOperation(jobId, { async cancelJob() { return { success: false, terminationConfirmed: false } } }, 'provider_delete_failure')
  try {
    await assert.rejects(handleDeleteJob({ jobId }), (err) => err.code === 'CANCELLATION_FAILED')
    assert.equal((await jobManager.getJob(jobId)).status, 'processing')
    assert.equal(await storage.exists(jobId), true)
  } finally { await discard(jobId) }
})

test('worker cannot publish MusicXML or success transitions after cancellation wins', async () => {
  const jobId = jobManager.generateJobId()
  const pdfPath = new URL(`../storage/jobs/${jobId}/input.pdf`, import.meta.url).pathname
  await jobManager.createJob({ jobId, fileName: 'test.pdf', provider: 'mock', pdfPath })
  await storage.writePdf(jobId, validPdf())
  await jobManager.updateStatus(jobId, 'queued')
  const processing = processJob({ jobId, provider: 'mock', pdfPath, fileName: 'test.pdf' }, 'cancel-test-worker')
  try {
    while (!getRunningOperation(jobId)) await new Promise((resolve) => setImmediate(resolve))
    await handleCancelJob({ jobId })
    await assert.rejects(processing)
    const job = await jobManager.getJob(jobId)
    assert.equal(job.status, 'failed')
    assert.equal(job.error.code, 'CANCELLED')
    assert.equal(await storage.readMusicXml(jobId), null)
    assert.equal(job.musicxmlCreatedAt, null)
    assert.equal(job.completedAt, null)
  } finally { await discard(jobId) }
})

test('CANCELLED worker failure is not automatically retried', async () => {
  let enqueues = 0
  const result = await runQueueEntry({ jobId: 'cancel_no_retry', provider: 'mock' }, 'test', {
    processJob: async () => { const error = new Error('cancelled'); error.code = 'CANCELLED'; error.retryable = false; throw error },
    handleFailure: async (_jobId, error) => ({ shouldRetry: error.retryable !== false }),
    enqueue: async () => { enqueues++ },
  })
  assert.equal(result.failed, true)
  assert.equal(enqueues, 0)
})
