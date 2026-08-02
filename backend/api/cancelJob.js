// POST /api/jobs/:id/cancel handler.

import * as jobManager from '../jobs/jobManager.js'
import * as queue from '../queue/uploadQueue.js'
import * as storage from '../storage/musicXmlStorage.js'
import { invalidateCache } from '../services/statusService.js'
import { cancelRunningJob, isJobActive } from '../workers/omrWorker.js'
import { ValidationError, JobNotFoundError, CancellationFailedError, toGatewayError, successResponse } from '../utils/errors.js'

const RE = /^job_\d{10}_[a-z0-9]{6}$/
const CANCELLATION_ERROR = () => ({ code: 'CANCELLED', message: 'İş kullanıcı tarafından iptal edildi.', occurredAt: new Date().toISOString() })

async function markCancelled(jobId, job) {
  if (job.status === 'failed' && job.error?.code === 'CANCELLED') return job
  if (job.status === 'uploaded') {
    job = await jobManager.updateStatus(jobId, 'queued')
  }
  return jobManager.updateStatus(jobId, 'failed', { error: CANCELLATION_ERROR() })
}

export async function handleCancelJob({ jobId }) {
  try {
    if (!jobId) throw new ValidationError('jobId zorunludur.')
    if (!RE.test(jobId)) throw new ValidationError('jobId formatı geçersiz.')
    let job
    try { job = await jobManager.getJob(jobId) }
    catch (e) { if (e instanceof JobNotFoundError) throw e; throw toGatewayError(e) }

    if (job.status === 'failed' && job.error?.code === 'CANCELLED') {
      return successResponse({ jobId, status: 'failed', message: 'İş zaten iptal edilmiş.' })
    }
    if (job.status === 'processing' || isJobActive(jobId)) {
      const result = await cancelRunningJob(jobId)
      if (!result.success || !result.terminationConfirmed) {
        throw new CancellationFailedError(result.error?.message, { jobId, providerCode: result.error?.code })
      }
      job = await jobManager.getJob(jobId)
      if (!(job.status === 'failed' && job.error?.code === 'CANCELLED')) await markCancelled(jobId, job)
    } else if (job.status === 'uploaded' || job.status === 'queued') {
      queue.remove(jobId)
      await markCancelled(jobId, job)
    } else {
      throw new ValidationError(`İş iptal edilemez. Mevcut durum: ${job.status}.`)
    }

    await storage.deleteJob(jobId)
    invalidateCache(jobId)
    return successResponse({ jobId, status: 'failed', message: 'İş iptal edildi.' })
  } catch (e) { throw toGatewayError(e) }
}
