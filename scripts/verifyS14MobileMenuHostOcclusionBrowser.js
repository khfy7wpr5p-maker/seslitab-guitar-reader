import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'

const repoRoot = resolve('.')
const distRoot = resolve(repoRoot, 'dist')
const candidates = [
  process.env.CHROME_BIN,
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
].filter(Boolean)

let chrome = null
for (const candidate of candidates) {
  if (spawnSync(candidate, ['--version'], { encoding: 'utf8' }).status === 0) {
    chrome = candidate
    break
  }
}

if (!chrome) {
  console.error('S14 mobile menu host-occlusion proof failed closed: Chrome/Chromium not found.')
  process.exit(1)
}
if (typeof WebSocket !== 'function') {
  console.error('S14 mobile menu host-occlusion proof failed closed: Node WebSocket client is unavailable.')
  process.exit(1)
}

for (const required of [
  resolve(distRoot, 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'viewport-fit.js'),
]) {
  if (!existsSync(required)) {
    console.error(`S14 mobile menu host-occlusion proof failed closed: missing build artifact ${required}`)
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

async function waitForChildExit(child, timeoutMs = 2000) {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise((resolveExit) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.removeListener('exit', finish)
      resolveExit()
    }
    const timer = setTimeout(finish, timeoutMs)
    child.once('exit', finish)
  })
}

