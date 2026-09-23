// SesliTab Cloud OMR Gateway — Express HTTP Server
//
// Endpoints:
//   POST   /api/v1/pdf/upload        — multipart/form-data, field "file" = PDF
//   POST   /api/v1/pdf/analyze       — JSON body: { jobId }
//   POST   /api/v1/discovery/search  — provider-neutral score discovery
//   GET    /api/v1/job/:jobId        — poll job status
//   GET    /api/v1/musicxml/:jobId   — download MusicXML
//   DELETE /api/v1/job/:jobId        — cancel and delete job
//   GET    /api/v1/health            — health check

import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { GATEWAY_CONFIG } from './config/gatewayConfig.js'
import { getProviderName } from './providers/index.js'
import { runAudiverisPreflight, safePreflightResponse } from './services/audiverisPreflight.js'
import { startGateway, stopGateway } from './index.js'
import { toGatewayError, ValidationError } from './utils/errors.js'
import { createCorsOptions } from './security/corsPolicy.js'
import { createFixedWindowRateLimiter } from './security/rateLimitPolicy.js'
import { createSecureDeliveryConfig } from './delivery/config.js'
import { createUnavailableSecureDeliveryRouter } from './delivery/http/router.js'

import { handleUploadPdf } from './api/uploadPdf.js'
import { handleAnalyzePdf } from './api/analyzePdf.js'
import { handleGetJobStatus } from './api/getJobStatus.js'
import { handleDownloadMusicXml } from './api/downloadMusicXml.js'
import { handleDownloadOmr } from './api/downloadOmr.js'
import { handleDeleteJob } from './api/deleteJob.js'
import { handleCancelJob } from './api/cancelJob.js'
import { handleSearchDiscovery } from './api/searchDiscovery.js'

const PORT = process.env.PORT || process.env.OMR_GATEWAY_PORT || 3001
const HOST = '0.0.0.0'
async function ensureRuntimeDirs() {
  const dirs = [GATEWAY_CONFIG.storagePath]
  if (GATEWAY_CONFIG.tempDir) dirs.push(GATEWAY_CONFIG.tempDir)
  if (GATEWAY_CONFIG.dataDir) dirs.push(GATEWAY_CONFIG.dataDir)
  for (const d of dirs) {
    if (d) await fs.mkdir(d, { recursive: true }).catch(() => {})
  }
}

await ensureRuntimeDirs()

const app = express()

// Render forwards requests through internal reverse proxies.
// Trust only local/private proxy networks instead of trusting arbitrary
// forwarded headers from every source.
app.set('trust proxy', [
  'loopback',
  'linklocal',
  'uniquelocal',
])

let shuttingDown = false

// Exact-origin CORS allowlist.
// Production permits only the published SesliTab frontend.
// Requests without an Origin header remain available for health checks
// and server-to-server tools.
app.use(cors(createCorsOptions(GATEWAY_CONFIG.allowedOrigins)))
app.use(express.json())

// Reject new jobs/searches during shutdown.
app.use('/api/jobs', (req, res, next) => {
  if (shuttingDown && (req.method === 'POST' || req.method === 'PUT')) {
    return res.status(503).json({ success: false, error: { code: 'SHUTTING_DOWN', message: 'Sunucu kapanıyor, yeni iş kabul edilmiyor.' } })
  }
  next()
})
app.use('/api/v1/pdf', (req, res, next) => {
  if (shuttingDown && (req.method === 'POST' || req.method === 'PUT')) {
    return res.status(503).json({ success: false, error: { code: 'SHUTTING_DOWN', message: 'Sunucu kapanıyor, yeni iş kabul edilmiyor.' } })
  }
  next()
})
app.use('/api/v1/discovery', (req, res, next) => {
  if (shuttingDown && (req.method === 'POST' || req.method === 'PUT')) {
    return res.status(503).json({ success: false, error: { code: 'SHUTTING_DOWN', message: 'Sunucu kapanıyor, yeni arama kabul edilmiyor.' } })
  }
  next()
})

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: GATEWAY_CONFIG.maxUploadSizeBytes,
    files: 1,
    fields: 1,
    parts: 3,
    fieldNestingDepth: 0,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true)
    else cb(new Error('Sadece PDF dosyaları kabul edilir.'))
  },
})

