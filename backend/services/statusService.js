// Status Service — read-only job status and MusicXML retrieval with caching.

import * as jobManager from '../jobs/jobManager.js'
import * as storage from '../storage/musicXmlStorage.js'
import { JobNotReadyError } from '../utils/errors.js'

const cache = new Map()
const TTL = { processing: 5_000, completed: 60_000, musicXml: 300_000 }

function cGet(k) { const e = cache.get(k); if (!e) return null; if (Date.now() > e.exp) { cache.delete(k); return null } return e.v }
function cSet(k, v, t) { cache.set(k, { v, exp: Date.now() + t }) }

export function invalidateCache(jobId) { for (const k of cache.keys()) if (k.endsWith(`:${jobId}`)) cache.delete(k) }

export async function getJobStatus(jobId) {
  const c = cGet(`s:${jobId}`); if (c) return { ...c, cacheHit: true }
  const r = await jobManager.getJob(jobId)
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
