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
  console.error('S14 CDP browser proof failed closed: Chrome/Chromium not found.')
  process.exit(1)
}
if (typeof WebSocket !== 'function') {
  console.error('S14 CDP browser proof failed closed: Node WebSocket client is unavailable.')
  process.exit(1)
}

for (const required of [
  resolve(distRoot, 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'build', 'mobile.js'),
]) {
  if (!existsSync(required)) {
    console.error(`S14 CDP browser proof failed closed: missing build artifact ${required}`)
    process.exit(1)
  }
}

const fixtureXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`

const fixtureXmlTwo = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>1</fifths></key>
        <time><beats>3</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
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

async function waitFor(cdp, expression, label, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs
  let lastValue = null
  let lastError = null
  while (Date.now() < deadline) {
    try {
      lastValue = await evaluate(cdp, expression)
      if (lastValue) return lastValue
    } catch (error) {
      lastError = error
    }
    await delay(100)
  }
  throw new Error(`${label} timed out${lastError ? `: ${lastError.message}` : lastValue ? ` (last=${String(lastValue)})` : ''}`)
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
  throw new Error('S14 CDP browser proof could not acquire a local port.')
}

const userDataDir = mkdtempSync(join(tmpdir(), 'seslitab-s14-cdp-'))
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

  await waitFor(cdp, `document.readyState === 'complete' && !!document.getElementById('smoosic-tab-btn')`, 'S14 tab init')

  const tabs = await evaluate(cdp, `[...document.querySelectorAll('.input-tab-btn')].map((node) => node.textContent.trim())`)
  const expectedTabs = ['PDF', 'MusicXML', 'TAB', 'Nota Düzenle']
  if (!Array.isArray(tabs) || tabs.length !== expectedTabs.length || expectedTabs.some((label, index) => tabs[index] !== label)) {
    throw new Error(`Unexpected input tabs: ${Array.isArray(tabs) ? tabs.join('|') : String(tabs)}`)
  }
  if (tabs.includes('Nota Ara')) throw new Error('Retired Nota Ara tab is present.')

  const shellPass = await evaluate(cdp, `(() => {
    const retiredIds = [
      'teacher-tab-btn', 'tab-teacher', 'stage-s05-score-workspace',
      'stage-s07-inline-teacher-inspector', 'stage-s08-score-quality',
      'stage-s10-educational-chords', 'stage-s11-workflow-details',
      'stage-s12-note-tools', 'stage-i-instrument-products',
      'stage-l-share-panel', 'stage-pr-d-keypad'
    ];
    return !!document.getElementById('seslitab-app-shell')
      && !!document.getElementById('discovery-query')
      && !!document.getElementById('discovery-search-btn')
      && !document.getElementById('discovery-tab-btn')
      && !document.getElementById('smoosic-editor-frame')
      && retiredIds.every((id) => !document.getElementById(id));
  })()`)
  if (!shellPass) throw new Error('Top search, lazy Smoosic, or retired-surface shell invariant failed.')

  await waitFor(cdp, `!!document.getElementById('result-guitar-tab-btn') && !!document.getElementById('result-violin-btn')`, 'Gitar TAB/Keman tabs')
  const productLabels = await evaluate(cdp, `[
    document.getElementById('result-guitar-tab-btn')?.textContent.trim(),
    document.getElementById('result-violin-btn')?.textContent.trim()
  ]`)
  if (productLabels?.[0] !== 'Gitar TAB' || productLabels?.[1] !== 'Keman') throw new Error('Gitar TAB/Keman result tabs are missing.')

  await evaluate(cdp, `document.getElementById('musicxml-tab-btn').click(); true`)
  if (!await evaluate(cdp, uploadExpression(fixtureXml, 's14-browser-fixture.musicxml'))) throw new Error('First MusicXML input is missing.')
  await waitFor(cdp, `document.getElementById('musicxml-open-btn')?.disabled === false`, 'first MusicXML selection')
  await evaluate(cdp, `document.getElementById('musicxml-open-btn').click(); true`)
  await waitFor(cdp, `String(document.getElementById('xml-output')?.textContent || '').includes('<step>C</step>')`, 'first main MusicXML parse')
  const firstName = await evaluate(cdp, `String(document.getElementById('musicxml-file-name')?.textContent || '')`)
  if (!firstName.includes('s14-browser-fixture.musicxml')) throw new Error('First MusicXML source filename was not preserved.')

  await evaluate(cdp, `document.getElementById('smoosic-tab-btn').click(); true`)
  await waitFor(cdp, `!!document.getElementById('smoosic-editor-frame')`, 'lazy Smoosic iframe')
  const frameSrc = await evaluate(cdp, `document.getElementById('smoosic-editor-frame')?.getAttribute('src')`)
  if (frameSrc !== '/smoosic-editor/index.html') throw new Error(`Unexpected Smoosic iframe source: ${String(frameSrc)}`)

  await waitFor(cdp, `!!document.getElementById('smoosic-editor-frame')?.contentDocument?.getElementById('poc-status')`, 'Smoosic document')
  await waitFor(cdp, `(() => {
    const text = String(document.getElementById('smoosic-editor-frame')?.contentDocument?.getElementById('poc-status')?.textContent || '');
    if (text.startsWith('Başlatma hatası:') || text.startsWith('Hata:') || text.startsWith('XML hatası:')) return 'ERROR:' + text;
    return text.startsWith('Yüklendi:') && text.includes('s14-browser-fixture.musicxml');
  })()`, 'first MusicXML handoff to Smoosic')
  const firstEditorStatus = await evaluate(cdp, `String(document.getElementById('smoosic-editor-frame').contentDocument.getElementById('poc-status')?.textContent || '')`)
  if (!firstEditorStatus.startsWith('Yüklendi:') || !firstEditorStatus.includes('s14-browser-fixture.musicxml')) {
    throw new Error(`Smoosic first handoff failed: ${firstEditorStatus}`)
  }

  const editorControlsPass = await evaluate(cdp, `(() => {
    const doc = document.getElementById('smoosic-editor-frame').contentDocument;
    return !!doc.getElementById('mobile-xml-input')
      && !!doc.getElementById('mobile-xml-export')
      && !doc.getElementById('mobile-corpus-input')
      && !doc.getElementById('mobile-corpus-run');
  })()`)
  if (!editorControlsPass) throw new Error('Smoosic production controls/corpus boundary failed.')

  await waitFor(cdp, `(() => {
    const doc = document.getElementById('smoosic-editor-frame')?.contentDocument;
    return !!doc?.getElementById('mobile-menu-toggle') && !!doc?.getElementById('controls-left');
  })()`, 'mobile Smoosic menu controls')

  const menuProof = await evaluate(cdp, `(async () => {
    const frame = document.getElementById('smoosic-editor-frame');
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    const toggle = doc.getElementById('mobile-menu-toggle');
    const menu = doc.getElementById('controls-left');
    const firstLabel = String(menu.querySelector('button')?.textContent || '').trim();
    if (!firstLabel.includes('Help')) return { pass: false, reason: 'first-label', firstLabel, scrollTop: menu.scrollTop };

    if (doc.body.classList.contains('mobile-menu-open')) toggle.click();
    const originalStyle = menu.getAttribute('style');
    const spacer = doc.createElement('div');
    spacer.setAttribute('aria-hidden', 'true');
    spacer.style.height = '900px';
    spacer.style.minHeight = '900px';
    spacer.style.flex = '0 0 900px';
    spacer.style.pointerEvents = 'none';

    menu.style.setProperty('top', '0', 'important');
    menu.style.setProperty('bottom', 'auto', 'important');
    menu.style.setProperty('height', '120px', 'important');
    menu.style.setProperty('min-height', '0', 'important');
    menu.style.setProperty('max-height', '120px', 'important');
    menu.style.setProperty('overflow-y', 'scroll', 'important');
    menu.appendChild(spacer);

    toggle.click();
    await new Promise((resolveFrame) => win.requestAnimationFrame(() => resolveFrame()));
    await new Promise((resolveFrame) => win.requestAnimationFrame(() => resolveFrame()));
    menu.scrollTop = menu.scrollHeight;
    const forcedScroll = menu.scrollTop;
    const geometry = {
      clientHeight: menu.clientHeight,
      scrollHeight: menu.scrollHeight,
    };

    toggle.click();
    toggle.click();
    await new Promise((resolveFrame) => win.requestAnimationFrame(() => resolveFrame()));
    await new Promise((resolveFrame) => win.requestAnimationFrame(() => resolveFrame()));
    const reopenedScrollTop = menu.scrollTop;
    const reopenedLabel = String(menu.querySelector('button')?.textContent || '').trim();

    toggle.click();
    spacer.remove();
    if (originalStyle === null) menu.removeAttribute('style');
    else menu.setAttribute('style', originalStyle);

    return {
      pass: forcedScroll > 0 && reopenedScrollTop === 0 && reopenedLabel.includes('Help'),
      forcedScroll,
      reopenedScrollTop,
      firstLabel,
      reopenedLabel,
      geometry,
    };
  })()`)
  if (!menuProof?.pass) throw new Error(`Mobile menu top-reset proof failed: ${JSON.stringify(menuProof)}`)

  await evaluate(cdp, `document.getElementById('musicxml-tab-btn').click(); true`)
  if (!await evaluate(cdp, uploadExpression(fixtureXmlTwo, 's14-browser-fixture-2.musicxml'))) throw new Error('Second MusicXML input is missing.')
  await waitFor(cdp, `document.getElementById('musicxml-open-btn')?.disabled === false`, 'second MusicXML selection')
  await evaluate(cdp, `document.getElementById('musicxml-open-btn').click(); true`)
  await waitFor(cdp, `(() => {
    const xml = String(document.getElementById('xml-output')?.textContent || '');
    const name = String(document.getElementById('musicxml-file-name')?.textContent || '');
    return xml.includes('<step>G</step>') && name.includes('s14-browser-fixture-2.musicxml');
  })()`, 'second main MusicXML parse')

  await waitFor(cdp, `(() => {
    const text = String(document.getElementById('smoosic-editor-frame')?.contentDocument?.getElementById('poc-status')?.textContent || '');
    if (text.startsWith('Başlatma hatası:') || text.startsWith('Hata:') || text.startsWith('XML hatası:')) return 'ERROR:' + text;
    return text.startsWith('Yüklendi:') && text.includes('s14-browser-fixture-2.musicxml');
  })()`, 'automatic second-source refresh in Smoosic')

  await evaluate(cdp, `document.getElementById('smoosic-tab-btn').click(); true`)
  await waitFor(cdp, `document.getElementById('smoosic-editor-frame')?.hidden === false`, 'second source editor visibility')
  const finalState = await evaluate(cdp, `(() => {
    const frame = document.getElementById('smoosic-editor-frame');
    return {
      status: String(frame.contentDocument.getElementById('poc-status')?.textContent || ''),
      frameWidth: frame.getBoundingClientRect().width,
      viewportWidth: document.documentElement.clientWidth,
      pageScrollWidth: document.documentElement.scrollWidth,
    };
  })()`)
  if (!finalState?.status.includes('s14-browser-fixture-2.musicxml')) throw new Error(`Smoosic kept a stale first source: ${String(finalState?.status)}`)
  if (finalState.frameWidth > finalState.viewportWidth + 2) throw new Error(`Smoosic host iframe overflows mobile viewport: ${finalState.frameWidth}/${finalState.viewportWidth}`)
  if (finalState.pageScrollWidth > finalState.viewportWidth + 2) throw new Error(`SesliTab page has horizontal mobile overflow: ${finalState.pageScrollWidth}/${finalState.viewportWidth}`)

  console.log(`S14 deterministic CDP production browser proof PASS using ${chrome}: clean shell + lazy same-origin Smoosic + forced stale mobile-menu reset + sequential MusicXML refresh.`)
} catch (error) {
  console.error(`S14 deterministic CDP production browser proof failed closed: ${error?.message ?? error}`)
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
    console.error(`S14 CDP cleanup failed: ${error?.message ?? error}`)
    process.exitCode = 1
  }
  await new Promise((resolveClose) => server.close(resolveClose))
}
