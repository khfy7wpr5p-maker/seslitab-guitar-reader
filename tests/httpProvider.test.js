// Focused tests for HttpOmrProvider and provider selection.
// Uses Node's built-in test runner with mocked HTTP (fetch).
// Run with: node --test tests/httpProvider.test.js

import { test, describe, before, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { createHttpOmrProvider, parseConfig, parseTimeout, validateMusicXml, mapHttpError, buildMultipart, SAMPLE_PARTWISE } from '../backend/providers/HttpOmrProvider.js'

const SAMPLE_TIMewise = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-timewise PUBLIC "-//Recordare//DTD MusicXML 4.0 Timewise//EN" "http://www.musicxml.org/dtds/timewise.dtd">
<score-timewise version="4.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list></score-timewise>`

const VALID_PDF = Buffer.from('%PDF-1.4\nfake PDF content\n%%EOF')

function makeProvider(opts = {}) {
  return createHttpOmrProvider({
    apiUrl: opts.apiUrl ?? 'http://mock-omr.local/api',
    apiKey: opts.apiKey ?? '',
    timeoutMs: opts.timeoutMs ?? 120000,
  })
}

function mockFetch(handler) {
  globalThis.fetch = async (url, init) => handler(url, init)
}

function makeResponse(body, opts = {}) {
  return {
    ok: opts.status ? opts.status >= 200 && opts.status < 300 : true,
    status: opts.status ?? 200,
    headers: { get: (k) => opts.contentType ? opts.contentType : null },
    text: async () => body,
  }
}

// ── Tests ─────────────────────────────────────────────────────

describe('Provider selection', () => {
  test('1. MockProvider varsayılan (no OMR_PROVIDER)', async () => {
    const orig = process.env.OMR_PROVIDER
    delete process.env.OMR_PROVIDER
    const mod = await import('../backend/providers/index.js?t=' + Date.now())
    assert.equal(mod.getProviderName(), 'mock')
    process.env.OMR_PROVIDER = orig
  })

  test('2. OMR_PROVIDER=mock selects MockProvider', async () => {
    const orig = process.env.OMR_PROVIDER
    process.env.OMR_PROVIDER = 'mock'
    const mod = await import('../backend/providers/index.js?t=' + Date.now() + '2')
    assert.equal(mod.getProviderName(), 'mock')
    process.env.OMR_PROVIDER = orig
  })

  test('3. OMR_PROVIDER=http selects HttpOmrProvider', async () => {
    const orig = process.env.OMR_PROVIDER
    process.env.OMR_PROVIDER = 'http'
    const mod = await import('../backend/providers/index.js?t=' + Date.now() + '3')
    assert.equal(mod.getProviderName(), 'http')
    process.env.OMR_PROVIDER = orig
  })

  test('4. Unknown provider fails safely', async () => {
    const orig = process.env.OMR_PROVIDER
    process.env.OMR_PROVIDER = 'invalid_xyz'
    let threw = false
    try {
      await import('../backend/providers/index.js?t=' + Date.now() + '4')
    } catch (e) {
      threw = true
      assert.match(e.message, /Unknown OMR_PROVIDER/i)
    }
    assert.ok(threw, 'Bilinmeyen sağlayıcı hata vermeli')
    process.env.OMR_PROVIDER = orig
  })
})

describe('HttpOmrProvider configuration', () => {
  test('5. Missing OMR_HTTP_API_URL fails before sending request', async () => {
    const p = createHttpOmrProvider({ apiUrl: '', apiKey: '', timeoutMs: 120000 })
    let fetchCalled = false
    mockFetch(() => { fetchCalled = true; return makeResponse(SAMPLE_PARTWISE) })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    assert.equal(up.success, false)
    assert.match(up.error.message, /yapılandırılmamış/i)
    assert.equal(fetchCalled, false)
  })

  test('Timeout parsing uses 120000 default', () => {
    assert.equal(parseTimeout(undefined), 120000)
    assert.equal(parseTimeout(''), 120000)
    assert.equal(parseTimeout('abc'), 120000)
    assert.equal(parseTimeout('-5'), 120000)
    assert.equal(parseTimeout('0'), 120000)
    assert.equal(parseTimeout('60000'), 60000)
    assert.equal(parseTimeout('999999'), 600000)
  })
})

describe('HttpOmrProvider multipart upload', () => {
  let lastFetchArgs = null

  test('6. PDF sent as multipart/form-data', async () => {
    const p = makeProvider()
    let capturedInit = null
    mockFetch((_url, init) => {
      capturedInit = init
      return makeResponse(SAMPLE_PARTWISE, { contentType: 'application/xml' })
    })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    assert.equal(up.success, true)
    await p.analyzePdf(up.providerJobId)
    assert.ok(capturedInit, 'fetch çağrılmalı')
    assert.match(capturedInit.headers['Content-Type'], /multipart\/form-data/)
    assert.ok(capturedInit.body instanceof Buffer)
    assert.ok(capturedInit.body.includes('Content-Disposition: form-data; name="file"'))
    assert.ok(capturedInit.body.includes('test.pdf'))
  })

  test('7. Bearer API key sent when configured', async () => {
    const p = makeProvider({ apiKey: 'secret-key-123' })
    let capturedInit = null
    mockFetch((_url, init) => {
      capturedInit = init
      return makeResponse(SAMPLE_PARTWISE, { contentType: 'application/xml' })
    })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    await p.analyzePdf(up.providerJobId)
    assert.equal(capturedInit.headers['Authorization'], 'Bearer secret-key-123')
  })

  test('8. API key not sent when absent', async () => {
    const p = makeProvider({ apiKey: '' })
    let capturedInit = null
    mockFetch((_url, init) => {
      capturedInit = init
      return makeResponse(SAMPLE_PARTWISE, { contentType: 'application/xml' })
    })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    await p.analyzePdf(up.providerJobId)
    assert.equal(capturedInit.headers['Authorization'], undefined)
  })
})

describe('HttpOmrProvider response validation', () => {
  test('9. Valid score-partwise accepted', async () => {
    const p = makeProvider()
    mockFetch(() => makeResponse(SAMPLE_PARTWISE, { contentType: 'application/xml' }))
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, true)
    assert.equal(an.status, 'completed')
  })

  test('10. Valid score-timewise accepted', async () => {
    const p = makeProvider()
    mockFetch(() => makeResponse(SAMPLE_TIMewise, { contentType: 'application/xml' }))
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, true)
    assert.equal(an.status, 'completed')
  })

  test('11. Empty response rejected', async () => {
    const p = makeProvider()
    mockFetch(() => makeResponse('   '))
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, false)
    assert.equal(an.error.code, 'EMPTY_RESPONSE')
  })

  test('12. Invalid XML rejected', async () => {
    const p = makeProvider()
    mockFetch(() => makeResponse('this is not xml at all'))
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, false)
    assert.equal(an.error.code, 'INVALID_XML')
  })

  test('13. Non-MusicXML XML rejected', async () => {
    const p = makeProvider()
    mockFetch(() => makeResponse('<?xml version="1.0"?><html><body>not music</body></html>'))
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, false)
    assert.match(an.error.code, /NON_MUSICXML|HTML_RESPONSE/)
  })

  test('14. HTML response rejected', async () => {
    const p = makeProvider()
    mockFetch(() => makeResponse('<html><body>Server Error</body></html>'))
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, false)
    assert.equal(an.error.code, 'HTML_RESPONSE')
  })

  test('15. JSON error response rejected', async () => {
    const p = makeProvider()
    mockFetch(() => makeResponse('{"error": "something went wrong"}'))
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, false)
    assert.equal(an.error.code, 'JSON_RESPONSE')
  })
})

