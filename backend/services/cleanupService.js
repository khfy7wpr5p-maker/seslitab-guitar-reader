// Cleanup Service — retention-safe cleanup after successful recovery.
import { GATEWAY_CONFIG } from '../config/gatewayConfig.js'
import * as jobManager from '../jobs/jobManager.js'
import * as storage from '../storage/musicXmlStorage.js'
import * as queue from '../queue/uploadQueue.js'
import { isJobActive } from '../workers/omrWorker.js'
import { invalidateCache } from './statusService.js'

let timer = null
export function startCleanup() { if (timer) return; timer = setInterval(() => runCleanup().catch((e) => console.error('[Cleanup]', e.message)), GATEWAY_CONFIG.cleanupIntervalSeconds * 1000); console.log(`[Cleanup] Started — interval: ${GATEWAY_CONFIG.cleanupIntervalSeconds}s`) }
export function stopCleanup() { if (timer) { clearInterval(timer); timer = null; console.log('[Cleanup] Stopped.') } }

export async function runCleanup({ storageApi = storage, jobManagerApi = jobManager, queueApi = queue, activeCheck = isJobActive } = {}) {
  if (!jobManagerApi.isRecoveryComplete()) return { cleaned: [], protected: [], skipped: 'RECOVERY_INCOMPLETE' }
  const cleaned = []; const protectedDirs = []
  for (const id of await storageApi.listJobs()) {
    const read = await storageApi.readMetadata(id)
    if (!read.ok) { protectedDirs.push({ jobId: id, code: read.code }); continue }
    const m = read.metadata
    const retentionPassed = typeof m.retentionUntil === 'string' && Number.isFinite(Date.parse(m.retentionUntil)) && Date.parse(m.retentionUntil) <= Date.now()
    const eligible = m.status === 'expired' && retentionPassed && m.cleanupEligible === true && m.retentionClass === 'runtime' && m.teacherApproved !== true && m.protected !== true && !activeCheck(id) && !queueApi.contains(id)
    if (!eligible) continue
    const known = jobManagerApi.snapshot().find((j) => j.jobId === id)
    if (!known || known.status !== 'expired') { protectedDirs.push({ jobId: id, code: 'UNCERTAIN_OWNERSHIP' }); continue }
    await storageApi.deleteJob(id); await jobManagerApi.deleteJobRecord(id); invalidateCache(id); cleaned.push(id)
  }
  return { cleaned, protected: protectedDirs }
}
