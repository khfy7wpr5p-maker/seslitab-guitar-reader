// GatewayProvider — connects the frontend to the Express OMR Gateway backend.
//
// Implements the same IOmrProvider interface as the in-browser mock, but every
// call is an HTTP request to the backend's /api/jobs endpoints. The backend
// keeps MockProvider active, so the returned MusicXML is mock output.

import { assertProvider } from './IOmrProvider.js'

function getBaseUrl() {
  // Allow tests to inject a base URL without relying on Vite's import.meta.env.
  if (globalThis.__OMR_GATEWAY_URL__ !== undefined && globalThis.__OMR_GATEWAY_URL__ !== '') return globalThis.__OMR_GATEWAY_URL__
  if (import.meta.env && import.meta.env.VITE_OMR_GATEWAY_URL) return import.meta.env.VITE_OMR_GATEWAY_URL
  return ''
}

function gatewayUrl() {
  const base = getBaseUrl()
  if (!base) {
    const err = new Error('OMR sunucu adresi yapılandırılmamış.')
    err.code = 'GATEWAY_URL_MISSING'
    throw err
  }
  return base.replace(/\/$/, '')
}

async function asFetchError(res) {
  let body = null
  try { body = await res.json() } catch {}
  const msg = body?.error?.message || `HTTP ${res.status}`
  const err = new Error(msg)
  err.code = body?.error?.code || `HTTP_${res.status}`
  err.statusCode = res.status
  return err
}

async function doFetch(path, opts = {}) {
  const url = gatewayUrl() + path
  let res
  try {
    res = await fetch(url, opts)
  } catch (e) {
    const err = new Error('OMR sunucusuna bağlanılamadı.')
    err.code = 'NETWORK_ERROR'
    err.cause = e
    throw err
  }
  if (!res.ok) throw await asFetchError(res)
  return res
}

const gatewayProvider = {
  async uploadPdf(pdfFile) {
    if (!pdfFile) return { success: false, error: 'PDF dosyası boş.' }
    const form = new FormData()
    form.append('file', pdfFile)
    let res
    try {
      res = await doFetch('/api/jobs', { method: 'POST', body: form })
    } catch (e) {
      return { success: false, error: e.message, code: e.code }
    }
    const data = await res.json()
    const d = data.data || data
    return { success: true, jobId: d.jobId, status: d.status, provider: d.provider }
  },

  // The backend auto-queues on upload, so analysis is already started.
  async analyzePdf(jobId) {
    if (!jobId) return { success: false, error: 'İş kimliği gerekli.' }
    return { success: true, jobId, status: 'processing' }
  },

  async getStatus(jobId) {
    if (!jobId) return { success: false, error: 'İş kimliği gerekli.' }
    let res
    try {
      res = await doFetch(`/api/jobs/${jobId}/status`)
    } catch (e) {
      return { success: false, error: e.message, code: e.code, statusCode: e.statusCode }
    }
    const data = await res.json()
    const d = data.data || data
    return { success: true, status: d.status, progress: d.progress || 0, jobId: d.jobId }
  },

  async downloadMusicXML(jobId) {
    if (!jobId) return { success: false, error: 'İş kimliği gerekli.' }
    let res
    try {
      res = await doFetch(`/api/jobs/${jobId}/musicxml`)
    } catch (e) {
      return { success: false, error: e.message, code: e.code, statusCode: e.statusCode }
    }
    const xml = await res.text()
    if (!xml || !xml.trim()) return { success: false, error: 'Sunucu boş veya geçersiz MusicXML döndürdü.' }
    return { success: true, musicXml: xml }
  },

  async cancelJob(jobId) {
    if (!jobId) return { success: false, error: 'İş kimliği gerekli.' }
    let res
    try {
      res = await doFetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' })
    } catch (e) {
      return { success: false, error: e.message, code: e.code }
    }
    const data = await res.json()
    return { success: true, jobId, status: 'failed', data: data.data || data }
  },

  async deleteJob(jobId) {
    if (!jobId) return { success: false, error: 'İş kimliği gerekli.' }
    try {
      await doFetch(`/api/jobs/${jobId}`, { method: 'DELETE' })
    } catch (e) {
      return { success: false, error: e.message, code: e.code }
    }
    return { success: true, jobId }
  },
}

assertProvider(gatewayProvider, 'gatewayProvider')
export default gatewayProvider
