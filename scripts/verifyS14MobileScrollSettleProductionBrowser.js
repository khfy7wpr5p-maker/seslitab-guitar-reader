import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'

const repoRoot = resolve('.')
const distRoot = resolve(repoRoot, 'dist')
const artifactDir = resolve(repoRoot, 'artifacts')
const artifactPath = resolve(artifactDir, 'smoosic-mobile-scroll-settle-production.json')
const builtViewportPath = resolve(distRoot, 'smoosic-editor', 'viewport-fit.js')
const candidates = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean)

let chrome = null
for (const candidate of candidates) {
  if (spawnSync(candidate, ['--version'], { encoding: 'utf8' }).status === 0) {
    chrome = candidate
    break
  }
}
if (!chrome) {
  console.error('S14 production scroll-settle browser acceptance failed closed: Chrome/Chromium not found.')
  process.exit(1)
}

for (const required of [
  resolve(distRoot, 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'index.html'),
  builtViewportPath,
]) {
  if (!existsSync(required)) {
    console.error(`S14 production scroll-settle browser acceptance failed closed: missing ${required}`)
    process.exit(1)
  }
}

const builtViewportSource = readFileSync(builtViewportPath, 'utf8')
if (!builtViewportSource.includes('SCROLL_SETTLE_MS = 140') || !builtViewportSource.includes('scheduleViewportMotionFit')) {
  console.error('S14 production scroll-settle browser acceptance failed closed: production bundle does not contain the hardened viewport script.')
  process.exit(1)
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>S14 Production Scroll Settle</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
  </measure></part>
</score-partwise>`

function makeProofHtml() {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>S14 Production Scroll Settle</title></head>
<body data-s14-production="pending">
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
  body.setAttribute('data-s14-production', 'failed');
  body.setAttribute('data-s14-error', text.replace(/["<>]/g, ''));
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
    await sleep(80);
  }
  fail('timeout: ' + label);
}

function assignMusicXml(win, doc) {
  const input = doc.getElementById('musicxml-file-input');
  const file = new win.File([xml], 's14-production-scroll-settle.musicxml', { type: 'application/vnd.recordare.musicxml+xml' });
  const transfer = new win.DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new win.Event('change', { bubbles: true }));
}

async function run() {
  await waitFor(() => appFrame.contentDocument?.getElementById('musicxml-tab-btn'), 'host app init');
  const win = appFrame.contentWindow;
  const doc = appFrame.contentDocument;

  doc.getElementById('musicxml-tab-btn').click();
  assignMusicXml(win, doc);
  await waitFor(() => doc.getElementById('musicxml-open-btn')?.disabled === false, 'MusicXML selection');
  doc.getElementById('musicxml-open-btn').click();
  await waitFor(() => String(doc.getElementById('xml-output')?.textContent || '').includes('<step>F</step>'), 'MusicXML parse');
  doc.getElementById('smoosic-tab-btn').click();

  const frame = await waitFor(() => doc.getElementById('smoosic-editor-frame'), 'Smoosic iframe');
  const editorDoc = await waitFor(() => frame.contentDocument?.getElementById('poc-status') ? frame.contentDocument : null, 'editor document');
  await waitFor(() => {
    const status = String(editorDoc.getElementById('poc-status')?.textContent || '');
    return status.startsWith('Yüklendi:') && status.includes('s14-production-scroll-settle.musicxml');
  }, 'fully loaded editor MusicXML');

  const scroller = doc.scrollingElement || doc.documentElement;
  doc.documentElement.style.scrollBehavior = 'auto';
  doc.body.style.scrollBehavior = 'auto';
  scroller.scrollTop = 0;
  await sleep(500);

  function snapshot() {
    const rect = frame.getBoundingClientRect();
    const vv = win.visualViewport;
    const viewportTop = Number(vv?.offsetTop || 0);
    const viewportHeight = Number(vv?.height || win.innerHeight || 0);
    return {
      frameTop: Number(rect.top.toFixed(3)),
      frameHeight: Number(rect.height.toFixed(3)),
      frameStyleHeight: frame.style.height || '',
      datasetHeight: frame.dataset.seslitabViewportHeight || '',
      menuTop: frame.dataset.seslitabMenuTop || '',
      expectedHeight: Math.floor(viewportTop + viewportHeight - rect.top - 4),
    };
  }

  const metrics = {
    viewport: { width: win.innerWidth, height: win.innerHeight, visualHeight: win.visualViewport?.height || null },
    scroll: { maxBefore: 0, maxAfter: 0, samples: [], dispatchedSignals: 0, observedEvents: 0 },
    initial: snapshot(),
    editorStatus: String(editorDoc.getElementById('poc-status')?.textContent || ''),
    events: { iframeLoad: 0, editorInputChange: 0, frameHiddenMutation: 0 },
    phase: {
      burst: { frameStyleMutation: 0 },
      settle: { frameStyleMutation: 0 },
      idle: { frameStyleMutation: 0 },
    },
  };

  let phase = 'burst';
  frame.addEventListener('load', () => { metrics.events.iframeLoad += 1; });
  editorDoc.getElementById('mobile-xml-input')?.addEventListener('change', () => { metrics.events.editorInputChange += 1; });
  win.addEventListener('scroll', () => { metrics.scroll.observedEvents += 1; }, { passive: true });

  const frameObserver = new win.MutationObserver((records) => {
    for (const record of records) {
      if (record.attributeName === 'style') metrics.phase[phase].frameStyleMutation += 1;
      if (record.attributeName === 'hidden') metrics.events.frameHiddenMutation += 1;
    }
  });
  frameObserver.observe(frame, { attributes: true, attributeFilter: ['style', 'hidden'] });

  metrics.scroll.maxBefore = Math.max(0, scroller.scrollHeight - win.innerHeight);
  const spacer = doc.createElement('div');
  spacer.style.height = '2600px';
  spacer.style.width = '1px';
  spacer.setAttribute('aria-hidden', 'true');
  doc.body.appendChild(spacer);
  await sleep(80);
  metrics.scroll.maxAfter = Math.max(0, scroller.scrollHeight - win.innerHeight);
  if (metrics.scroll.maxAfter < 280) fail('host app did not become scrollable');

  for (const requested of [40, 80, 120, 160, 200, 240]) {
    const target = Math.min(requested, metrics.scroll.maxAfter);
    scroller.scrollTop = target;
    await sleep(5);
    const actual = Number(win.scrollY || scroller.scrollTop || 0);
    if (Math.abs(actual - target) > 2) fail('host scroll position did not apply: requested=' + target + ' actual=' + actual);
    metrics.scroll.samples.push({ requested: target, actual });
    win.dispatchEvent(new win.Event('scroll'));
    metrics.scroll.dispatchedSignals += 1;
    await sleep(30);
  }

  metrics.afterBurst = snapshot();
  phase = 'settle';
  // Chromium can emit one natural scroll event after the first settled iframe
  // height write because scroll anchoring/layout restoration is asynchronous.
  // Allow a bounded second convergence pass before declaring the browser idle.
  await sleep(500);
  metrics.afterSettle = snapshot();
  phase = 'idle';
  await sleep(300);
  metrics.afterIdle = snapshot();
  frameObserver.disconnect();

  metrics.analysis = {
    iframeReloadObserved: metrics.events.iframeLoad > 0,
    sourceReimportObserved: metrics.events.editorInputChange > 0,
    frameHiddenChanged: metrics.events.frameHiddenMutation > 0,
    burstFrameHeightDelta: Number((metrics.afterBurst.frameHeight - metrics.initial.frameHeight).toFixed(3)),
    settledFrameHeightDelta: Number((metrics.afterSettle.frameHeight - metrics.initial.frameHeight).toFixed(3)),
    burstFrameWrites: metrics.phase.burst.frameStyleMutation,
    settleFrameWrites: metrics.phase.settle.frameStyleMutation,
    idleFrameWrites: metrics.phase.idle.frameStyleMutation,
    settledGeometryError: Number((metrics.afterSettle.frameHeight - metrics.afterSettle.expectedHeight).toFixed(3)),
    idleGeometryDrift: Number((metrics.afterIdle.frameHeight - metrics.afterSettle.frameHeight).toFixed(3)),
  };

  body.setAttribute('data-s14-production', 'true');
  resultNode.textContent = JSON.stringify(metrics);
}

appFrame.addEventListener('load', () => {
  run().catch((error) => {
    if (body.getAttribute('data-s14-production') !== 'failed') fail(error?.message || error);
  });
}, { once: true });
</script>
</body>
</html>`
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg',
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
  if (url.pathname === '/__s14-production-scroll-settle.html') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    response.end(makeProofHtml())
    return
  }
  const target = safeDistPath(url.pathname)
  if (!target || !existsSync(target) || !statSync(target).isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('not found')
    return
  }
  response.writeHead(200, { 'content-type': mimeTypes[extname(target).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' })
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
  throw new Error('S14 production scroll-settle browser acceptance could not acquire a local port.')
}

function decodeHtmlText(text) {
  return text.replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
}

let stdout = ''
let stderr = ''
try {
  const targetUrl = `http://127.0.0.1:${port}/__s14-production-scroll-settle.html`
  const args = [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required',
    '--window-size=390,844', '--virtual-time-budget=180000', '--dump-dom', targetUrl,
  ]
  const exitCode = await new Promise((resolveExit, rejectExit) => {
    const child = spawn(chrome, args, { cwd: repoRoot })
    const timeout = setTimeout(() => { child.kill('SIGKILL'); rejectExit(new Error('S14 production scroll-settle Chrome run timed out.')) }, 210000)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', (error) => { clearTimeout(timeout); rejectExit(error) })
    child.once('close', (code) => { clearTimeout(timeout); resolveExit(code) })
  })
  if (exitCode !== 0) throw new Error(`S14 production scroll-settle Chrome exit ${exitCode}: ${stderr.slice(-5000)}`)
} finally {
  await new Promise((resolveClose) => server.close(resolveClose))
}

if (!stdout.includes('data-s14-production="true"')) {
  const error = stdout.match(/data-s14-error="([^"]+)"/)?.[1] || 'completion marker missing'
  throw new Error(`S14 production scroll-settle browser acceptance failed: ${error}`)
}
const match = stdout.match(/<pre id="result">([^<]+)<\/pre>/)
if (!match) throw new Error('S14 production scroll-settle browser evidence JSON missing.')
const metrics = JSON.parse(decodeHtmlText(match[1]))

const checks = {
  scrollEstablished: metrics.scroll.samples.length === 6 && metrics.scroll.samples.at(-1).actual >= 200,
  lifecycleSafetyPreserved: !metrics.analysis.iframeReloadObserved && !metrics.analysis.sourceReimportObserved && !metrics.analysis.frameHiddenChanged,
  meaningfulGeometryChange: Math.abs(metrics.afterBurst.expectedHeight - metrics.initial.frameHeight) >= 1,
  heightStableDuringBurst: Math.abs(metrics.analysis.burstFrameHeightDelta) < 0.5,
  zeroFrameWritesDuringBurst: metrics.analysis.burstFrameWrites === 0,
  exactSettledGeometry: Math.abs(metrics.analysis.settledGeometryError) < 0.5,
  datasetMatchesSettledGeometry: Number(metrics.afterSettle.datasetHeight) === metrics.afterSettle.expectedHeight,
  boundedWritesAfterSettle: metrics.analysis.settleFrameWrites >= 1 && metrics.analysis.settleFrameWrites <= 2,
  zeroWritesWhenIdle: metrics.analysis.idleFrameWrites === 0,
  zeroGeometryDriftWhenIdle: Math.abs(metrics.analysis.idleGeometryDrift) < 0.5,
}
const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name)
const evidence = {
  documentType: 'SmoosicMobileScrollSettleProductionEvidence',
  evidenceClass: 'CHROMIUM_REAL_BROWSER_PRODUCTION_BUNDLE',
  productionBehaviorChanged: true,
  deterministicActualScrollVerified: true,
  physicalIphoneSafariVerified: false,
  metrics,
  comparison: { checks, failedChecks },
}
mkdirSync(artifactDir, { recursive: true })
writeFileSync(artifactPath, JSON.stringify(evidence, null, 2) + '\n')
if (failedChecks.length) {
  console.error(`S14 production scroll-settle browser acceptance failed checks: ${failedChecks.join(', ')}`)
  console.error(JSON.stringify(evidence, null, 2))
  process.exit(1)
}
console.log(JSON.stringify(evidence, null, 2))
