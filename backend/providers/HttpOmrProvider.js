// HttpOmrProvider — sends PDF to a remote OMR HTTP service and receives MusicXML.
//
// Implements the same IOmrProvider interface as MockProvider/AudiverisProvider.
// The provider is server-side only; API keys never reach the frontend.

import { randomBytes } from 'node:crypto'
import { assertProvider } from './IOmrProvider.js'
import { sanitizePdfFilename } from '../security/inputValidation.js'
import { inspectMusicXml } from '../../musicXmlSecurity.js'

const SAMPLE_PARTWISE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>
  <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
  </measure></part>
</score-partwise>`

function parseConfig(env = process.env) {
  const apiUrl = (env.OMR_HTTP_API_URL || '').trim()
  const apiKey = (env.OMR_HTTP_API_KEY || '').trim()
  const timeoutMs = parseTimeout(env.OMR_HTTP_TIMEOUT_MS)
  return { apiUrl, apiKey, timeoutMs }
}

function parseTimeout(raw) {
  const DEFAULT = 120000
  if (!raw && raw !== 0) return DEFAULT
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT
  return Math.min(n, 600000)
}

function safeError(category, message) {
  const err = new Error(message)
  err.code = category
  return err
}

function buildMultipart(pdfBuffer, fileName, boundary) {
  const safeFileName = sanitizePdfFilename(fileName)
  const parts = []
  parts.push(`--${boundary}\r\n`)
  parts.push(`Content-Disposition: form-data; name="file"; filename="${safeFileName}"\r\n`)
  parts.push(`Content-Type: application/pdf\r\n\r\n`)
  const prefix = parts.join('')
  const suffix = `\r\n--${boundary}--\r\n`
  return Buffer.concat([Buffer.from(prefix, 'utf8'), Buffer.from(pdfBuffer), Buffer.from(suffix, 'utf8')])
}

function validateMusicXml(xml) {
  const validation = inspectMusicXml(xml)

  if (!validation.ok) {
    return {
      ok: false,
      error: safeError(validation.code, validation.message),
    }
  }

  return {
    ok: true,
    rootName: validation.rootName,
  }
}

function mapHttpError(status) {
  if (status === 401 || status === 403) return safeError('AUTH_ERROR', 'Uzak OMR hizmeti kimlik doğrulama hatası.')
  if (status === 429) return safeError('RATE_LIMIT', 'Uzak OMR hizmeti hız sınırı uyguluyor.')
  if (status >= 400 && status < 500) return safeError('CLIENT_ERROR', `Uzak OMR hizmeti istemci hatası (${status}).`)
  if (status >= 500) return safeError('SERVER_ERROR', `Uzak OMR hizmeti sunucu hatası (${status}).`)
  return safeError('UNKNOWN_HTTP', `Uzak OMR hizmeti bilinmeyen HTTP hatası (${status}).`)
}

function createHttpOmrProvider(config = parseConfig(), deps = {}) {
  const { apiUrl, apiKey, timeoutMs } = config
  const jobs = new Map()
  let counter = 0

  const provider = {
    async uploadPdf(pdfBuffer, fileName) {
      if (!pdfBuffer?.length) return { success: false, error: 'PDF boş.', retryable: false }
      if (!apiUrl) return { success: false, error: safeError('MISSING_URL', 'OMR HTTP API adresi yapılandırılmamış.'), retryable: false }
      const id = `http_${Date.now()}_${++counter}`
      jobs.set(id, { status: 'uploaded', progress: 0, musicXml: null, fileName, pdfBuffer, canceled: false })
      return { success: true, providerJobId: id, status: 'uploaded' }
    },

    async analyzePdf(id) {
      const j = jobs.get(id)
      if (!j) return { success: false, error: 'İş bulunamadı.', retryable: false }
      if (j.canceled) return { success: false, error: safeError('CANCELED', 'İşlem iptal edildi.'), retryable: false }
      j.status = 'processing'
      j.progress = 10

      const controller = new AbortController()
      j.controller = controller
      let timedOut = false
      const timeoutHandle = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)

      try {
        const boundary = `----SesliTab${Date.now()}${randomBytes(12).toString('hex')}`
        const body = buildMultipart(j.pdfBuffer, j.fileName, boundary)
        const headers = { 'Content-Type': `multipart/form-data; boundary=${boundary}` }
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

        let res
        try {
          res = await fetch(apiUrl, { method: 'POST', headers, body, signal: controller.signal })
        } catch (fetchErr) {
          if (j.canceled || (controller.signal.aborted && !timedOut)) {
            j.status = 'failed'
            return { success: false, error: safeError('CANCELED', 'İşlem iptal edildi.'), retryable: false }
          }
          if (timedOut || fetchErr?.name === 'AbortError') {
            j.status = 'failed'
            return { success: false, error: safeError('TIMEOUT', 'Uzak OMR hizmeti zaman aşımına uğradı.'), retryable: false }
          }
          j.status = 'failed'
          return { success: false, error: safeError('CONNECTION_ERROR', 'Uzak OMR hizmetine bağlanılamadı.'), retryable: false }
        }

        if (!res.ok) {
          j.status = 'failed'
          return { success: false, error: mapHttpError(res.status), retryable: res.status >= 500 }
        }

        const xml = await res.text()
        const validation = validateMusicXml(xml)
        if (!validation.ok) {
          j.status = 'failed'
          return { success: false, error: validation.error, retryable: false }
        }

        j.musicXml = xml
        j.status = 'completed'
        j.progress = 100
        return { success: true, providerJobId: id, status: 'completed', progress: 100 }
      } finally {
        clearTimeout(timeoutHandle)
        j.pdfBuffer = null
      }
    },

    async getStatus(id) {
      const j = jobs.get(id)
      if (!j) return { success: false, error: 'İş bulunamadı.', retryable: false }
      return { success: true, providerJobId: id, status: j.status, progress: j.progress }
    },

    async downloadMusicXML(id) {
      const j = jobs.get(id)
      if (!j || !j.musicXml) return { success: false, error: 'MusicXML hazır değil.', retryable: false }
      return { success: true, providerJobId: id, status: 'completed', musicXml: j.musicXml }
    },

    async cancelJob(id) {
      const j = jobs.get(id)
      if (!j) return { success: false, terminationConfirmed: false, error: { code: 'PROVIDER_JOB_NOT_FOUND', message: 'İş bulunamadı.' } }
      if (j.cancellationConfirmed) return { success: true, providerJobId: id, status: 'failed', terminationRequested: false, terminationConfirmed: true, alreadyClosed: true }
      if (j.cancelPromise) return j.cancelPromise
      j.canceled = true
      if (j.controller) j.controller.abort()
      j.cancelPromise = (async () => {
        if (typeof deps.cancelRemote !== 'function') {
          return { success: false, providerJobId: id, terminationRequested: true, terminationConfirmed: false, error: { code: 'CANCELLATION_FAILED', message: 'Uzak sağlayıcı iptalin tamamlandığını doğrulamadı.' } }
        }
        try {
          const remote = await deps.cancelRemote({ providerJobId: id })
          if (remote?.terminationConfirmed !== true) {
            return { success: false, providerJobId: id, terminationRequested: true, terminationConfirmed: false, error: { code: remote?.error?.code || 'CANCELLATION_FAILED', message: remote?.error?.message || 'Uzak sağlayıcı iptalin tamamlandığını doğrulamadı.' } }
          }
          j.cancellationConfirmed = true
          j.status = 'failed'
          return { success: true, providerJobId: id, status: 'failed', terminationRequested: true, terminationConfirmed: true }
        } catch {
          return { success: false, providerJobId: id, terminationRequested: true, terminationConfirmed: false, error: { code: 'CANCELLATION_FAILED', message: 'Uzak sağlayıcı iptal isteği başarısız oldu.' } }
        }
      })()
      return j.cancelPromise
    },

    async deleteJob(id) {
      const j = jobs.get(id)
      if (!j) return { success: false, error: 'İş bulunamadı.' }
      if (j.controller) j.controller.abort()
      j.pdfBuffer = null
      jobs.delete(id)
      return { success: true, providerJobId: id }
    },
  }

  assertProvider(provider, 'httpOmrProvider')
  return provider
}

export { createHttpOmrProvider, parseConfig, parseTimeout, validateMusicXml, mapHttpError, buildMultipart, SAMPLE_PARTWISE }
export default createHttpOmrProvider()
