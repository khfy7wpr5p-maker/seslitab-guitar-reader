#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DOCUMENT_TYPE = 'CeData01bLocalAudiverisEvidence'
const CONTRACT_VERSION = '1.0.0'
const EVIDENCE_CLASS = 'REAL_OMR_CAPTURE_PRELABEL'
const REVIEW_STATE = 'PENDING_TEACHER_REVIEW'
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function assertLoopbackGateway(gatewayUrl) {
  let parsed
  try { parsed = new URL(gatewayUrl) } catch { throw new TypeError('Gateway URL must be a valid loopback URL.') }
  if (!['http:', 'https:'].includes(parsed.protocol) || !LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new TypeError('CE-DATA-01B evidence capture permits loopback gateways only.')
  }
  return parsed.toString().replace(/\/$/u, '')
}

function assertVersionEvidence(engineVersion, engineVersionOutput) {
  if (typeof engineVersion !== 'string' || !engineVersion.trim()) {
    throw new TypeError('Pinned engine version is required.')
  }
  if (typeof engineVersionOutput !== 'string' || !engineVersionOutput.includes(engineVersion)) {
    throw new TypeError('Audiveris version evidence does not contain the pinned engine version.')
  }
}

async function readPdf(pdfPath) {
  const bytes = await fs.readFile(pdfPath)
  if (path.extname(pdfPath).toLowerCase() !== '.pdf' || bytes.subarray(0, 5).toString() !== '%PDF-') {
    throw new TypeError('Source must be a valid PDF.')
  }
  return bytes
}

async function readReference(referencePath) {
  if (!referencePath) return null
  const bytes = await fs.readFile(referencePath)
  if (bytes.length === 0) throw new TypeError('Reference MusicXML must not be empty.')
  return bytes
}

