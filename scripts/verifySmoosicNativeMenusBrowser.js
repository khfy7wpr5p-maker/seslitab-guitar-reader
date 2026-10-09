import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, resolve, sep } from 'node:path'

const repoRoot = resolve('.')
const distRoot = resolve(repoRoot, 'dist')
const artifactPath = resolve(repoRoot, 'artifacts', 'smenu-native-menu-browser.json')
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
  console.error('SMENU native-menu proof failed closed: Chrome/Chromium not found.')
  process.exit(1)
}
if (typeof WebSocket !== 'function') {
  console.error('SMENU native-menu proof failed closed: Node WebSocket client is unavailable.')
  process.exit(1)
}

for (const required of [
  resolve(distRoot, 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'build', 'mobile.js'),
]) {
  if (!existsSync(required)) {
    console.error(`SMENU native-menu proof failed closed: missing build artifact ${required}`)
    process.exit(1)
  }
}

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

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
}

function safeDistPath(pathname) {
  let relative = decodeURIComponent(pathname).replace(/^\/+/, '')
  if (!relative || relative.endsWith('/')) relative += 'index.html'
  const target = resolve(distRoot, relative)
  if (target !== distRoot && !target.startsWith(distRoot + sep)) return null
  return target
}

function createStaticServer() {
  return createServer((request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', 'http://127.0.0.1')
      const target = safeDistPath(requestUrl.pathname)
      if (!target || !existsSync(target) || !statSync(target).isFile()) {
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
  let lastValue = null
  while (Date.now() - started < timeoutMs) {
    try {
      lastValue = await predicate()
      if (lastValue) return lastValue
    } catch (error) {
      lastError = error
    }
    await delay(intervalMs)
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : lastValue ? ` (last=${String(lastValue)})` : ''}`)
}

class CdpConnection {
  constructor(url) {
    this.url = url
    this.socket = null
    this.nextId = 1
    this.pending = new Map()
  }

  async open() {
    this.socket = new WebSocket(this.url)
    await new Promise((resolveOpen, rejectOpen) => {
      const timer = setTimeout(() => rejectOpen(new Error('CDP WebSocket open timeout')), 10000)
      this.socket.addEventListener('open', () => {
        clearTimeout(timer)
        resolveOpen()
      }, { once: true })
      this.socket.addEventListener('error', () => {
        clearTimeout(timer)
        rejectOpen(new Error('CDP WebSocket failed to open'))
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

function uploadExpression(xml, fileName) {
  return `(() => {
    const input = document.getElementById('musicxml-file-input')
    if (!input) return false
    const file = new File([${JSON.stringify(xml)}], ${JSON.stringify(fileName)}, {
      type: 'application/vnd.recordare.musicxml+xml',
    })
    const transfer = new DataTransfer()
    transfer.items.add(file)
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`
}

async function clickAt(cdp, x, y) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  })
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  })
}

async function clickFrameControl(cdp, id) {
  const point = await evaluate(cdp, `(() => {
    const frame = document.getElementById('smoosic-editor-frame')
    const doc = frame?.contentDocument
    const element = doc?.getElementById(${JSON.stringify(id)})
    if (!frame || !doc || !element) return null
    const frameRect = frame.getBoundingClientRect()
    const rect = element.getBoundingClientRect()
    const childX = rect.left + rect.width / 2
    const childY = rect.top + rect.height / 2
    const x = frameRect.left + childX
    const y = frameRect.top + childY
    const childHit = doc.elementFromPoint(childX, childY)
    const hostHit = document.elementFromPoint(x, y)
    return {
      x,
      y,
      frameRect: { left: frameRect.left, top: frameRect.top, width: frameRect.width, height: frameRect.height },
      controlRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      childHitId: childHit?.id || null,
      childHitClass: childHit?.className || null,
      childTargetHit: Boolean(childHit && (childHit === element || element.contains(childHit))),
      hostHitId: hostHit?.id || null,
      hostHitTag: hostHit?.tagName || null,
      hostFrameHit: hostHit === frame,
    }
  })()`)
  if (!point) throw new Error(`Missing native Smoosic control #${id}`)
  await clickAt(cdp, point.x, point.y)
  return point
}

async function captureEditorState(cdp) {
  return evaluate(cdp, `(() => {
    const frame = document.getElementById('smoosic-editor-frame')
    const doc = frame?.contentDocument
    const win = frame?.contentWindow
    const names = ['SuiFileMenu', 'SuiScoreMenu', 'SuiNoteMenu', 'DisplaySettings']
    const smo = win?.Smo
    const constructors = Object.fromEntries(names.map((name) => [name, typeof smo?.[name]]))
    const controls = {}
    for (const id of ['fileMenu', 'scoreMenu', 'noteMenu', 'playButton2']) {
      const element = doc?.getElementById(id)
      if (!element) {
        controls[id] = null
        continue
      }
      const rect = element.getBoundingClientRect()
      const style = win.getComputedStyle(element)
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      const hit = doc.elementFromPoint(x, y)
      controls[id] = {
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        display: style.display,
        visibility: style.visibility,
        pointerEvents: style.pointerEvents,
        hitId: hit?.id || null,
        hitClass: hit?.className || null,
        targetHit: Boolean(hit && (hit === element || element.contains(hit))),
      }
    }
    return {
      hostReady: Boolean(frame && doc && win),
      hostInnerWidth: window.innerWidth,
      hostInnerHeight: window.innerHeight,
      frameSrc: frame?.getAttribute('src') || null,
      frameRect: frame ? (() => {
        const rect = frame.getBoundingClientRect()
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
      })() : null,
      frameStatus: doc?.getElementById('poc-status')?.textContent || null,
      frameInnerWidth: win?.innerWidth ?? null,
      frameInnerHeight: win?.innerHeight ?? null,
      smoGlobalType: typeof smo,
      constructors,
      controls,
    }
  })()`)
}

async function inspectMenu(cdp) {
  return evaluate(cdp, `(() => {
    const frame = document.getElementById('smoosic-editor-frame')
    const doc = frame?.contentDocument
    const win = frame?.contentWindow
    if (!frame || !doc || !win) return { functional: false, reason: 'missing-frame' }
    const menus = Array.from(doc.querySelectorAll('.menuElement'))
    const menu = menus.find((candidate) => {
      const rect = candidate.getBoundingClientRect()
      const style = win.getComputedStyle(candidate)
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
    }) || menus.at(-1) || null
    const container = menu?.closest('.menuContainer') || doc.querySelector('.menuContainer')
    const rectOf = (element) => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    }
    const styleOf = (element) => {
      if (!element) return null
      const style = win.getComputedStyle(element)
      return {
        display: style.display,
        visibility: style.visibility,
        pointerEvents: style.pointerEvents,
        overflow: style.overflow,
        maxHeight: style.maxHeight,
        minHeight: style.minHeight,
        position: style.position,
      }
    }
    const options = menu ? Array.from(menu.querySelectorAll('.menuOption')) : []
    const visibleOptions = options.filter((option) => {
      const rect = option.getBoundingClientRect()
      const style = win.getComputedStyle(option)
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
    })
    const first = visibleOptions[0] || null
    let firstHit = null
    if (first) {
      const rect = first.getBoundingClientRect()
      const childX = rect.left + Math.min(rect.width / 2, Math.max(2, rect.width - 2))
      const childY = rect.top + Math.min(rect.height / 2, Math.max(2, rect.height - 2))
      const hit = doc.elementFromPoint(childX, childY)
      firstHit = {
        childX,
        childY,
        hitId: hit?.id || null,
        hitClass: hit?.className || null,
        optionHit: Boolean(hit && (hit === first || first.contains(hit))),
      }
    }
    const menuRect = rectOf(menu)
    const menuStyle = styleOf(menu)
    const functional = Boolean(
      menu &&
      menuRect &&
      menuRect.width > 30 &&
      menuRect.height > 40 &&
      visibleOptions.length >= 2 &&
      menuStyle?.display !== 'none' &&
      menuStyle?.visibility !== 'hidden' &&
      menuStyle?.pointerEvents !== 'none' &&
      firstHit?.optionHit
    )
    return {
      menuCount: menus.length,
      menuRect,
      menuStyle,
      menuScrollHeight: menu?.scrollHeight ?? null,
      containerRect: rectOf(container),
      containerStyle: styleOf(container),
      optionCount: options.length,
      visibleOptionCount: visibleOptions.length,
      firstOptionRect: rectOf(first),
      firstHit,
      functional,
    }
  })()`)
}

async function openProductionEditor(cdp, appUrl, fileName) {
  await cdp.send('Page.navigate', { url: appUrl })
  await waitFor(
    async () => evaluate(cdp, `document.readyState === 'complete' && !!document.getElementById('musicxml-tab-btn') && !!document.getElementById('smoosic-tab-btn')`),
    { timeoutMs: 60000, label: 'SesliTab shell' },
  )
  await evaluate(cdp, `document.getElementById('musicxml-tab-btn').click(); true`)
  const uploaded = await evaluate(cdp, uploadExpression(fixtureXml, fileName))
  if (!uploaded) throw new Error('MusicXML test fixture input is missing')
  await waitFor(
    async () => evaluate(cdp, `document.getElementById('musicxml-open-btn')?.disabled === false`),
    { label: 'MusicXML selection' },
  )
  await evaluate(cdp, `document.getElementById('musicxml-open-btn').click(); true`)
  await waitFor(
    async () => evaluate(cdp, `String(document.getElementById('xml-output')?.textContent || '').includes('<step>C</step>')`),
    { timeoutMs: 60000, label: 'MusicXML parse' },
  )
  await evaluate(cdp, `document.getElementById('smoosic-tab-btn').click(); true`)
  await waitFor(
    async () => evaluate(cdp, `!!document.getElementById('smoosic-editor-frame')?.contentDocument?.getElementById('poc-status')`),
    { timeoutMs: 60000, label: 'Smoosic iframe document' },
  )
  const handoffState = await waitFor(
    async () => evaluate(cdp, `(() => {
      const doc = document.getElementById('smoosic-editor-frame')?.contentDocument
      const status = String(doc?.getElementById('poc-status')?.textContent || '')
      if (status.startsWith('Başlatma hatası:') || status.startsWith('Hata:') || status.startsWith('XML hatası:')) return 'ERROR:' + status
      if (status.startsWith('Yüklendi:') && status.includes(${JSON.stringify(fileName)})) return 'READY:' + status
      return ''
    })()`),
    { timeoutMs: 120000, label: 'MusicXML handoff to Smoosic' },
  )
  if (String(handoffState).startsWith('ERROR:')) throw new Error(String(handoffState))
  await waitFor(
    async () => evaluate(cdp, `(() => {
      const doc = document.getElementById('smoosic-editor-frame')?.contentDocument
      return !!doc?.getElementById('fileMenu') && !!doc?.getElementById('scoreMenu') && !!doc?.getElementById('noteMenu') && !!doc?.getElementById('playButton2')
    })()`),
    { timeoutMs: 30000, label: 'native Smoosic controls after production handoff' },
  )
}

const server = createStaticServer()
const userDataDir = mkdtempSync(resolve(tmpdir(), 'seslitab-smenu-chrome-'))
const remoteDebuggingPort = 9337
const chromeLog = []
let browser = null
let cdp = null
let failure = null
const diagnostics = {
  generatedAt: new Date().toISOString(),
  chrome,
  viewport: { width: 1130, height: 900 },
  runtime: null,
  menus: {},
  precondition: null,
}

try {
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  const appUrl = `http://127.0.0.1:${address.port}/index.html`

  browser = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=${remoteDebuggingPort}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1130,900',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  browser.stderr?.on('data', (chunk) => chromeLog.push(String(chunk)))

  const targets = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${remoteDebuggingPort}/json/list`)
    if (!response.ok) return null
    const payload = await response.json()
    return payload.find((target) => target.type === 'page' && target.webSocketDebuggerUrl) ? payload : null
  }, { timeoutMs: 15000, label: 'Chrome DevTools target' })
  const target = targets.find((candidate) => candidate.type === 'page' && candidate.webSocketDebuggerUrl)
  cdp = new CdpConnection(target.webSocketDebuggerUrl)
  await cdp.open()
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1130,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })

  await openProductionEditor(cdp, appUrl, 'smenu-runtime.musicxml')
  diagnostics.runtime = await captureEditorState(cdp)

  for (const [name, id] of [
    ['file', 'fileMenu'],
    ['score', 'scoreMenu'],
    ['notes', 'noteMenu'],
  ]) {
    const fileName = `smenu-${name}.musicxml`
    await openProductionEditor(cdp, appUrl, fileName)
    const before = await captureEditorState(cdp)
    const click = await clickFrameControl(cdp, id)
    await delay(500)
    const result = await inspectMenu(cdp)
    diagnostics.menus[name] = { id, before, click, result }
  }

  const failedMenus = Object.entries(diagnostics.menus)
    .filter(([, value]) => !value.result?.functional)
    .map(([name]) => name)
  if (failedMenus.length) {
    throw new Error(`Native Smoosic menu proof failed for: ${failedMenus.join(', ')}`)
  }
} catch (error) {
  failure = error
  if (cdp) {
    try {
      diagnostics.precondition = await captureEditorState(cdp)
    } catch (captureError) {
      diagnostics.precondition = { captureError: captureError?.message || String(captureError) }
    }
  }
  diagnostics.failure = {
    message: error?.message || String(error),
    stack: error?.stack || null,
  }
} finally {
  diagnostics.chromeStderr = chromeLog.join('').slice(-12000)
  mkdirSync(resolve(repoRoot, 'artifacts'), { recursive: true })
  writeFileSync(artifactPath, `${JSON.stringify(diagnostics, null, 2)}\n`)
  cdp?.close()
  if (browser && browser.exitCode === null) browser.kill('SIGTERM')
  if (server.listening) await new Promise((resolveClose) => server.close(resolveClose))
  rmSync(userDataDir, { recursive: true, force: true })
}

if (failure) {
  console.error(`SMENU native-menu proof failed: ${failure.message}`)
  console.error(`Evidence: ${artifactPath}`)
  process.exit(1)
}

console.log('SMENU native-menu proof passed for File, Score, and Notes native controls.')
console.log(`Evidence: ${artifactPath}`)