async function waitForDevToolsPort(userDataDir, child) {
  const portFile = join(userDataDir, 'DevToolsActivePort')
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Chrome exited before DevTools became ready (${child.exitCode}).`)
    if (existsSync(portFile)) {
      const [portText] = readFileSync(portFile, 'utf8').trim().split(/\r?\n/)
      const port = Number(portText)
      if (Number.isInteger(port) && port > 0) return port
    }
    await delay(50)
  }
  throw new Error('Chrome DevTools port did not become ready.')
}

function connectCdp(webSocketUrl) {
  return new Promise((resolveConnection, rejectConnection) => {
    const socket = new WebSocket(webSocketUrl)
    let nextId = 1
    const pending = new Map()
    let settled = false

    const rejectAll = (error) => {
      for (const { reject } of pending.values()) reject(error)
      pending.clear()
    }

    socket.addEventListener('open', () => {
      settled = true
      resolveConnection({
        send(method, params = {}) {
          const id = nextId++
          return new Promise((resolveCommand, rejectCommand) => {
            pending.set(id, { resolve: resolveCommand, reject: rejectCommand })
            socket.send(JSON.stringify({ id, method, params }))
          })
        },
        close() {
          rejectAll(new Error('CDP connection closed.'))
          socket.close()
        },
      })
    }, { once: true })

    socket.addEventListener('message', (event) => {
      let message
      try {
        message = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (!message.id || !pending.has(message.id)) return
      const handler = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) handler.reject(new Error(`${message.error.message ?? 'CDP command failed'} (${message.error.code ?? 'unknown'})`))
      else handler.resolve(message.result ?? {})
    })

    socket.addEventListener('error', () => {
      const error = new Error('Chrome DevTools WebSocket failed.')
      rejectAll(error)
      if (!settled) rejectConnection(error)
    })
    socket.addEventListener('close', () => rejectAll(new Error('Chrome DevTools WebSocket closed.')))
  })
}

async function createPageTarget(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })
  if (!response.ok) throw new Error(`Chrome DevTools target creation failed (${response.status}).`)
  const target = await response.json()
  if (typeof target?.webSocketDebuggerUrl !== 'string' || !target.webSocketDebuggerUrl) {
    throw new Error('Chrome DevTools target did not expose a WebSocket URL.')
  }
  return target.webSocketDebuggerUrl
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result?.exceptionDetails) {
    const text = result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Runtime evaluation failed.'
    throw new Error(text)
  }
  return result?.result?.value
}

async function waitFor(cdp, expression, label, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  let lastValue = null
  while (Date.now() < deadline) {
    lastValue = await evaluate(cdp, expression)
    if (lastValue) return lastValue
    await delay(100)
  }
  throw new Error(`${label} timed out${lastValue ? ` (last=${String(lastValue)})` : ''}`)
}

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1')
  const target = safeDistPath(url.pathname)
  if (!target || !existsSync(target) || !statSync(target).isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('not found')
    return
  }
  response.writeHead(200, {
    'content-type': mimeTypes[extname(target).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'no-store',
  })
  response.end(readFileSync(target))
})

await new Promise((resolveListen, rejectListen) => {
  server.once('error', rejectListen)
  server.listen(0, '127.0.0.1', resolveListen)
})

const address = server.address()
const port = typeof address === 'object' && address ? address.port : null
if (!port) throw new Error('S14 mobile menu host-occlusion proof could not acquire a local port.')

const userDataDir = mkdtempSync(join(tmpdir(), 'seslitab-menu-host-'))
const child = spawn(chrome, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--remote-debugging-port=0',
  `--user-data-dir=${userDataDir}`,
  'about:blank',
], { cwd: repoRoot, stdio: 'ignore' })

let cdp = null
try {
  const debugPort = await waitForDevToolsPort(userDataDir, child)
  const webSocketUrl = await createPageTarget(debugPort)
  cdp = await connectCdp(webSocketUrl)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
    screenOrientation: { type: 'portraitPrimary', angle: 0 },
  })
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html` })

  await waitFor(cdp, `document.readyState === 'complete' && !!document.getElementById('smoosic-tab-btn')`, 'SesliTab shell')
  await evaluate(cdp, `document.getElementById('smoosic-tab-btn').click(); true`)
  await waitFor(cdp, `!!document.getElementById('smoosic-editor-frame')`, 'Smoosic iframe')
  await waitFor(cdp, `(() => {
    const doc = document.getElementById('smoosic-editor-frame')?.contentDocument;
    return !!doc?.getElementById('mobile-menu-toggle') && !!doc?.getElementById('controls-left');
  })()`, 'Smoosic mobile menu')

  await evaluate(cdp, `(() => {
    const spacer = document.createElement('div');
    spacer.id = 'host-occlusion-test-spacer';
    spacer.style.height = '1400px';
    spacer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(spacer);
    const frame = document.getElementById('smoosic-editor-frame');
    const frameDocumentTop = window.scrollY + frame.getBoundingClientRect().top;
    window.scrollTo(0, frameDocumentTop + 220);
    return true;
  })()`)

  await waitFor(cdp, `(() => {
    const frame = document.getElementById('smoosic-editor-frame');
    const header = document.querySelector('.app-header');
    if (!frame || !header) return false;
    return frame.getBoundingClientRect().top < header.getBoundingClientRect().bottom - 100
      && Number(frame.dataset.seslitabHostOccludedTop || 0) > 100;
  })()`, 'host header to occlude iframe top')

  await evaluate(cdp, `(() => {
    const frame = document.getElementById('smoosic-editor-frame');
    const doc = frame.contentDocument;
    if (doc.body.classList.contains('mobile-menu-open')) doc.getElementById('mobile-menu-toggle').click();
    doc.getElementById('mobile-menu-toggle').click();
    return true;
  })()`)

  await waitFor(cdp, `document.getElementById('smoosic-editor-frame')?.contentDocument?.body?.classList?.contains('mobile-menu-open') === true`, 'mobile menu open')
  await delay(100)

  const proof = await evaluate(cdp, `(() => {
    const frame = document.getElementById('smoosic-editor-frame');
    const header = document.querySelector('.app-header');
    const doc = frame.contentDocument;
    const menu = doc.getElementById('controls-left');
    const firstButton = menu.querySelector('button');
    const grayShell = doc.querySelector('.media > .d-flex.flex-column.flex-shrink-0.p-3.bg-body-tertiary');
    const frameRect = frame.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const firstRect = firstButton.getBoundingClientRect();
    const x = Math.max(firstRect.left + 1, Math.min(firstRect.right - 1, firstRect.left + firstRect.width / 2));
    const y = Math.max(firstRect.top + 1, Math.min(firstRect.bottom - 1, firstRect.top + firstRect.height / 2));
    const hit = doc.elementFromPoint(x, y);
    const visibleFirstHeight = Math.max(0, Math.min(firstRect.bottom, menuRect.bottom) - Math.max(firstRect.top, menuRect.top));
    const grayRect = grayShell?.getBoundingClientRect?.();
    const grayStyle = grayShell ? getComputedStyle(grayShell) : null;
    return {
      firstLabel: String(firstButton?.textContent || '').trim(),
      scrollTop: menu.scrollTop,
      frameTop: frameRect.top,
      headerBottom: headerRect.bottom,
      menuTopInParent: frameRect.top + menuRect.top,
      firstTopInParent: frameRect.top + firstRect.top,
      menuTopCss: getComputedStyle(menu).top,
      recordedMenuTop: Number(frame.dataset.seslitabMenuTop || 0),
      recordedOccludedTop: Number(frame.dataset.seslitabHostOccludedTop || 0),
      viewportHeight: window.visualViewport?.height || window.innerHeight,
      menuParentIsBody: menu.parentElement === doc.body,
      firstHitInsideMenu: !!hit?.closest?.('#controls-left'),
      firstHitTag: hit?.tagName || '',
      firstHitClass: String(hit?.className || ''),
      visibleFirstHeight,
      grayShellWidth: Number(grayRect?.width || 0),
      grayShellPaddingLeft: grayStyle?.paddingLeft || '',
      grayShellBackground: grayStyle?.backgroundColor || '',
    };
  })()`)

  if (!proof?.firstLabel.includes('Help')) throw new Error(`First mobile menu item is not Help: ${JSON.stringify(proof)}`)
  if (proof.scrollTop !== 0) throw new Error(`Mobile menu did not reopen at scrollTop=0: ${JSON.stringify(proof)}`)
  if (!(proof.recordedOccludedTop > 100)) throw new Error(`Host occlusion was not reproduced: ${JSON.stringify(proof)}`)
  if (proof.menuTopInParent < proof.headerBottom - 2) throw new Error(`Mobile menu is still hidden behind sticky host header: ${JSON.stringify(proof)}`)
  if (proof.firstTopInParent < proof.headerBottom - 2) throw new Error(`Help item is still hidden behind sticky host header: ${JSON.stringify(proof)}`)
  if (!proof.menuParentIsBody) throw new Error(`Mobile menu is still trapped inside Smoosic media layers: ${JSON.stringify(proof)}`)
  if (!proof.firstHitInsideMenu) throw new Error(`Help item is painted behind another Smoosic layer: ${JSON.stringify(proof)}`)
  if (proof.visibleFirstHeight < 40) throw new Error(`Help item is clipped to a narrow strip: ${JSON.stringify(proof)}`)
  if (proof.grayShellWidth > 1) throw new Error(`Empty Bootstrap menu shell still occupies score width: ${JSON.stringify(proof)}`)

  console.log(`S14 mobile menu host-occlusion browser proof PASS using ${chrome}: ${JSON.stringify(proof)}`)
} catch (error) {
  console.error(`S14 mobile menu host-occlusion proof failed closed: ${error?.message ?? error}`)
  process.exitCode = 1
} finally {
  try { cdp?.close() } catch {}
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
  await waitForChildExit(child, 1500)
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  await waitForChildExit(child, 1000)
  try {
    rmSync(userDataDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
  } catch (error) {
    console.error(`S14 mobile menu host-occlusion cleanup failed: ${error?.message ?? error}`)
    process.exitCode = 1
  }
  await new Promise((resolveClose) => server.close(resolveClose))
}
