// DELETE /api/v1/job/:jobId handler.

import * as jobManager from '../jobs/jobManager.js'
import * as queue from '../queue/uploadQueue.js'
import * as storage from '../storage/musicXmlStorage.js'
import { invalidateCache } from '../services/statusService.js'
import { cancelRunningJob, isJobActive } from '../workers/omrWorker.js'
import { ValidationError, CancellationFailedError, toGatewayError, successResponse } from '../utils/errors.js'

const RE = /^job_\d{10}_[a-z0-9]{6}$/

export async function handleDeleteJob({ jobId }) {
  try {
    if (!jobId) throw new ValidationError('jobId zorunludur.')
    if (!RE.test(jobId)) throw new ValidationError('jobId formatı geçersiz.')
    const job = await jobManager.getJob(jobId)
    if (job.status === 'processing' || isJobActive(jobId)) {
      const result = await cancelRunningJob(jobId)
      if (!result.success || !result.terminationConfirmed) throw new CancellationFailedError(result.error?.message, { jobId })
    }
    queue.remove(jobId)
    await storage.deleteJob(jobId)
    await jobManager.deleteJobRecord(jobId)
    invalidateCache(jobId)
    return successResponse({ jobId, message: 'İş silindi.' })
  } catch (e) { throw toGatewayError(e) }
}
