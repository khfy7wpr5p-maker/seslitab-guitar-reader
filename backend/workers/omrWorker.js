// OMR Worker — pulls jobs from queue and processes through OMR provider.

import { promises as fs } from 'node:fs'
import { GATEWAY_CONFIG } from '../config/gatewayConfig.js'
import * as queue from '../queue/uploadQueue.js'
import * as jobManager from '../jobs/jobManager.js'
import * as storage from '../storage/musicXmlStorage.js'
import { getProviderByName } from '../providers/index.js'
import { ProviderError, ProviderTimeoutError, ProviderStartFailedError, JobProcessingTimeoutError } from '../utils/errors.js'
import { logLifecycle } from '../utils/logger.js'
import { sanitizePdfFilename, validatePdf } from '../security/inputValidation.js'

const workers = []
const activeJobs = new Set()
const runningOperations = new Map()
let stopping = false
let started = false
let wc = 0

export function startWorkerPool() {
  if (started) return getWorkerPoolState()
  started = true
  stopping = false
  for (let i = 0; i < GATEWAY_CONFIG.workerPoolSize; i++) {
    const id = `worker-${++wc}`
    workers.push({ id, p: runWorkerLoop(id) })
  }
  console.log(`[OMR Gateway] Worker pool started: ${GATEWAY_CONFIG.workerPoolSize} workers`)
  return getWorkerPoolState()
}

export async function stopWorkerPool() {
  stopping = true
  await Promise.allSettled(workers.map((w) => w.p))
  workers.length = 0
  started = false
}

export function isJobActive(jobId) { return activeJobs.has(jobId) }
export function getWorkerPoolState() { return { started, stopping, workerCount: workers.length, activeJobIds: [...activeJobs], runningOperationJobIds: [...runningOperations.keys()] } }

export function registerRunningOperation(jobId, provider, providerJobId) {
  if (runningOperations.has(jobId)) throw new Error(`Job already owns a provider operation: ${jobId}`)
  const operation = { jobId, provider, providerJobId, cancellationRequested: false, cancelPromise: null }
  runningOperations.set(jobId, operation)
  return operation
}

export function getRunningOperation(jobId) { return runningOperations.get(jobId) || null }
export function releaseRunningOperation(jobId) { return runningOperations.delete(jobId) }

export async function cancelRunningJob(jobId) {
  let operation = runningOperations.get(jobId)
  while (!operation && activeJobs.has(jobId)) {
    await new Promise((resolve) => setImmediate(resolve))
    operation = runningOperations.get(jobId)
  }
  if (!operation) return { success: false, terminationConfirmed: false, error: { code: 'CANCELLATION_FAILED', message: 'Çalışan sağlayıcı işlemi bulunamadı.' } }
  if (operation.cancelPromise) return operation.cancelPromise
  operation.cancellationRequested = true
  operation.cancelPromise = (async () => {
    if (typeof operation.provider.cancelJob !== 'function') {
      return { success: false, terminationConfirmed: false, error: { code: 'CANCELLATION_FAILED', message: 'Sağlayıcı doğrulanabilir iptali desteklemiyor.' } }
    }
    try {
      const result = await operation.provider.cancelJob(operation.providerJobId)
      return result?.terminationConfirmed === true && result?.success === true
        ? result
        : { success: false, terminationConfirmed: false, error: result?.error || { code: 'CANCELLATION_FAILED', message: 'Sağlayıcı işlemin kapandığını doğrulamadı.' } }
    } catch {
      return { success: false, terminationConfirmed: false, error: { code: 'CANCELLATION_FAILED', message: 'Sağlayıcı iptal isteği başarısız oldu.' } }
    }
  })()
  return operation.cancelPromise
}

function assertNotCancelled(operation) {
  if (!operation?.cancellationRequested) return
  const err = new Error('İşlem iptal edildi.')
  err.code = 'CANCELLED'
  err.retryable = false
  throw err
}

async function runWorkerLoop(workerId) {
  while (!stopping) {
    const entry = queue.dequeue()
    if (!entry) { await sleep(500); continue }
    logLifecycle('worker_picked_up', { jobId: entry.jobId, status: 'queued', provider: entry.provider })
    await runQueueEntry(entry, workerId)
  }
}

export async function runQueueEntry(entry, workerId = 'test', deps = {}) {
  if (activeJobs.has(entry.jobId)) return { skipped: true, reason: 'already_active' }
  activeJobs.add(entry.jobId)
  const process = deps.processJob || processJob
  const handleFailure = deps.handleFailure || jobManager.handleFailure
  const enqueue = deps.enqueue || queue.enqueue
  const markRetryQueued = deps.markRetryQueued || jobManager.markRetryQueued
  try {
    await process(entry, workerId)
    return { completed: true }
  } catch (err) {
    const code = err.code || 'WORKER_ERROR'
    logLifecycle('worker_failed', { jobId: entry.jobId, status: 'failed', provider: entry.provider, error: err.message })
    try {
      const failed = await handleFailure(entry.jobId, { code, message: err.message, retryable: err.retryable !== false })
      if (failed.shouldRetry) {
        await enqueue(entry)
        await markRetryQueued(entry.jobId)
        return { retried: true }
      }
      return { failed: true }
    } catch (failureError) {
      console.error(`[Worker ${workerId}] Failure handling for ${entry.jobId}:`, failureError.message)
      return { failed: true, failureHandlingError: failureError }
    }
  } finally {
    activeJobs.delete(entry.jobId)
  }
}

