import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'

const repoRoot = resolve('.')
const distRoot = resolve(repoRoot, 'dist')
const artifactDir = resolve(repoRoot, 'artifacts')
const artifactPath = resolve(artifactDir, 'smoosic-mobile-geometry-baseline.json')
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
  console.error('S14 geometry diagnostic failed closed: Chrome/Chromium not found.')
  process.exit(1)
}

for (const required of [
  resolve(distRoot, 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'viewport-fit.js'),
]) {
  if (!existsSync(required)) {
    console.error(`S14 geometry diagnostic failed closed: missing build artifact ${required}`)
    process.exit(1)
  }
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>Geometry Baseline</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
  </measure></part>
</score-partwise>`

const proofHtml = `<!doctype html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>S14 geometry baseline</title></head>
<body data-s14-geometry-diagnostic="pending">
  <iframe id="app-frame" src="/index.html" style="width:390px;height:844px;border:0"></iframe>
  <pre id="result">pending</pre>
  <script>
    const xml = ${JSON.stringify(xml)};
    const body = document.body;
    const resultNode = document.getElementById('result');
    const appFrame = document.getElementById('app-frame');
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function fail(message) {
      const text = String(message || 'unknown failure');
      body.setAttribute('data-s14-geometry-diagnostic', 'failed');
      body.setAttribute('data-s14-geometry-diagnostic-error', text.replace(/["<>]/g, ''));
      resultNode.textContent = text;
      throw new Error(text);
    }

    async function waitFor(check, label, timeout = 120000) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        try {
          const value = check();
          if (value) return value;
        } catch {}
        await sleep(100);
      }
      fail('timeout: ' + label);
    }

    function assignMusicXml(win, doc) {
      const input = doc.getElementById('musicxml-file-input');
      const file = new win.File([xml], 'geometry-baseline.musicxml', { type: 'application/vnd.recordare.musicxml+xml' });
      const transfer = new win.DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new win.Event('change', { bubbles: true }));
    }

    function rectOf(node) {
      if (!node || typeof node.getBoundingClientRect !== 'function') return null;
      const rect = node.getBoundingClientRect();
      const style = node.ownerDocument?.defaultView?.getComputedStyle?.(node);
      return {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        display: style?.display || '',
        position: style?.position || '',
        overflowX: style?.overflowX || '',
        overflowY: style?.overflowY || '',
      };
    }

    function geometry(frame, editorDoc) {
      const outerMenu = editorDoc.querySelector('body > #controls-left');
      const innerMenu = outerMenu?.querySelector('#controls-left.controls-left') || null;
      return {
        iframe: rectOf(frame),
        upperToolbar: rectOf(editorDoc.querySelector("[id$='-top-bar']")),
        scoreViewport: rectOf(editorDoc.querySelector('.musicRelief')),
        bottomToolbar: rectOf(editorDoc.getElementById('mobile-toolbar')),
        outerMenu: rectOf(outerMenu),
        innerMenu: rectOf(innerMenu),
        menuScrollTop: outerMenu ? outerMenu.scrollTop : null,
        activeElement: editorDoc.activeElement ? {
          tag: editorDoc.activeElement.tagName,
          id: editorDoc.activeElement.id || '',
          className: String(editorDoc.activeElement.className || ''),
        } : null,
        menuTopDataset: frame.dataset.seslitabMenuTop || '',
        hostOccludedTopDataset: frame.dataset.seslitabHostOccludedTop || '',
      };
    }

    async function run() {
      await waitFor(() => appFrame.contentDocument?.getElementById('musicxml-tab-btn'), 'app init');
      const win = appFrame.contentWindow;
      const doc = appFrame.contentDocument;

      doc.getElementById('musicxml-tab-btn').click();
      assignMusicXml(win, doc);
      await waitFor(() => doc.getElementById('musicxml-open-btn')?.disabled === false, 'MusicXML selection');
      doc.getElementById('musicxml-open-btn').click();
      await waitFor(() => String(doc.getElementById('xml-output')?.textContent || '').includes('<step>G</step>'), 'MusicXML parse');

      doc.getElementById('smoosic-tab-btn').click();
      const frame = await waitFor(() => doc.getElementById('smoosic-editor-frame'), 'Smoosic iframe');
      const editorDoc = await waitFor(() => frame.contentDocument?.getElementById('poc-status') ? frame.contentDocument : null, 'editor document');
      await waitFor(() => String(editorDoc.getElementById('poc-status')?.textContent || '').includes('geometry-baseline.musicxml'), 'editor MusicXML load');
      await waitFor(() => editorDoc.querySelector('.musicRelief') && editorDoc.getElementById('mobile-toolbar'), 'mobile geometry nodes');

      const metrics = {
        viewport: {
          width: win.innerWidth,
          height: win.innerHeight,
          visualWidth: win.visualViewport?.width || null,
          visualHeight: win.visualViewport?.height || null,
        },
        events: {
          parentScroll: 0,
          editorResize: 0,
          iframeLoad: 0,
          editorInputChange: 0,
          frameStyleMutation: 0,
          frameHiddenMutation: 0,
          scoreChildListMutations: 0,
          scoreAttributeMutations: 0,
          scoreCharacterDataMutations: 0,
        },
        geometry: {},
      };

      metrics.geometry.initialClosed = geometry(frame, editorDoc);

      frame.addEventListener('load', () => { metrics.events.iframeLoad += 1; });
      editorDoc.getElementById('mobile-xml-input')?.addEventListener('change', () => { metrics.events.editorInputChange += 1; });
      win.addEventListener('scroll', () => { metrics.events.parentScroll += 1; }, { passive: true });
      frame.contentWindow.addEventListener('resize', () => { metrics.events.editorResize += 1; }, { passive: true });

      const frameObserver = new win.MutationObserver((records) => {
        for (const record of records) {
          if (record.attributeName === 'style') metrics.events.frameStyleMutation += 1;
          if (record.attributeName === 'hidden') metrics.events.frameHiddenMutation += 1;
        }
      });
      frameObserver.observe(frame, { attributes: true, attributeFilter: ['style', 'hidden'] });

      const scoreRoot = editorDoc.querySelector('.musicRelief');
      const scoreObserver = new frame.contentWindow.MutationObserver((records) => {
        for (const record of records) {
          if (record.type === 'childList') metrics.events.scoreChildListMutations += 1;
          if (record.type === 'attributes') metrics.events.scoreAttributeMutations += 1;
          if (record.type === 'characterData') metrics.events.scoreCharacterDataMutations += 1;
        }
      });
      scoreObserver.observe(scoreRoot, { childList: true, subtree: true, attributes: true, characterData: true });

      const menuToggle = editorDoc.getElementById('mobile-menu-toggle');
      menuToggle.click();
      await waitFor(() => editorDoc.body.classList.contains('mobile-menu-open'), 'mobile menu open');
      await sleep(220);
      metrics.geometry.menuOpenBeforeHostScroll = geometry(frame, editorDoc);

      const spacer = doc.createElement('div');
      spacer.id = 's14-geometry-scroll-spacer';
      spacer.style.height = '2200px';
      spacer.setAttribute('aria-hidden', 'true');
      doc.body.appendChild(spacer);
      const frameDocumentTop = win.scrollY + frame.getBoundingClientRect().top;
      win.scrollTo(0, frameDocumentTop + 260);
      await sleep(400);
      metrics.geometry.menuOpenAfterHostScroll = geometry(frame, editorDoc);

      if (!editorDoc.body.classList.contains('mobile-menu-open')) menuToggle.click();
      await sleep(100);
      metrics.geometry.final = geometry(frame, editorDoc);

      frameObserver.disconnect();
      scoreObserver.disconnect();

      const initial = metrics.geometry.initialClosed;
      const after = metrics.geometry.menuOpenAfterHostScroll;
      metrics.analysis = {
        iframeReloadObserved: metrics.events.iframeLoad > 0,
        sourceReimportObserved: metrics.events.editorInputChange > 0,
        frameHiddenChanged: metrics.events.frameHiddenMutation > 0,
        childResizeObserved: metrics.events.editorResize > 0,
        frameHeightChanged: Boolean(initial?.iframe && after?.iframe && Math.abs(initial.iframe.height - after.iframe.height) > 0.5),
        scoreChildListMutated: metrics.events.scoreChildListMutations > 0,
        scoreAttributesMutated: metrics.events.scoreAttributeMutations > 0,
        menuStartsAtTop: after?.menuScrollTop === 0,
        outerMenuIsFixed: after?.outerMenu?.position === 'fixed',
        innerMenuIsStatic: after?.innerMenu?.position === 'static',
        scoreViewportHasWidth: Number(after?.scoreViewport?.width || 0) > 0,
        bottomToolbarVisible: Number(after?.bottomToolbar?.height || 0) >= 44,
      };

      body.setAttribute('data-s14-geometry-diagnostic', 'true');
      resultNode.textContent = JSON.stringify(metrics);
    }

    appFrame.addEventListener('load', () => {
      run().catch((error) => {
        if (body.getAttribute('data-s14-geometry-diagnostic') !== 'failed') fail(error?.message || error);
      });
    }, { once: true });
  </script>
</body>
</html>`

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

function safeDistPath(pathname) {
  let relative = decodeURIComponent(pathname).replace(/^\/+/, '')
  if (!relative || relative.endsWith('/')) relative += 'index.html'
  const target = resolve(distRoot, relative)
  if (target !== distRoot && !target.startsWith(distRoot + sep)) return null
  return target
}

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1')
  if (url.pathname === '/__s14-geometry-diagnostic.html') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    response.end(proofHtml)
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
if (!port) {
  server.close()
  throw new Error('S14 geometry diagnostic could not acquire a local port.')
}

const targetUrl = `http://127.0.0.1:${port}/__s14-geometry-diagnostic.html`
const chromeArgs = [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--autoplay-policy=no-user-gesture-required',
  '--window-size=390,844',
  '--virtual-time-budget=180000',
  '--dump-dom',
  targetUrl,
]

let stdout = ''
let stderr = ''
let exitCode = null
try {
  exitCode = await new Promise((resolveExit, rejectExit) => {
    const child = spawn(chrome, chromeArgs, { cwd: repoRoot })
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      rejectExit(new Error('S14 geometry diagnostic Chrome run timed out.'))
    }, 210000)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', (error) => {
      clearTimeout(timeout)
      rejectExit(error)
    })
    child.once('close', (code) => {
      clearTimeout(timeout)
      resolveExit(code)
    })
  })
} finally {
  await new Promise((resolveClose) => server.close(resolveClose))
}