async function requireJson(response, label) {
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}.`)
  return response.json()
}

async function delay(ms) {
  if (ms <= 0) return
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function captureLocalAudiverisEvidence({
  pdfPath,
  referencePath = null,
  outDir,
  gatewayUrl = 'http://127.0.0.1:8080',
  engineVersion,
  engineVersionOutput,
  pollIntervalMs = 1000,
  maxPollAttempts = 180,
}) {
  const baseUrl = assertLoopbackGateway(gatewayUrl)
  assertVersionEvidence(engineVersion, engineVersionOutput)
  if (!pdfPath || !outDir) throw new TypeError('pdfPath and outDir are required.')

  const pdfBytes = await readPdf(pdfPath)
  const referenceBytes = await readReference(referencePath)

  const health = await requireJson(await fetch(`${baseUrl}/health`), 'Audiveris health check')
  const provider = health.data?.provider
  const runtime = health.data?.runtime ?? {}
  if (provider !== 'audiveris') throw new Error(`Expected audiveris provider, received ${provider ?? 'unknown'}.`)
  if (runtime.audiverisAvailable !== true && runtime.available !== true) {
    throw new Error('Audiveris runtime is not available.')
  }
  if (runtime.versionCheck === false) throw new Error('Audiveris runtime version check failed.')

  let jobId = null
  try {
    const form = new FormData()
    form.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), path.basename(pdfPath))
    const upload = await requireJson(await fetch(`${baseUrl}/api/jobs`, { method: 'POST', body: form }), 'Audiveris upload')
    jobId = upload.data?.jobId
    if (!jobId) throw new Error('Audiveris upload did not return a job id.')

    let completed = false
    for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
      const status = await requireJson(await fetch(`${baseUrl}/api/jobs/${encodeURIComponent(jobId)}/status`), 'Audiveris status')
      const state = status.data?.status
      if (state === 'completed') { completed = true; break }
      if (state === 'failed' || state === 'expired') throw new Error(`Audiveris job ended in ${state}.`)
      await delay(pollIntervalMs)
    }
    if (!completed) throw new Error('Audiveris job did not complete within the polling limit.')

    const musicXmlResponse = await fetch(`${baseUrl}/api/jobs/${encodeURIComponent(jobId)}/musicxml`)
    if (!musicXmlResponse.ok) throw new Error(`MusicXML download failed with HTTP ${musicXmlResponse.status}.`)
    const musicXmlBytes = Buffer.from(await musicXmlResponse.arrayBuffer())
    const musicXmlText = musicXmlBytes.toString('utf8')
    if (!/<score-(partwise|timewise)([\s>])/u.test(musicXmlText)) {
      throw new TypeError('Audiveris output is not valid MusicXML.')
    }

    const omrResponse = await fetch(`${baseUrl}/api/jobs/${encodeURIComponent(jobId)}/omr`)
    const omrBytes = omrResponse.ok ? Buffer.from(await omrResponse.arrayBuffer()) : null

    await fs.mkdir(outDir, { recursive: true })
    await fs.writeFile(path.join(outDir, path.basename(pdfPath)), pdfBytes)
    if (referenceBytes) await fs.writeFile(path.join(outDir, path.basename(referencePath)), referenceBytes)
    await fs.writeFile(path.join(outDir, 'output.musicxml'), musicXmlBytes)
    if (omrBytes?.length) await fs.writeFile(path.join(outDir, 'project.omr'), omrBytes)
    await fs.writeFile(path.join(outDir, 'audiveris-version.txt'), `${engineVersionOutput.trim()}\n`)

    const manifest = {
      documentType: DOCUMENT_TYPE,
      contractVersion: CONTRACT_VERSION,
      evidenceClass: EVIDENCE_CLASS,
      reviewState: REVIEW_STATE,
      source: {
        fileName: path.basename(pdfPath),
        sha256: sha256(pdfBytes),
        byteLength: pdfBytes.byteLength,
      },
      reference: referenceBytes ? {
        fileName: path.basename(referencePath),
        sha256: sha256(referenceBytes),
        byteLength: referenceBytes.byteLength,
      } : null,
      engine: {
        id: 'audiveris',
        version: engineVersion,
        versionEvidenceSha256: sha256(Buffer.from(engineVersionOutput)),
      },
      musicXml: {
        fileName: 'output.musicxml',
        sha256: sha256(musicXmlBytes),
        byteLength: musicXmlBytes.byteLength,
      },
      omr: omrBytes?.length ? {
        fileName: 'project.omr',
        sha256: sha256(omrBytes),
        byteLength: omrBytes.byteLength,
      } : null,
    }

    const manifestPath = path.join(outDir, 'evidence.json')
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    return { manifestPath, manifest }
  } finally {
    if (jobId) {
      await fetch(`${baseUrl}/api/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' }).catch(() => {})
    }
  }
}

function parseCliArgs(argv) {
  const args = [...argv]
  const pdfPath = args.shift()
  const options = { pdfPath, gatewayUrl: 'http://127.0.0.1:8080' }
  while (args.length) {
    const flag = args.shift()
    const value = args.shift()
    if (!value) throw new TypeError(`Missing value for ${flag}.`)
    if (flag === '--gateway') options.gatewayUrl = value
    else if (flag === '--out') options.outDir = value
    else if (flag === '--reference') options.referencePath = value
    else if (flag === '--engine-version') options.engineVersion = value
    else if (flag === '--engine-version-file') options.engineVersionFile = value
    else throw new TypeError(`Unknown argument: ${flag}`)
  }
  return options
}

async function runCli() {
  const options = parseCliArgs(process.argv.slice(2))
  if (!options.pdfPath || !options.outDir || !options.engineVersion || !options.engineVersionFile) {
    throw new TypeError('Usage: node scripts/local-audiveris-evidence-capture.js <source.pdf> --out <dir> --engine-version <version> --engine-version-file <file> [--reference <musicxml>] [--gateway <loopback-url>]')
  }
  options.engineVersionOutput = await fs.readFile(options.engineVersionFile, 'utf8')
  delete options.engineVersionFile
  const result = await captureLocalAudiverisEvidence(options)
  process.stdout.write(`${result.manifestPath}\n`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  runCli().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}

export { captureLocalAudiverisEvidence, assertLoopbackGateway, assertVersionEvidence, sha256 }
