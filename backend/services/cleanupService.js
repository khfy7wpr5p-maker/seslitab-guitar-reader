// Cleanup Service — periodically expires old jobs and deletes orphaned files.

import { GATEWAY_CONFIG } from '../config/gatewayConfig.js'
import * as jobManager from '../jobs/jobManager.js'
import * as storage from '../storage/musicXmlStorage.js'
import { invalidateCache } from './statusService.js'

let timer = null

export function startCleanup() {
  timer = setInterval(() => runCleanup().catch((e) => console.error('[Cleanup]', e.message)), GATEWAY_CONFIG.cleanupIntervalSeconds * 1000)
  console.log(`[Cleanup] Started — interval: ${GATEWAY_CONFIG.cleanupIntervalSeconds}s`)
}

export function stopCleanup() { if (timer) { clearInterval(timer); timer = null; console.log('[Cleanup] Stopped.') } }

export async function runCleanup() {
  const expired = await jobManager.listExpiredJobs()
  for (const r of expired) {
    try { if (r.status !== 'expired') await jobManager.updateStatus(r.jobId, 'expired'); await storage.deleteJob(r.jobId); invalidateCache(r.jobId) }
    catch (e) { console.error(`[Cleanup] ${r.jobId}:`, e.message) }
  }
  // Orphaned files
  const stored = await storage.listJobs()
  const known = new Set(jobManager.snapshot().map((j) => j.jobId))
  for (const id of stored) if (!known.has(id)) { try { await storage.deleteJob(id) } catch {} }
  return { cleaned: expired.map((r) => r.jobId) }
}
