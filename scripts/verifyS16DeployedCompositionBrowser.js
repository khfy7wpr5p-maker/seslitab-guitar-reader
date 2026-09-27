import { spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  normalizeS16ProductionTarget,
  verifyS16DeployedManifest,
  verifyS16MountedSurfaceSnapshot,
} from './s16DeployedCompositionContract.js'
import { createS16ReadOnlyRequestGuard } from './s16ReadOnlyRequestGuard.js'

const evidencePath = resolve('artifacts', 's16-deployed-composition.json')
const SHA_PATTERN = /^[a-f0-9]{40}$/u
const candidates = [
  process.env.CHROME_BIN,
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
].filter(Boolean)

const fixtureXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>S16 Production Composition Probe</work-title></work>
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes>
      <divisions>1</divisions>
      <time><beats>4</beats><beat-type>4</beat-type></time>
      <clef><sign>G</sign><line>2</line></clef>
    </attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>
  </measure></part>
</score-partwise>`

function requiredEnvironment(name) {
  const value = String(process.env[name] ?? '').trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function resolveExpectedRevision() {
  const revision = requiredEnvironment('SESLITAB_EXPECTED_REVISION').toLowerCase()
  if (!SHA_PATTERN.test(revision)) {
    throw new Error('SESLITAB_EXPECTED_REVISION must be a 40-character hexadecimal Git revision.')
  }
  return revision
}

function resolveChrome() {
  for (const candidate of candidates) {
    if (spawnSync(candidate, ['--version'], { encoding: 'utf8' }).status === 0) return candidate
  }
  throw new Error('Chrome/Chromium is required for the S16 deployed composition probe.')
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
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
      const [portText] = readFileSync(portFile, 'utf8').trim().split(/\r?\n/u)
      const port = Number(portText)
      if (Number.isInteger(port) && port > 0) return port
    }
    await delay(50)
  }
  throw new Error('Chrome DevTools port did not become ready.')
}

async function findPageTarget(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, { method: 'GET' })
  if (!response.ok) throw new Error(`Chrome DevTools target discovery failed (${response.status}).`)
  const targets = await response.json()
  const target = Array.isArray(targets)
    ? targets.find((candidate) => candidate?.type === 'page')
    : null
  if (typeof target?.webSocketDebuggerUrl !== 'string' || !target.webSocketDebuggerUrl) {
    throw new Error('Chrome DevTools did not expose a page WebSocket URL.')
  }
  return target.webSocketDebuggerUrl
}

function connectCdp(webSocketUrl) {
  return new Promise((resolveConnection, rejectConnection) => {
    const socket = new WebSocket(webSocketUrl)
    const pending = new Map()
    const listeners = new Map()
    let nextId = 1
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
        on(method, listener) {
          listeners.set(method, [...(listeners.get(method) ?? []), listener])
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
      for (const listener of listeners.get(message.method) ?? []) {
        listener(message.params ?? {})
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

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result?.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description
      || result.exceptionDetails.text
      || 'Runtime evaluation failed.'
    throw new Error(description)
  }
  return result?.result?.value
}

async function waitFor(cdp, expression, label, timeoutMs = 120000, assertSafe = null) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    assertSafe?.()
    try {
      const value = await evaluate(cdp, expression)
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await delay(100)
  }
  assertSafe?.()
  throw new Error(`${label} timed out${lastError ? `: ${lastError.message}` : ''}`)
}

function uploadExpression(xml, fileName) {
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

function textFromRemoteObject(value) {
  if (typeof value?.value === 'string') return value.value
  if (typeof value?.description === 'string') return value.description
  return String(value?.value ?? value?.description ?? '')
}

async function fetchManifest(target, expectedRevision) {
  const manifestUrl = new URL('seslitab-build.json', target)
  const response = await fetch(manifestUrl, {
    method: 'GET',
    redirect: 'follow',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'cache-control': 'no-cache',
    },
  })
  const body = await response.text()
  return verifyS16DeployedManifest({
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    finalUrl: response.url,
    body,
  }, { expectedRevision })
}

export async function runBrowserProbe({ chrome, target }) {
  const userDataDir = mkdtempSync(join(tmpdir(), 'seslitab-s16-production-'))
  const child = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-extensions',
    '--no-first-run',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: 'ignore' })

  let cdp = null
  try {
    const debugPort = await waitForDevToolsPort(userDataDir, child)
    cdp = await connectCdp(await findPageTarget(debugPort))
    const pageErrors = []
    const consoleErrors = []

    cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
      pageErrors.push(
        exceptionDetails?.exception?.description
        || exceptionDetails?.text
        || 'Unhandled page exception',
      )
    })
    cdp.on('Runtime.consoleAPICalled', ({ type, args }) => {
      if (type === 'error') consoleErrors.push((args ?? []).map(textFromRemoteObject).join(' '))
    })
    cdp.on('Log.entryAdded', ({ entry }) => {
      if (entry?.level === 'error') consoleErrors.push(String(entry.text ?? 'Browser log error'))
    })
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Network.enable')
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    await cdp.send('Log.enable')
    const requestGuard = createS16ReadOnlyRequestGuard(cdp)
    await requestGuard.enable()
    const waitForSafe = (expression, label, timeoutMs) => waitFor(
      cdp,
      expression,
      label,
      timeoutMs,
      requestGuard.assertSafe,
    )
    await cdp.send('Page.navigate', { url: target.href })

    await waitForSafe(
      `document.readyState === 'complete'
        && !!document.getElementById('discovery-search-form')
        && !!document.getElementById('musicxml-tab-btn')
        && !!document.getElementById('smoosic-tab-btn')
        && !!document.getElementById('chromatic-tuner-section')`,
      'SesliTab production shell',
    )

    await evaluate(cdp, `document.getElementById('musicxml-tab-btn').click(); true`)
    if (!await evaluate(cdp, uploadExpression(fixtureXml, 's16-production-composition.musicxml'))) {
      throw new Error('S16 production MusicXML input is missing.')
    }
    await waitForSafe(
      `document.getElementById('musicxml-open-btn')?.disabled === false`,
      'S16 production MusicXML selection',
    )
    await evaluate(cdp, `document.getElementById('musicxml-open-btn').click(); true`)
    await waitForSafe(
      `String(document.getElementById('xml-output')?.textContent || '').includes('<step>C</step>')
        && String(document.getElementById('musicxml-file-name')?.textContent || '').includes('s16-production-composition.musicxml')`,
      'S16 production MusicXML acceptance',
    )
    await waitForSafe(
      `(() => {
        const panel = document.getElementById('tab-guitar-tab');
        const state = String(panel?.getAttribute('data-guitar-tab-state') || '');
        return !!panel && state !== '' && state !== 'idle';
      })()`,
      'S16 production Guitar TAB consumer',
    )

    await evaluate(cdp, `document.getElementById('smoosic-tab-btn').click(); true`)
    await waitForSafe(
      `!!document.getElementById('smoosic-apply-btn')
        && !!document.getElementById('smoosic-editor-frame')`,
      'S16 production Smoosic host controls',
    )
    await waitForSafe(
      `(() => {
        const status = document.getElementById('smoosic-editor-frame')?.contentDocument?.getElementById('poc-status');
        const text = String(status?.textContent || '');
        if (text.startsWith('Başlatma hatası:') || text.startsWith('Hata:') || text.startsWith('XML hatası:')) {
          throw new Error(text);
        }
        return text.startsWith('Yüklendi:') && text.includes('s16-production-composition.musicxml');
      })()`,
      'S16 production Smoosic handoff',
    )

    await requestGuard.settle()
    const rawSnapshot = await evaluate(cdp, `(() => {
      const guitarPanel = document.getElementById('tab-guitar-tab');
      const guitarState = String(guitarPanel?.getAttribute('data-guitar-tab-state') || '');
      return {
        finalUrl: window.location.href,
        readyState: document.readyState,
        musicXmlAccepted: String(document.getElementById('xml-output')?.textContent || '').includes('<step>C</step>'),
        surfaces: {
          discoverySearch: !!document.getElementById('discovery-search-form'),
          smoosicTab: !!document.getElementById('smoosic-tab-btn'),
          smoosicApply: !!document.getElementById('smoosic-apply-btn'),
          tuner: !!document.getElementById('chromatic-tuner-section'),
          guitarTab: !!guitarPanel && guitarState !== '' && guitarState !== 'idle',
        },
      };
    })()`)
    return verifyS16MountedSurfaceSnapshot({
      ...rawSnapshot,
      pageErrors,
      consoleErrors,
    })
  } finally {
    try {
      cdp?.close()
    } catch {
      // Best-effort local browser cleanup only.
    }
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    await waitForChildExit(child)
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await waitForChildExit(child)
    rmSync(userDataDir, { recursive: true, force: true })
  }
}

async function main() {
  rmSync(evidencePath, { force: true })
  const targetValue = requiredEnvironment('SESLITAB_PRODUCTION_URL')
  const expectedRevision = resolveExpectedRevision()
  const target = normalizeS16ProductionTarget(targetValue)
  const manifest = await fetchManifest(target, expectedRevision)
  const chrome = resolveChrome()
  const snapshot = await runBrowserProbe({ chrome, target })
  const evidence = Object.freeze({
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    targetUrl: target.href,
    expectedRevision,
    manifest,
    snapshot,
    result: 'PASS',
  })

  mkdirSync(resolve('artifacts'), { recursive: true })
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  console.log(`S16 deployed composition probe PASS: ${target.href} ${expectedRevision}`)
  console.log(`Evidence: ${evidencePath}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await main()
  } catch (error) {
    console.error(`S16 deployed composition probe failed closed: ${error?.message ?? error}`)
    process.exitCode = 1
  }
}
