import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, resolve, sep } from 'node:path'

const repoRoot = resolve('.')
const distRoot = resolve(repoRoot, 'dist')
const artifactPath = resolve(repoRoot, 'artifacts', 'smenu-native-menu-browser-v2.json')
const viewport = { width: 1130, height: 900 }
const controls = [
  { name: 'file', label: 'File' },
  { name: 'score', label: 'Score' },
  { name: 'notes', label: 'Notes' },
]

const fixtureXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`

const chromeCandidates = [
  process.env.CHROME_BIN,
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
].filter(Boolean)
let chrome = null
for (const candidate of chromeCandidates) {
  if (spawnSync(candidate, ['--version'], { encoding: 'utf8' }).status === 0) {
    chrome = candidate
    break
  }
}
if (!chrome) {
  console.error('SMENU V2 proof failed closed: Chrome/Chromium not found.')
  process.exit(1)
}
if (typeof WebSocket !== 'function') {
  console.error('SMENU V2 proof failed closed: Node WebSocket client unavailable.')
  process.exit(1)
}
for (const path of [
  resolve(distRoot, 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'build', 'mobile.js'),
]) {
  if (!existsSync(path)) {
    console.error(`SMENU V2 proof failed closed: missing ${path}`)
    process.exit(1)
  }
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
}
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms))

function staticServer() {
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
      response.writeHead(200, {
        'content-type': mimeTypes[extname(target)] || 'application/octet-stream',
        'cache-control': 'no-store',
      })
      response.end(readFileSync(target))
    } catch (error) {
      response.writeHead(500)
      response.end(String(error?.message || error))
    }
  })
}

async function waitFor(predicate, { timeoutMs = 60000, intervalMs = 150, label = 'condition' } = {}) {
  const started = Date.now()
  let lastError = null
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await predicate()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await delay(intervalMs)
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`)
}

class Cdp {
  constructor(url) {
    this.url = url
    this.socket = null
    this.nextId = 1
    this.pending = new Map()
  }
  async open() {
    this.socket = new WebSocket(this.url)
    await new Promise((resolveOpen, rejectOpen) => {
      const timer = setTimeout(() => rejectOpen(new Error('CDP open timeout')), 10000)
      this.socket.addEventListener('open', () => {
        clearTimeout(timer)
        resolveOpen()
      }, { once: true })
      this.socket.addEventListener('error', () => {
        clearTimeout(timer)
        rejectOpen(new Error('CDP failed to open'))
      }, { once: true })
    })
    this.socket.addEventListener('message', (event) => {
      const payload = JSON.parse(String(event.data))
      if (!payload.id) return
      const pending = this.pending.get(payload.id)
      if (!pending) return
      this.pending.delete(payload.id)
      if (payload.error) pending.reject(new Error(payload.error.message || 'CDP command failed'))
      else pending.resolve(payload.result)
    })
  }
  send(method, params = {}) {
    const id = this.nextId++
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
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Runtime.evaluate failed')
  }
  return result.result?.value
}

function uploadExpression(fileName) {
  return `(() => {
    const input = document.getElementById('musicxml-file-input')
    if (!input) return false
    const file = new File([${JSON.stringify(fixtureXml)}], ${JSON.stringify(fileName)}, {
      type: 'application/vnd.recordare.musicxml+xml'
    })
    const transfer = new DataTransfer()
    transfer.items.add(file)
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`
}

