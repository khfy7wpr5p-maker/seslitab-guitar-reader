// GET /api/v1/job/:jobId handler.

import * as statusService from '../services/statusService.js'
import { ValidationError, toGatewayError } from '../utils/errors.js'

const RE = /^job_\d{10}_[a-z0-9]{6}$/

export async function handleGetJobStatus({ jobId }) {
  try {
    if (!jobId) throw new ValidationError('jobId zorunludur.')
    if (!RE.test(jobId)) throw new ValidationError('jobId formatı geçersiz.')
    return await statusService.getJobStatus(jobId)
  } catch (e) { throw toGatewayError(e) }
}
