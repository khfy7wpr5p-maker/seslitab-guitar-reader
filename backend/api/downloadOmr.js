// GET /api/jobs/:id/omr and /api/v1/omr/:jobId handler.

import * as statusService from '../services/statusService.js'
import { ValidationError, toGatewayError } from '../utils/errors.js'

const RE = /^job_\d{10}_[a-z0-9]{6}$/

export async function handleDownloadOmr({ jobId }) {
  try {
    if (!jobId) throw new ValidationError('jobId zorunludur.')
    if (!RE.test(jobId)) throw new ValidationError('jobId formatı geçersiz.')
    return await statusService.getOmrArtifact(jobId)
  } catch (e) { throw toGatewayError(e) }
}
