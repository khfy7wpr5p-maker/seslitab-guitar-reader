import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, relative, extname, sep } from 'node:path'
import { createServer } from 'node:http'
import { StringDecoder } from 'node:string_decoder'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Chrome's supported pipe transport uses fd 3/4 and NUL-delimited JSON. It
// requires no HTTP discovery listener, published port file or WebSocket target.
export function createBrowserPipeConnection(child, { deadline } = {}) {
  const writer = child.stdio[3]
  const reader = child.stdio[4]
  const decoder = new StringDecoder('utf8')
  const pending = new Map()
  let nextId = 1
  let buffered = ''
  let closed = false

  function close(error = new Error('CDP pipe closed.')) {
    if (closed) return
    closed = true
    for (const entry of pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(error)
    }
    pending.clear()
    reader.removeListener('data', receive)
    child.removeListener('exit', exited)
    child.removeListener('error', failed)
    writer.destroy()
    reader.destroy()
  }

  function failed(error) { close(new Error('CDP pipe transport failed.', { cause: error })) }
  function exited(code, signal) { close(new Error(`Chromium exited before proof completion (code=${code}, signal=${signal}).`)) }
  function receive(chunk) {
    buffered += decoder.write(chunk)
    let end
    while ((end = buffered.indexOf('\0')) !== -1) {
      const frame = buffered.slice(0, end)
      buffered = buffered.slice(end + 1)
      let message
      try {
        message = JSON.parse(frame)
        if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('Invalid CDP message')
      } catch (cause) {
        close(new Error('Malformed CDP pipe response.', { cause }))
        return
      }
      const entry = pending.get(message.id)
      if (!entry) continue // Events and replies to retired commands carry no authority.
      pending.delete(message.id)
      clearTimeout(entry.timer)
      if (message.error) entry.reject(new Error(`CDP command ${entry.method} failed (${message.error.code}).`))
      else entry.resolve(message.result ?? {})
    }
  }

  reader.on('data', receive)
  reader.on('end', () => close(new Error('CDP pipe ended before proof completion.')))
  reader.on('close', () => close())
  reader.on('error', failed)
  writer.on('error', failed)
  child.once('exit', exited)
  child.once('error', failed)

  return {
    send(method, params = {}, sessionId) {
      if (closed) return Promise.reject(new Error('CDP pipe is closed.'))
      if (!Number.isFinite(deadline) || Date.now() >= deadline) {
        return Promise.reject(new Error(`CDP command ${method} exceeded the proof deadline.`))
      }
      const id = nextId++
      return new Promise((resolveCommand, rejectCommand) => {
        const timer = setTimeout(() => {
          close(new Error(`CDP command ${method} timed out before the proof deadline.`))
        }, Math.max(1, deadline - Date.now()))
        pending.set(id, { method, resolve: resolveCommand, reject: rejectCommand, timer })
        try {
          writer.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0', (error) => {
            if (error) failed(error)
          })
        } catch (error) { failed(error) }
      })
    },
    close,
  }
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
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }
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
    '--allow-file-access-from-files', '--remote-debugging-pipe',
    `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000) })
  let cdp
  let pageSession
  let phase = 'browser startup'
  const deadline = Date.now() + 20000
  const timeout = setTimeout(() => child.kill('SIGKILL'), 22000)
  try {
    cdp = createBrowserPipeConnection(child, { deadline })
    await cdp.send('Browser.getVersion')
    phase = 'page target creation'
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
    pageSession = sessionId
    phase = 'fixture navigation'
    await cdp.send('Page.enable', {}, pageSession)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: false,
    }, pageSession)
    await cdp.send('Page.navigate', { url }, pageSession)
    phase = 'fixture proof'
    while (Date.now() < deadline) {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const proof = document.querySelector('#proof');
          return { done: proof && /^(PASS|FAIL)$/.test(proof.textContent.trim()),
            html: document.documentElement?.outerHTML ?? '' };
        })()`, returnByValue: true,
      }, pageSession)
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
      if (result.result?.value?.done) return result.result.value.html
      await delay(25)
    }
    throw new Error(`Browser fixture did not complete: ${fixturePath}`)
  } catch (cause) {
    throw new Error(`Browser fixture failed during ${phase}: ${cause.message}; Chromium stderr: ${stderr.slice(-1000)}`, { cause })
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
