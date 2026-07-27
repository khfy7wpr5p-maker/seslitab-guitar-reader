// POST /api/v1/pdf/analyze handler.

import * as jobManager from '../jobs/jobManager.js'
import * as queue from '../queue/uploadQueue.js'
import { ValidationError, JobNotReadyError, toGatewayError, successResponse } from '../utils/errors.js'

const RE = /^job_\d{10}_[a-z0-9]{6}$/

export async function handleAnalyzePdf({ jobId }) {
  try {
    if (!jobId) throw new ValidationError('jobId zorunludur.')
    if (!RE.test(jobId)) throw new ValidationError('jobId formatı geçersiz.')
    const r = await jobManager.getJob(jobId)
    if (['completed', 'processing', 'musicxml_created'].includes(r.status)) throw new JobNotReadyError(jobId, r.status)
    if (r.status === 'uploaded') { await queue.enqueue({ jobId, provider: r.provider, pdfPath: r.pdfPath, fileName: r.fileName }); await jobManager.updateStatus(jobId, 'queued') }
    return successResponse({ jobId, status: 'queued', message: 'Analiz kuyruğa eklendi.' })
  } catch (e) { throw toGatewayError(e) }
}
