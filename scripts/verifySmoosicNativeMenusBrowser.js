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
  resolve(distRoot, 'smoosic-editor', 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'build', 'mobile.js'),
]) {
  if (!existsSync(required)) {
    console.error(`SMENU native-menu proof failed closed: missing build artifact ${required}`)
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

async function waitFor(predicate, { timeoutMs = 30000, intervalMs = 150, label = 'condition' } = {}) {
  const started = Date.now()
  let lastError = null
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await predicate()
      if (result) return result
    } catch (error) {
      lastError = error
    }
    await delay(intervalMs)
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`)
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
      const payload = JSON.parse(event.data)
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

async function clickAt(cdp, x, y) {
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x,
    y,
  })
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

async function clickSelector(cdp, selector) {
  const point = await evaluate(cdp, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) return null
    const rect = element.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const hit = document.elementFromPoint(x, y)
    return {
      x,
      y,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      hitId: hit?.id || null,
      hitClass: hit?.className || null,
      targetHit: Boolean(hit && (hit === element || element.contains(hit))),
    }
  })()`)
  if (!point) throw new Error(`Missing native control ${selector}`)
  await clickAt(cdp, point.x, point.y)
  return point
}

async function navigateEditor(cdp, editorUrl) {
  await cdp.send('Page.navigate', { url: editorUrl })
  await waitFor(
    async () => evaluate(cdp, `document.readyState === 'complete'`),
    { label: 'Smoosic document load' },
  )
  await waitFor(
    async () => evaluate(cdp, `(() => {
      const status = document.querySelector('#poc-status')?.textContent || ''
      return status.includes('Editör hazır') &&
        Boolean(document.querySelector('#fileMenu')) &&
        Boolean(document.querySelector('#scoreMenu')) &&
        Boolean(document.querySelector('#noteMenu')) &&
        Boolean(document.querySelector('#playButton2'))
    })()`),
    { timeoutMs: 45000, label: 'Smoosic native controls ready' },
  )
}

async function inspectRuntime(cdp) {
  return evaluate(cdp, `(() => {
    const names = ['SuiFileMenu', 'SuiScoreMenu', 'SuiNoteMenu', 'DisplaySettings']
    const smo = globalThis.Smo
    const constructors = Object.fromEntries(names.map((name) => [name, typeof smo?.[name]]))
    return {
      status: document.querySelector('#poc-status')?.textContent || '',
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      smoGlobalType: typeof smo,
      constructors,
      controls: Object.fromEntries(['fileMenu', 'scoreMenu', 'noteMenu', 'playButton2'].map((id) => {
        const element = document.getElementById(id)
        if (!element) return [id, null]
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        const x = rect.left + rect.width / 2
        const y = rect.top + rect.height / 2
        const hit = document.elementFromPoint(x, y)
        return [id, {
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          display: style.display,
          visibility: style.visibility,
          pointerEvents: style.pointerEvents,
          hitId: hit?.id || null,
          hitClass: hit?.className || null,
          targetHit: Boolean(hit && (hit === element || element.contains(hit))),
        }]
      })),
    }
  })()`)
}

async function inspectMenu(cdp) {
  return evaluate(cdp, `(() => {
    const menus = Array.from(document.querySelectorAll('.menuElement'))
    const menu = menus.find((candidate) => {
      const rect = candidate.getBoundingClientRect()
      const style = getComputedStyle(candidate)
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
    }) || menus.at(-1) || null
    const container = menu?.closest('.menuContainer') || document.querySelector('.menuContainer')
    const rectOf = (element) => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    }
    const styleOf = (element) => {
      if (!element) return null
      const style = getComputedStyle(element)
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
      const style = getComputedStyle(option)
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
    })
    const first = visibleOptions[0] || null
    let firstHit = null
    if (first) {
      const rect = first.getBoundingClientRect()
      const x = rect.left + Math.min(rect.width / 2, Math.max(2, rect.width - 2))
      const y = rect.top + Math.min(rect.height / 2, Math.max(2, rect.height - 2))
      const hit = document.elementFromPoint(x, y)
      firstHit = {
        x,
        y,
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
}

try {
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  const origin = `http://127.0.0.1:${address.port}`
  const editorUrl = `${origin}/smoosic-editor/index.html`

  browser = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
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
  await cdp.send('DOM.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1130,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })

  await navigateEditor(cdp, editorUrl)
  diagnostics.runtime = await inspectRuntime(cdp)

  for (const menu of [
    ['file', '#fileMenu'],
    ['score', '#scoreMenu'],
    ['notes', '#noteMenu'],
  ]) {
    const [name, selector] = menu
    await navigateEditor(cdp, editorUrl)
    const before = await inspectRuntime(cdp)
    const click = await clickSelector(cdp, selector)
    await delay(500)
    const result = await inspectMenu(cdp)
    diagnostics.menus[name] = { selector, before, click, result }
  }

  const failedMenus = Object.entries(diagnostics.menus)
    .filter(([, value]) => !value.result?.functional)
    .map(([name]) => name)
  if (failedMenus.length) {
    throw new Error(`Native Smoosic menu proof failed for: ${failedMenus.join(', ')}`)
  }
} catch (error) {
  failure = error
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
  await new Promise((resolveClose) => server.close(resolveClose))
  rmSync(userDataDir, { recursive: true, force: true })
}

if (failure) {
  console.error(`SMENU native-menu proof failed: ${failure.message}`)
  console.error(`Evidence: ${artifactPath}`)
  process.exit(1)
}

console.log('SMENU native-menu proof passed for File, Score, and Notes native controls.')
console.log(`Evidence: ${artifactPath}`)
