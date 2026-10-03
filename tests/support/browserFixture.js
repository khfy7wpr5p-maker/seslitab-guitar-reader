import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, relative, extname, sep } from 'node:path'
import { createServer } from 'node:http'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
function connectCdp(webSocketUrl) {
  return new Promise((resolveConnection, rejectConnection) => {
    const socket = new WebSocket(webSocketUrl)
    const pending = new Map()
    let nextId = 1
    let settled = false
    const connectionTimeout = setTimeout(() => {
      socket.close()
      rejectConnection(new Error('Chrome DevTools connection timed out.'))
    }, 5000)

    const rejectAll = (error) => {
      for (const { reject } of pending.values()) reject(error)
      pending.clear()
    }

    socket.addEventListener('open', () => {
      settled = true
      clearTimeout(connectionTimeout)
      resolveConnection({
        send(method, params = {}) {
          const id = nextId++
          return new Promise((resolveCommand, rejectCommand) => {
            pending.set(id, { resolve: resolveCommand, reject: rejectCommand })
            socket.send(JSON.stringify({ id, method, params }))
          })
        },
        close() {
          rejectAll(new Error('Chrome DevTools connection closed.'))
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
      if (message.id && pending.has(message.id)) {
        const handler = pending.get(message.id)
        pending.delete(message.id)
        if (message.error) {
          handler.reject(new Error(`${message.error.message ?? 'CDP command failed'} (${message.error.code ?? 'unknown'})`))
        } else {
          handler.resolve(message.result ?? {})
        }
        return
      }
    })

    socket.addEventListener('error', () => {
      const error = new Error('Chrome DevTools WebSocket failed.')
      rejectAll(error)
      clearTimeout(connectionTimeout)
      if (!settled) rejectConnection(error)
    })
    socket.addEventListener('close', () => {
      clearTimeout(connectionTimeout)
      const error = new Error('Chrome DevTools WebSocket closed.')
      rejectAll(error)
      if (!settled) rejectConnection(error)
    })
  })
}

// Use an isolated profile and observe the fixture's actual completion, rather
// than Chromium's platform-dependent --dump-dom/virtual-time shutdown path.
export async function runBrowserFixture(chrome, fixturePath, viewport) {
  const root = resolve('.')
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    const target = resolve(root, '.' + pathname)
    if (!target.startsWith(root + sep)) { response.writeHead(403).end(); return }
    try {
      const bytes = readFileSync(target)
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }
      response.writeHead(200, { 'content-type': mime[extname(target)] ?? 'application/octet-stream' }).end(bytes)
    } catch { response.writeHead(404).end() }
  })
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const url = `http://127.0.0.1:${server.address().port}/${relative(root, fixturePath).split(sep).join('/')}`
  const profile = mkdtempSync(join(tmpdir(), 'seslitab-fixture-'))
  const [width, height] = viewport.split(',').map(Number)
  const child = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--allow-file-access-from-files', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000) })
  let launchError = null
  child.on('error', (error) => { launchError = error })
  let cdp
  const deadline = Date.now() + 20000
  const timeout = setTimeout(() => child.kill('SIGKILL'), 22000)
  try {
    const portFile = join(profile, 'DevToolsActivePort')
    while (!existsSync(portFile)) {
      if (launchError) throw launchError
      if (child.exitCode !== null || Date.now() > deadline) throw new Error(`Chromium startup failed: ${stderr}`)
      await delay(25)
    }
    const port = Number(readFileSync(portFile, 'utf8').split('\n')[0])
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error(`CDP discovery: HTTP ${response.status}`)
    const target = (await response.json()).find((item) => item.type === 'page')
    cdp = await connectCdp(target.webSocketDebuggerUrl)
    await cdp.send('Page.enable')
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: false,
    })
    await cdp.send('Page.navigate', { url: url })
    while (Date.now() < deadline) {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const proof = document.querySelector('#proof');
          return { done: proof && /^(PASS|FAIL)$/.test(proof.textContent.trim()),
            html: document.documentElement?.outerHTML ?? '' };
        })()`, returnByValue: true,
      })
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
      if (result.result?.value?.done) return result.result.value.html
      await delay(25)
    }
    throw new Error(`Browser fixture did not complete: ${fixturePath}`)
  } finally {
    clearTimeout(timeout)
    cdp?.close()
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve))
      child.kill('SIGKILL')
      await exited
    }
    await new Promise((resolveClose) => server.close(resolveClose))
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}
