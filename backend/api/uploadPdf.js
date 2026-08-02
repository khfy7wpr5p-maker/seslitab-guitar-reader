// POST /api/v1/pdf/upload handler.

import path from 'node:path'
import { GATEWAY_CONFIG } from '../config/gatewayConfig.js'
import * as jobManager from '../jobs/jobManager.js'
import * as queue from '../queue/uploadQueue.js'
import * as storage from '../storage/musicXmlStorage.js'
import { logLifecycle, markStart } from '../utils/logger.js'
import { ValidationError, FileTooLargeError, toGatewayError, successResponse } from '../utils/errors.js'
import { validatePdf } from '../security/inputValidation.js'

export async function handleUploadPdf({ fileBuffer, fileName, provider }) {
  let createdJobId = null
  let queued = false
  try {
    if (!fileBuffer?.length) throw new ValidationError('PDF dosyası zorunludur.')
    if (fileBuffer.length > GATEWAY_CONFIG.maxUploadSizeBytes) throw new FileTooLargeError('10 MB sınırı aşıldı.')
    const validation = await validatePdf({ buffer: fileBuffer, fileName, maxPages: GATEWAY_CONFIG.maxPdfPages, maxBytes: GATEWAY_CONFIG.maxUploadSizeBytes })
    fileName = validation.fileName
    const p = provider || GATEWAY_CONFIG.defaultProvider
    const jobId = jobManager.generateJobId()
    createdJobId = jobId
    markStart(jobId)
    logLifecycle('upload_received', { jobId, status: 'uploaded', provider: p })
    const pdfPath = path.join(GATEWAY_CONFIG.storagePath, jobId, 'input.pdf')
    await jobManager.createJob({ jobId, fileName, provider: p, pdfPath })
    logLifecycle('job_created', { jobId, status: 'uploaded', provider: p })
    await storage.writePdf(jobId, fileBuffer)
    const q = await queue.enqueue({ jobId, provider: p, pdfPath, fileName })
    if (!q.accepted) throw new ValidationError('Kuyruğa eklenemedi.')
    await jobManager.updateStatus(jobId, 'queued')
    queued = true
    logLifecycle('job_queued', { jobId, status: 'queued', provider: p })
    const r = await jobManager.getJob(jobId)
    return successResponse({ jobId: r.jobId, status: r.status, fileName: r.fileName, provider: r.provider, createdAt: r.createdAt })
  } catch (e) {
    if (createdJobId && !queued) {
      try {
        queue.remove(createdJobId)
        await storage.deleteJob(createdJobId)
        await jobManager.deleteJobRecord(createdJobId)
      } catch (rollbackError) {
        e.details = { ...(e.details || {}), rollbackError: rollbackError.message }
      }
    }
    throw toGatewayError(e)
  }
}
