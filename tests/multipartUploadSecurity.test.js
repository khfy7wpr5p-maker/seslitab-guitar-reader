import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PORT = 4001
const BASE = `http://localhost:${PORT}`
const TMP_STORAGE = mkdtempSync(path.join(os.tmpdir(), 'seslitab-multipart-security-'))
let serverProcess = null

function makePdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
  ]
  let pdf = '%PDF-1.7\n'
  const offsets = [0]
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 4\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return pdf
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || ''
  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text()
  return { status: response.status, data }
}

async function sendMultipart(parts, { close = true } = {}) {
  const boundary = `----SesliTabSecurity${Math.random().toString(36).slice(2)}`
  let body = ''

  for (const part of parts) {
    body += `--${boundary}\r\n`
    if (part.filename) {
      body += `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n`
      body += `Content-Type: ${part.contentType || 'application/pdf'}\r\n\r\n`
      body += `${part.value}\r\n`
    } else {
      body += `Content-Disposition: form-data; name="${part.name}"\r\n\r\n`
      body += `${part.value}\r\n`
    }
  }

  if (close) body += `--${boundary}--\r\n`

  const response = await fetch(`${BASE}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  })

  return parseResponse(response)
}

before(async () => {
  serverProcess = spawn(process.execPath, ['backend/server.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      OMR_PROVIDER: 'mock',
      SESLITAB_MUSICXML_DIR: TMP_STORAGE,
    },
    stdio: 'pipe',
  })

  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/api/v1/health`)
      if (response.ok) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  throw new Error('Multipart security test server did not become ready.')
})

after(async () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM')
    await new Promise(resolve => setTimeout(resolve, 500))
    serverProcess = null
  }
  rmSync(TMP_STORAGE, { recursive: true, force: true })
})

test('Multer 2.2.0 and strict multipart limits are pinned in production configuration', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const packageLock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
  const serverSource = readFileSync(new URL('../backend/server.js', import.meta.url), 'utf8')

  assert.equal(packageJson.dependencies.multer, '2.2.0')
  assert.equal(packageLock.packages[''].dependencies.multer, '2.2.0')
  assert.equal(packageLock.packages['node_modules/multer'].version, '2.2.0')
  assert.match(serverSource, /fileSize:\s*GATEWAY_CONFIG\.maxUploadSizeBytes/)
  assert.match(serverSource, /files:\s*1/)
  assert.match(serverSource, /fields:\s*1/)
  assert.match(serverSource, /parts:\s*2/)
  assert.match(serverSource, /fieldNestingDepth:\s*0/)
})

test('normal PDF plus one provider field remains accepted', async () => {
  const result = await sendMultipart([
    { name: 'provider', value: 'mock' },
    { name: 'file', filename: 'normal.pdf', contentType: 'application/pdf', value: makePdf() },
  ])

  assert.equal(result.status, 201)
  assert.equal(result.data.success, true)
  assert.equal(result.data.data.provider, 'mock')
})

test('nested multipart field names are rejected safely', async () => {
  const result = await sendMultipart([
    { name: 'provider[nested]', value: 'mock' },
    { name: 'file', filename: 'nested.pdf', contentType: 'application/pdf', value: makePdf() },
  ])

  assert.equal(result.status, 400)
  assert.equal(result.data.error.code, 'INVALID_MULTIPART')
})

test('excess fields or parts are rejected safely', async () => {
  const result = await sendMultipart([
    { name: 'provider', value: 'mock' },
    { name: 'extra', value: 'not-allowed' },
    { name: 'file', filename: 'parts.pdf', contentType: 'application/pdf', value: makePdf() },
  ])

  assert.equal(result.status, 400)
  assert.equal(result.data.error.code, 'INVALID_MULTIPART')
})

test('more than one uploaded file is rejected safely', async () => {
  const result = await sendMultipart([
    { name: 'file', filename: 'one.pdf', contentType: 'application/pdf', value: makePdf() },
    { name: 'file', filename: 'two.pdf', contentType: 'application/pdf', value: makePdf() },
  ])

  assert.equal(result.status, 400)
  assert.equal(result.data.error.code, 'INVALID_MULTIPART')
})

test('malformed multipart bodies fail closed without killing the server', async () => {
  const result = await sendMultipart([
    { name: 'provider', value: 'mock' },
    { name: 'file', filename: 'broken.pdf', contentType: 'application/pdf', value: makePdf() },
  ], { close: false })

  assert.equal(result.status, 400)
  assert.equal(result.data.error.code, 'INVALID_MULTIPART')

  const health = await fetch(`${BASE}/api/v1/health`)
  assert.equal(health.status, 200)
})
