import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const origin = (process.env.SESLITAB_PRODUCTION_URL || 'https://seslitab-app.onrender.com').replace(/\/+$/, '')
const gesiMusicXml = readFileSync(path.join(repoRoot, 'tests', 'fixtures', 'real-omr', 'gesi-clean.xml'), 'utf8')
const candidates = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean)
let chrome
for (const candidate of candidates) {
  const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' })
  if (probe.status === 0) { chrome = candidate; break }
}
if (!chrome) throw new Error('Chrome/Chromium not found.')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForJson(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return response.json()
    } catch (error) { lastError = error }
    await delay(100)
  }
  throw lastError || new Error(`Timed out waiting for ${url}`)
}

function connectCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl)
    let nextId = 0
    const pending = new Map()
    socket.onopen = () => resolve({
      send(method, params = {}) {
        const id = ++nextId
        return new Promise((resolveCommand, rejectCommand) => {
          pending.set(id, { resolveCommand, rejectCommand })
          socket.send(JSON.stringify({ id, method, params }))
        })
      },
      close() { socket.close() },
    })
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

async function probe(label, port, width, height) {
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'seslitab-s01-gesi-'))
  const process = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`,
    `--window-size=${width},${height}`, '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  process.stderr.on('data', (chunk) => { stderr += String(chunk) })

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
        const state = await cdp.send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true })
        if (state?.result?.value === 'complete') break
        await delay(100)
      }

      const expression = `
        (async () => {
          const frame = document.createElement('iframe')
          frame.src = '/st-score-runtime/index.html?s01-gesi=' + Date.now()
          frame.style.position = 'absolute'
          frame.style.left = '-10000px'
          frame.style.width = '1200px'
          frame.style.height = '1000px'
          document.body.appendChild(frame)
          const required = ['renderMusicXml','moveCursor','hitTestNote','highlight','clearHighlights','dispose']
          const deadline = Date.now() + 15000
          let host
          while (Date.now() < deadline) {
            try {
              host = frame.contentWindow && frame.contentWindow.__ST_SCORE_RENDER_HOST__
              if (host && required.every((name) => typeof host[name] === 'function')) break
            } catch (error) {
              return { ready: false, rendered: false, error: 'iframe-access:' + String(error && error.message || error) }
            }
            await new Promise((resolve) => setTimeout(resolve, 100))
          }
          if (!host || !required.every((name) => typeof host[name] === 'function')) {
            return { ready: false, rendered: false }
          }
          try {
            await host.renderMusicXml({
              contractVersion: '0.2.0',
              musicxml: ${JSON.stringify(gesiMusicXml)},
              pageMode: 'continuous',
              autoResize: true,
              drawTitle: true,
              drawComposer: true,
              ticket: '1',
            })
            await new Promise((resolve) => setTimeout(resolve, 800))
            const svgCount = frame.contentDocument ? frame.contentDocument.querySelectorAll('svg').length : 0
            const noteLikeCount = frame.contentDocument
              ? frame.contentDocument.querySelectorAll('[class*="note"], [id*="note"]').length
              : 0
            await host.dispose()
            return { ready: true, rendered: svgCount > 0, svgCount, noteLikeCount, href: frame.contentWindow.location.href }
          } catch (error) {
            return { ready: true, rendered: false, error: String(error && error.stack || error && error.message || error) }
          }
        })()
      `
      const result = await cdp.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      })
      const value = result?.result?.value
      if (!value?.ready || !value?.rendered) throw new Error(`${label} failed: ${JSON.stringify(value)}`)
      console.log(`${label} PASS: Gesi SVG=${value.svgCount}, href=${value.href}`)
    } finally { cdp.close() }
  } catch (error) {
    console.error(error.message)
    if (stderr.trim()) console.error(stderr.slice(-4000))
    throw error
  } finally {
    process.kill('SIGTERM')
    await delay(250)
    rmSync(userDataDir, { recursive: true, force: true })
  }
}

await probe('Production Chrome desktop Gesi score runtime', 9341, 1440, 1000)
await probe('Production Chrome narrow Gesi score runtime', 9342, 390, 844)
console.log(`Production HTTPS Gesi score runtime proof PASS for ${origin}`)
