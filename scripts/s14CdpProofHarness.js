import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'

const repoRoot = resolve('.')
const distRoot = resolve(repoRoot, 'dist')
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

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (spawnSync(candidate, ['--version'], { encoding: 'utf8' }).status === 0) {
      return candidate
    }
  }
  throw new Error('Chrome/Chromium not found.')
}

function safeDistPath(pathname) {
  let relative = decodeURIComponent(pathname).replace(/^\/+/, '')
  if (!relative || relative.endsWith('/')) relative += 'index.html'
  const target = resolve(distRoot, relative)
  if (target !== distRoot && !target.startsWith(distRoot + sep)) return null
  return target
}

function createDistServer() {
  return createServer((request, response) => {
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
    if (child.exitCode !== null) {
      throw new Error(`Chrome exited before DevTools became ready (${child.exitCode}).`)
    }
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
      if (message.error) {
        handler.reject(new Error(`${message.error.message ?? 'CDP command failed'} (${message.error.code ?? 'unknown'})`))
      } else {
        handler.resolve(message.result ?? {})
      }
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
  const response = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`,
    { method: 'PUT' },
  )
  if (!response.ok) {
    throw new Error(`Chrome DevTools target creation failed (${response.status}).`)
  }
  const target = await response.json()
  if (typeof target?.webSocketDebuggerUrl !== 'string' || !target.webSocketDebuggerUrl) {
    throw new Error('Chrome DevTools target did not expose a WebSocket URL.')
  }
  return target.webSocketDebuggerUrl
}

export async function createS14CdpProofSession({ width = 390, height = 844 } = {}) {
  if (typeof WebSocket !== 'function') {
    throw new Error('Node WebSocket client is unavailable.')
  }
  for (const required of [
    resolve(distRoot, 'index.html'),
    resolve(distRoot, 'smoosic-editor', 'index.html'),
    resolve(distRoot, 'smoosic-editor', 'build', 'mobile.js'),
  ]) {
    if (!existsSync(required)) {
      throw new Error(`Missing build artifact ${required}`)
    }
  }

  const chrome = findChrome()
  const server = createDistServer()
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', resolveListen)
  })

  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : null
  if (!port) {
    server.close()
    throw new Error('Could not acquire a local HTTP port.')
  }

  const userDataDir = mkdtempSync(join(tmpdir(), 'seslitab-s14-proof-'))
  const child = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--autoplay-policy=no-user-gesture-required',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], {
    cwd: repoRoot,
    stdio: 'ignore',
  })

  let cdp = null
  try {
    const debugPort = await waitForDevToolsPort(userDataDir, child)
    const webSocketUrl = await createPageTarget(debugPort)
    cdp = await connectCdp(webSocketUrl)
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: width,
      screenHeight: height,
      screenOrientation: { type: 'portraitPrimary', angle: 0 },
    })
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html` })
  } catch (error) {
    try { cdp?.close() } catch {}
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await waitForChildExit(child, 1000)
    rmSync(userDataDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
    await new Promise((resolveClose) => server.close(resolveClose))
    throw error
  }

  async function evaluate(expression) {
    const result = await cdp.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (result?.exceptionDetails) {
      const message = result.exceptionDetails.exception?.description
        || result.exceptionDetails.text
        || 'Runtime evaluation failed.'
      throw new Error(message)
    }
    return result?.result?.value
  }

  async function waitFor(expression, label, timeoutMs = 120000) {
    const deadline = Date.now() + timeoutMs
    let lastError = null
    while (Date.now() < deadline) {
      try {
        const value = await evaluate(expression)
        if (value) return value
      } catch (error) {
        lastError = error
      }
      await delay(100)
    }
    throw new Error(`${label} timed out${lastError ? `: ${lastError.message}` : ''}`)
  }

  async function close() {
    try { cdp?.close() } catch {}
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    await waitForChildExit(child, 1500)
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await waitForChildExit(child, 1000)
    try {
      rmSync(userDataDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
    } finally {
      await new Promise((resolveClose) => server.close(resolveClose))
    }
  }

  return { chrome, evaluate, waitFor, close }
}

export function musicXmlUploadExpression(xml, fileName) {
  return `(() => {
    const input = document.getElementById('musicxml-file-input');
    if (!input) return false;
    const file = new File([${JSON.stringify(xml)}], ${JSON.stringify(fileName)}, {
      type: 'application/vnd.recordare.musicxml+xml',
    });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`
}

export function pdfUploadExpression(fileName) {
  return `(() => {
    const input = document.getElementById('file-input');
    if (!input) return false;
    const file = new File(['%PDF-1.4\\n%%EOF'], ${JSON.stringify(fileName)}, {
      type: 'application/pdf',
    });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`
}
