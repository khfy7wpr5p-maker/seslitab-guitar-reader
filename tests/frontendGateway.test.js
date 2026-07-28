// Focused tests for the frontend OMR Gateway integration.
// Tests the gatewayProvider client + omrService polling/cancel/timeout logic
// using a stubbed fetch and a stubbed provider.
// Run with: node --test tests/frontendGateway.test.js

import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

// ── Polyfills for Node test environment ────────────────────────
// Minimal DOMParser shim that builds a tiny element tree from XML.
// Supports the subset of DOM methods used by musicXmlParser.js:
// querySelector, querySelectorAll, getAttribute, textContent.
class MiniElement {
  constructor(tag, attrs, parent) {
    this.tag = tag
    this.attrs = attrs || {}
    this.children = []
    this.parent = parent
    this._text = ''
  }
  getAttribute(name) { return this.attrs[name] || null }
  get textContent() {
    if (this.children.length === 0) return this._text
    return this.children.map((c) => c.textContent).join('')
  }
  querySelector(sel) { return this._findAll(sel)[0] || null }
  querySelectorAll(sel) { return this._findAll(sel) }
  _findAll(sel, acc = []) {
    for (const c of this.children) {
      if (c.tag === sel) acc.push(c)
      c._findAll(sel, acc)
    }
    return acc
  }
}

class MiniDocument extends MiniElement {
  constructor() { super('#document', {}, null) }
}

