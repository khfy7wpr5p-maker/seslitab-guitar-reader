// SesliTab Cloud OMR Gateway — entry point.

import { startWorkerPool, stopWorkerPool } from './workers/omrWorker.js'
import { startCleanup, stopCleanup } from './services/cleanupService.js'
import { getProviderName, listProviders } from './providers/index.js'

export { handleUploadPdf } from './api/uploadPdf.js'
export { handleAnalyzePdf } from './api/analyzePdf.js'
export { handleGetJobStatus } from './api/getJobStatus.js'
export { handleDownloadMusicXml } from './api/downloadMusicXml.js'
export { handleDeleteJob } from './api/deleteJob.js'
export { handleCancelJob } from './api/cancelJob.js'

export function startGateway() {
  console.log(`[OMR Gateway] Provider: ${getProviderName()} | Available: ${listProviders().join(', ')}`)
  startWorkerPool()
  startCleanup()
  console.log('[OMR Gateway] Ready.')
}

export async function stopGateway() {
  await stopWorkerPool()
  stopCleanup()
  console.log('[OMR Gateway] Stopped.')
}
