// Job Manager — durable single source of truth for OMR job lifecycle.
import path from 'node:path'
import { GATEWAY_CONFIG } from '../config/gatewayConfig.js'
import { JobNotFoundError, InternalError } from '../utils/errors.js'
import * as storage from '../storage/musicXmlStorage.js'
import * as queue from '../queue/uploadQueue.js'

const jobs = new Map()
const VALID = { uploaded: ['queued'], queued: ['processing', 'failed', 'expired'], processing: ['processing', 'musicxml_created', 'failed', 'expired'], musicxml_created: ['completed', 'failed'], completed: ['expired'], failed: ['expired', 'queued'], expired: [] }
const SUPPORTED = new Set(Object.keys(VALID))
let counter = 0
let persistenceEnabled = false
let recoveryComplete = false
let recoveryPromise = null

function metadataFor(r) {
  return { schemaVersion: 1, jobId: r.jobId, status: r.status, fileName: r.fileName, provider: r.provider, inputPath: 'input.pdf', musicXmlPath: r.musicXmlPath ? 'output.musicxml' : null, progress: r.progress, workerId: r.workerId, retryCount: r.retryCount, maxRetries: r.maxRetries, timeoutSeconds: r.timeoutSeconds, createdAt: r.createdAt, updatedAt: r.updatedAt, queuedAt: r.queuedAt, processingAt: r.processingAt, musicxmlCreatedAt: r.musicxmlCreatedAt, completedAt: r.completedAt, expiredAt: r.expiredAt, error: r.error, cancellationResult: r.cancellationResult || null, retentionClass: r.retentionClass || 'runtime', retentionUntil: r.retentionUntil || null, cleanupEligible: r.cleanupEligible === true, teacherApproved: r.teacherApproved === true, protected: r.protected === true }
}
async function persist(r, storageApi = storage) { if (persistenceEnabled) await storageApi.writeMetadata(r.jobId, metadataFor(r)) }
function fromMetadata(m, storageApi) { return { ...m, pdfPath: path.join(storageApi.root || GATEWAY_CONFIG.storagePath, m.jobId, m.inputPath || 'input.pdf'), musicXmlPath: m.musicXmlPath ? path.join(storageApi.root || GATEWAY_CONFIG.storagePath, m.jobId, m.musicXmlPath) : null } }

export function generateJobId() { const ts = Math.floor(Date.now() / 1000); return `job_${ts}_${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}` }
export async function createJob({ jobId, fileName, provider, pdfPath }) {
  const now = new Date().toISOString()
  const r = { jobId, status: 'uploaded', fileName, provider, pdfPath, musicXmlPath: null, progress: 0, workerId: null, retryCount: 0, maxRetries: GATEWAY_CONFIG.maxRetries, timeoutSeconds: GATEWAY_CONFIG.jobTimeoutSeconds, createdAt: now, updatedAt: now, queuedAt: null, processingAt: null, musicxmlCreatedAt: null, completedAt: null, expiredAt: null, error: null, cancellationResult: null, retentionClass: 'runtime', retentionUntil: null, cleanupEligible: false, teacherApproved: false, protected: false }
  await persist(r); jobs.set(jobId, r); return r
}
export async function getJob(jobId) { const r = jobs.get(jobId); if (!r) throw new JobNotFoundError(jobId); return r }
export async function updateStatus(jobId, newStatus, extra = {}) {
  const r = jobs.get(jobId); if (!r) throw new JobNotFoundError(jobId)
  if (!VALID[r.status]?.includes(newStatus)) throw new InternalError(`Geçersiz geçiş: ${r.status} → ${newStatus}`, { jobId })
  const before = structuredClone(r); const self = r.status === newStatus
  r.status = newStatus; r.updatedAt = new Date().toISOString()
  if (!self) { if (newStatus === 'queued') r.queuedAt = r.updatedAt; if (newStatus === 'processing') r.processingAt = r.updatedAt; if (newStatus === 'musicxml_created') r.musicxmlCreatedAt = r.updatedAt; if (newStatus === 'completed') r.completedAt = r.updatedAt; if (newStatus === 'expired') r.expiredAt = r.updatedAt }
  for (const key of ['progress','workerId','musicXmlPath','error','retryCount','cancellationResult','cleanupEligible','retentionClass','retentionUntil','teacherApproved','protected']) if (extra[key] !== undefined) r[key] = extra[key]
  try { await persist(r); return r } catch (e) { Object.assign(r, before); throw e }
}
export async function handleFailure(jobId, error) {
  const r = jobs.get(jobId); if (!r) throw new JobNotFoundError(jobId)
  if (r.status === 'failed' && r.error?.code === 'CANCELLED') return { ...r, shouldRetry: false }
  const detail = { code: error.code || 'UNKNOWN', message: error.message || 'Hata', details: error.details || {}, retryable: error.retryable !== false, occurredAt: new Date().toISOString() }
  const retryable = detail.retryable && detail.code !== 'CANCELLED' && r.retryCount < r.maxRetries
  const count = retryable ? r.retryCount + 1 : r.retryCount
  const failed = await updateStatus(jobId, 'failed', { error: detail, retryCount: count })
  return { ...failed, shouldRetry: retryable }
}
export async function markRetryQueued(jobId) { return updateStatus(jobId, 'queued', { progress: 0, workerId: null, error: null }) }
export async function listExpiredJobs() { const now = Date.now(); return [...jobs.values()].filter((j) => (j.status === 'completed' && j.completedAt && now - new Date(j.completedAt).getTime() > GATEWAY_CONFIG.completedTtlDays * 86400000) || (j.status === 'failed' && j.updatedAt && now - new Date(j.updatedAt).getTime() > GATEWAY_CONFIG.failedTtlDays * 86400000) || j.status === 'expired') }
export async function deleteJobRecord(jobId) { jobs.delete(jobId) }
export function snapshot() { return [...jobs.values()] }
export function isRecoveryComplete() { return recoveryComplete }
export function resetForTests() { jobs.clear(); recoveryComplete = false; recoveryPromise = null; persistenceEnabled = false }