if (exitCode !== 0) {
  console.error(`S14 geometry diagnostic Chrome exit ${exitCode}: ${stderr.slice(-5000)}`)
  process.exit(1)
}
if (!stdout.includes('data-s14-geometry-diagnostic="true"')) {
  const error = stdout.match(/data-s14-geometry-diagnostic-error="([^"]+)"/)?.[1] || 'completion marker missing'
  console.error(`S14 geometry diagnostic failed: ${error}`)
  console.error(stdout.slice(-12000))
  process.exit(1)
}

const resultMatch = stdout.match(/<pre id="result">([^<]+)<\/pre>/)
if (!resultMatch) {
  console.error('S14 geometry diagnostic failed: JSON result missing from DOM dump.')
  process.exit(1)
}

let metrics
try {
  metrics = JSON.parse(resultMatch[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'))
} catch (error) {
  console.error(`S14 geometry diagnostic failed: result JSON could not be parsed: ${error?.message ?? error}`)
  process.exit(1)
}

mkdirSync(artifactDir, { recursive: true })
writeFileSync(artifactPath, JSON.stringify({
  documentType: 'SmoosicMobileGeometryBaselineEvidence',
  evidenceClass: 'CHROMIUM_REAL_BROWSER_DIAGNOSTIC',
  productionBehaviorChanged: false,
  metrics,
}, null, 2) + '\n')

console.log(`S14 geometry diagnostic PASS using ${chrome}: ${JSON.stringify(metrics.analysis)} artifact=${artifactPath}`)
