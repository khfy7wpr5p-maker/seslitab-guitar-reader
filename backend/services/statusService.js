// Status Service — read-only job status and MusicXML retrieval with caching.

import * as jobManager from '../jobs/jobManager.js'
import * as storage from '../storage/musicXmlStorage.js'
import { GATEWAY_CONFIG } from '../config/gatewayConfig.js'
import { JobNotReadyError, JobQueueTimeoutError, JobProcessingTimeoutError } from '../utils/errors.js'
import { logLifecycle } from '../utils/logger.js'

const cache = new Map()
const TTL = { processing: 5_000, completed: 60_000, musicXml: 300_000 }

function cGet(k) { const e = cache.get(k); if (!e) return null; if (Date.now() > e.exp) { cache.delete(k); return null } return e.v }
function cSet(k, v, t) { cache.set(k, { v, exp: Date.now() + t }) }

export function invalidateCache(jobId) { for (const k of cache.keys()) if (k.endsWith(`:${jobId}`)) cache.delete(k) }

function ageMs(r, field) {
  return r[field] ? Date.now() - new Date(r[field]).getTime() : 0
}

async function enforceTimeouts(r) {
  if (r.status === 'queued') {
    if (ageMs(r, 'queuedAt') > GATEWAY_CONFIG.maxQueueWaitSeconds * 1000) {
      logLifecycle('job_queue_timeout', { jobId: r.jobId, status: 'queued', provider: r.provider, error: 'JOB_QUEUE_TIMEOUT' })
      await jobManager.updateStatus(r.jobId, 'failed', { error: { code: 'JOB_QUEUE_TIMEOUT', message: 'İş kuyrukta çok uzun süre bekledi.', occurredAt: new Date().toISOString() } })
      invalidateCache(r.jobId)
      return new JobQueueTimeoutError('İş kuyrukta çok uzun süre bekledi.', { jobId: r.jobId })
    }
  }
  if (r.status === 'processing' || r.status === 'musicxml_created') {
    if (ageMs(r, 'processingAt') > GATEWAY_CONFIG.maxProcessingSeconds * 1000) {
      logLifecycle('job_processing_timeout', { jobId: r.jobId, status: r.status, provider: r.provider, error: 'JOB_PROCESSING_TIMEOUT' })
      await jobManager.updateStatus(r.jobId, 'failed', { error: { code: 'JOB_PROCESSING_TIMEOUT', message: 'İşleme çok uzun sürdü.', occurredAt: new Date().toISOString() } })
      invalidateCache(r.jobId)
      return new JobProcessingTimeoutError('İşleme çok uzun sürdü.', { jobId: r.jobId })
    }
  }
  return null
}

export async function getJobStatus(jobId) {
  const c = cGet(`s:${jobId}`); if (c) return { ...c, cacheHit: true }
  const r = await jobManager.getJob(jobId)

  const timeoutErr = await enforceTimeouts(r)
  if (timeoutErr) throw timeoutErr

  const res = { success: true, jobId: r.jobId, status: r.status, progress: r.progress, fileName: r.fileName, provider: r.provider, createdAt: r.createdAt, updatedAt: r.updatedAt, completedAt: r.completedAt, error: r.error }
  cSet(`s:${jobId}`, res, ['completed', 'failed', 'expired'].includes(r.status) ? TTL.completed : TTL.processing)
  return res
}

export async function getMusicXml(jobId) {
  const c = cGet(`m:${jobId}`); if (c) return { ...c, cacheHit: true }
  const r = await jobManager.getJob(jobId)
  if (r.status !== 'completed') throw new JobNotReadyError(jobId, r.status)
  const xml = await storage.readMusicXml(jobId)
  if (!xml) throw new JobNotReadyError(jobId, 'completed (dosya yok)')
  const res = { success: true, jobId, musicXml: xml, fileName: r.fileName.replace(/\.pdf$/i, '.musicxml') }
  cSet(`m:${jobId}`, res, TTL.musicXml)
  return res
}

export async function getOmrArtifact(jobId) {
  const r = await jobManager.getJob(jobId)
  if (r.status !== 'completed') throw new JobNotReadyError(jobId, r.status)
  const buf = await storage.readOmr(jobId)
  if (!buf) return { success: false, jobId, error: '.omr dosyası bulunamadı.' }
  return { success: true, jobId, omrBuffer: buf, fileName: r.fileName.replace(/\.pdf$/i, '.omr') }
}