describe('HttpOmrProvider HTTP error handling', () => {
  test('16. HTTP 401 handled safely', async () => {
    const p = makeProvider()
    mockFetch(() => makeResponse('Unauthorized', { status: 401 }))
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, false)
    assert.equal(an.error.code, 'AUTH_ERROR')
  })

  test('16b. HTTP 403 handled safely', async () => {
    const p = makeProvider()
    mockFetch(() => makeResponse('Forbidden', { status: 403 }))
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, false)
    assert.equal(an.error.code, 'AUTH_ERROR')
  })

  test('17. HTTP 429 handled safely', async () => {
    const p = makeProvider()
    mockFetch(() => makeResponse('Too Many Requests', { status: 429 }))
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, false)
    assert.equal(an.error.code, 'RATE_LIMIT')
  })

  test('18. HTTP 4xx handled safely', async () => {
    const p = makeProvider()
    mockFetch(() => makeResponse('Bad Request', { status: 400 }))
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, false)
    assert.equal(an.error.code, 'CLIENT_ERROR')
  })

  test('19. HTTP 5xx handled safely', async () => {
    const p = makeProvider()
    mockFetch(() => makeResponse('Internal Server Error', { status: 500 }))
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, false)
    assert.equal(an.error.code, 'SERVER_ERROR')
    assert.equal(an.retryable, true)
  })

  test('20. Network failure handled safely', async () => {
    const p = makeProvider()
    mockFetch(() => { throw new Error('ECONNREFUSED') })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, false)
    assert.equal(an.error.code, 'CONNECTION_ERROR')
  })
})

