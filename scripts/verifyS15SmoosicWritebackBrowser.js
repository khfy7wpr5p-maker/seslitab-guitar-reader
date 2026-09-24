import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'

const repoRoot = resolve('.')
const distRoot = resolve(repoRoot, 'dist')
const evidencePath = resolve(repoRoot, 'artifacts', 's15-smoosic-writeback.json')

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
  console.error('S15 write-back proof failed closed: Chrome/Chromium not found.')
  process.exit(1)
}
if (typeof WebSocket !== 'function') {
  console.error('S15 write-back proof failed closed: Node WebSocket client is unavailable.')
  process.exit(1)
}

for (const required of [
  resolve(distRoot, 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'build', 'mobile.js'),
]) {
  if (!existsSync(required)) {
    console.error(`S15 write-back proof failed closed: missing build artifact ${required}`)
    process.exit(1)
  }
}

const sourceXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>S15 C</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes>
      <divisions>1</divisions>
      <time><beats>4</beats><beat-type>4</beat-type></time>
      <clef><sign>G</sign><line>2</line></clef>
    </attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>
  </measure></part>
</score-partwise>`

const replacementXml = sourceXml
  .replace('<work-title>S15 C</work-title>', '<work-title>S15 G replacement</work-title>')
  .replace('<step>C</step>', '<step>G</step>')

const staleCandidateXml = sourceXml
  .replace('<work-title>S15 C</work-title>', '<work-title>S15 stale E</work-title>')
  .replace('<step>C</step>', '<step>E</step>')

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
    const description =
      result.exceptionDetails.exception?.description
      || result.exceptionDetails.text
      || 'Runtime evaluation failed.'
    throw new Error(description)
  }
  return result?.result?.value
}

async function waitFor(cdp, expression, label, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const value = await evaluate(cdp, expression)
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await delay(100)
  }
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

async function openMusicXml(cdp, xml, fileName, expectedStep) {
  await evaluate(cdp, `document.getElementById('musicxml-tab-btn').click(); true`)
  if (!await evaluate(cdp, uploadExpression(xml, fileName))) {
    throw new Error(`MusicXML input missing for ${fileName}.`)
  }
  await waitFor(
    cdp,
    `document.getElementById('musicxml-open-btn')?.disabled === false`,
    `${fileName} selection`,
  )
  await evaluate(cdp, `document.getElementById('musicxml-open-btn').click(); true`)
  await waitFor(
    cdp,
    `(() => {
      const xml = String(document.getElementById('xml-output')?.textContent || '');
      const name = String(document.getElementById('musicxml-file-name')?.textContent || '');
      return xml.includes('<step>${expectedStep}</step>') && name.includes(${JSON.stringify(fileName)});
    })()`,
    `${fileName} accepted parse`,
  )
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
if (!port) {
  server.close()
  throw new Error('S15 write-back proof could not acquire a local port.')
}

const userDataDir = mkdtempSync(join(tmpdir(), 'seslitab-s15-cdp-'))
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
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
    screenOrientation: { type: 'portraitPrimary', angle: 0 },
  })
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html` })

  await waitFor(
    cdp,
    `document.readyState === 'complete'
      && !!document.getElementById('musicxml-tab-btn')
      && !!document.getElementById('smoosic-tab-btn')`,
    'SesliTab shell',
  )

  await openMusicXml(cdp, sourceXml, 's15-writeback.musicxml', 'C')

  const beforeConsumers = await waitFor(
    cdp,
    `(() => {
      const guitarState = String(document.getElementById('tab-guitar-tab')?.getAttribute('data-guitar-tab-state') || '');
      const violinState = String(document.getElementById('tab-violin')?.getAttribute('data-violin-state') || '');
      if (!guitarState || guitarState === 'idle' || !violinState || violinState === 'idle') return null;
      return {
        guitarState,
        guitar: String(document.getElementById('guitar-tab-output')?.textContent || ''),
        violinState,
        violin: String(document.getElementById('violin-output')?.textContent || ''),
      };
    })()`,
    'initial product consumers',
  )

  await evaluate(cdp, `document.getElementById('smoosic-tab-btn').click(); true`)
  await waitFor(cdp, `!!document.getElementById('smoosic-editor-frame')`, 'Smoosic iframe')
  await waitFor(
    cdp,
    `!!document.getElementById('smoosic-editor-frame')?.contentDocument?.getElementById('poc-status')`,
    'Smoosic document',
  )
  await waitFor(
    cdp,
    `(() => {
      const text = String(document.getElementById('smoosic-editor-frame')?.contentDocument?.getElementById('poc-status')?.textContent || '');
      return text.startsWith('Yüklendi:') && text.includes('s15-writeback.musicxml');
    })()`,
    'Smoosic initial handoff',
  )

  await waitFor(
    cdp,
    `(() => {
      const frame = document.getElementById('smoosic-editor-frame');
      if (!frame || frame.hidden) return false;
      return [...(frame.contentDocument?.querySelectorAll('#smoo .vf-notehead') || [])]
        .some((head) => {
          const rect = head.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
    })()`,
    'rendered Smoosic notehead',
  )

  const pitchTriggered = await evaluate(cdp, `(() => {
    const frame = document.getElementById('smoosic-editor-frame');
    const button = frame?.contentDocument?.querySelector('button[data-key="d"]');
    if (!button) return false;
    button.click();
    return true;
  })()`)
  if (!pitchTriggered) throw new Error('Smoosic Re control could not be triggered.')

  await waitFor(
    cdp,
    `(() => {
      const frame = document.getElementById('smoosic-editor-frame');
      const button = document.getElementById('smoosic-apply-btn');
      return !!frame && !!button && frame.hidden === false;
    })()`,
    'S15 host apply control',
  )

  await evaluate(cdp, `(() => {
    window.__S15_FIRST_EXPORT__ = null;
    if (!window.__S15_EXPORT_PROBE_BOUND__) {
      window.addEventListener('message', (event) => {
        if (
          event.source === document.getElementById('smoosic-editor-frame')?.contentWindow
          && event.data?.type === 'seslitab:smoosic-export-result'
        ) {
          window.__S15_FIRST_EXPORT__ = event.data;
        }
      }, true);
      window.__S15_EXPORT_PROBE_BOUND__ = true;
    }
    return true;
  })()`)

  const applyTriggered = await evaluate(
    cdp,
    `(() => {
      const button = document.getElementById('smoosic-apply-btn');
      if (!button) return false;
      button.click();
      return true;
    })()`,
  )
  if (!applyTriggered) throw new Error('S15 host apply control could not be triggered.')

  try {
    await waitFor(
      cdp,
      `String(document.getElementById('smoosic-editor-host-status')?.textContent || '').includes('Yeni sürüm doğrulandı')`,
      'supported S15 write-back',
    )
  } catch (error) {
    const diagnostic = await evaluate(cdp, `(() => {
      const frame = document.getElementById('smoosic-editor-frame');
      const exportResult = window.__S15_FIRST_EXPORT__;
      const candidateXml = String(exportResult?.musicXml || '');
      const visibleXml = String(document.getElementById('xml-output')?.textContent || '');
      const readStep = (xml) => {
        if (!xml) return '';
        const parsed = new DOMParser().parseFromString(xml, 'text/xml');
        return String(parsed.querySelector('part > measure > note pitch > step')?.textContent || '');
      };
      return {
        hostStatus: String(document.getElementById('smoosic-editor-host-status')?.textContent || ''),
        editorStatus: String(frame?.contentDocument?.getElementById('poc-status')?.textContent || ''),
        candidateStep: readStep(candidateXml),
        candidateLength: candidateXml.length,
        candidateError: String(exportResult?.error || ''),
        visibleStep: readStep(visibleXml),
        applyDisabled: Boolean(document.getElementById('smoosic-apply-btn')?.disabled),
      };
    })()`)
    throw new Error(`${error.message} | diagnostic=${JSON.stringify(diagnostic)}`)
  }
  try {
    await waitFor(
      cdp,
      `(() => {
        const xml = String(document.getElementById('xml-output')?.textContent || '');
        return xml.includes('<step>D</step>') && !xml.includes('<step>C</step>');
      })()`,
      'published D revision',
      15000,
    )
  } catch (error) {
    const diagnostic = await evaluate(cdp, `(() => {
      const exportResult = window.__S15_FIRST_EXPORT__;
      const candidateXml = String(exportResult?.musicXml || '');
      const visibleXml = String(document.getElementById('xml-output')?.textContent || '');
      const readStep = (xml) => {
        if (!xml) return '';
        const parsed = new DOMParser().parseFromString(xml, 'text/xml');
        return String(parsed.querySelector('part > measure > note pitch > step')?.textContent || '');
      };
      const frame = document.getElementById('smoosic-editor-frame');
      return {
        hostStatus: String(document.getElementById('smoosic-editor-host-status')?.textContent || ''),
        editorStatus: String(frame?.contentDocument?.getElementById('poc-status')?.textContent || ''),
        candidateStep: readStep(candidateXml),
        candidateLength: candidateXml.length,
        candidateError: String(exportResult?.error || ''),
        visibleStep: readStep(visibleXml),
        visibleLength: visibleXml.length,
      };
    })()`)
    throw new Error(`${error.message} | diagnostic=${JSON.stringify(diagnostic)}`)
  }

  try {
    await waitFor(
      cdp,
      `(() => {
        const guitarState = String(document.getElementById('tab-guitar-tab')?.getAttribute('data-guitar-tab-state') || '');
        const violinState = String(document.getElementById('tab-violin')?.getAttribute('data-violin-state') || '');
        if (!guitarState || guitarState === 'idle' || !violinState || violinState === 'idle') return null;
        const result = {
          guitarState,
          guitar: String(document.getElementById('guitar-tab-output')?.textContent || ''),
          violinState,
          violin: String(document.getElementById('violin-output')?.textContent || ''),
        };
        const before = ${JSON.stringify(beforeConsumers)};
        return result.guitarState !== before.guitarState || result.guitar !== before.guitar
          || result.violinState !== before.violinState || result.violin !== before.violin
          ? result : null;
      })()`,
      'refreshed product consumers',
      10000,
    )
  } catch (error) {
    const current = await evaluate(cdp, `(() => ({
      guitarState: String(document.getElementById('tab-guitar-tab')?.getAttribute('data-guitar-tab-state') || ''),
      guitar: String(document.getElementById('guitar-tab-output')?.textContent || ''),
      violinState: String(document.getElementById('tab-violin')?.getAttribute('data-violin-state') || ''),
      violin: String(document.getElementById('violin-output')?.textContent || ''),
      summary: String(document.getElementById('notes-summary')?.textContent || ''),
    }))()`)
    throw new Error(`${error.message} | before=${JSON.stringify(beforeConsumers)} | after=${JSON.stringify(current)}`)
  }

  const editorUsable = await evaluate(
    cdp,
    `(() => {
      const frame = document.getElementById('smoosic-editor-frame');
      return !!frame && frame.isConnected && frame.hidden === false
        && !!frame.contentDocument?.querySelector('button[data-key="d"]');
    })()`,
  )
  if (!editorUsable) throw new Error('Smoosic editor did not remain usable after write-back.')

  const pending = await evaluate(cdp, `(() => {
    const frame = document.getElementById('smoosic-editor-frame');
    const editorWin = frame.contentWindow;
    const original = editorWin.postMessage.bind(editorWin);
    window.__S15_ORIGINAL_POSTMESSAGE__ = original;
    window.__S15_PENDING_REQUEST__ = null;
    editorWin.postMessage = function(message, targetOrigin, transfer) {
      if (message?.type === 'seslitab:smoosic-export-request') {
        window.__S15_PENDING_REQUEST__ = {
          requestId: message.requestId,
          sourceRevision: message.sourceRevision,
        };
        return;
      }
      return original(message, targetOrigin, transfer);
    };
    document.getElementById('smoosic-apply-btn').click();
    return true;
  })()`)
  if (!pending) throw new Error('Could not arm stale-writeback request capture.')

  const pendingRequest = await waitFor(
    cdp,
    `window.__S15_PENDING_REQUEST__ || null`,
    'captured in-flight S15 request',
  )

  await openMusicXml(cdp, replacementXml, 's15-replacement.musicxml', 'G')
  await waitFor(
    cdp,
    `(() => {
      const frame = document.getElementById('smoosic-editor-frame');
      const text = String(frame?.contentDocument?.getElementById('poc-status')?.textContent || '');
      return frame?.hidden === false && text.startsWith('Yüklendi:') && text.includes('s15-replacement.musicxml');
    })()`,
    'replacement Smoosic handoff',
  )

  await evaluate(cdp, `(() => {
    const frame = document.getElementById('smoosic-editor-frame');
    const payload = ${JSON.stringify({
      type: 'seslitab:smoosic-export-result',
      version: 1,
      requestId: '__REQUEST_ID__',
      sourceRevision: -1,
      fileName: 's15-stale.musicxml',
      musicXml: staleCandidateXml,
      roundTripOk: true,
      shapeOk: true,
      semanticOk: true,
    })};
    payload.requestId = ${JSON.stringify(pendingRequest.requestId)};
    payload.sourceRevision = ${Number(pendingRequest.sourceRevision)};
    const script = frame.contentDocument.createElement('script');
    script.textContent = 'parent.postMessage(' + JSON.stringify(payload).replace(/</g, '\\u003c') + ', location.origin);';
    frame.contentDocument.body.appendChild(script);
    script.remove();
    return true;
  })()`)

  await delay(800)
  const finalState = await evaluate(cdp, `(() => {
    const xml = String(document.getElementById('xml-output')?.textContent || '');
    const frame = document.getElementById('smoosic-editor-frame');
    if (window.__S15_ORIGINAL_POSTMESSAGE__) {
      frame.contentWindow.postMessage = window.__S15_ORIGINAL_POSTMESSAGE__;
      delete window.__S15_ORIGINAL_POSTMESSAGE__;
    }
    delete window.__S15_PENDING_REQUEST__;
    return {
      hasG: xml.includes('<step>G</step>'),
      hasE: xml.includes('<step>E</step>'),
    };
  })()`)

  if (!finalState?.hasG || finalState?.hasE) {
    throw new Error('Stale Smoosic write-back overwrote the accepted replacement source.')
  }

  mkdirSync(resolve(repoRoot, 'artifacts'), { recursive: true })
  writeFileSync(evidencePath, JSON.stringify({
    documentType: 'S15SmoosicWritebackEvidence',
    evidenceClass: 'CHROMIUM_REAL_BROWSER_PRODUCTION_BUNDLE',
    supportedEditCommitted: true,
    freshProductPublished: true,
    staleWritebackRejected: true,
    editorRemainedUsable: true,
    physicalIphoneSafariVerified: false,
  }, null, 2) + '\n')

  console.log(
    `S15 Smoosic write-back browser proof PASS using ${chrome}: rendered note + toolbar C→D edit committed, consumers refreshed, stale response rejected, editor remained usable.`,
  )
} catch (error) {
  console.error(`S15 write-back browser proof failed closed: ${error?.message ?? error}`)
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
    console.error(`S15 CDP cleanup failed: ${error?.message ?? error}`)
    process.exitCode = 1
  }
  await new Promise((resolveClose) => server.close(resolveClose))
}
