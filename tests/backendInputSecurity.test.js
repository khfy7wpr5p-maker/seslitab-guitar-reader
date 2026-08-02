import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { GATEWAY_CONFIG } from '../backend/config/gatewayConfig.js'
import { handleUploadPdf } from '../backend/api/uploadPdf.js'
import * as jobManager from '../backend/jobs/jobManager.js'
import * as queue from '../backend/queue/uploadQueue.js'
import * as storage from '../backend/storage/musicXmlStorage.js'
import { processJob } from '../backend/workers/omrWorker.js'
import { buildMultipart } from '../backend/providers/HttpOmrProvider.js'
import { PDF_HEADER_SCAN_BYTES, parseMaxPdfPages, sanitizePdfFilename, validatePdf } from '../backend/security/inputValidation.js'

function makePdf(pageCount = 1, prefix = Buffer.alloc(0)) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, i) => `${i + 3} 0 R`).join(' ')}] /Count ${pageCount} >>`,
    ...Array.from({ length: pageCount }, () => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>'),
  ]
  const chunks = [Buffer.from(prefix), Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n', 'binary')]
  const offsets = [0]
  let length = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  for (let i = 0; i < objects.length; i++) {
    offsets.push(length)
    const chunk = Buffer.from(`${i + 1} 0 obj\n${objects[i]}\nendobj\n`)
    chunks.push(chunk); length += chunk.length
  }
  const xrefOffset = length
  const xref = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n']
  for (const offset of offsets.slice(1)) xref.push(`${String(offset).padStart(10, '0')} 00000 n \n`)
  xref.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`)
  chunks.push(Buffer.from(xref.join('')))
  return Buffer.concat(chunks)
}

async function removeJob(jobId) {
  queue.remove(jobId)
  await storage.deleteJob(jobId)
  await jobManager.deleteJobRecord(jobId)
}

async function snapshotStorage() {
  try {
    return { exists: true, entries: (await fs.readdir(GATEWAY_CONFIG.storagePath)).sort() }
  } catch (error) {
    if (error.code === 'ENOENT') return { exists: false, entries: [] }
    throw error
  }
}

afterEach(() => queue.clear())

test('structurally valid PDF and mixed-case extension are accepted', async () => {
  const result = await validatePdf({ buffer: makePdf(), fileName: 'Ders.PDF', maxPages: 200 })
  assert.equal(result.pageCount, 1)
  assert.equal(result.fileName, 'Ders.PDF')
})

test('leading bytes are accepted only when header remains in first 1024 bytes and parsing succeeds', async () => {
  const prefix = Buffer.alloc(PDF_HEADER_SCAN_BYTES - 5, 0x20)
  assert.equal((await validatePdf({ buffer: makePdf(1, prefix), fileName: 'score.pdf', maxPages: 200 })).pageCount, 1)
  await assert.rejects(validatePdf({ buffer: makePdf(1, Buffer.alloc(PDF_HEADER_SCAN_BYTES, 0x20)), fileName: 'score.pdf', maxPages: 200 }), error => error.code === 'INVALID_PDF')
})

test('fake, malformed, truncated and non-PDF content fail closed', async () => {
  for (const buffer of [Buffer.from('%PDF-1.7\nfake'), Buffer.from('%PDF-'), Buffer.from('not a pdf')]) {
    await assert.rejects(validatePdf({ buffer, fileName: 'score.pdf', maxPages: 200 }), error => error.code === 'INVALID_PDF')
  }
})

test('extension is mandatory and MIME claims are irrelevant', async () => {
  await assert.rejects(validatePdf({ buffer: makePdf(), fileName: 'score.txt', mimeType: 'application/pdf', maxPages: 200 }), error => error.code === 'INVALID_PDF')
  await assert.rejects(validatePdf({ buffer: Buffer.from('text'), fileName: 'score.pdf', mimeType: 'application/pdf', maxPages: 200 }), error => error.code === 'INVALID_PDF')
})

