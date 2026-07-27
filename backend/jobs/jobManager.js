// Job Manager — single source of truth for OMR job lifecycle.

import { GATEWAY_CONFIG } from '../config/gatewayConfig.js'
import { JobNotFoundError, InternalError } from '../utils/errors.js'

const jobs = new Map()
const VALID = {
  uploaded: ['queued'], queued: ['processing', 'failed', 'expired'],
  processing: ['processing', 'musicxml_created', 'failed', 'expired'],
  musicxml_created: ['completed', 'failed'], completed: ['expired'],
  failed: ['expired', 'queued'], expired: [],
}
let counter = 0

export function generateJobId() {
  const ts = Math.floor(Date.now() / 1000)
  return `job_${ts}_${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`
}

export async function createJob({ jobId, fileName, provider, pdfPath }) {
  const now = new Date().toISOString()
  const r = { jobId, status: 'uploaded', fileName, provider, pdfPath, musicXmlPath: null, progress: 0, workerId: null, retryCount: 0, maxRetries: GATEWAY_CONFIG.maxRetries, timeoutSeconds: GATEWAY_CONFIG.jobTimeoutSeconds, createdAt: now, updatedAt: now, queuedAt: null, processingAt: null, musicxmlCreatedAt: null, completedAt: null, expiredAt: null, error: null }
  jobs.set(jobId, r); return r
}

export async function getJob(jobId) {
  const r = jobs.get(jobId)
  if (!r) throw new JobNotFoundError(jobId)
  return r
}

export async function updateStatus(jobId, newStatus, extra = {}) {
  const r = jobs.get(jobId)
  if (!r) throw new JobNotFoundError(jobId)
  if (!VALID[r.status]?.includes(newStatus)) throw new InternalError(`Geçersiz geçiş: ${r.status} → ${newStatus}`, { jobId })
  const self = r.status === newStatus
  r.status = newStatus; r.updatedAt = new Date().toISOString()
  if (!self) {
    if (newStatus === 'queued') r.queuedAt = r.updatedAt
    if (newStatus === 'processing') r.processingAt = r.updatedAt
    if (newStatus === 'musicxml_created') r.musicxmlCreatedAt = r.updatedAt
    if (newStatus === 'completed') r.completedAt = r.updatedAt
    if (newStatus === 'expired') r.expiredAt = r.updatedAt
  }
  if (extra.progress !== undefined) r.progress = extra.progress
  if (extra.workerId !== undefined) r.workerId = extra.workerId
  if (extra.musicXmlPath !== undefined) r.musicXmlPath = extra.musicXmlPath
  if (extra.error !== undefined) r.error = extra.error
  if (extra.retryCount !== undefined) r.retryCount = extra.retryCount
  return r
}

export async function handleFailure(jobId, error) {
  const r = jobs.get(jobId)
  if (!r) throw new JobNotFoundError(jobId)
  r.error = { code: error.code || 'UNKNOWN', message: error.message || 'Hata', details: error.details || {}, occurredAt: new Date().toISOString() }
  if (r.retryCount < r.maxRetries) {
    r.retryCount++
    await updateStatus(jobId, 'failed', { error: r.error, retryCount: r.retryCount })
    return updateStatus(jobId, 'queued')
  }
  return updateStatus(jobId, 'failed', { error: r.error, retryCount: r.retryCount })
}

export async function listExpiredJobs() {
  const now = Date.now()
  return [...jobs.values()].filter((j) => {
    if (j.status === 'completed' && j.completedAt) return now - new Date(j.completedAt).getTime() > GATEWAY_CONFIG.completedTtlDays * 86400000
    if (j.status === 'failed' && j.updatedAt) return now - new Date(j.updatedAt).getTime() > GATEWAY_CONFIG.failedTtlDays * 86400000
    return false
  })
}

export async function deleteJobRecord(jobId) { jobs.delete(jobId) }
export function snapshot() { return [...jobs.values()] }