function sendSuccess(res, data, status = 200) {
  res.status(status).json({ success: true, data })
}

function sendError(res, err) {
  const e = toGatewayError(err)
  res.status(e.statusCode).json(e.toJSON())
}

// --- Routes ---

app.get('/health', async (_req, res) => {
  const provider = getProviderName()
  let runtime = undefined
  if (provider === 'audiveris') {
    const result = await runAudiverisPreflight()
    runtime = safePreflightResponse(result)
  }
  sendSuccess(res, { status: 'ok', provider, runtime })
})

app.get('/api/v1/health', async (_req, res) => {
  const provider = getProviderName()
  let runtime = undefined
  if (provider === 'audiveris') {
    const result = await runAudiverisPreflight()
    runtime = safePreflightResponse(result)
  }
  sendSuccess(res, { status: 'ok', provider, runtime })
})

// Health endpoints above remain exempt from API limits.
const apiRateLimiter = createFixedWindowRateLimiter({
  windowMs: GATEWAY_CONFIG.rateLimit.windowMs,
  maxRequests: GATEWAY_CONFIG.rateLimit.apiMaxRequests,
  maxEntries: GATEWAY_CONFIG.rateLimit.maxEntries,
})

const jobRateLimiter = createFixedWindowRateLimiter({
  windowMs: GATEWAY_CONFIG.rateLimit.windowMs,
  maxRequests: GATEWAY_CONFIG.rateLimit.jobMaxRequests,
  maxEntries: GATEWAY_CONFIG.rateLimit.maxEntries,
})

app.use('/api', apiRateLimiter)

const SECURE_DELIVERY_CONFIG =
  createSecureDeliveryConfig(process.env)

// TD-06 is mounted fail-closed before Firebase composition exists.
// Task 10 will replace this unavailable boundary with the injected
// Secure Delivery composition after its own reviewed implementation.
app.use(
  '/api/secure-delivery/v1',
  createUnavailableSecureDeliveryRouter({
    config: SECURE_DELIVERY_CONFIG,
  }),
)

app.post('/api/v1/discovery/search', async (req, res) => {
  try {
    const result = await handleSearchDiscovery({ body: req.body })
    sendSuccess(res, result)
  } catch (e) { sendError(res, e) }
})

app.post('/api/v1/pdf/upload', jobRateLimiter, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendError(res, new ValidationError('PDF dosyası zorunludur. "file" alanını gönderin.'))
    const result = await handleUploadPdf({ fileBuffer: req.file.buffer, fileName: req.file.originalname, provider: req.body?.provider })
    sendSuccess(res, result.data || result, 201)
  } catch (e) { sendError(res, e) }
})

app.post('/api/v1/pdf/analyze', jobRateLimiter, async (req, res) => {
  try {
    const result = await handleAnalyzePdf({ jobId: req.body?.jobId })
    sendSuccess(res, result.data || result, 202)
  } catch (e) { sendError(res, e) }
})

app.get('/api/v1/job/:jobId', async (req, res) => {
  try {
    const result = await handleGetJobStatus({ jobId: req.params.jobId })
    const { success, ...data } = result
    sendSuccess(res, data)
  } catch (e) { sendError(res, e) }
})

app.get('/api/v1/musicxml/:jobId', async (req, res) => {
  try {
    const result = await handleDownloadMusicXml({ jobId: req.params.jobId })
    sendSuccess(res, { jobId: req.params.jobId, musicXml: result.musicXml, fileName: result.fileName })
  } catch (e) { sendError(res, e) }
})

app.get('/api/v1/omr/:jobId', async (req, res) => {
  try {
    const result = await handleDownloadOmr({ jobId: req.params.jobId })
    if (!result.success) return sendError(res, new ValidationError(result.error || '.omr bulunamadı.'))
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName || 'project.omr'}"`)
    res.status(200).send(result.omrBuffer)
  } catch (e) { sendError(res, e) }
})