async function openEditor(cdp, appUrl, fileName) {
  await cdp.send('Page.navigate', { url: appUrl })
  await waitFor(
    () => evaluate(cdp, `document.readyState === 'complete' && !!document.getElementById('musicxml-tab-btn') && !!document.getElementById('smoosic-tab-btn')`),
    { label: 'SesliTab shell' },
  )
  await evaluate(cdp, `document.getElementById('musicxml-tab-btn').click(); true`)
  if (!await evaluate(cdp, uploadExpression(fileName))) throw new Error('MusicXML input missing')
  await waitFor(
    () => evaluate(cdp, `document.getElementById('musicxml-open-btn')?.disabled === false`),
    { label: 'MusicXML selection' },
  )
  await evaluate(cdp, `document.getElementById('musicxml-open-btn').click(); true`)
  await waitFor(
    () => evaluate(cdp, `String(document.getElementById('xml-output')?.textContent || '').includes('<step>C</step>')`),
    { label: 'MusicXML parse' },
  )
  await evaluate(cdp, `document.getElementById('smoosic-tab-btn').click(); true`)
  const state = await waitFor(
    () => evaluate(cdp, `(() => {
      const doc = document.getElementById('smoosic-editor-frame')?.contentDocument
      const status = String(doc?.getElementById('poc-status')?.textContent || '')
      if (status.startsWith('Başlatma hatası:') || status.startsWith('Hata:') || status.startsWith('XML hatası:')) return 'ERROR:' + status
      if (status.startsWith('Yüklendi:') && status.includes(${JSON.stringify(fileName)})) return 'READY:' + status
      return ''
    })()`),
    { timeoutMs: 120000, label: 'MusicXML handoff to Smoosic' },
  )
  if (String(state).startsWith('ERROR:')) throw new Error(String(state))
  await waitFor(
    () => evaluate(cdp, `(() => {
      const doc = document.getElementById('smoosic-editor-frame')?.contentDocument
      return ${JSON.stringify(controls.map((control) => control.label))}.every((label) => !!doc?.querySelector('button[aria-label="' + label + '"]'))
    })()`),
    { timeoutMs: 30000, label: 'rendered Vue native menu controls' },
  )
}

async function clickRenderedControl(cdp, label) {
  const point = await evaluate(cdp, `(() => {
    const frame = document.getElementById('smoosic-editor-frame')
    const doc = frame?.contentDocument
    const element = doc?.querySelector('button[aria-label=${JSON.stringify(label)}]')
    if (!frame || !doc || !element) return null
    const frameRect = frame.getBoundingClientRect()
    const rect = element.getBoundingClientRect()
    const childX = rect.left + rect.width / 2
    const childY = rect.top + rect.height / 2
    const childHit = doc.elementFromPoint(childX, childY)
    return {
      x: frameRect.left + childX,
      y: frameRect.top + childY,
      id: element.id || null,
      label: element.getAttribute('aria-label'),
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      hitId: childHit?.id || null,
      hitClass: childHit?.className || null,
      targetHit: Boolean(childHit && (childHit === element || element.contains(childHit))),
    }
  })()`)
  if (!point) throw new Error(`Missing rendered Smoosic control ${label}`)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1 })
  return point
}

async function inspectMenu(cdp) {
  return evaluate(cdp, `(() => {
    const frame = document.getElementById('smoosic-editor-frame')
    const doc = frame?.contentDocument
    const win = frame?.contentWindow
    if (!doc || !win) return { functional: false, reason: 'missing-frame' }
    const container = doc.querySelector('.menuContainer')
    const legacyElement = container?.querySelector('.menuElement') || doc.querySelector('.menuElement')
    const layer = container?.querySelector('.menu-layer') || doc.querySelector('.menu-layer')
    const drop = container?.querySelector('[role="menu"], .mdrop') || doc.querySelector('[role="menu"], .mdrop')
    const root = legacyElement || layer || drop
    const rows = Array.from((container || doc).querySelectorAll('.mitem, .menuOption'))
    const rectOf = (element) => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
    }
    const styleOf = (element) => {
      if (!element) return null
      const style = win.getComputedStyle(element)
      return {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        position: style.position,
        maxHeight: style.maxHeight,
        overflowY: style.overflowY,
        pointerEvents: style.pointerEvents,
        zIndex: style.zIndex,
      }
    }
    const visibleRows = rows.filter((row) => {
      const rect = row.getBoundingClientRect()
      const style = win.getComputedStyle(row)
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
    })
    const rootRect = rectOf(root)
    const rootStyle = styleOf(root)
    const viewport = { width: win.innerWidth, height: win.innerHeight }
    const intersectsViewport = Boolean(rootRect && rootRect.right > 0 && rootRect.bottom > 0 && rootRect.left < viewport.width && rootRect.top < viewport.height)
    const functional = Boolean(
      root &&
      rootRect &&
      rootRect.width > 80 &&
      rootRect.height > 40 &&
      visibleRows.length >= 2 &&
      rootStyle?.display !== 'none' &&
      rootStyle?.visibility !== 'hidden' &&
      rootStyle?.pointerEvents !== 'none' &&
      intersectsViewport
    )
    return {
      bodyClass: doc.body?.className || '',
      viewport,
      containerRect: rectOf(container),
      containerStyle: styleOf(container),
      legacyElementRect: rectOf(legacyElement),
      legacyElementStyle: styleOf(legacyElement),
      layerRect: rectOf(layer),
      layerStyle: styleOf(layer),
      dropRect: rectOf(drop),
      dropStyle: styleOf(drop),
      rootRect,
      rootStyle,
      rootClientHeight: root?.clientHeight ?? null,
      rootScrollHeight: root?.scrollHeight ?? null,
      rowCount: rows.length,
      visibleRowCount: visibleRows.length,
      firstRows: visibleRows.slice(0, 8).map((row) => ({ text: row.textContent?.trim() || '', rect: rectOf(row) })),
      intersectsViewport,
      functional,
    }
  })()`)
}

