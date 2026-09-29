import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'

const repoRoot = resolve('.')
const distRoot = resolve(repoRoot, 'dist')
const fixturePath = resolve(repoRoot, 'tests', 'fixtures', 'ce-bridge-structural-browser-proof.html')

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
  console.error('CE-BRIDGE structural proof failed closed: Chrome/Chromium not found.')
  process.exit(1)
}
if (typeof WebSocket !== 'function') {
  console.error('CE-BRIDGE structural proof failed closed: Node WebSocket client is unavailable.')
  process.exit(1)
}
for (const required of [
  resolve(distRoot, 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'build', 'mobile.js'),
  resolve(distRoot, 'st-omr-correction-engine-runtime', 'ce-struct-browser-runtime.js'),
  fixturePath,
]) {
  if (!existsSync(required)) {
    console.error(`CE-BRIDGE structural proof failed closed: missing artifact ${required}`)
    process.exit(1)
  }
}

const sourceXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>CE Bridge Duration</work-title></work>
  <part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes>
      <divisions>1</divisions>
      <time><beats>4</beats><beat-type>4</beat-type></time>
      <clef><sign>G</sign><line>2</line></clef>
    </attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff><type>quarter</type></note>
    <forward><duration>1</duration><voice>1</voice></forward>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff><type>half</type></note>
  </measure></part>
</score-partwise>`

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

function musicXmlCounts(xml) {
  return Object.freeze({
    total: (String(xml).match(/<note\b/g) ?? []).length,
    pitched: (String(xml).match(/<pitch\b/g) ?? []).length,
    rests: (String(xml).match(/<rest\b/g) ?? []).length,
    forwards: (String(xml).match(/<forward\b/g) ?? []).length,
  })
}

function requireEvidence(condition, message) {
  if (!condition) throw new Error(`gesi-clean evidence mismatch: ${message}`)
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



function firstNoteDuration(xml) {
  const match = String(xml).match(/<note\b[^>]*>[\s\S]*?<duration\b[^>]*>([^<]+)<\/duration>/i)
  return match ? Number(String(match[1]).trim()) : null
}

async function waitForAppShell(cdp) {
  await waitFor(
    cdp,
    `document.readyState === 'complete'
      && !!document.getElementById('musicxml-tab-btn')
      && !!document.getElementById('smoosic-tab-btn')`,
    'SesliTab shell',
  )
}

async function openEditorOnSource(cdp, origin) {
  await cdp.send('Page.navigate', { url: `${origin}/index.html` })
  await waitForAppShell(cdp)
  await openMusicXml(cdp, sourceXml, 'ce-bridge-duration.musicxml', 'C')
  await evaluate(cdp, `document.getElementById('smoosic-tab-btn').click(); true`)
  await waitFor(cdp, `!!document.getElementById('smoosic-editor-frame')`, 'Smoosic iframe')
  await waitFor(
    cdp,
    `(() => {
      const frame = document.getElementById('smoosic-editor-frame');
      const text = String(frame?.contentDocument?.getElementById('poc-status')?.textContent || '');
      return text.startsWith('Yüklendi:') && text.includes('ce-bridge-duration.musicxml');
    })()`,
    'Smoosic source handoff',
  )
  await waitFor(
    cdp,
    `(() => {
      const frame = document.getElementById('smoosic-editor-frame');
      return [...(frame?.contentDocument?.querySelectorAll('#smoo .vf-notehead') || [])]
        .some((head) => {
          const rect = head.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
    })()`,
    'Smoosic rendered note',
  )
  await evaluate(cdp, `(() => {
    window.__CE_BRIDGE_LAST_EXPORT__ = null;
    window.__CE_BRIDGE_ANALYSIS_MUTATIONS__ = 0;
    const output = document.getElementById('rhythmic-output');
    if (output) {
      new MutationObserver(() => { window.__CE_BRIDGE_ANALYSIS_MUTATIONS__++; })
        .observe(output, { childList: true, characterData: true, subtree: true });
    }
    if (!window.__CE_BRIDGE_EXPORT_PROBE__) {
      window.addEventListener('message', (event) => {
        if (
          event.source === document.getElementById('smoosic-editor-frame')?.contentWindow
          && event.data?.type === 'seslitab:smoosic-export-result'
        ) {
          window.__CE_BRIDGE_LAST_EXPORT__ = event.data;
        }
      }, true);
      window.__CE_BRIDGE_EXPORT_PROBE__ = true;
    }
    return true;
  })()`)
}

async function triggerEditorButton(cdp, selector, label) {
  const ok = await evaluate(cdp, `(() => {
    const frame = document.getElementById('smoosic-editor-frame');
    const button = frame?.contentDocument?.querySelector(${JSON.stringify(selector)});
    if (!button) return false;
    button.click();
    return true;
  })()`)
  if (!ok) throw new Error(`${label} control could not be triggered.`)
}

async function clickApply(cdp) {
  const ok = await evaluate(cdp, `(() => {
    const button = document.getElementById('smoosic-apply-btn');
    if (!button) return false;
    button.click();
    return true;
  })()`)
  if (!ok) throw new Error('CE-BRIDGE Apply control could not be triggered.')
}

async function expectSourceUnchanged(cdp, label) {
  const unchanged = await evaluate(cdp, `(() => {
    const xml = String(document.getElementById('xml-output')?.textContent || '');
    const parsed = new DOMParser().parseFromString(xml, 'text/xml');
    const first = parsed.querySelector('part > measure > note > duration')?.textContent || '';
    return first === '1' && xml.includes('<forward>');
  })()`)
  if (!unchanged) throw new Error(`${label}: current SesliTab revision changed unexpectedly.`)
}

async function armCapturedRequest(cdp) {
  await evaluate(cdp, `(() => {
    const frame = document.getElementById('smoosic-editor-frame');
    if (!frame?.contentWindow) return false;
    const original = frame.contentWindow.postMessage.bind(frame.contentWindow);
    window.__CE_BRIDGE_ORIGINAL_FRAME_POSTMESSAGE__ = original;
    window.__CE_BRIDGE_CAPTURED_REQUEST__ = null;
    frame.contentWindow.postMessage = function(message, targetOrigin, transfer) {
      if (message?.type === 'seslitab:smoosic-export-request') {
        window.__CE_BRIDGE_CAPTURED_REQUEST__ = message;
        return;
      }
      return original(message, targetOrigin, transfer);
    };
    return true;
  })()`)
  await clickApply(cdp)
  return waitFor(cdp, `window.__CE_BRIDGE_CAPTURED_REQUEST__ || null`, 'captured structural request')
}

async function sendCapturedResult(cdp, request, payload) {
  const result = {
    type: 'seslitab:smoosic-export-result',
    version: 2,
    requestId: request.requestId,
    sourceRevision: request.sourceRevision,
    fileName: 'ce-bridge-negative.musicxml',
    roundTripOk: true,
    shapeOk: true,
    semanticOk: true,
    ...payload,
  }
  await evaluate(cdp, `(() => {
    const frame = document.getElementById('smoosic-editor-frame');
    const payload = ${JSON.stringify(result).replace(/</g, '\\u003c')};
    const script = frame.contentDocument.createElement('script');
    script.textContent = 'parent.postMessage(' + JSON.stringify(payload).replace(/</g, '\\u003c') + ', location.origin);';
    frame.contentDocument.body.appendChild(script);
    script.remove();
    return true;
  })()`)
}

async function restoreCapturedRequest(cdp) {
  await evaluate(cdp, `(() => {
    const frame = document.getElementById('smoosic-editor-frame');
    if (window.__CE_BRIDGE_ORIGINAL_FRAME_POSTMESSAGE__) {
      frame.contentWindow.postMessage = window.__CE_BRIDGE_ORIGINAL_FRAME_POSTMESSAGE__;
    }
    delete window.__CE_BRIDGE_ORIGINAL_FRAME_POSTMESSAGE__;
    delete window.__CE_BRIDGE_CAPTURED_REQUEST__;
    return true;
  })()`)
}

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1')
  if (url.pathname === '/ce-bridge-structural-browser-proof.html') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    response.end(readFileSync(fixturePath))
    return
  }
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
if (!port) throw new Error('CE-BRIDGE proof could not acquire a local port.')
const origin = `http://127.0.0.1:${port}`

const userDataDir = mkdtempSync(join(tmpdir(), 'seslitab-ce-bridge-cdp-'))
const child = spawn(chrome, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--autoplay-policy=no-user-gesture-required',
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
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
    screenWidth: 390, screenHeight: 844,
    screenOrientation: { type: 'portraitPrimary', angle: 0 },
  })

  // Static CE artifact must expose the exact bounded browser contract.
  await cdp.send('Page.navigate', { url: `${origin}/ce-bridge-structural-browser-proof.html` })
  await waitFor(cdp, `document.documentElement.dataset.ceStructRuntimeReady === 'true'`, 'CE runtime fixture')
  const fixtureA11y = await evaluate(cdp, `(() => {
    const s = document.getElementById('ce-bridge-fixture-status');
    return { role: s?.getAttribute('role'), live: s?.getAttribute('aria-live') };
  })()`)
  if (fixtureA11y?.role !== 'status' || fixtureA11y?.live !== 'polite') {
    throw new Error('CE runtime fixture accessibility contract failed.')
  }

  // Runtime-unavailable must fail closed before any immutable commit.
  await openEditorOnSource(cdp, origin)
  await triggerEditorButton(cdp, 'button[data-key="."]', '2× süre')
  await evaluate(cdp, `(() => {
    const original = document.head.appendChild.bind(document.head);
    window.__CE_BRIDGE_ORIGINAL_HEAD_APPEND__ = original;
    document.head.appendChild = function(node) {
      if (node?.getAttribute?.('data-seslitab-ce-struct-runtime') === 'true') {
        queueMicrotask(() => node.dispatchEvent(new Event('error')));
        return node;
      }
      return original(node);
    };
    return true;
  })()`)
  await clickApply(cdp)
  try {
    await waitFor(
      cdp,
      `String(document.getElementById('smoosic-editor-host-status')?.textContent || '').includes('Yapısal doğrulama motoru kullanılamıyor')`,
      'CE runtime unavailable fail-closed status',
      15000,
    )
  } catch (error) {
    const diagnostic = await evaluate(cdp, `(() => {
      const status = document.getElementById('smoosic-editor-host-status');
      const exported = window.__CE_BRIDGE_LAST_EXPORT__;
      const manifest = exported?.structuralActionManifest;
      const frame = document.getElementById('smoosic-editor-frame');
      return {
        hostStatus: String(status?.textContent || ''),
        hostKind: String(status?.dataset?.kind || ''),
        applyDisabled: Boolean(document.getElementById('smoosic-apply-btn')?.disabled),
        editorStatus: String(frame?.contentDocument?.getElementById('poc-status')?.textContent || ''),
        hasExport: Boolean(exported),
        exportError: String(exported?.error || ''),
        hasManifest: Boolean(manifest),
        manifestBefore: manifest?.operations?.[0]?.before ?? null,
        manifestAfter: manifest?.operations?.[0]?.after ?? null,
        manifestFingerprint: String(manifest?.baseMappingFingerprint || ''),
        candidateDuration: (() => {
          const xml = String(exported?.musicXml || '');
          if (!xml) return null;
          const parsed = new DOMParser().parseFromString(xml, 'text/xml');
          return Number(parsed.querySelector('part > measure > note > duration')?.textContent || NaN);
        })(),
        visibleDuration: (() => {
          const xml = String(document.getElementById('xml-output')?.textContent || '');
          const parsed = new DOMParser().parseFromString(xml, 'text/xml');
          return Number(parsed.querySelector('part > measure > note > duration')?.textContent || NaN);
        })(),
        runtimePresent: Boolean(window.STOmrCorrectionCeStructRuntime),
        runtimeScriptCount: document.querySelectorAll('script[data-seslitab-ce-struct-runtime]').length,
      };
    })()`)
    throw new Error(`${error.message} | diagnostic=${JSON.stringify(diagnostic)}`)
  }
  await expectSourceUnchanged(cdp, 'runtime unavailable')
  const unavailableA11y = await evaluate(cdp, `(() => {
    const s = document.getElementById('smoosic-editor-host-status');
    return { role: s?.getAttribute('role'), live: s?.getAttribute('aria-live') };
  })()`)
  if (unavailableA11y?.role !== 'alert' || unavailableA11y?.live !== 'assertive') {
    throw new Error('Runtime failure status is not assertive.')
  }

  // New document resets one-per-document failed runtime cache.
  await openEditorOnSource(cdp, origin)
  await triggerEditorButton(cdp, 'button[data-key="."]', '2× süre')
  await clickApply(cdp)
  await waitFor(
    cdp,
    `String(document.getElementById('smoosic-editor-host-status')?.textContent || '').includes('Yeni sürüm doğrulandı')`,
    'CE structural duration write-back',
  )
  const positive = await evaluate(cdp, `(() => {
    const exported = window.__CE_BRIDGE_LAST_EXPORT__;
    const visibleXml = String(document.getElementById('xml-output')?.textContent || '');
    const manifest = exported?.structuralActionManifest;
    const status = document.getElementById('smoosic-editor-host-status');
    return {
      manifest,
      candidateMusicXml: String(exported?.musicXml || ''),
      paddingRestProvenance: exported?.paddingRestProvenance || null,
      visibleXml,
      visibleDuration: (() => {
        const parsed = new DOMParser().parseFromString(visibleXml, 'text/xml');
        return Number(parsed.querySelector('part > measure > note > duration')?.textContent || NaN);
      })(),
      analysisMutations: Number(window.__CE_BRIDGE_ANALYSIS_MUTATIONS__ || 0),
      statusRole: status?.getAttribute('role'),
      statusLive: status?.getAttribute('aria-live'),
      runtimeContract: window.STOmrCorrectionCeStructRuntime?.contract || '',
    };
  })()`)
  if (
    positive?.manifest?.operations?.length !== 1
    || positive.manifest.operations[0].operation !== 'CHANGE_EVENT_DURATION'
    || !(positive.manifest.operations[0].after > positive.manifest.operations[0].before)
  ) throw new Error(`Explicit duration manifest missing or invalid: ${JSON.stringify(positive?.manifest)}`)
  if (positive.visibleDuration !== 2) {
    throw new Error(`Structural duration was not published as exact source-grid duration 2: ${positive.visibleDuration}`)
  }
  if (!(positive.analysisMutations > 0)) throw new Error('Fresh SesliTab result analysis did not rerender rhythmic output.')
  if (positive.statusRole !== 'status' || positive.statusLive !== 'polite') {
    throw new Error('Structural success status is not polite.')
  }
  if (positive.runtimeContract !== 'ST_OMR_CORRECTION_ENGINE_CE_STRUCT_BROWSER') {
    throw new Error('Exact CE runtime was not loaded into the host.')
  }

  // Undo before Apply must collapse net structural intent and create no revision.
  await openEditorOnSource(cdp, origin)
  await triggerEditorButton(cdp, 'button[data-key="."]', '2× süre')
  await triggerEditorButton(cdp, 'button[data-key="z"][data-ctrl="true"]', 'Geri al')
  await clickApply(cdp)
  await waitFor(
    cdp,
    `String(document.getElementById('smoosic-editor-host-status')?.textContent || '').includes('uygulanacak yeni bir müzikal değişiklik yok')`,
    'undo-before-Apply no-change',
  )
  const undoExport = await evaluate(cdp, `window.__CE_BRIDGE_LAST_EXPORT__ || null`)
  if (undoExport?.structuralActionManifest !== undefined) {
    throw new Error('Undo-before-Apply retained structural action provenance.')
  }
  await expectSourceUnchanged(cdp, 'undo before apply')

  // Mixed pitch + duration must fail exact CE candidate conformance.
  await openEditorOnSource(cdp, origin)
  await triggerEditorButton(cdp, 'button[data-key="."]', '2× süre')
  await triggerEditorButton(cdp, 'button[data-key="d"]', 'Re')
  await clickApply(cdp)
  await waitFor(
    cdp,
    `String(document.getElementById('smoosic-editor-host-status')?.textContent || '').includes('Editör sonucu doğrulanan yapısal değişiklikle eşleşmiyor')`,
    'mixed pitch plus duration conformance failure',
  )
  await expectSourceUnchanged(cdp, 'mixed edit')

  // Malformed manifest: same-origin correlated response, but invalid action provenance.
  await openEditorOnSource(cdp, origin)
  let request = await armCapturedRequest(cdp)
  await sendCapturedResult(cdp, request, {
    musicXml: sourceXml,
    paddingRestProvenance: { version: 1, sourceRevision: request.sourceRevision, rawNoteCount: 2, entries: [] },
    structuralActionManifest: { version: 1 },
  })
  await waitFor(
    cdp,
    `String(document.getElementById('smoosic-editor-host-status')?.textContent || '').includes('Yapısal düzenleme kaynağı doğrulanamadı')`,
    'malformed manifest fail-closed',
  )
  await expectSourceUnchanged(cdp, 'malformed manifest')
  await restoreCapturedRequest(cdp)

  // Stale manifest is independently rejected before CE.
  await openEditorOnSource(cdp, origin)
  request = await armCapturedRequest(cdp)
  const staleManifest = {
    ...positive.manifest,
    sourceRevision: Math.max(0, request.sourceRevision - 1),
    actionId: request.requestId,
  }
  if (staleManifest.sourceRevision === request.sourceRevision) staleManifest.sourceRevision += 1
  await sendCapturedResult(cdp, request, {
    musicXml: positive.candidateMusicXml,
    paddingRestProvenance: {
      ...positive.paddingRestProvenance,
      sourceRevision: request.sourceRevision,
    },
    structuralActionManifest: staleManifest,
  })
  await waitFor(
    cdp,
    `String(document.getElementById('smoosic-editor-host-status')?.textContent || '').includes('Kaynak değişti')`,
    'stale manifest fail-closed',
  )
  await expectSourceUnchanged(cdp, 'stale manifest')
  await restoreCapturedRequest(cdp)

  // Valid manifest + undeclared candidate pitch mutation must fail conformance.
  await openEditorOnSource(cdp, origin)
  request = await armCapturedRequest(cdp)
  const validManifest = {
    ...positive.manifest,
    sourceRevision: request.sourceRevision,
    actionId: request.requestId,
  }
  const mismatchedCandidate = positive.candidateMusicXml.replace('<step>C</step>', '<step>D</step>')
  await sendCapturedResult(cdp, request, {
    musicXml: mismatchedCandidate,
    paddingRestProvenance: {
      ...positive.paddingRestProvenance,
      sourceRevision: request.sourceRevision,
    },
    structuralActionManifest: validManifest,
  })
  await waitFor(
    cdp,
    `String(document.getElementById('smoosic-editor-host-status')?.textContent || '').includes('Editör sonucu doğrulanan yapısal değişiklikle eşleşmiyor')`,
    'candidate mismatch fail-closed',
  )
  await expectSourceUnchanged(cdp, 'candidate mismatch')
  await restoreCapturedRequest(cdp)

  console.log('CE-BRIDGE structural browser proof passed.')
} finally {
  try { cdp?.close() } catch {}
  try { child.kill('SIGTERM') } catch {}
  await waitForChildExit(child)
  server.close()
  rmSync(userDataDir, { recursive: true, force: true })
}
