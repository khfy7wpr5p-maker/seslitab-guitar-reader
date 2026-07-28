// OMR Worker — pulls jobs from queue and processes through OMR provider.

import { promises as fs } from 'node:fs'
import { GATEWAY_CONFIG } from '../config/gatewayConfig.js'
import * as queue from '../queue/uploadQueue.js'
import * as jobManager from '../jobs/jobManager.js'
import * as storage from '../storage/musicXmlStorage.js'
import { getProviderByName } from '../providers/index.js'
import { ProviderError, ProviderTimeoutError, ProviderStartFailedError, JobProcessingTimeoutError } from '../utils/errors.js'
import { logLifecycle } from '../utils/logger.js'

const workers = []
let stopping = false
let wc = 0

export function startWorkerPool() {
  for (let i = 0; i < GATEWAY_CONFIG.workerPoolSize; i++) {
    const id = `worker-${++wc}`
    workers.push({ id, p: runWorkerLoop(id) })
  }
  console.log(`[OMR Gateway] Worker pool started: ${GATEWAY_CONFIG.workerPoolSize} workers`)
}

export async function stopWorkerPool() {
  stopping = true
  await Promise.allSettled(workers.map((w) => w.p))
  workers.length = 0
}

async function runWorkerLoop(workerId) {
  while (!stopping) {
    const entry = queue.dequeue()
    if (!entry) { await sleep(500); continue }
    logLifecycle('worker_picked_up', { jobId: entry.jobId, status: 'queued', provider: entry.provider })
    try { await processJob(entry, workerId) }
    catch (err) {
      const code = err.code || 'WORKER_ERROR'
      logLifecycle('worker_failed', { jobId: entry.jobId, status: 'failed', provider: entry.provider, error: err.message })
      await jobManager.handleFailure(entry.jobId, { code, message: err.message, retryable: err.retryable !== false })
    }
  }
}

export async function processJob(entry, workerId = 'test') {
  const { jobId, provider: pn, pdfPath, fileName } = entry
  await jobManager.updateStatus(jobId, 'processing', { workerId, progress: 0 })
  logLifecycle('provider_started', { jobId, status: 'processing', provider: pn })

  const provider = getProviderByName(pn)
  const pdf = await fs.readFile(pdfPath)

  const up = await provider.uploadPdf(pdf, fileName)
  if (!up.success) {
    logLifecycle('provider_start_failed', { jobId, status: 'processing', provider: pn, error: up.error?.message || up.error || 'uploadPdf failed' })
    throw new ProviderStartFailedError(up.error?.message || up.error || 'PDF yüklenemedi.', { jobId })
  }
  const pid = up.providerJobId

  const an = await provider.analyzePdf(pid)
  if (!an.success) {
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

  const dl = await provider.downloadMusicXML(pid)
  if (!dl.success || !dl.musicXml) throw new ProviderError(dl.error || 'MusicXML indirilemedi.', { jobId })

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

  await jobManager.updateStatus(jobId, 'musicxml_created', { progress: 100 })
  await jobManager.updateStatus(jobId, 'completed', { progress: 100 })
  logLifecycle('job_completed', { jobId, status: 'completed', provider: pn })
  console.log(`[Worker ${workerId}] Job ${jobId} completed.`)
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }
