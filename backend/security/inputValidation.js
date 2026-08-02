import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import {
  FileTooLargeError,
  InvalidConfigurationError,
  InvalidPdfError,
  PdfPageLimitError,
  UnsafeFilenameError,
  UnsupportedPdfError,
} from '../utils/errors.js'

export const PDF_HEADER_SCAN_BYTES = 1024
const PDF_HEADER = Buffer.from('%PDF-', 'ascii')

export function parseMaxPdfPages(raw, fallback = 200) {
  const value = raw === undefined || raw === '' ? fallback : Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) throw new InvalidConfigurationError()
  return value
}

export function sanitizePdfFilename(input) {
  if (typeof input !== 'string') throw new UnsafeFilenameError()
  const name = input.normalize('NFC').trim()
  if (!name || /[\0-\x1f\x7f"]/.test(name) || name.includes('/') || name.includes('\\') || /(^|[\\/])\.\.([\\/]|$)/.test(name) || /^[a-zA-Z]:/.test(name)) {
    throw new UnsafeFilenameError()
  }
  if (!/\.pdf$/i.test(name) || name === '.' || name === '..') throw new InvalidPdfError('Dosya uzantısı .pdf olmalıdır.')
  return name
}

export async function validatePdf({ buffer, fileName, maxPages = 200, maxBytes = Infinity }) {
  const safeFileName = sanitizePdfFilename(fileName)
  if (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) throw new InvalidPdfError()
  const bytes = Buffer.from(buffer)
  if (!bytes.length) throw new InvalidPdfError('PDF dosyası boş veya okunamıyor.')
  if (bytes.length > maxBytes) throw new FileTooLargeError('10 MB sınırı aşıldı.')

  const headerIndex = bytes.subarray(0, PDF_HEADER_SCAN_BYTES).indexOf(PDF_HEADER)
  if (headerIndex < 0 || headerIndex + PDF_HEADER.length > PDF_HEADER_SCAN_BYTES) throw new InvalidPdfError('Geçerli PDF başlığı bulunamadı.')

  let loadingTask
  let document
  try {
    loadingTask = getDocument({
      data: new Uint8Array(bytes),
      disableWorker: true,
      disableAutoFetch: true,
      disableStream: true,
      isEvalSupported: false,
      useWorkerFetch: false,
      useSystemFonts: false,
      disableFontFace: true,
      verbosity: 0,
    })
    document = await loadingTask.promise
    const pageCount = document.numPages
    if (!Number.isSafeInteger(pageCount) || pageCount <= 0) throw new InvalidPdfError()
    if (pageCount > maxPages) throw new PdfPageLimitError(`PDF en fazla ${maxPages} sayfa olabilir.`, { pageCount, maxPages })
    return { fileName: safeFileName, pageCount, headerOffset: headerIndex }
  } catch (error) {
    if (error instanceof FileTooLargeError || error instanceof InvalidPdfError || error instanceof PdfPageLimitError || error instanceof UnsafeFilenameError) throw error
    if (error?.name === 'PasswordException') throw new UnsupportedPdfError()
    throw new InvalidPdfError()
  } finally {
    try { if (document) await document.destroy(); else if (loadingTask) await loadingTask.destroy() } catch {}
  }
}