const server = staticServer()
const userDataDir = mkdtempSync(resolve(tmpdir(), 'seslitab-smenu-v2-'))
const remoteDebuggingPort = 9347
const diagnostics = {
  generatedAt: new Date().toISOString(),
  viewport,
  controls: {},
  chrome: null,
  failure: null,
}
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
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=${remoteDebuggingPort}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${viewport.width},${viewport.height}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  const chromeStderr = []
  browser.stderr?.on('data', (chunk) => chromeStderr.push(String(chunk)))
  diagnostics.chrome = { binary: chrome, stderr: chromeStderr }

  const targets = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${remoteDebuggingPort}/json/list`)
    if (!response.ok) return null
    const payload = await response.json()
    return payload.find((target) => target.type === 'page' && target.webSocketDebuggerUrl) ? payload : null
  }, { timeoutMs: 15000, label: 'Chrome DevTools target' })
  const target = targets.find((candidate) => candidate.type === 'page' && candidate.webSocketDebuggerUrl)
  cdp = new Cdp(target.webSocketDebuggerUrl)
  await cdp.open()
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false,
  })

  for (const control of controls) {
    const fileName = `smenu-v2-${control.name}.musicxml`
    await openEditor(cdp, appUrl, fileName)
    const click = await clickRenderedControl(cdp, control.label)
    await delay(500)
    const menu = await inspectMenu(cdp)
    diagnostics.controls[control.name] = { label: control.label, click, menu }
  }

  const failed = Object.entries(diagnostics.controls)
    .filter(([, evidence]) => !evidence.menu?.functional)
    .map(([name]) => name)
  if (failed.length) throw new Error(`Native Smoosic menu layout RED for: ${failed.join(', ')}`)
} catch (error) {
  failure = error
  diagnostics.failure = { message: error?.message || String(error), stack: error?.stack || null }
} finally {
  if (diagnostics.chrome?.stderr) diagnostics.chrome.stderr = diagnostics.chrome.stderr.join('').slice(-12000)
  mkdirSync(resolve(repoRoot, 'artifacts'), { recursive: true })
  writeFileSync(artifactPath, `${JSON.stringify(diagnostics, null, 2)}\n`)
  cdp?.close()
  if (browser && browser.exitCode === null) browser.kill('SIGTERM')
  if (server.listening) await new Promise((resolveClose) => server.close(resolveClose))
  rmSync(userDataDir, { recursive: true, force: true })
}

if (failure) {
  console.error(`SMENU V2 proof failed: ${failure.message}`)
  console.error(`Evidence: ${artifactPath}`)
  process.exit(1)
}
console.log('SMENU V2 proof passed for File, Score, and Notes native menus.')
console.log(`Evidence: ${artifactPath}`)
