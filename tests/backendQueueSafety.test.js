import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { GATEWAY_CONFIG } from '../backend/config/gatewayConfig.js'
import * as queue from '../backend/queue/uploadQueue.js'
import * as worker from '../backend/workers/omrWorker.js'
import * as jobManager from '../backend/jobs/jobManager.js'
import { handleAnalyzePdf } from '../backend/api/analyzePdf.js'
import { handleUploadPdf } from '../backend/api/uploadPdf.js'

beforeEach(() => queue.clear())
after(async () => { if (worker.getWorkerPoolState().started) await worker.stopWorkerPool(); queue.clear() })

function entry(jobId) { return { jobId, provider: 'mock', pdfPath: '/tmp/test.pdf', fileName: 'test.pdf' } }
async function processingJob() {
  const jobId = jobManager.generateJobId()
  await jobManager.createJob({ ...entry(jobId), fileName: 'test.pdf' })
  await jobManager.updateStatus(jobId, 'queued')
  await jobManager.updateStatus(jobId, 'processing')
  return { jobId, job: await jobManager.getJob(jobId) }
}

function validPdf() {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>']
  let pdf = '%PDF-1.7\n'; const offsets = [0]
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n` }
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 4\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf)
}

// 1-2. Configuration
test('1. default worker concurrency is exactly 1', () => assert.equal(GATEWAY_CONFIG.workerPoolSize, 1))
test('2. valid explicit worker concurrency override remains supported', () => {
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', "import('./backend/config/gatewayConfig.js').then(m=>process.stdout.write(String(m.GATEWAY_CONFIG.workerPoolSize)))"], {
    cwd: process.cwd(), env: { ...process.env, SESLITAB_WORKER_POOL_SIZE: '3' }, encoding: 'utf8',
  })
  assert.equal(out, '3')
})

// 3-5. Queue semantics
test('3. duplicate jobId enqueue is idempotent', async () => {
  await queue.enqueue(entry('same'))
  const duplicate = await queue.enqueue(entry('same'))
  assert.equal(duplicate.duplicate, true)
  assert.equal(queue.size(), 1)
  assert.equal(queue.contains('same'), true)
})
test('4. remove leaves no matching pending entry', async () => {
  await queue.enqueue(entry('remove-me'))
  assert.equal(queue.remove('remove-me'), true)
  assert.equal(queue.contains('remove-me'), false)
  assert.equal(queue.remove('remove-me'), false)
})
test('5. priority and FIFO remain stable for distinct jobs', async () => {
  await queue.enqueue({ ...entry('normal-1'), priority: 'normal' })
  await queue.enqueue({ ...entry('high-1'), priority: 'high' })
  await queue.enqueue({ ...entry('normal-2'), priority: 'normal' })
  assert.deepEqual(queue.snapshot().map(x => x.jobId), ['high-1', 'normal-1', 'normal-2'])
})

// 6-9. Pool and ownership
test('6. repeated startWorkerPool does not add loops', async () => {
  const first = worker.startWorkerPool()
  const second = worker.startWorkerPool()
  assert.equal(first.workerCount, 1)
  assert.equal(second.workerCount, 1)
  await worker.stopWorkerPool()
  assert.equal(worker.getWorkerPoolState().started, false)
})
test('7. same job cannot execute concurrently', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  let calls = 0
  const first = worker.runQueueEntry(entry('owned'), 'w1', { processJob: async () => { calls++; await gate } })
  await new Promise(resolve => setImmediate(resolve))
  const second = await worker.runQueueEntry(entry('owned'), 'w2', { processJob: async () => { calls++ } })
  assert.deepEqual(second, { skipped: true, reason: 'already_active' })
  assert.equal(calls, 1)
  release(); await first
})
test('8. ownership releases after success', async () => {
  await worker.runQueueEntry(entry('success'), 'w', { processJob: async () => {} })
  assert.equal(worker.isJobActive('success'), false)
})
test('9. ownership releases after failure', async () => {
  await worker.runQueueEntry(entry('failure'), 'w', {
    processJob: async () => { throw new Error('boom') },
    handleFailure: async () => ({ shouldRetry: false }),
  })
  assert.equal(worker.isJobActive('failure'), false)
})

// 10-15. Retry and worker survival
test('10-11. retryable failure enters real queue once and increments once', async () => {
  const { jobId } = await processingJob()
  const result = await worker.runQueueEntry(entry(jobId), 'w', { processJob: async () => { const e = new Error('transient'); e.retryable = true; throw e } })
  const job = await jobManager.getJob(jobId)
  assert.equal(result.retried, true)
  assert.equal(job.status, 'queued')
  assert.equal(job.retryCount, 1)
  assert.equal(job.workerId, null)
  assert.equal(queue.contains(jobId), true)
  assert.equal(queue.snapshot().filter(x => x.jobId === jobId).length, 1)
})
test('12. failed retry enqueue leaves truthful failed state', async () => {
  const { jobId } = await processingJob()
  const result = await worker.runQueueEntry(entry(jobId), 'w', {
    processJob: async () => { throw new Error('transient') },
    enqueue: async () => { throw new Error('queue unavailable') },
  })
  assert.equal(result.failed, true)
  assert.equal((await jobManager.getJob(jobId)).status, 'failed')
})
test('13. CANCELLED failure is never retried', async () => {
  const { jobId } = await processingJob()
  await jobManager.updateStatus(jobId, 'failed', { error: { code: 'CANCELLED', message: 'cancelled' } })
  const result = await jobManager.handleFailure(jobId, { code: 'WORKER_ERROR', message: 'late failure', retryable: true })
  assert.equal(result.shouldRetry, false)
  assert.equal((await jobManager.getJob(jobId)).retryCount, 0)
  assert.equal(queue.contains(jobId), false)
})
test('14. exhausted retry limit does not enqueue', async () => {
  const { jobId, job } = await processingJob()
  job.retryCount = job.maxRetries
  const result = await worker.runQueueEntry(entry(jobId), 'w', { processJob: async () => { throw new Error('again') } })
  assert.equal(result.failed, true)
  assert.equal((await jobManager.getJob(jobId)).status, 'failed')
  assert.equal(queue.contains(jobId), false)
})
test('15. secondary failure handling is contained and next entry can run', async () => {
  const bad = await worker.runQueueEntry(entry('bad'), 'w', {
    processJob: async () => { throw new Error('primary') },
    handleFailure: async () => { throw new Error('secondary') },
  })
  assert.equal(bad.failureHandlingError.message, 'secondary')
  const good = await worker.runQueueEntry(entry('good'), 'w', { processJob: async () => {} })
  assert.equal(good.completed, true)
})

// 16-18. Upload rollback
test('16-18. queue-full upload rollback removes only its new job and preserves existing data', async () => {
  const originalMax = GATEWAY_CONFIG.maxQueueSize
  const fixtureDir = path.join(GATEWAY_CONFIG.storagePath, 'queue-safety-test-owned-sentinel')
  const preserved = path.join(fixtureDir, 'sentinel.bin')
  const sentinel = Buffer.from('seslitab queue rollback portability sentinel\n', 'utf8')
  const hash = (value) => createHash('sha256').update(value).digest('hex')
  let fixtureCreated = false

  try {
    await assert.rejects(fs.lstat(fixtureDir), err => err.code === 'ENOENT')
    await fs.mkdir(fixtureDir)
    fixtureCreated = true
    await fs.writeFile(preserved, sentinel)
    const preservedBytesBefore = await fs.readFile(preserved)
    const preservedHashBefore = hash(preservedBytesBefore)
    const storageEntriesBefore = (await fs.readdir(GATEWAY_CONFIG.storagePath)).sort()

    GATEWAY_CONFIG.maxQueueSize = 1
    await queue.enqueue(entry('capacity-holder'))
    const beforeIds = new Set(jobManager.snapshot().map(j => j.jobId))
    await assert.rejects(
      () => handleUploadPdf({ fileBuffer: validPdf(), fileName: 'full.pdf', provider: 'mock' }),
      err => err.code === 'QUEUE_FULL'
    )
    assert.deepEqual(new Set(jobManager.snapshot().map(j => j.jobId)), beforeIds)
    assert.equal(queue.size(), 1)
    const preservedBytesAfter = await fs.readFile(preserved)
    assert.deepEqual(preservedBytesAfter, preservedBytesBefore)
    assert.equal(hash(preservedBytesAfter), preservedHashBefore)
    assert.deepEqual((await fs.readdir(GATEWAY_CONFIG.storagePath)).sort(), storageEntriesBefore)
  } finally {
    GATEWAY_CONFIG.maxQueueSize = originalMax
    if (fixtureCreated) {
      await fs.rm(preserved, { force: true })
      await fs.rmdir(fixtureDir)
    }
  }
})

// 19-24. Analyze truthfulness
test('19. uploaded analyze performs a real enqueue', async () => {
  const jobId = jobManager.generateJobId(); await jobManager.createJob({ ...entry(jobId) })
  const result = await handleAnalyzePdf({ jobId })
  assert.equal(result.data.status, 'queued'); assert.equal(queue.contains(jobId), true)
})
test('20. queued analyze is idempotent and repairs one missing queue entry', async () => {
  const jobId = jobManager.generateJobId(); await jobManager.createJob({ ...entry(jobId) }); await jobManager.updateStatus(jobId, 'queued')
  await handleAnalyzePdf({ jobId }); await handleAnalyzePdf({ jobId })
  assert.equal(queue.snapshot().filter(x => x.jobId === jobId).length, 1)
})
test('21. failed retryable analyze actually re-enqueues', async () => {
  const { jobId } = await processingJob(); await jobManager.updateStatus(jobId, 'failed', { error: { code: 'TRANSIENT' } })
  const result = await handleAnalyzePdf({ jobId })
  assert.equal(result.data.status, 'queued'); assert.equal(queue.contains(jobId), true); assert.equal((await jobManager.getJob(jobId)).status, 'queued')
})
test('22. failed CANCELLED job is not reported queued', async () => {
  const { jobId } = await processingJob(); await jobManager.updateStatus(jobId, 'failed', { error: { code: 'CANCELLED' } })
  await assert.rejects(() => handleAnalyzePdf({ jobId }), err => err.code === 'JOB_NOT_READY')
  assert.equal(queue.contains(jobId), false)
})
test('23. expired job is not reported queued', async () => {
  const { jobId } = await processingJob(); await jobManager.updateStatus(jobId, 'failed'); await jobManager.updateStatus(jobId, 'expired')
  await assert.rejects(() => handleAnalyzePdf({ jobId }), err => err.code === 'JOB_NOT_READY')
})
test('24. processing and completed jobs cannot be duplicated', async () => {
  const a = await processingJob(); await assert.rejects(() => handleAnalyzePdf({ jobId: a.jobId }), err => err.code === 'JOB_NOT_READY')
  const b = await processingJob(); await jobManager.updateStatus(b.jobId, 'musicxml_created'); await jobManager.updateStatus(b.jobId, 'completed')
  await assert.rejects(() => handleAnalyzePdf({ jobId: b.jobId }), err => err.code === 'JOB_NOT_READY')
  assert.equal(queue.contains(a.jobId), false); assert.equal(queue.contains(b.jobId), false)
})