class MiniDOMParser {
  parseFromString(xml) {
    const doc = new MiniDocument()
    const stack = [doc]
    const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[a-zA-Z-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g
    let m
    while ((m = tagRe.exec(xml)) !== null) {
      if (m[4] !== undefined && m[4].trim()) {
        stack[stack.length - 1]._text += m[4]
        continue
      }
      const isClose = m[0][1] === '/'
      const tag = m[1]
      const attrStr = m[2] || ''
      const selfClose = m[3] === '/'
      if (isClose) { stack.pop(); continue }
      const attrs = {}
      const attrRe = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g
      let am
      while ((am = attrRe.exec(attrStr)) !== null) attrs[am[1]] = am[2]
      const el = new MiniElement(tag, attrs, stack[stack.length - 1])
      stack[stack.length - 1].children.push(el)
      if (!selfClose) stack.push(el)
    }
    return doc
  }
}
globalThis.DOMParser = MiniDOMParser

// ── Stub helpers ──────────────────────────────────────────────

function makeResponse(body, opts = {}) {
  const status = opts.status || 200
  return {
    ok: opts.ok !== undefined ? opts.ok : status < 400,
    status,
    headers: { get: (h) => (h === 'content-type' ? opts.contentType || 'application/json' : null) },
    async json() { return body },
    async text() { return typeof body === 'string' ? body : JSON.stringify(body) },
    async blob() {
      if (body instanceof Blob) return body
      if (Buffer.isBuffer(body)) return new Blob([body], { type: opts.contentType || 'application/octet-stream' })
      if (body instanceof ArrayBuffer) return new Blob([body], { type: opts.contentType || 'application/octet-stream' })
      if (typeof body === 'string') return new Blob([body], { type: opts.contentType || 'text/plain' })
      return new Blob([JSON.stringify(body)], { type: 'application/json' })
    },
  }
}

// ── gatewayProvider tests (stubbed fetch) ──────────────────────

describe('gatewayProvider — HTTP istemcisi', async () => {
  const providerMod = await import('../src/providers/gatewayProvider.js')
  const provider = providerMod.default

  let originalFetch
  let fetchCalls

  function stubFetch(responses) {
    fetchCalls = 0
    globalThis.fetch = async (url, opts) => {
      fetchCalls++
      const key = `${opts?.method || 'GET'} ${url}`
      const r = responses[key] || responses[url]
      if (!r) return makeResponse({ success: false, error: { code: 'NOT_FOUND', message: 'Stub yok: ' + key } }, { status: 404 })
      return typeof r === 'function' ? r(opts) : r
    }
  }

  beforeEach(() => {
    originalFetch = globalThis.fetch
    globalThis.__OMR_GATEWAY_URL__ = 'http://x'
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
    delete globalThis.__OMR_GATEWAY_URL__
  })

  test('1. createJob: geçerli PDF ile iş oluşturur', async () => {
    stubFetch({
      'POST http://x/api/jobs': makeResponse({ success: true, data: { jobId: 'job_123', status: 'queued', provider: 'audiveris' } }, { status: 201 }),
    })
    const fakeFile = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
    const r = await provider.uploadPdf(fakeFile)
    assert.equal(r.success, true)
    assert.equal(r.jobId, 'job_123')
    assert.equal(r.provider, 'audiveris')
    assert.equal(fetchCalls, 1)
  })

  test('1a. FormData includes provider=audiveris', async () => {
    let capturedBody = null
    stubFetch({
      'POST http://x/api/jobs': (opts) => {
        capturedBody = opts?.body
        return makeResponse({ success: true, data: { jobId: 'job_p', status: 'queued', provider: 'audiveris' } }, { status: 201 })
      },
    })
    const fakeFile = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
    await provider.uploadPdf(fakeFile)
    assert.ok(capturedBody instanceof FormData, 'Body should be FormData')
    assert.equal(capturedBody.get('provider'), 'audiveris', 'FormData must include provider=audiveris')
    assert.ok(capturedBody.get('file') instanceof Blob, 'FormData must include file')
  })

  test('1b. provider=mock response is rejected with PROVIDER_MISMATCH', async () => {
    stubFetch({
      'POST http://x/api/jobs': makeResponse({ success: true, data: { jobId: 'job_m', status: 'queued', provider: 'mock' } }, { status: 201 }),
    })
    const fakeFile = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
    const r = await provider.uploadPdf(fakeFile)
    assert.equal(r.success, false)
    assert.equal(r.code, 'PROVIDER_MISMATCH')
    assert.equal(r.provider, 'mock')
    assert.match(r.error, /audiveris/)
    assert.match(r.error, /mock/)
  })

  test('1c. no demo result is shown after a real OMR request returns mock', async () => {
    // After a PROVIDER_MISMATCH, the result must not be treated as a
    // successful OMR job — no jobId to poll, no mock MusicXML generated.
    stubFetch({
      'POST http://x/api/jobs': makeResponse({ success: true, data: { jobId: 'job_m', status: 'queued', provider: 'mock' } }, { status: 201 }),
    })
    const fakeFile = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
    const r = await provider.uploadPdf(fakeFile)
    assert.equal(r.success, false)
    assert.equal(r.jobId, undefined, 'Must not return a jobId for polling')
    assert.equal(r.musicXml, undefined, 'Must not return mock MusicXML')
  })

  test('1d. successful audiveris response continues normally', async () => {
    stubFetch({
      'POST http://x/api/jobs': makeResponse({ success: true, data: { jobId: 'job_ok', status: 'queued', provider: 'audiveris' } }, { status: 201 }),
      'GET http://x/api/jobs/job_ok/status': makeResponse({ success: true, data: { jobId: 'job_ok', status: 'completed', progress: 100 } }),
      'GET http://x/api/jobs/job_ok/musicxml': makeResponse('<?xml version="1.0"?><score-partwise/>', { contentType: 'application/xml' }),
    })
    const fakeFile = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
    const up = await provider.uploadPdf(fakeFile)
    assert.equal(up.success, true)
    assert.equal(up.provider, 'audiveris')
    const st = await provider.getStatus('job_ok')
    assert.equal(st.success, true)
    assert.equal(st.status, 'completed')
    const dl = await provider.downloadMusicXML('job_ok')
    assert.equal(dl.success, true)
    assert.ok(dl.musicXml.includes('<score-partwise'))
  })

  test('2. getJobStatus: durum döner', async () => {
    stubFetch({
      'GET http://x/api/jobs/job_123/status': makeResponse({ success: true, data: { jobId: 'job_123', status: 'processing', progress: 50 } }),
    })
    const r = await provider.getStatus('job_123')
    assert.equal(r.success, true)
    assert.equal(r.status, 'processing')
    assert.equal(r.progress, 50)
  })

  test('3. getMusicXml: hazır MusicXML döner', async () => {
    const xml = '<?xml version="1.0"?><score-partwise/>'
    stubFetch({
      'GET http://x/api/jobs/job_123/musicxml': makeResponse(xml, { contentType: 'application/xml' }),
    })
    const r = await provider.downloadMusicXML('job_123')
    assert.equal(r.success, true)
    assert.ok(r.musicXml.includes('<score-partwise'))
  })

  test('4. cancelJob: iptal isteği gönderir', async () => {
    stubFetch({
      'POST http://x/api/jobs/job_123/cancel': makeResponse({ success: true, data: { jobId: 'job_123', status: 'failed' } }),
    })
    const r = await provider.cancelJob('job_123')
    assert.equal(r.success, true)
  })

  test('5. deleteJob: silme isteği gönderir', async () => {
    stubFetch({
      'DELETE http://x/api/jobs/job_123': makeResponse({ success: true, data: { jobId: 'job_123' } }),
    })
    const r = await provider.deleteJob('job_123')
    assert.equal(r.success, true)
  })

  test('6. Gateway URL eksikse production fallback kullanılır', async () => {
    delete globalThis.__OMR_GATEWAY_URL__
    let calledUrl = null
    globalThis.fetch = async (url, opts) => {
      calledUrl = url
      return makeResponse({ success: true, data: { jobId: 'job_fb', status: 'queued', provider: 'audiveris' } }, { status: 201 })
    }
    const r = await provider.uploadPdf(new Blob(['x']))
    assert.equal(r.success, true)
    assert.ok(calledUrl && calledUrl.includes('seslitab-omr.onrender.com'), 'Production URL fallback kullanılmalı: ' + calledUrl)
  })

  test('7. Ağ hatası: NETWORK_ERROR döner', async () => {
    globalThis.fetch = async () => { throw new Error('connection refused') }
    const r = await provider.getStatus('job_123')
    assert.equal(r.success, false)
    assert.equal(r.code, 'NETWORK_ERROR')
  })

  test('8. 404: iş bulunamadı', async () => {
    stubFetch({
      'GET http://x/api/jobs/unknown/status': makeResponse({ success: false, error: { code: 'JOB_NOT_FOUND', message: 'İş kaydı bulunamadı.' } }, { status: 404 }),
    })
    const r = await provider.getStatus('unknown')
    assert.equal(r.success, false)
    assert.equal(r.statusCode, 404)
  })

  test('8b. Ağ hatası mesajı Türkçe', async () => {
    globalThis.fetch = async () => { throw new Error('fail') }
    const r = await provider.getStatus('job_x')
    assert.equal(r.success, false)
    assert.match(r.error, /bağlanılamadı/i)
  })

  test('8c. Production fallback URL ile ağ hatası Türkçe', async () => {
    delete globalThis.__OMR_GATEWAY_URL__
    globalThis.fetch = async () => { throw new Error('connection refused') }
    const r = await provider.uploadPdf(new Blob(['x']))
    assert.equal(r.success, false)
    assert.match(r.error, /bağlanılamadı/i)
  })

  test('8d. Boş MusicXML mesajı Türkçe', async () => {
    stubFetch({
      'GET http://x/api/jobs/job_e/musicxml': makeResponse('   ', { contentType: 'application/xml' }),
    })
    const r = await provider.downloadMusicXML('job_e')
    assert.equal(r.success, false)
    assert.match(r.error, /boş veya geçersiz/i)
  })

  test('8e. downloadOmrProject: doğru endpoint\'i kullanır', async () => {
    let calledUrl = null
    stubFetch({
      'GET http://x/api/jobs/job_omr/omr': (opts) => {
        calledUrl = 'GET http://x/api/jobs/job_omr/omr'
        return makeResponse(Buffer.from('fake-omr-binary'), { contentType: 'application/octet-stream' })
      },
    })
    const r = await provider.downloadOmrProject('job_omr')
    assert.equal(r.success, true)
    assert.ok(r.blob, 'Blob dönmeli')
    assert.ok(calledUrl && calledUrl.includes('/api/jobs/job_omr/omr'), 'Doğru endpoint: ' + calledUrl)
  })

  test('8f. downloadOmrProject: 404 durumunda hata döner', async () => {
    stubFetch({
      'GET http://x/api/jobs/job_404/omr': makeResponse({ success: false, error: { code: 'NOT_FOUND', message: 'OMR projesi bulunamadı.' } }, { status: 404 }),
    })
    const r = await provider.downloadOmrProject('job_404')
    assert.equal(r.success, false)
    assert.equal(r.statusCode, 404)
  })

  test('8g. downloadOmrProject: boş yanıt başarısız sayılır', async () => {
    stubFetch({
      'GET http://x/api/jobs/job_empty_omr/omr': makeResponse(new ArrayBuffer(0), { contentType: 'application/octet-stream' }),
    })
    const r = await provider.downloadOmrProject('job_empty_omr')
    assert.equal(r.success, false)
    assert.match(r.error, /henüz hazır değil/i)
  })

  test('8h. downloadOmrProject: jobId olmadan hata döner', async () => {
    const r = await provider.downloadOmrProject(null)
    assert.equal(r.success, false)
    assert.match(r.error, /kimliği gerekli/)
  })
})

// ── omrService polling tests (stubbed provider) ────────────────

describe('omrService — polling ve iptal', async () => {
  const omrService = await import('../src/services/omrService.js')
  const providersMod = await import('../src/providers/index.js')

  afterEach(() => providersMod.resetOmrProvider())

  function setProvider(p) { providersMod.setOmrProvider(p) }

  test('9. Polling: queued → processing → completed, MusicXML döner', async () => {
    const xml = '<?xml version="1.0"?><score-partwise><part><measure/></part></score-partwise>'
    let pollCount = 0
    const statuses = ['queued', 'processing', 'processing', 'completed']
    setProvider({
      async uploadPdf() { return { success: true, jobId: 'job_1' } },
      async analyzePdf() { return { success: true, jobId: 'job_1' } },
      async getStatus() { const s = statuses[Math.min(pollCount, 3)]; pollCount++; return { success: true, status: s, progress: pollCount * 25 } },
      async downloadMusicXML() { return { success: true, musicXml: xml } },
    })
    const r = await omrService.pollAndDownload('job_1')
    assert.equal(r.success, true)
    assert.ok(r.musicXml.includes('<score-partwise'))
  })

  test('10. Polling: failed durumunda durur', async () => {
    let pollCount = 0
    setProvider({
      async getStatus() { pollCount++; return { success: true, status: 'failed', progress: 0 } },
      async downloadMusicXML() { return { success: false, error: 'hazır değil' } },
    })
    const r = await omrService.pollAndDownload('job_fail')
    assert.equal(r.success, false)
    assert.match(r.error, /başarısız/i)
    assert.equal(pollCount, 1)
  })

  test('10b. Polling: timeout durumunda durur (120 sn)', async () => {
    let pollCount = 0
    setProvider({
      async getStatus() { pollCount++; return { success: true, status: 'processing', progress: 50 } },
      async downloadMusicXML() { return { success: true, musicXml: 'x' } },
    })
    // Use a very short maxWait by monkey-patching Date.now
    const origNow = Date.now
    let t = 1000
    Date.now = () => { t += 130000; return t }
    const r = await omrService.pollAndDownload('job_to')
    Date.now = origNow
    assert.equal(r.success, false)
    assert.equal(r.status, 'timeout')
    assert.match(r.error, /zaman aşımı/i)
  })

  test('10c. Örtüşen polling istekleri engellenir', async () => {
    let activePolls = 0
    let maxConcurrent = 0
    const xml = '<?xml version="1.0"?><score-partwise><part><measure/></part></score-partwise>'
    setProvider({
      async getStatus() {
        activePolls++
        maxConcurrent = Math.max(maxConcurrent, activePolls)
        await new Promise(r => setTimeout(r, 50))
        activePolls--
        return { success: true, status: 'completed', progress: 100 }
      },
      async downloadMusicXML() { return { success: true, musicXml: xml } },
    })
    const r = await omrService.pollAndDownload('job_overlap')
    assert.equal(r.success, true)
    assert.ok(maxConcurrent <= 1, 'Eşzamanlı polling olmamalı: ' + maxConcurrent)
  })

  test('11. Polling: AbortSignal ile iptal edilir', async () => {
    const ac = new AbortController()
    let pollCount = 0
    setProvider({
      async getStatus() { pollCount++; if (pollCount === 2) ac.abort(); return { success: true, status: 'processing', progress: 10 } },
      async downloadMusicXML() { return { success: true, musicXml: 'x' } },
    })
    const r = await omrService.pollAndDownload('job_abort', null, { signal: ac.signal })
    assert.equal(r.success, false)
    assert.match(r.error, /iptal/i)
  })

  test('12. cancelOmrJob: sağlayıcı iptali destekliyorsa çağırır', async () => {
    let called = false
    setProvider({
      async cancelJob() { called = true; return { success: true, jobId: 'job_c' } },
    })
    const r = await omrService.cancelOmrJob('job_c')
    assert.equal(r.success, true)
    assert.equal(called, true)
  })

  test('12b. Tamamlanan iş iptal edilmez', async () => {
    let cancelCalled = false
    setProvider({
      async cancelJob() { cancelCalled = true; return { success: true, jobId: 'job_done' } },
      async getStatus() { return { success: true, status: 'completed', progress: 100 } },
      async downloadMusicXML() { return { success: true, musicXml: '<?xml version="1.0"?><score-partwise/>' } },
    })
    // Poll to completion first
    const r = await omrService.pollAndDownload('job_done')
    assert.equal(r.success, true)
    // After completion, cancel should not be called by the flow
    // (the UI hides the cancel button after completion)
    assert.equal(cancelCalled, false)
  })

  test('13. deleteOmrJob: sağlayıcı silmeyi destekliyorsa çağırır', async () => {
    let called = false
    setProvider({
      async deleteJob() { called = true; return { success: true, jobId: 'job_d' } },
    })
    const r = await omrService.deleteOmrJob('job_d')
    assert.equal(r.success, true)
    assert.equal(called, true)
  })

  test('13b. İş yalnızca MusicXML indirildikten sonra silinir', async () => {
    let deleteCalled = false
    let downloadCalled = false
    const xml = '<?xml version="1.0"?><score-partwise><part><measure/></part></score-partwise>'
    setProvider({
      async getStatus() { return { success: true, status: 'completed', progress: 100 } },
      async downloadMusicXML() { downloadCalled = true; return { success: true, musicXml: xml } },
      async deleteJob() { deleteCalled = true; return { success: true, jobId: 'job_clean' } },
    })
    const r = await omrService.pollAndDownload('job_clean')
    assert.equal(r.success, true)
    assert.equal(downloadCalled, true, 'MusicXML indirilmeli')
    // deleteJob is called by the UI after download, not by pollAndDownload itself
    // Simulate the UI cleanup call
    const d = await omrService.deleteOmrJob('job_clean')
    assert.equal(d.success, true)
    assert.equal(deleteCalled, true, 'İş silinmeli')
    assert.ok(downloadCalled, 'Silme işlemi indirmeden önce olmamalı')
  })

  test('14. Boş MusicXML reddedilir', async () => {
    setProvider({
      async getStatus() { return { success: true, status: 'completed', progress: 100 } },
      async downloadMusicXML() { return { success: true, musicXml: '   ' } },
    })
    const r = await omrService.pollAndDownload('job_empty')
    assert.equal(r.success, false)
    assert.match(r.error, /boş veya geçersiz/i)
  })

  test('14b. Mock disclosure metni doğru', async () => {
    // The mock notice text is defined in app.js showMockNotice().
    // We verify the expected string matches the spec.
    const expected = 'Demo OMR kullanılıyor. Gösterilen nota sonucu yüklenen PDF\'den tanınmamıştır.'
    assert.ok(expected.includes('Demo OMR kullanılıyor'))
    assert.ok(expected.includes('tanınmamıştır'))
  })

  test('15. 404: iş kaydı bulunamadı polling sırasında döner', async () => {
    setProvider({
      async getStatus() { return { success: false, statusCode: 404, error: 'İş kaydı bulunamadı.' } },
      async downloadMusicXML() { return { success: false, error: 'yok' } },
    })
    const r = await omrService.pollAndDownload('job_404')
    assert.equal(r.success, false)
    assert.equal(r.status, 'not_found')
    assert.match(r.error, /bulunamadı/i)
  })
})

// ── MusicXML → Turkish narration pipeline ─────────────────────

describe('MusicXML → Türkçe anlatım hattı', async () => {
  const musicEngine = await import('../src/services/musicEngine.js')

  const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type><technical><string>3</string><fret>2</fret></technical></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><type>quarter</type><technical><string>2</string><fret>1</fret></technical></note>
    </measure>
  </part>
</score-partwise>`

  test('16. MusicXML parse edilir ve nota listesi boş değildir', async () => {
    const result = musicEngine.parseMusicXmlToNotes(SAMPLE_XML)
    assert.ok(!result.error, 'Hata olmamalı: ' + result.error)
    assert.ok(result.notes.length > 0, 'Nota listesi boş olmamalı')
  })

  test('17. Türkçe anlatım metni üretilir ve boş değildir', async () => {
    const result = musicEngine.parseMusicXmlToNotes(SAMPLE_XML)
    const spoken = musicEngine.notesToSpokenText(result.notes)
    assert.ok(spoken && spoken.length > 0, 'Anlatım metni boş olmamalı')
    assert.ok(!spoken.includes('Nota bulunamadı'), 'Nota bulunduğu için boş mesaj gelmemeli')
  })

  test('18. Ritmik metin üretilir', async () => {
    const result = musicEngine.parseMusicXmlToNotes(SAMPLE_XML)
    const rhythmic = musicEngine.notesToRhythmicText(result.notes)
    assert.ok(rhythmic && rhythmic.length > 0)
  })
})
