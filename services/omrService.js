// OMR Service — thin orchestration layer over the OMR provider system.
//
// This module exposes the app-facing API (uploadPdf, convertPdfToMusicXML,
// getConversionStatus, downloadMusicXML, sendPdfToOmr). It does NOT contain
// any OMR logic itself — it delegates to the active IOmrProvider resolved by
// the factory in providers/index.js. The provider is selected by the
// VITE_OMR_PROVIDER env var; switching engines is a single config change.
//
// The rest of the app (main.js) imports from here and never knows which
// provider is active.

import { getOmrProvider, getOmrProviderName, listOmrProviders } from '../providers/index.js'

// Re-export provider info for debugging / UI display if needed.
export { getOmrProviderName, listOmrProviders }

/**
 * Step 1 — upload a PDF and register an OMR job.
 * @param {File} pdfFile
 * @returns {Promise<{ success: boolean, jobId?: string, error?: string }>}
 */
export async function uploadPdf(pdfFile) {
  return getOmrProvider().uploadPdf(pdfFile)
}

/**
 * Step 2 — start OMR recognition for a previously uploaded job.
 * @param {string} jobId
 * @returns {Promise<{ success: boolean, jobId?: string, status?: string, error?: string }>}
 */
export async function convertPdfToMusicXML(jobId) {
  if (!jobId) {
    return { success: false, error: 'İş kimliği gerekli.' }
  }
  return getOmrProvider().analyzePdf(jobId)
}

/**
 * Step 3 — poll the status of an OMR conversion job.
 * @param {string} jobId
 * @returns {Promise<{ success: boolean, status?: string, error?: string }>}
 */
export async function getConversionStatus(jobId) {
  return getOmrProvider().getStatus(jobId)
}

/**
 * Step 4 — download the finished MusicXML for a completed job.
 * @param {string} jobId
 * @returns {Promise<{ success: boolean, musicXml?: string, error?: string }>}
 */
export async function downloadMusicXML(jobId) {
  return getOmrProvider().downloadMusicXML(jobId)
}

// ---------------------------------------------------------------------------
// Convenience: run the full pipeline in one call (upload → analyze → download).
// Kept for backwards compatibility with previous sendPdfToOmr() callers.
// ---------------------------------------------------------------------------
export async function sendPdfToOmr(pdfFile) {
  const provider = getOmrProvider()

  const upload = await provider.uploadPdf(pdfFile)
  if (!upload.success) return upload

  const analyze = await provider.analyzePdf(upload.jobId)
  if (!analyze.success) return analyze

  return provider.downloadMusicXML(upload.jobId)
}
