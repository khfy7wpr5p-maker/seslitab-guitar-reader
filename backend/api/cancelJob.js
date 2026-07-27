// POST /api/jobs/:id/cancel handler.
//
// Uses the existing job lifecycle. A job is cancelable only while it is
// still queued or processing (i.e. not yet musicxml_created/completed/failed).

import * as jobManager from '../jobs/jobManager.js'
import * as queue from '../queue/uploadQueue.js'
import * as storage from '../storage/musicXmlStorage.js'
import { invalidateCache } from '../services/statusService.js'
import { ValidationError, JobNotFoundError, toGatewayError, successResponse } from '../utils/errors.js'

const RE = /^job_\d{10}_[a-z0-9]{6}$/
const CANCELABLE = new Set(['uploaded', 'queued', 'processing'])

export async function handleCancelJob({ jobId }) {
  try {
    if (!jobId) throw new ValidationError('jobId zorunludur.')
    if (!RE.test(jobId)) throw new ValidationError('jobId formatı geçersiz.')

    let job
    try {
      job = await jobManager.getJob(jobId)
    } catch (e) {
      if (e instanceof JobNotFoundError) throw e
      throw toGatewayError(e)
    }

    if (!CANCELABLE.has(job.status)) {
      throw new ValidationError(
        `İş iptal edilemez. Mevcut durum: ${job.status}. Yalnızca kuyrukta veya işlenmekte olan işler iptal edilebilir.`
      )
    }

    // Remove from queue if still waiting
    queue.remove(jobId)
    // Mark as failed with a cancellation reason
    await jobManager.updateStatus(jobId, 'failed', {
      error: { code: 'CANCELLED', message: 'İş kullanıcı tarafından iptal edildi.', occurredAt: new Date().toISOString() },
    })
    // Clean up any partial files
    try { await storage.deleteJob(jobId) } catch {}
    invalidateCache(jobId)

    return successResponse({ jobId, status: 'failed', message: 'İş iptal edildi.' })
  } catch (e) { throw toGatewayError(e) }
}