app.delete('/api/v1/job/:jobId', async (req, res) => {
  try {
    const result = await handleDeleteJob({ jobId: req.params.jobId })
    sendSuccess(res, result.data || result)
  } catch (e) { sendError(res, e) }
})

// --- New /api/jobs endpoints (clean RESTful surface) ---

// POST /api/jobs — upload a PDF and create a job
app.post('/api/jobs', jobRateLimiter, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendError(res, new ValidationError('PDF dosyası zorunludur. "file" alanını gönderin.'))
    const result = await handleUploadPdf({ fileBuffer: req.file.buffer, fileName: req.file.originalname, provider: req.body?.provider })
    sendSuccess(res, result.data || result, 201)
  } catch (e) { sendError(res, e) }
})

// GET /api/jobs/:id/status — current job status
app.get('/api/jobs/:id/status', async (req, res) => {
  try {
    const result = await handleGetJobStatus({ jobId: req.params.id })
    const { success, ...data } = result
    sendSuccess(res, data)
  } catch (e) { sendError(res, e) }
})

// GET /api/jobs/:id/musicxml — download MusicXML (only when ready)
app.get('/api/jobs/:id/musicxml', async (req, res) => {
  try {
    const result = await handleDownloadMusicXml({ jobId: req.params.id })
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName || 'output.musicxml'}"`)
    res.status(200).send(result.musicXml)
  } catch (e) { sendError(res, e) }
})

app.get('/api/jobs/:id/omr', async (req, res) => {
  try {
    const result = await handleDownloadOmr({ jobId: req.params.id })
    if (!result.success) return sendError(res, new ValidationError(result.error || '.omr bulunamadı.'))
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName || 'project.omr'}"`)
    res.status(200).send(result.omrBuffer)
  } catch (e) { sendError(res, e) }
})

// POST /api/jobs/:id/cancel — cancel a queued/processing job
app.post('/api/jobs/:id/cancel', async (req, res) => {
  try {
    const result = await handleCancelJob({ jobId: req.params.id })
    sendSuccess(res, result.data || result)
  } catch (e) { sendError(res, e) }
})

// DELETE /api/jobs/:id — remove job and its files
app.delete('/api/jobs/:id', async (req, res) => {
  try {
    const result = await handleDeleteJob({ jobId: req.params.id })
    sendSuccess(res, result.data || result)
  } catch (e) { sendError(res, e) }
})

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint bulunamadı.' } })
})

// Error handler
app.use((err, req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'Dosya boyutu 10 MB sınırını aşıyor.' } })
  if (err.message?.includes('Sadece PDF')) return res.status(415).json({ success: false, error: { code: 'UNSUPPORTED_FILE_TYPE', message: err.message } })
  if (err instanceof multer.MulterError || req.is('multipart/form-data')) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_MULTIPART', message: 'Geçersiz veya sınırları aşan multipart form isteği.' } })
  }
  sendError(res, err)
})

// --- Start ---

// Recovery must complete before workers, cleanup, readiness and HTTP accept.
await startGateway()
const server = app.listen(PORT, HOST, () => {
  console.log(`[OMR Gateway] HTTP server on ${HOST}:${PORT}`)
  console.log(`[OMR Gateway] Endpoints:`)
  console.log(`  POST   /api/v1/discovery/search`)
  console.log(`  POST   /api/v1/pdf/upload`)
  console.log(`  POST   /api/v1/pdf/analyze`)
  console.log(`  GET    /api/v1/job/:jobId`)
  console.log(`  GET    /api/v1/musicxml/:jobId`)
  console.log(`  GET    /api/v1/omr/:jobId`)
  console.log(`  DELETE /api/v1/job/:jobId`)
  console.log(`  GET    /api/v1/health`)
  console.log(`  POST   /api/jobs`)
  console.log(`  GET    /api/jobs/:id/status`)
  console.log(`  GET    /api/jobs/:id/musicxml`)
  console.log(`  POST   /api/jobs/:id/cancel`)
  console.log(`  DELETE /api/jobs/:id`)
})

async function shutdown() {
  console.log('[OMR Gateway] Shutting down...')
  shuttingDown = true
  server.close()
  await stopGateway()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

export { app, server }