test('empty and encrypted/unreadable PDFs are rejected safely', async () => {
  await assert.rejects(validatePdf({ buffer: Buffer.alloc(0), fileName: 'empty.pdf', maxPages: 200 }), error => error.code === 'INVALID_PDF')
  const encrypted = Buffer.from('%PDF-1.7\n1 0 obj << /Encrypt 2 0 R >> endobj\n%%EOF')
  await assert.rejects(validatePdf({ buffer: encrypted, fileName: 'locked.pdf', maxPages: 200 }), error => ['INVALID_PDF', 'UNSUPPORTED_PDF'].includes(error.code))
})

test('200-page boundary succeeds and 201 pages fails with stable code', async () => {
  assert.equal((await validatePdf({ buffer: makePdf(200), fileName: 'book.pdf', maxPages: 200 })).pageCount, 200)
  await assert.rejects(validatePdf({ buffer: makePdf(201), fileName: 'book.pdf', maxPages: 200 }), error => error.code === 'PDF_PAGE_LIMIT_EXCEEDED')
})

test('page limit parsing accepts finite positive integers only', () => {
  assert.equal(parseMaxPdfPages(undefined, 200), 200)
  assert.equal(parseMaxPdfPages('12', 200), 12)
  for (const value of ['0', '-1', '1.5', 'abc', '9007199254740992']) assert.throws(() => parseMaxPdfPages(value, 200), error => error.code === 'INVALID_CONFIGURATION')
})

test('invalid configured page limit fails module initialization safely', () => {
  assert.throws(() => execFileSync(process.execPath, ['--input-type=module', '-e', "import('./backend/config/gatewayConfig.js')"], {
    cwd: process.cwd(), env: { ...process.env, SESLITAB_MAX_PDF_PAGES: '0' }, encoding: 'utf8', stdio: 'pipe',
  }))
})

test('filename policy blocks traversal and header injection while preserving safe Unicode', () => {
  for (const name of ['../secret.pdf', '..\\secret.pdf', '/tmp/secret.pdf', 'C:\\tmp\\secret.pdf', 'bad\0.pdf', 'bad\r.pdf', 'bad\n.pdf', 'bad".pdf']) {
    assert.throws(() => sanitizePdfFilename(name), error => error.code === 'UNSAFE_FILENAME')
  }
  assert.equal(sanitizePdfFilename('Türkçe Ders.PDF'), 'Türkçe Ders.PDF')
})

test('upload rejects invalid PDF before persistence, queue and storage', async () => {
  const beforeJobs = jobManager.snapshot().map(job => job.jobId)
  const beforeStorage = await snapshotStorage()
  await assert.rejects(handleUploadPdf({ fileBuffer: Buffer.from('%PDF-fake'), fileName: 'fake.pdf', provider: 'mock' }), error => error.code === 'INVALID_PDF')
  assert.deepEqual(jobManager.snapshot().map(job => job.jobId), beforeJobs)
  assert.equal(queue.size(), 0)
  assert.deepEqual(await snapshotStorage(), beforeStorage)
})

test('valid upload remains functional with sanitized display filename', async () => {
  const result = await handleUploadPdf({ fileBuffer: makePdf(), fileName: 'Türkçe Ders.PDF', provider: 'mock' })
  const jobId = result.data.jobId
  try {
    assert.equal(result.data.fileName, 'Türkçe Ders.PDF')
    assert.equal(queue.contains(jobId), true)
    assert.equal(await storage.inputExists(jobId), true)
  } finally { await removeJob(jobId) }
})

test('worker revalidation rejects altered persisted PDF before any provider lookup or call', async () => {
  const jobId = jobManager.generateJobId()
  const pdfPath = path.join(GATEWAY_CONFIG.storagePath, jobId, 'input.pdf')
  await jobManager.createJob({ jobId, fileName: 'score.pdf', provider: 'provider-that-must-not-be-looked-up', pdfPath })
  await jobManager.updateStatus(jobId, 'queued')
  await storage.writePdf(jobId, Buffer.from('%PDF-altered'))
  try {
    await assert.rejects(processJob({ jobId, provider: 'provider-that-must-not-be-looked-up', pdfPath, fileName: 'score.pdf' }), error => error.code === 'INVALID_PDF')
  } finally { await removeJob(jobId) }
})

test('HTTP multipart builder rejects unsafe outbound filename', () => {
  assert.throws(() => buildMultipart(makePdf(), 'safe.pdf\r\nX-Injected: yes', 'boundary'), error => error.code === 'UNSAFE_FILENAME')
})
