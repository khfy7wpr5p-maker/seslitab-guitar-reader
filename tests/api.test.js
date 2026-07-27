// Focused API tests for the /api/jobs endpoints.
// Uses Node's built-in test runner + the running backend server.
// Run with: node --test tests/api.test.js
//
// These tests start the backend server on a test port and exercise the
// /api/jobs endpoints end-to-end via real HTTP requests.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const PORT = 3999
const BASE = `http://localhost:${PORT}`
const TMP_STORAGE = mkdtempSync(path.join(os.tmpdir(), 'seslitab-test-'))
const STORAGE = TMP_STORAGE

let serverProcess = null

// ── Helpers ──────────────────────────────────────────────────

async function request(method, urlPath, { headers = {}, body = null, isForm = false, formData = null } = {}) {
  const url = new URL(urlPath, BASE)
  const opts = { method, headers: { ...headers } }

  if (isForm && formData) {
    // Build multipart/form-data manually
    const boundary = '----TestBoundary' + Math.random().toString(36).slice(2)
    opts.headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`
    let payload = ''
    for (const [key, value] of Object.entries(formData)) {
      if (value === null || value === undefined) continue
      if (key === 'file') {
        payload += `--${boundary}\r\n`
        payload += `Content-Disposition: form-data; name="file"; filename="${value.filename}"\r\n`
        payload += `Content-Type: ${value.contentType || 'application/pdf'}\r\n\r\n`
        payload += `${value.content}\r\n`
      } else {
        payload += `--${boundary}\r\n`
        payload += `Content-Disposition: form-data; name="${key}"\r\n\r\n`
        payload += `${value}\r\n`
      }
    }
    payload += `--${boundary}--\r\n`
    opts.body = payload
  } else if (body) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }

  const res = await fetch(url, opts)
  const contentType = res.headers.get('content-type') || ''
  let data
  if (contentType.includes('application/json')) {
    data = await res.json()
  } else {
    data = await res.text()
  }
  return { status: res.status, headers: res.headers, data }
}

function makePdf(content = '%PDF-1.4\nfake PDF content for testing\n%%EOF') {
  return content
}

async function waitForStatus(jobId, targetStatus, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const r = await request('GET', `/api/jobs/${jobId}/status`)
    const status = r.data?.data?.status || r.data?.status
    if (status === targetStatus) return r.data?.data || r.data
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return null
}

// ── Setup / Teardown ──────────────────────────────────────────

before(async () => {
  // Start the backend server on the test port with isolated storage
  serverProcess = spawn('node', ['backend/server.js'], {
    env: { ...process.env, PORT: String(PORT), SESLITAB_MUSICXML_DIR: TMP_STORAGE },
    stdio: 'pipe',
  })

  // Wait for server to be ready
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${BASE}/api/v1/health`)
      if (r.ok) break
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
})

after(async () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM')
    await new Promise((resolve) => setTimeout(resolve, 500))
    serverProcess = null
  }
  rmSync(TMP_STORAGE, { recursive: true, force: true })
})

// ── Tests ─────────────────────────────────────────────────────

describe('1. Geçerli PDF ile iş oluşturma', () => {
  test('POST /api/jobs geçerli PDF ile 201 döner', async () => {
    const r = await request('POST', '/api/jobs', {
      isForm: true,
      formData: {
        file: { filename: 'test.pdf', content: makePdf(), contentType: 'application/pdf' },
      },
    })
    assert.equal(r.status, 201)
    assert.ok(r.data.success)
    const d = r.data.data
    assert.ok(d.jobId)
    assert.match(d.jobId, /^job_\d+_[a-z0-9]+$/)
    assert.equal(d.status, 'queued')
    assert.equal(d.provider, 'mock')
  })
})

describe('2. Dosyasız istek reddi', () => {
  test('file alanı yoksa 400 döner', async () => {
    const r = await request('POST', '/api/jobs', { isForm: true, formData: {} })
    assert.equal(r.status, 400)
    assert.ok(r.data.error)
    assert.match(r.data.error.message, /PDF dosyası zorunludur/)
  })
})

describe('3. PDF olmayan dosya reddi', () => {
  test('.txt dosyası 415 döner', async () => {
    const r = await request('POST', '/api/jobs', {
      isForm: true,
      formData: {
        file: { filename: 'test.txt', content: 'bu bir metin dosyasıdır', contentType: 'text/plain' },
      },
    })
    assert.ok(r.status === 400 || r.status === 415)
    assert.ok(r.data.error)
  })
})

describe('4. Boyut limitini aşan dosya reddi', () => {
  test('11 MB PDF 413 döner', async () => {
    // Create an 11 MB fake PDF (in-memory would be too big; use a minimal oversized buffer)
    const bigContent = '%PDF-1.4\n' + 'A'.repeat(11 * 1024 * 1024) + '\n%%EOF'
    const r = await request('POST', '/api/jobs', {
      isForm: true,
      formData: {
        file: { filename: 'big.pdf', content: bigContent, contentType: 'application/pdf' },
      },
    })
    assert.equal(r.status, 413)
    assert.match(r.data.error.message, /sınır|limit|büyük/i)
  })
})

