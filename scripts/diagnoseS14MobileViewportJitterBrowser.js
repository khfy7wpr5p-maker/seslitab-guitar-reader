import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'

const repoRoot = resolve('.')
const distRoot = resolve(repoRoot, 'dist')
const artifactDir = resolve(repoRoot, 'artifacts')
const artifactPath = resolve(artifactDir, 'smoosic-mobile-viewport-diagnostics.json')
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
  console.error('S14 viewport diagnostic failed closed: Chrome/Chromium not found.')
  process.exit(1)
}

for (const required of [
  resolve(distRoot, 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'viewport-fit.js'),
]) {
  if (!existsSync(required)) {
    console.error(`S14 viewport diagnostic failed closed: missing build artifact ${required}`)
    process.exit(1)
  }
}

function scoreXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>Viewport Diagnostic</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`
}

const xml = scoreXml()
const proofHtml = `<!doctype html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>S14 viewport diagnostic</title></head>
<body data-s14-viewport-diagnostic="pending">
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
      body.setAttribute('data-s14-viewport-diagnostic', 'failed');
      body.setAttribute('data-s14-viewport-diagnostic-error', text.replace(/["<>]/g, ''));
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
      const file = new win.File([xml], 'viewport-diagnostic.musicxml', { type: 'application/vnd.recordare.musicxml+xml' });
      const transfer = new win.DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new win.Event('change', { bubbles: true }));
    }

    async function run() {
      await waitFor(() => appFrame.contentDocument?.getElementById('musicxml-tab-btn'), 'app init');
      const win = appFrame.contentWindow;
      const doc = appFrame.contentDocument;

      doc.getElementById('musicxml-tab-btn').click();
      assignMusicXml(win, doc);
      await waitFor(() => doc.getElementById('musicxml-open-btn')?.disabled === false, 'MusicXML selection');
      doc.getElementById('musicxml-open-btn').click();
      await waitFor(() => String(doc.getElementById('xml-output')?.textContent || '').includes('<step>C</step>'), 'MusicXML parse');

      doc.getElementById('smoosic-tab-btn').click();
      const frame = await waitFor(() => doc.getElementById('smoosic-editor-frame'), 'Smoosic iframe');
      const editorDoc = await waitFor(() => frame.contentDocument?.getElementById('poc-status') ? frame.contentDocument : null, 'editor document');
      await waitFor(() => String(editorDoc.getElementById('poc-status')?.textContent || '').includes('viewport-diagnostic.musicxml'), 'editor MusicXML load');

      const metrics = {
        viewport: { width: win.innerWidth, height: win.innerHeight },
        visualViewport: win.visualViewport ? { width: win.visualViewport.width, height: win.visualViewport.height } : null,
        initial: {
          frameHeight: frame.getBoundingClientRect().height,
          frameTop: frame.getBoundingClientRect().top,
          frameHidden: frame.hidden,
          frameSrc: frame.getAttribute('src'),
          editorStatus: String(editorDoc.getElementById('poc-status')?.textContent || ''),
        },
        events: {
          parentScroll: 0,
          visualViewportScroll: 0,
          visualViewportResize: 0,
          iframeLoad: 0,
          editorInputChange: 0,
          frameStyleMutation: 0,
          frameHiddenMutation: 0,
          scoreDomMutationRecords: 0,
        },
        frameHeightSamples: [],
        menuTopSamples: [],
      };

      frame.addEventListener('load', () => { metrics.events.iframeLoad += 1; });
      editorDoc.getElementById('mobile-xml-input')?.addEventListener('change', () => { metrics.events.editorInputChange += 1; });
      win.addEventListener('scroll', () => { metrics.events.parentScroll += 1; }, { passive: true });
      win.visualViewport?.addEventListener('scroll', () => { metrics.events.visualViewportScroll += 1; }, { passive: true });
      win.visualViewport?.addEventListener('resize', () => { metrics.events.visualViewportResize += 1; }, { passive: true });

      const frameObserver = new win.MutationObserver((records) => {
        for (const record of records) {
          if (record.attributeName === 'style') metrics.events.frameStyleMutation += 1;
          if (record.attributeName === 'hidden') metrics.events.frameHiddenMutation += 1;
        }
        metrics.frameHeightSamples.push({
          scrollY: win.scrollY,
          rectHeight: frame.getBoundingClientRect().height,
          styleHeight: frame.style.height,
          datasetHeight: frame.dataset.seslitabViewportHeight || '',
        });
        metrics.menuTopSamples.push({
          scrollY: win.scrollY,
          menuTop: frame.dataset.seslitabMenuTop || '',
          occludedTop: frame.dataset.seslitabHostOccludedTop || '',
        });
      });
      frameObserver.observe(frame, { attributes: true, attributeFilter: ['style', 'hidden', 'data-seslitab-viewport-height', 'data-seslitab-menu-top', 'data-seslitab-host-occluded-top'] });

      const scoreRoot = editorDoc.querySelector('.musicRelief, .score-container, #smoo');
      const scoreObserver = scoreRoot ? new frame.contentWindow.MutationObserver((records) => {
        metrics.events.scoreDomMutationRecords += records.length;
      }) : null;
      if (scoreObserver && scoreRoot) scoreObserver.observe(scoreRoot, { childList: true, subtree: true, attributes: true });

      const spacer = doc.createElement('div');
      spacer.id = 's14-viewport-diagnostic-spacer';
      spacer.style.height = '1800px';
      spacer.setAttribute('aria-hidden', 'true');
      doc.body.appendChild(spacer);

      const frameDocumentTop = win.scrollY + frame.getBoundingClientRect().top;
      const positions = [0, 80, 160, 240, 320, 400, 320, 240, 160, 80, 0];
      for (const delta of positions) {
        win.scrollTo(0, frameDocumentTop + delta);
        await sleep(80);
      }
      await sleep(350);

      frameObserver.disconnect();
      scoreObserver?.disconnect();
      metrics.final = {
        frameHeight: frame.getBoundingClientRect().height,
        frameTop: frame.getBoundingClientRect().top,
        frameHidden: frame.hidden,
        frameSrc: frame.getAttribute('src'),
        editorStatus: String(editorDoc.getElementById('poc-status')?.textContent || ''),
      };
      metrics.analysis = {
        frameReloadObserved: metrics.events.iframeLoad > 0,
        sourceReimportObserved: metrics.events.editorInputChange > 0,
        frameHiddenChanged: metrics.events.frameHiddenMutation > 0,
        frameGeometryMutatedDuringScroll: metrics.events.frameStyleMutation > 0 || metrics.frameHeightSamples.length > 0,
        scoreDomMutatedDuringScroll: metrics.events.scoreDomMutationRecords > 0,
      };

      body.setAttribute('data-s14-viewport-diagnostic', 'true');
      body.setAttribute('data-s14-frame-reload', String(metrics.analysis.frameReloadObserved));
      body.setAttribute('data-s14-source-reimport', String(metrics.analysis.sourceReimportObserved));
      body.setAttribute('data-s14-frame-hidden-change', String(metrics.analysis.frameHiddenChanged));
      body.setAttribute('data-s14-frame-geometry-mutation', String(metrics.analysis.frameGeometryMutatedDuringScroll));
      body.setAttribute('data-s14-score-dom-mutation', String(metrics.analysis.scoreDomMutatedDuringScroll));
      resultNode.textContent = JSON.stringify(metrics);
    }

    appFrame.addEventListener('load', () => {
      run().catch((error) => {
        if (body.getAttribute('data-s14-viewport-diagnostic') !== 'failed') fail(error?.message || error);
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
  if (url.pathname === '/__s14-viewport-diagnostic.html') {
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
  throw new Error('S14 viewport diagnostic could not acquire a local port.')
}

const targetUrl = `http://127.0.0.1:${port}/__s14-viewport-diagnostic.html`
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
      rejectExit(new Error('S14 viewport diagnostic Chrome run timed out.'))
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
  console.error(`S14 viewport diagnostic Chrome exit ${exitCode}: ${stderr.slice(-5000)}`)
  process.exit(1)
}

if (!stdout.includes('data-s14-viewport-diagnostic="true"')) {
  const error = stdout.match(/data-s14-viewport-diagnostic-error="([^"]+)"/)?.[1] || 'completion marker missing'
  console.error(`S14 viewport diagnostic failed: ${error}`)
  console.error(stdout.slice(-12000))
  process.exit(1)
}

const resultMatch = stdout.match(/<pre id="result">([^<]+)<\/pre>/)
if (!resultMatch) {
  console.error('S14 viewport diagnostic failed: JSON result missing from DOM dump.')
  process.exit(1)
}

let metrics
try {
  metrics = JSON.parse(resultMatch[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'))
} catch (error) {
  console.error(`S14 viewport diagnostic failed: result JSON could not be parsed: ${error?.message ?? error}`)
  process.exit(1)
}

mkdirSync(artifactDir, { recursive: true })
writeFileSync(artifactPath, JSON.stringify({
  documentType: 'SmoosicMobileViewportDiagnosticEvidence',
  evidenceClass: 'CHROMIUM_REAL_BROWSER_DIAGNOSTIC',
  productionBehaviorChanged: false,
  metrics,
}, null, 2) + '\n')

console.log(`S14 viewport diagnostic PASS using ${chrome}: ${JSON.stringify(metrics.analysis)} artifact=${artifactPath}`)
