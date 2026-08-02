// SesliTab Cloud OMR Gateway — entry point.
import { startWorkerPool, stopWorkerPool } from './workers/omrWorker.js'
import { startCleanup, stopCleanup } from './services/cleanupService.js'
import { getProviderName, listProviders } from './providers/index.js'
import { recoverJobs } from './jobs/jobManager.js'

export { handleUploadPdf } from './api/uploadPdf.js'
export { handleAnalyzePdf } from './api/analyzePdf.js'
export { handleGetJobStatus } from './api/getJobStatus.js'
export { handleDownloadMusicXml } from './api/downloadMusicXml.js'
export { handleDeleteJob } from './api/deleteJob.js'
export { handleCancelJob } from './api/cancelJob.js'
export { recoverJobs } from './jobs/jobManager.js'

let startPromise = null
export async function startGateway(deps = {}) {
  if (startPromise) return startPromise
  startPromise = (async () => {
    console.log(`[OMR Gateway] Provider: ${getProviderName()} | Available: ${listProviders().join(', ')}`)
    const recovery = await (deps.recoverJobs || recoverJobs)(deps.recoveryOptions)
    ;(deps.startWorkerPool || startWorkerPool)()
    ;(deps.startCleanup || startCleanup)()
    console.log('[OMR Gateway] Ready.')
    return recovery
  })()
  try { return await startPromise } catch (e) { startPromise = null; throw e }
}
export async function stopGateway() { await stopWorkerPool(); stopCleanup(); startPromise = null; console.log('[OMR Gateway] Stopped.') }