describe('HttpOmrProvider timeout and cancellation', () => {
  test('21. Timeout aborts the request', async () => {
    const p = makeProvider({ timeoutMs: 50 })
    mockFetch((_url, init) => {
      return new Promise((_, reject) => {
        const t = setTimeout(() => reject(new Error('never')), 5000)
        if (init?.signal) {
          init.signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')) })
        }
      })
    })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    assert.equal(an.success, false)
    assert.equal(an.error.code, 'TIMEOUT')
  })

  test('22. Job cancellation aborts the request', async () => {
    const p = makeProvider({ timeoutMs: 30000 })
    let abortFired = false
    mockFetch((_url, init) => {
      return new Promise((_, reject) => {
        const t = setTimeout(() => reject(new Error('never')), 5000)
        if (init?.signal) {
          init.signal.addEventListener('abort', () => { abortFired = true; clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')) })
        }
      })
    })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const analyzePromise = p.analyzePdf(up.providerJobId)
    setTimeout(() => p.cancelJob(up.providerJobId), 10)
    const an = await analyzePromise
    assert.equal(an.success, false)
    assert.equal(an.error.code, 'CANCELED')
    assert.ok(abortFired, 'Abort signal tetiklenmeli')
  })

  test('22b. Canceled job cannot later become completed', async () => {
    const p = makeProvider()
    mockFetch((_url, init) => {
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => resolve(makeResponse(SAMPLE_PARTWISE)), 5000)
        if (init?.signal) {
          init.signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')) })
        }
      })
    })
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const analyzePromise = p.analyzePdf(up.providerJobId)
    setTimeout(() => p.cancelJob(up.providerJobId), 10)
    const an = await analyzePromise
    assert.equal(an.success, false)
    assert.equal(an.error.code, 'CANCELED')
    const st = await p.getStatus(up.providerJobId)
    assert.equal(st.status, 'failed')
  })
})

describe('HttpOmrProvider secret protection', () => {
  test('23. Secrets absent from user-facing errors and logs', async () => {
    const p = makeProvider({ apiKey: 'SUPER_SECRET_KEY_42' })
    mockFetch(() => makeResponse('Server Error', { status: 500 }))
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const an = await p.analyzePdf(up.providerJobId)
    const errStr = JSON.stringify(an.error)
    assert.ok(!errStr.includes('SUPER_SECRET_KEY_42'), 'API key error mesajında olmamalı')
    assert.ok(!errStr.includes('Bearer'), 'Authorization header error mesajında olmamalı')
    assert.ok(!errStr.includes('Authorization'), 'Authorization kelimesi olmamalı')
  })
})

describe('HttpOmrProvider download and cleanup', () => {
  test('23b. downloadMusicXML returns XML after completion', async () => {
    const p = makeProvider()
    mockFetch(() => makeResponse(SAMPLE_PARTWISE, { contentType: 'application/xml' }))
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    await p.analyzePdf(up.providerJobId)
    const dl = await p.downloadMusicXML(up.providerJobId)
    assert.equal(dl.success, true)
    assert.ok(dl.musicXml.includes('<score-partwise'))
  })

  test('23c. deleteJob removes job data', async () => {
    const p = makeProvider()
    mockFetch(() => makeResponse(SAMPLE_PARTWISE, { contentType: 'application/xml' }))
    const up = await p.uploadPdf(VALID_PDF, 'test.pdf')
    const del = await p.deleteJob(up.providerJobId)
    assert.equal(del.success, true)
    const st = await p.getStatus(up.providerJobId)
    assert.equal(st.success, false)
  })
})

describe('buildMultipart helper', () => {
  test('24. Multipart contains file field and boundary', () => {
    const buf = buildMultipart(VALID_PDF, 'doc.pdf', 'TEST_BOUNDARY')
    assert.ok(buf.includes('--TEST_BOUNDARY'))
    assert.ok(buf.includes('name="file"'))
    assert.ok(buf.includes('doc.pdf'))
    assert.ok(buf.includes('application/pdf'))
  })
})