describe('5. İş durumu okuma', () => {
  test('GET /api/jobs/:id/status durum döner', async () => {
    const create = await request('POST', '/api/jobs', {
      isForm: true,
      formData: { file: { filename: 's.pdf', content: makePdf(), contentType: 'application/pdf' } },
    })
    const jobId = create.data.data.jobId
    const r = await request('GET', `/api/jobs/${jobId}/status`)
    assert.equal(r.status, 200)
    assert.ok(r.data.success)
    const d = r.data.data
    assert.ok(d.jobId)
    assert.ok(typeof d.status === 'string')
    assert.ok(typeof d.progress === 'number')
    // Should not expose internal paths
    const str = JSON.stringify(r.data)
    assert.ok(!str.includes('pdfPath'), 'pdfPath açıklanmamalı')
    assert.ok(!str.includes('musicXmlPath'), 'musicXmlPath açıklanmamalı')
  })
})

describe('6. Bilinmeyen iş için 404', () => {
  test('GET /api/jobs/unknown_job_id/status 404 döner', async () => {
    const r = await request('GET', '/api/jobs/job_9999999999_aaaaaa/status')
    assert.equal(r.status, 404)
    assert.match(r.data.error.message, /bulunamadı/)
  })
})

describe('7. Hazır olmayan MusicXML isteği', () => {
  test('tamamlanmadan önce 409 döner', async () => {
    const create = await request('POST', '/api/jobs', {
      isForm: true,
      formData: { file: { filename: 'n.pdf', content: makePdf(), contentType: 'application/pdf' } },
    })
    const jobId = create.data.data.jobId
    // Immediately request musicxml — should not be ready
    const r = await request('GET', `/api/jobs/${jobId}/musicxml`)
    assert.ok(r.status === 409 || r.status === 404, `409 veya 404 bekleniyordu, ${r.status} geldi: ${JSON.stringify(r.data)}`)
  })
})

describe('8. Hazır MusicXML indirme', () => {
  test('completed durumunda XML döner', async () => {
    const create = await request('POST', '/api/jobs', {
      isForm: true,
      formData: { file: { filename: 'ok.pdf', content: makePdf(), contentType: 'application/pdf' } },
    })
    const jobId = create.data.data.jobId
    // Wait for completion (mock provider completes quickly)
    const final = await waitForStatus(jobId, 'completed', 60)
    assert.ok(final, 'İş tamamlanmadı')
    const r = await request('GET', `/api/jobs/${jobId}/musicxml`)
    assert.equal(r.status, 200)
    assert.match(r.headers.get('content-type'), /xml/)
    assert.ok(r.data.includes('<score-partwise') || r.data.includes('<?xml'))
  })
})

describe('9. Kuyrukta/işlenmekte olan işi iptal etme', () => {
  test('queued/processing iş iptal edilir', async () => {
    const create = await request('POST', '/api/jobs', {
      isForm: true,
      formData: { file: { filename: 'cancel.pdf', content: makePdf(), contentType: 'application/pdf' } },
    })
    const jobId = create.data.data.jobId
    // Try to cancel immediately (should be queued or processing)
    const r = await request('POST', `/api/jobs/${jobId}/cancel`)
    assert.ok(r.status === 200, `200 bekleniyordu, ${r.status} geldi: ${JSON.stringify(r.data)}`)
    assert.ok(r.data.success)
    // After cancel, status should be failed
    const status = await request('GET', `/api/jobs/${jobId}/status`)
    assert.equal(status.data.data.status, 'failed')
  })
})

describe('10. Tamamlanmış işi iptal etme reddi', () => {
  test('completed iş iptal edilemez', async () => {
    const create = await request('POST', '/api/jobs', {
      isForm: true,
      formData: { file: { filename: 'done.pdf', content: makePdf(), contentType: 'application/pdf' } },
    })
    const jobId = create.data.data.jobId
    const final = await waitForStatus(jobId, 'completed', 60)
    assert.ok(final, 'İş tamamlanmadı')
    const r = await request('POST', `/api/jobs/${jobId}/cancel`)
    assert.equal(r.status, 400)
    assert.match(r.data.error.message, /iptal edilemez|durum/i)
  })
})

describe('11. İş silme ve temizleme', () => {
  test('DELETE /api/jobs/:id işi kaldırır', async () => {
    const create = await request('POST', '/api/jobs', {
      isForm: true,
      formData: { file: { filename: 'del.pdf', content: makePdf(), contentType: 'application/pdf' } },
    })
    const jobId = create.data.data.jobId
    const r = await request('DELETE', `/api/jobs/${jobId}`)
    assert.equal(r.status, 200)
    assert.ok(r.data.success)
    // After delete, status should 404
    const status = await request('GET', `/api/jobs/${jobId}/status`)
    assert.equal(status.status, 404)
  })
})

describe('12. MockProvider varsayılan sağlayıcı', () => {
  test('health endpoint mock döner', async () => {
    const r = await request('GET', '/api/v1/health')
    assert.equal(r.status, 200)
    assert.equal(r.data.data.provider, 'mock')
  })

  test('yeni iş mock provider ile oluşturulur', async () => {
    const create = await request('POST', '/api/jobs', {
      isForm: true,
      formData: { file: { filename: 'p.pdf', content: makePdf(), contentType: 'application/pdf' } },
    })
    assert.equal(create.data.data.provider, 'mock')
  })
})
