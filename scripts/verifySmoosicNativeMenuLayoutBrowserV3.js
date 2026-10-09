import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, resolve, sep } from 'node:path'

const distRoot = resolve('dist')
const artifactPath = resolve('artifacts', 'smenu-native-menu-layout-v3.json')
const labels = ['File', 'Score', 'Notes']
const fixtureXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>
  </measure></part>
</score-partwise>`

const chromeCandidates = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean)
const chrome = chromeCandidates.find((candidate) => spawnSync(candidate, ['--version'], { encoding: 'utf8' }).status === 0)
if (!chrome) throw new Error('Chrome/Chromium not found')
if (typeof WebSocket !== 'function') throw new Error('Node WebSocket unavailable')

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
}

function serverForDist() {
  return createServer((request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1')
      let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '')
      if (!relative || relative.endsWith('/')) relative += 'index.html'
      const target = resolve(distRoot, relative)
      if ((target !== distRoot && !target.startsWith(distRoot + sep)) || !existsSync(target) || !statSync(target).isFile()) {
        response.writeHead(404)
        response.end('not found')
        return
      }
      response.writeHead(200, { 'content-type': mime[extname(target)] || 'application/octet-stream', 'cache-control': 'no-store' })
      response.end(readFileSync(target))
    } catch (error) {
      response.writeHead(500)
      response.end(String(error?.message || error))
    }
  })
}

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
async function waitFor(fn, label, timeoutMs = 60000) {
  const started = Date.now()
  let lastError = null
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await fn()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await delay(150)
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`)
}

