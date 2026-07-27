// DELETE /api/v1/job/:jobId handler.

import * as jobManager from '../jobs/jobManager.js'
import * as queue from '../queue/uploadQueue.js'
import * as storage from '../storage/musicXmlStorage.js'
import { invalidateCache } from '../services/statusService.js'
import { ValidationError, toGatewayError, successResponse } from '../utils/errors.js'

const RE = /^job_\d{10}_[a-z0-9]{6}$/

export async function handleDeleteJob({ jobId }) {
  try {
    if (!jobId) throw new ValidationError('jobId zorunludur.')
    if (!RE.test(jobId)) throw new ValidationError('jobId formatı geçersiz.')
    await jobManager.getJob(jobId)
    queue.remove(jobId)
    await storage.deleteJob(jobId)
    await jobManager.deleteJobRecord(jobId)
    invalidateCache(jobId)
    return successResponse({ jobId, message: 'İş silindi.' })
  } catch (e) { throw toGatewayError(e) }
}