export async function processJob(entry, workerId = 'test') {
  const { jobId, provider: pn, pdfPath, fileName } = entry
  await jobManager.updateStatus(jobId, 'processing', { workerId, progress: 0 })
  logLifecycle('provider_started', { jobId, status: 'processing', provider: pn })

  const pdf = await fs.readFile(pdfPath)
  const safeFileName = sanitizePdfFilename(fileName)
  await validatePdf({ buffer: pdf, fileName: safeFileName, maxPages: GATEWAY_CONFIG.maxPdfPages, maxBytes: GATEWAY_CONFIG.maxUploadSizeBytes })
  const provider = getProviderByName(pn)

  const up = await provider.uploadPdf(pdf, safeFileName)
  if (!up.success) {
    logLifecycle('provider_start_failed', { jobId, status: 'processing', provider: pn, error: up.error?.message || up.error || 'uploadPdf failed' })
    throw new ProviderStartFailedError(up.error?.message || up.error || 'PDF yüklenemedi.', { jobId })
  }
  const pid = up.providerJobId
  const operation = registerRunningOperation(jobId, provider, pid)

  try {
  const an = await provider.analyzePdf(pid)
  if (!an.success) {
    if (operation.cancellationRequested || an.error?.code === 'CANCELED' || an.error?.code === 'CANCELLED') assertNotCancelled(operation)
    logLifecycle('provider_start_failed', { jobId, status: 'processing', provider: pn, error: an.error?.message || an.error || 'analyzePdf failed' })
    throw new ProviderStartFailedError(an.error?.message || an.error || 'Analiz başlatılamadı.', { jobId })
  }

  const cfg = GATEWAY_CONFIG.providers[pn] || {}
  const timeoutMs = (cfg.jobTimeoutSeconds || GATEWAY_CONFIG.jobTimeoutSeconds) * 1000
  const pollMs = (cfg.pollIntervalSeconds || 5) * 1000
  const start = Date.now()
  let last = 'processing'

  while (Date.now() - start < timeoutMs) {
    await sleep(pollMs)
    const s = await provider.getStatus(pid)
    if (!s.success) throw new ProviderError(s.error || 'Durum sorgulanamadı.', { jobId })
    last = s.status
    if (last !== 'completed' && last !== 'failed') await jobManager.updateStatus(jobId, 'processing', { progress: s.progress || 0 })
    if (last === 'completed') break
    if (last === 'failed') throw new ProviderError('OMR motoru başarısız.', { jobId })
  }
  if (last !== 'completed') {
    logLifecycle('provider_timeout', { jobId, status: 'processing', provider: pn, error: 'OMR_PROVIDER_TIMEOUT' })
    throw new ProviderTimeoutError('OMR zaman aşımı.', { jobId })
  }

  assertNotCancelled(operation)
  const dl = await provider.downloadMusicXML(pid)
  if (!dl.success || !dl.musicXml) throw new ProviderError(dl.error || 'MusicXML indirilemedi.', { jobId })

  assertNotCancelled(operation)
  await storage.writeMusicXml(jobId, dl.musicXml)
  logLifecycle('musicxml_stored', { jobId, status: 'musicxml_created', provider: pn })

  if (typeof provider.downloadOmrArtifact === 'function') {
    try {
      const omr = await provider.downloadOmrArtifact(pid)
      if (omr.success && omr.omrBuffer) {
        await storage.writeOmr(jobId, omr.omrBuffer)
        console.log(`[Worker ${workerId}] Job ${jobId} .omr artifact saved (${omr.omrBuffer.length} bytes).`)
      } else {
        console.log(`[Worker ${workerId}] Job ${jobId} no .omr artifact.`)
      }
    } catch (e) {
      console.error(`[Worker ${workerId}] Job ${jobId} .omr artifact error:`, e.message)
    }
  }

  assertNotCancelled(operation)
  await jobManager.updateStatus(jobId, 'musicxml_created', { progress: 100 })
  assertNotCancelled(operation)
  await jobManager.updateStatus(jobId, 'completed', { progress: 100 })
  logLifecycle('job_completed', { jobId, status: 'completed', provider: pn })
  console.log(`[Worker ${workerId}] Job ${jobId} completed.`)
  } finally {
    if (runningOperations.get(jobId) === operation) runningOperations.delete(jobId)
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }
