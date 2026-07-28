// OMR Service — thin orchestration layer over the OMR provider system.
//
// Supports both the in-browser mock provider and the Express OMR Gateway
// backend (via gatewayProvider). Polling stops on completion, failure,
// cancellation, or timeout (120s max).

import { getOmrProvider } from '../providers/index.js'

export async function uploadPdf(pdfFile) {
  return getOmrProvider().uploadPdf(pdfFile)
}

export async function convertPdfToMusicXML(jobId) {
  if (!jobId) return { success: false, error: 'İş kimliği gerekli.' }
  return getOmrProvider().analyzePdf(jobId)
}

export async function getConversionStatus(jobId) {
  return getOmrProvider().getStatus(jobId)
}

export async function downloadMusicXML(jobId) {
  return getOmrProvider().downloadMusicXML(jobId)
}

export async function downloadOmrProject(jobId) {
  const provider = getOmrProvider()
  if (typeof provider.downloadOmrProject !== 'function') {
    return { success: false, error: 'Bu sağlayıcı OMR proje indirmeyi desteklemiyor.' }
  }
  return provider.downloadOmrProject(jobId)
}

/**
 * Upload a PDF and start analysis. Returns { success, jobId }.
 * Does NOT wait for the MusicXML — the caller should poll separately.
 */
export async function uploadAndAnalyze(pdfFile) {
  const provider = getOmrProvider()
  const upload = await provider.uploadPdf(pdfFile)
  if (!upload.success) return upload
  const analyze = await provider.analyzePdf(upload.jobId)
  if (!analyze.success) return analyze
  return { success: true, jobId: upload.jobId, status: 'processing', provider: upload.provider }
}

/**
 * Poll job status until completed, then download MusicXML.
 * @param {string} jobId
 * @param {function} onProgress — optional callback(status, progress)
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{success: boolean, musicXml?: string, error?: string, status?: string}>}
 */
export async function pollAndDownload(jobId, onProgress = null, options = {}) {
  if (!jobId) return { success: false, error: 'İş kimliği alınamadı.' }

  const provider = getOmrProvider()
  const signal = options.signal
  const maxWaitMs = 120000
  const pollIntervalMs = 1500
  const start = Date.now()

  let status = 'processing'

  while (status !== 'completed' && status !== 'failed' && status !== 'canceled') {
    if (signal?.aborted) return { success: false, error: 'İşlem iptal edildi.', status: 'canceled' }
    if (Date.now() - start > maxWaitMs) return { success: false, error: 'İşlem zaman aşımına uğradı.', status: 'timeout' }

    await sleep(pollIntervalMs)
    if (signal?.aborted) return { success: false, error: 'İşlem iptal edildi.', status: 'canceled' }

    const statusResult = await provider.getStatus(jobId)
    if (!statusResult.success) {
      if (statusResult.statusCode === 404) return { success: false, error: 'İş kaydı bulunamadı.', status: 'not_found' }
      return { success: false, error: statusResult.error || 'Durum sorgulanamadı.' }
    }
    status = statusResult.status
    if (onProgress) onProgress(status, statusResult.progress || 0)
  }

  if (status === 'failed') return { success: false, error: 'Dönüştürme başarısız oldu.', status: 'failed' }
  if (status === 'canceled') return { success: false, error: 'İşlem iptal edildi.', status: 'canceled' }
  if (status !== 'completed') return { success: false, error: 'İşlem zaman aşımına uğradı.', status: 'timeout' }

  const download = await provider.downloadMusicXML(jobId)
  if (!download.success || !download.musicXml) {
    return { success: false, error: download.error || 'MusicXML indirilemedi.' }
  }
  if (!download.musicXml.trim()) {
    return { success: false, error: 'Sunucu boş veya geçersiz MusicXML döndürdü.' }
  }

  return { success: true, musicXml: download.musicXml }
}

/**
 * Cancel an active job. Only works for queued/processing jobs.
 */
export async function cancelOmrJob(jobId) {
  if (!jobId) return { success: false, error: 'İş kimliği gerekli.' }
  const provider = getOmrProvider()
  if (typeof provider.cancelJob !== 'function') {
    return { success: false, error: 'Bu sağlayıcı iptali desteklemiyor.' }
  }
  return provider.cancelJob(jobId)
}

/**
 * Delete a job and its files from the backend. Safe to call after download.
 */
export async function deleteOmrJob(jobId) {
  if (!jobId) return { success: false, error: 'İş kimliği gerekli.' }
  const provider = getOmrProvider()
  if (typeof provider.deleteJob !== 'function') {
    return { success: false, error: 'Bu sağlayıcı silmeyi desteklemiyor.' }
  }
  return provider.deleteJob(jobId)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
