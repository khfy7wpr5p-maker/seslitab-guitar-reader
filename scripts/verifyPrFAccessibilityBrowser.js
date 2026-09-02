import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const fixturePath = path.join(repoRoot, 'tests', 'fixtures', 'pr-f-accessibility-browser-proof.html')
const fixtureUrl = pathToFileURL(fixturePath).href
const candidates = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean)

let chrome = null
for (const candidate of candidates) {
  if (spawnSync(candidate, ['--version'], { encoding: 'utf8' }).status === 0) {
    chrome = candidate
    break
  }
}
if (!chrome) {
  console.error('PR-F browser proof failed closed: Chrome/Chromium not found.')
  process.exit(1)
}
if (typeof WebSocket !== 'function') {
  console.error('PR-F browser proof failed closed: Node WebSocket client is unavailable.')
  process.exit(1)
}

const cases = [
  { width: 320, height: 568, viewport: 'narrow', mobile: true },
  { width: 568, height: 320, viewport: 'landscape', mobile: true },
  { width: 1280, height: 900, viewport: 'desktop', mobile: false },
]

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForDevToolsPort(userDataDir, child) {
  const portFile = path.join(userDataDir, 'DevToolsActivePort')
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
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl)
    let nextId = 1
    const pending = new Map()
    let settled = false

    const rejectAll = (error) => {
      for (const { reject: rejectPending } of pending.values()) rejectPending(error)
      pending.clear()
    }

    socket.addEventListener('open', () => {
      settled = true
      resolve({
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
      if (!settled) reject(error)
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

async function readProofState(cdp) {
  const evaluation = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const node = document.getElementById('status')
      if (!node) return null
      return {
        status: node.textContent,
        error: node.getAttribute('data-prf-error'),
        pass44: node.getAttribute('data-prf-44px-pass'),
        focus: node.getAttribute('data-prf-focus-pass'),
        disabledReason: node.getAttribute('data-prf-disabled-reason-pass'),
        viewportPass: node.getAttribute('data-prf-viewport-pass'),
        stress: node.getAttribute('data-prf-stress-loop-pass'),
        exactSelection: node.getAttribute('data-prf-exact-selection-loop-pass'),
        viewport: node.getAttribute('data-prf-viewport'),
        innerWidth,
        innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
      }
    })()`,
    returnByValue: true,
  })
  return evaluation?.result?.value ?? null
}

async function runCase(testCase) {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'seslitab-prf-cdp-'))
  const child = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--allow-file-access-from-files',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], {
    cwd: repoRoot,
    stdio: 'ignore',
  })

  let cdp = null
  try {
    const port = await waitForDevToolsPort(userDataDir, child)
    const targetUrl = await createPageTarget(port)
    cdp = await connectCdp(targetUrl)
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: testCase.width,
      height: testCase.height,
      deviceScaleFactor: 1,
      mobile: testCase.mobile,
      screenWidth: testCase.width,
      screenHeight: testCase.height,
      screenOrientation: testCase.width > testCase.height
        ? { type: 'landscapePrimary', angle: 90 }
        : { type: 'portraitPrimary', angle: 0 },
    })
    await cdp.send('Page.navigate', { url: fixtureUrl })

    const deadline = Date.now() + 30000
    let state = null
    while (Date.now() < deadline) {
      state = await readProofState(cdp)
      if (state?.status === 'PASS' || state?.status === 'FAIL') break
      await delay(100)
    }
    if (!state) throw new Error(`${testCase.viewport}: proof state never became available.`)
    if (state.status !== 'PASS') throw new Error(`${testCase.viewport}: ${state.error || `proof did not complete (${state.status})`}`)

    const required = {
      pass44: 'true',
      focus: 'true',
      disabledReason: 'true',
      viewportPass: 'true',
      stress: 'true',
      exactSelection: 'true',
    }
    for (const [key, expected] of Object.entries(required)) {
      if (state[key] !== expected) throw new Error(`${testCase.viewport}: ${key}=${String(state[key])}, expected ${expected}.`)
    }
    if (state.viewport !== testCase.viewport) {
      throw new Error(`${testCase.viewport}: page classified actual viewport as ${String(state.viewport)}.`)
    }
    if (state.innerWidth !== testCase.width || state.innerHeight !== testCase.height) {
      throw new Error(`${testCase.viewport}: CDP viewport mismatch ${state.innerWidth}x${state.innerHeight}, expected ${testCase.width}x${testCase.height}.`)
    }
    if (state.scrollWidth > testCase.width + 1) {
      throw new Error(`${testCase.viewport}: horizontal overflow ${state.scrollWidth}/${testCase.width}.`)
    }
  } finally {
    try { cdp?.close() } catch {}
    if (child.exitCode === null) child.kill('SIGKILL')
    rmSync(userDataDir, { recursive: true, force: true })
  }
}

try {
  for (const testCase of cases) await runCase(testCase)
  console.log(`PR-F supporting Chrome accessibility + repeated edit/rerender/undo proof PASS using ${chrome} at exact CDP viewports 320x568, 568x320, and 1280x900`)
} catch (error) {
  console.error(`PR-F browser proof failed closed: ${error?.message ?? error}`)
  process.exit(1)
}