export async function recoverJobs({ storageApi = storage, queueApi = queue } = {}) {
  if (recoveryComplete) return { recovered: jobs.size, protected: [], enqueued: [] }
  if (recoveryPromise) return recoveryPromise
  recoveryPromise = (async () => {
    await storageApi.initialize()
    const ids = await storageApi.listJobs(); const protectedDirs = []; const enqueued = []
    const recovered = new Map()
    for (const id of ids) {
      const read = await storageApi.readMetadata(id)
      if (!read.ok) { protectedDirs.push({ jobId: id, code: read.code }); continue }
      const m = read.metadata
      if (!SUPPORTED.has(m.status)) { protectedDirs.push({ jobId: id, code: 'UNSUPPORTED_JOB_STATUS' }); continue }
      const r = fromMetadata(m, storageApi); recovered.set(id, r)
    }
    jobs.clear(); for (const [id, r] of recovered) jobs.set(id, r)
    persistenceEnabled = true
    for (const r of recovered.values()) {
      const hasInput = await storageApi.inputExists(r.jobId)
      if (r.status === 'uploaded' || r.status === 'queued') {
        if (!hasInput) {
          r.status = 'failed'; r.updatedAt = new Date().toISOString(); r.error = { code: 'RECOVERY_INPUT_MISSING', message: 'Restart recovery sırasında input.pdf bulunamadı.', retryable: false, occurredAt: r.updatedAt }; await storageApi.writeMetadata(r.jobId, metadataFor(r)); continue
        }
        if (r.status === 'uploaded') { r.status = 'queued'; r.queuedAt = new Date().toISOString(); r.updatedAt = r.queuedAt; await storageApi.writeMetadata(r.jobId, metadataFor(r)) }
        const result = await queueApi.enqueue({ jobId: r.jobId, provider: r.provider, pdfPath: r.pdfPath, fileName: r.fileName }); if (!result?.duplicate) enqueued.push(r.jobId)
      } else if (r.status === 'processing' || r.status === 'musicxml_created') {
        r.status = 'failed'; r.updatedAt = new Date().toISOString(); r.error = { code: 'RESTART_INTERRUPTED', message: 'Sunucu yeniden başladığı için önceki işlem güvenle sürdürülemedi.', retryable: true, occurredAt: r.updatedAt }; r.workerId = null; await storageApi.writeMetadata(r.jobId, metadataFor(r))
      }
    }
    recoveryComplete = true
    return { recovered: recovered.size, protected: protectedDirs, enqueued }
  })()
  try { return await recoveryPromise } catch (e) { recoveryComplete = false; persistenceEnabled = false; throw e } finally { recoveryPromise = null }
}
