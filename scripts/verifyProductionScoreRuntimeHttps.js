import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const origin = (process.env.SESLITAB_PRODUCTION_URL || 'https://seslitab-app.onrender.com').replace(/\/+$/, '')
const runtimeUrl = `${origin}/st-score-runtime/index.html`
const localRuntimePath = path.join(repoRoot, 'dist', 'st-score-runtime', 'index.html')
const contractVersion = '0.2.0'

if (!origin.startsWith('https://')) {
  console.error('Production score runtime diagnostic requires an HTTPS origin.')
  process.exit(1)
}
if (!existsSync(localRuntimePath)) {
  console.error(`Production score runtime diagnostic requires built runtime at ${localRuntimePath}`)
  process.exit(1)
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function fetchBytes(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
  })
  const bytes = Buffer.from(await response.arrayBuffer())
  return { response, bytes }
}

const app = await fetchBytes(`${origin}/`)
if (!app.response.ok) {
  console.error(`Production app GET failed: ${app.response.status}`)
  process.exit(1)
}

const runtime = await fetchBytes(`${runtimeUrl}?s01=${Date.now()}`)
if (!runtime.response.ok) {
  console.error(`Production runtime GET failed: ${runtime.response.status}`)
  process.exit(1)
}

const contentType = runtime.response.headers.get('content-type') || ''
if (!contentType.toLowerCase().includes('text/html')) {
  console.error(`Production runtime returned unexpected content type: ${contentType || '(missing)'}`)
  process.exit(1)
}

const localRuntimeBytes = readFileSync(localRuntimePath)
if (sha256(runtime.bytes) !== sha256(localRuntimeBytes)) {
  console.error('Production runtime index bytes do not match the exact locally built runtime for this commit.')
  console.error(`local=${sha256(localRuntimeBytes)} production=${sha256(runtime.bytes)}`)
  process.exit(1)
}

const candidates = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean)
let chrome
for (const candidate of candidates) {
  const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' })
  if (probe.status === 0) {
    chrome = candidate
    break
  }
}
if (!chrome) {
  console.error('Production score runtime diagnostic failed closed: Chrome/Chromium not found.')
  process.exit(1)
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForJson(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return response.json()
    } catch (error) {
      lastError = error
    }
    await delay(100)
  }
  throw lastError || new Error(`Timed out waiting for ${url}`)
}

function connectCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl)
    let nextId = 0
    const pending = new Map()

    socket.onopen = () => {
      resolve({
        async send(method, params = {}) {
          const id = ++nextId
          return new Promise((resolveCommand, rejectCommand) => {
            pending.set(id, { resolveCommand, rejectCommand })
            socket.send(JSON.stringify({ id, method, params }))
          })
        },
        close() { socket.close() },
      })
    }
    socket.onerror = () => reject(new Error('Chrome DevTools websocket connection failed.'))
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data))
      if (!message.id || !pending.has(message.id)) return
      const waiter = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) waiter.rejectCommand(new Error(`${message.error.code}: ${message.error.message}`))
      else waiter.resolveCommand(message.result)
    }
  })
}

const minimalMusicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Probe</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration><voice>1</voice><type>whole</type>
      </note>
    </measure>
  </part>
</score-partwise>`

async function runBrowserProbe(label, port, width, height) {
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'seslitab-s01-chrome-'))
  const chromeProcess = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`,
    `--window-size=${width},${height}`, '--no-first-run', '--no-default-browser-check',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })

  let stderr = ''
  chromeProcess.stderr.on('data', (chunk) => { stderr += String(chunk) })

  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`)
    const targets = await waitForJson(`http://127.0.0.1:${port}/json/list`)
    const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl)
    if (!page) throw new Error('Chrome page target not found.')

    const cdp = await connectCdp(page.webSocketDebuggerUrl)
    try {
      await cdp.send('Page.enable')
      await cdp.send('Runtime.enable')
      await cdp.send('Page.navigate', { url: origin })

      const loadDeadline = Date.now() + 15000
      while (Date.now() < loadDeadline) {
        const ready = await cdp.send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true })
        if (ready?.result?.value === 'complete') break
        await delay(100)
      }

      const probeExpression = `
        (async () => {
          const old = document.getElementById('s01-production-runtime-probe')
          if (old) old.remove()
          const frame = document.createElement('iframe')
          frame.id = 's01-production-runtime-probe'
          frame.src = '/st-score-runtime/index.html?s01-browser=' + Date.now()
          frame.style.position = 'absolute'
          frame.style.left = '-10000px'
          frame.style.top = '0'
          frame.style.width = '1200px'
          frame.style.height = '800px'
          document.body.appendChild(frame)

          const required = ['renderMusicXml', 'moveCursor', 'hitTestNote', 'highlight', 'clearHighlights', 'dispose']
          const deadline = Date.now() + 15000
          let host = null
          while (Date.now() < deadline) {
            try {
              host = frame.contentWindow && frame.contentWindow.__ST_SCORE_RENDER_HOST__
              if (host && required.every((name) => typeof host[name] === 'function')) break
            } catch (error) {
              return { ready: false, render: false, error: 'iframe-access:' + String(error && error.message || error) }
            }
            await new Promise((resolve) => setTimeout(resolve, 100))
          }
          if (!host || !required.every((name) => typeof host[name] === 'function')) {
            return {
              ready: false,
              render: false,
              href: (() => { try { return frame.contentWindow.location.href } catch { return null } })(),
            }
          }

          try {
            await host.renderMusicXml({
              contractVersion: ${JSON.stringify(contractVersion)},
              musicxml: ${JSON.stringify(minimalMusicXml)},
              pageMode: 'continuous',
              autoResize: true,
              drawTitle: false,
              drawComposer: false,
              ticket: '1',
            })
            await new Promise((resolve) => setTimeout(resolve, 500))
            const svgCount = frame.contentDocument ? frame.contentDocument.querySelectorAll('svg').length : 0
            const htmlLength = frame.contentDocument && frame.contentDocument.documentElement
              ? frame.contentDocument.documentElement.outerHTML.length
              : 0
            await host.dispose()
            return {
              ready: true,
              render: svgCount > 0,
              svgCount,
              htmlLength,
              href: frame.contentWindow.location.href,
            }
          } catch (error) {
            return {
              ready: true,
              render: false,
              error: String(error && error.stack || error && error.message || error),
            }
          }
        })()
      `

      const result = await cdp.send('Runtime.evaluate', {
        expression: probeExpression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      })
      const value = result?.result?.value
      if (!value?.ready || !value?.render) {
        throw new Error(`${label} failed: ${JSON.stringify(value)}`)
      }
      console.log(`${label} PASS: runtime ready, SVG render=${value.svgCount}, href=${value.href}`)
    } finally {
      cdp.close()
    }
  } catch (error) {
    console.error(`${label}: ${error.message}`)
    if (stderr.trim()) console.error(stderr.slice(-5000))
    throw error
  } finally {
    chromeProcess.kill('SIGTERM')
    await delay(250)
    rmSync(userDataDir, { recursive: true, force: true })
  }
}

await runBrowserProbe('Production Chrome desktop score runtime', 9331, 1440, 1000)
await runBrowserProbe('Production Chrome narrow score runtime', 9332, 390, 844)

console.log(`Production HTTPS score runtime proof PASS for ${origin}`)
console.log(`Runtime SHA-256: ${sha256(runtime.bytes)}`)