class Cdp {
  constructor(url) {
    this.url = url
    this.socket = null
    this.id = 1
    this.pending = new Map()
  }
  async open() {
    this.socket = new WebSocket(this.url)
    await new Promise((resolveOpen, rejectOpen) => {
      const timeout = setTimeout(() => rejectOpen(new Error('CDP open timeout')), 10000)
      this.socket.addEventListener('open', () => { clearTimeout(timeout); resolveOpen() }, { once: true })
      this.socket.addEventListener('error', () => { clearTimeout(timeout); rejectOpen(new Error('CDP open error')) }, { once: true })
    })
    this.socket.addEventListener('message', (event) => {
      const payload = JSON.parse(String(event.data))
      if (!payload.id) return
      const pending = this.pending.get(payload.id)
      if (!pending) return
      this.pending.delete(payload.id)
      payload.error ? pending.reject(new Error(payload.error.message)) : pending.resolve(payload.result)
    })
  }
  send(method, params = {}) {
    const id = this.id++
    return new Promise((resolveCommand, rejectCommand) => {
      this.pending.set(id, { resolve: resolveCommand, reject: rejectCommand })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }
  close() {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.close()
  }
}

async function evaluate(cdp, expression) {
  const response = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'evaluate failed')
  return response.result?.value
}

async function prepareEditor(cdp, appUrl, fileName) {
  await cdp.send('Page.navigate', { url: appUrl })
  await waitFor(() => evaluate(cdp, `document.readyState === 'complete' && !!document.getElementById('musicxml-tab-btn')`), 'SesliTab shell')
  await evaluate(cdp, `document.getElementById('musicxml-tab-btn').click(); true`)
  await evaluate(cdp, `(() => {
    const input = document.getElementById('musicxml-file-input')
    if (!input) return false
    const file = new File([${JSON.stringify(fixtureXml)}], ${JSON.stringify(fileName)}, { type: 'application/vnd.recordare.musicxml+xml' })
    const transfer = new DataTransfer()
    transfer.items.add(file)
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
  await waitFor(() => evaluate(cdp, `document.getElementById('musicxml-open-btn')?.disabled === false`), 'MusicXML selection')
  await evaluate(cdp, `document.getElementById('musicxml-open-btn').click(); true`)
  await waitFor(() => evaluate(cdp, `String(document.getElementById('xml-output')?.textContent || '').includes('<step>C</step>')`), 'MusicXML parse')
  await evaluate(cdp, `document.getElementById('smoosic-tab-btn').click(); true`)
  const handoff = await waitFor(() => evaluate(cdp, `(() => {
    const doc = document.getElementById('smoosic-editor-frame')?.contentDocument
    const status = String(doc?.getElementById('poc-status')?.textContent || '')
    if (status.startsWith('Başlatma hatası:') || status.startsWith('Hata:') || status.startsWith('XML hatası:')) return 'ERROR:' + status
    if (status.startsWith('Yüklendi:') && status.includes(${JSON.stringify(fileName)})) return 'READY:' + status
    return ''
  })()`), 'Smoosic MusicXML handoff', 120000)
  if (String(handoff).startsWith('ERROR:')) throw new Error(handoff)
  await waitFor(() => evaluate(cdp, `(() => {
    const doc = document.getElementById('smoosic-editor-frame')?.contentDocument
    return ${JSON.stringify(labels)}.every((label) => !!doc?.querySelector('button[aria-label="' + label + '"]'))
  })()`), 'rendered Vue menu buttons', 30000)
}

async function activateAndInspect(cdp, label) {
  const activation = await evaluate(cdp, `(() => {
    const frame = document.getElementById('smoosic-editor-frame')
    const doc = frame?.contentDocument
    const win = frame?.contentWindow
    const button = doc?.querySelector('button[aria-label=${JSON.stringify(label)}]')
    if (!button || !doc || !win) return null
    const rect = button.getBoundingClientRect()
    const hit = doc.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    button.click()
    return {
      buttonId: button.id || null,
      buttonRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      hitTag: hit?.tagName || null,
      hitId: hit?.id || null,
      hitClass: String(hit?.className || ''),
      physicalHitBeforeDomClick: Boolean(hit && (hit === button || button.contains(hit))),
    }
  })()`)
  if (!activation) throw new Error(`Missing ${label} button`)
  await delay(500)
  const layout = await evaluate(cdp, `(() => {
    const frame = document.getElementById('smoosic-editor-frame')
    const doc = frame?.contentDocument
    const win = frame?.contentWindow
    if (!doc || !win) return null
    const container = doc.querySelector('.menuContainer')
    const candidates = [
      container?.querySelector('.menuElement'),
      container?.querySelector('.menu-layer'),
      container?.querySelector('[role="menu"]'),
      doc.querySelector('.menuElement'),
      doc.querySelector('.menu-layer'),
      doc.querySelector('[role="menu"]'),
    ].filter(Boolean)
    const unique = [...new Set(candidates)]
    const rows = Array.from((container || doc).querySelectorAll('.mitem, .menuOption'))
    const rect = (element) => {
      if (!element) return null
      const r = element.getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
    }
    const style = (element) => {
      if (!element) return null
      const s = win.getComputedStyle(element)
      return { display: s.display, visibility: s.visibility, opacity: s.opacity, position: s.position, maxHeight: s.maxHeight, overflowY: s.overflowY, pointerEvents: s.pointerEvents, zIndex: s.zIndex }
    }
    const roots = unique.map((element) => ({
      className: String(element.className || ''),
      role: element.getAttribute('role'),
      rect: rect(element),
      style: style(element),
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      text: String(element.textContent || '').trim().slice(0, 500),
    }))
    const visibleRows = rows.filter((row) => {
      const r = row.getBoundingClientRect()
      const s = win.getComputedStyle(row)
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'
    })
    const best = roots.find((root) => root.rect?.width > 80 && root.rect?.height > 40) || roots[0] || null
    const viewport = { width: win.innerWidth, height: win.innerHeight }
    const intersects = Boolean(best?.rect && best.rect.right > 0 && best.rect.bottom > 0 && best.rect.left < viewport.width && best.rect.top < viewport.height)
    return {
      bodyClass: doc.body?.className || '',
      viewport,
      container: container ? { rect: rect(container), style: style(container), text: String(container.textContent || '').trim().slice(0, 500) } : null,
      roots,
      rowCount: rows.length,
      visibleRowCount: visibleRows.length,
      visibleRows: visibleRows.slice(0, 10).map((row) => ({ text: String(row.textContent || '').trim(), rect: rect(row) })),
      intersects,
      functional: Boolean(best && best.rect?.width > 80 && best.rect?.height > 40 && visibleRows.length >= 2 && intersects),
    }
  })()`)
  return { activation, layout }
}

const server = serverForDist()
const userDataDir = mkdtempSync(resolve(tmpdir(), 'seslitab-smenu-v3-'))
const port = 9357
const evidence = { generatedAt: new Date().toISOString(), chrome, results: {}, failure: null }
let browser = null
let cdp = null
let failure = null

try {
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const appUrl = `http://127.0.0.1:${server.address().port}/index.html`
  browser = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`, '--window-size=1130,900', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  const targets = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`)
    if (!response.ok) return null
    const payload = await response.json()
    return payload.find((target) => target.type === 'page' && target.webSocketDebuggerUrl) ? payload : null
  }, 'Chrome DevTools target', 15000)
  const target = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl)
  cdp = new Cdp(target.webSocketDebuggerUrl)
  await cdp.open()
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1130, height: 900, deviceScaleFactor: 1, mobile: false })

  for (const label of labels) {
    await prepareEditor(cdp, appUrl, `smenu-v3-${label.toLowerCase()}.musicxml`)
    evidence.results[label] = await activateAndInspect(cdp, label)
  }
  const failed = labels.filter((label) => !evidence.results[label]?.layout?.functional)
  if (failed.length) throw new Error(`Native menu layout RED for: ${failed.join(', ')}`)
} catch (error) {
  failure = error
  evidence.failure = { message: error?.message || String(error), stack: error?.stack || null }
} finally {
  mkdirSync(resolve('artifacts'), { recursive: true })
  writeFileSync(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`)
  cdp?.close()
  if (browser && browser.exitCode === null) browser.kill('SIGTERM')
  if (server.listening) await new Promise((resolveClose) => server.close(resolveClose))
  rmSync(userDataDir, { recursive: true, force: true })
}

if (failure) {
  console.error(`SMENU V3 proof failed: ${failure.message}`)
  console.error(`Evidence: ${artifactPath}`)
  process.exit(1)
}
console.log('SMENU V3 native menu layout proof passed.')
console.log(`Evidence: ${artifactPath}`)
