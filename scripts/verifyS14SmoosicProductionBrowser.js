import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'

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
  console.error('S14 browser proof failed closed: Chrome/Chromium not found.')
  process.exit(1)
}

for (const required of [
  resolve(distRoot, 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'build', 'mobile.js'),
]) {
  if (!existsSync(required)) {
    console.error(`S14 browser proof failed closed: missing build artifact ${required}`)
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

const proofHtml = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>S14 Browser Proof</title>
</head>
<body data-s14-proof="pending">
  <iframe id="app-frame" title="SesliTab" src="/index.html" style="width:390px;height:844px;border:0"></iframe>
  <pre id="proof-status">pending</pre>
  <script>
    const fixtureXml = ${JSON.stringify(fixtureXml)};
    const fixtureXmlTwo = ${JSON.stringify(fixtureXmlTwo)};
    const proofBody = document.body;
    const proofStatus = document.getElementById('proof-status');
    const appFrame = document.getElementById('app-frame');
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function mark(name) {
      proofBody.setAttribute(name, 'true');
    }

    function fail(message) {
      const text = String(message || 'unknown failure');
      proofBody.setAttribute('data-s14-proof', 'failed');
      proofBody.setAttribute('data-s14-error', text.replace(/["<>]/g, ''));
      proofStatus.textContent = text;
      throw new Error(text);
    }

    async function waitFor(check, label, timeout = 90000) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        try {
          const result = check();
          if (result) return result;
        } catch {}
        await sleep(100);
      }
      fail('timeout: ' + label);
    }

    function assignMusicXml(win, doc, xml, fileName) {
      const fileInput = doc.getElementById('musicxml-file-input');
      const file = new win.File([xml], fileName, {
        type: 'application/vnd.recordare.musicxml+xml',
      });
      const transfer = new win.DataTransfer();
      transfer.items.add(file);
      fileInput.files = transfer.files;
      fileInput.dispatchEvent(new win.Event('change', { bubbles: true }));
    }

    async function run() {
      await waitFor(() => appFrame.contentDocument?.getElementById('smoosic-tab-btn'), 'S14 tab init');
      const win = appFrame.contentWindow;
      const doc = appFrame.contentDocument;

      const labels = [...doc.querySelectorAll('.input-tab-btn')].map((node) => node.textContent.trim());
      const expected = ['PDF', 'MusicXML', 'TAB', 'Nota Düzenle'];
      if (labels.length !== expected.length || expected.some((label, index) => labels[index] !== label)) {
        fail('unexpected input tabs: ' + labels.join('|'));
      }
      if (labels.includes('Nota Ara')) fail('retired Nota Ara tab is present');
      mark('data-s14-tabs-pass');

      if (!doc.getElementById('seslitab-app-shell') || !doc.getElementById('discovery-query') || !doc.getElementById('discovery-search-btn')) {
        fail('top Eser veya sanatçı search is missing');
      }
      if (doc.getElementById('discovery-tab-btn')) fail('separate discovery/Nota Ara tab is still present');
      mark('data-s14-search-pass');

      if (doc.getElementById('smoosic-editor-frame')) fail('Smoosic loaded before Nota Düzenle activation');
      mark('data-s14-lazy-pass');

      const retiredIds = [
        'teacher-tab-btn',
        'tab-teacher',
        'stage-s05-score-workspace',
        'stage-s07-inline-teacher-inspector',
        'stage-s08-score-quality',
        'stage-s10-educational-chords',
        'stage-s11-workflow-details',
        'stage-s12-note-tools',
        'stage-i-instrument-products',
        'stage-l-share-panel',
        'stage-pr-d-keypad',
      ];
      const retiredPresent = retiredIds.filter((id) => doc.getElementById(id));
      if (retiredPresent.length) fail('retired surfaces present: ' + retiredPresent.join(','));
      mark('data-s14-retired-pass');

      await waitFor(() => doc.getElementById('result-guitar-tab-btn') && doc.getElementById('result-violin-btn'), 'Gitar TAB/Keman tabs');
      if (doc.getElementById('result-guitar-tab-btn').textContent.trim() !== 'Gitar TAB') fail('Gitar TAB result tab missing');
      if (doc.getElementById('result-violin-btn').textContent.trim() !== 'Keman') fail('Keman result tab missing');
      mark('data-s14-products-pass');

      doc.getElementById('musicxml-tab-btn').click();
      assignMusicXml(win, doc, fixtureXml, 's14-browser-fixture.musicxml');
      await waitFor(() => doc.getElementById('musicxml-open-btn')?.disabled === false, 'MusicXML selection');
      doc.getElementById('musicxml-open-btn').click();
      await waitFor(() => String(doc.getElementById('xml-output')?.textContent || '').includes('<step>C</step>'), 'main MusicXML parse');
      if (!String(doc.getElementById('musicxml-file-name')?.textContent || '').includes('s14-browser-fixture.musicxml')) {
        fail('MusicXML source filename was not preserved');
      }
      mark('data-s14-main-musicxml-pass');

      doc.getElementById('smoosic-tab-btn').click();
      const editorFrame = await waitFor(() => doc.getElementById('smoosic-editor-frame'), 'lazy Smoosic iframe');
      await waitFor(() => editorFrame.getAttribute('src') === '/smoosic-editor/index.html', 'same-origin Smoosic src');
      mark('data-s14-same-origin-pass');

      const editorDoc = await waitFor(
        () => editorFrame.contentDocument?.getElementById('poc-status') ? editorFrame.contentDocument : null,
        'Smoosic document',
      );
      await waitFor(() => {
        const text = String(editorDoc.getElementById('poc-status')?.textContent || '');
        if (text.startsWith('Başlatma hatası:') || text.startsWith('Hata:') || text.startsWith('XML hatası:')) fail(text);
        return text.startsWith('Yüklendi:') && text.includes('s14-browser-fixture.musicxml');
      }, 'first MusicXML handoff to Smoosic', 120000);

      const firstEditorStatus = String(editorDoc.getElementById('poc-status')?.textContent || '');
      if (!firstEditorStatus.includes('s14-browser-fixture.musicxml')) fail('Smoosic did not load the first MusicXML source');
      if (!editorDoc.getElementById('mobile-xml-input') || !editorDoc.getElementById('mobile-xml-export')) {
        fail('Smoosic editor controls missing');
      }
      if (editorDoc.getElementById('mobile-corpus-input') || editorDoc.getElementById('mobile-corpus-run')) {
        fail('Corpus development UI leaked into production');
      }
      mark('data-s14-handoff-pass');

      // Reproduce the production bug: leave the already-created Smoosic iframe,
      // load a second source, then return to Nota Düzenle. The same iframe must
      // refresh to the second source instead of keeping the first score.
      doc.getElementById('musicxml-tab-btn').click();
      assignMusicXml(win, doc, fixtureXmlTwo, 's14-browser-fixture-2.musicxml');
      await waitFor(() => doc.getElementById('musicxml-open-btn')?.disabled === false, 'second MusicXML selection');
      doc.getElementById('musicxml-open-btn').click();
      await waitFor(() => {
        const xml = String(doc.getElementById('xml-output')?.textContent || '');
        const name = String(doc.getElementById('musicxml-file-name')?.textContent || '');
        return xml.includes('<step>G</step>') && name.includes('s14-browser-fixture-2.musicxml');
      }, 'second main MusicXML parse');

      await waitFor(() => {
        const text = String(editorDoc.getElementById('poc-status')?.textContent || '');
        if (text.startsWith('Başlatma hatası:') || text.startsWith('Hata:') || text.startsWith('XML hatası:')) fail(text);
        return text.startsWith('Yüklendi:') && text.includes('s14-browser-fixture-2.musicxml');
      }, 'automatic second-source refresh in Smoosic', 120000);

      doc.getElementById('smoosic-tab-btn').click();
      await waitFor(() => editorFrame.hidden === false, 'second source editor visibility');
      const secondEditorStatus = String(editorDoc.getElementById('poc-status')?.textContent || '');
      if (!secondEditorStatus.includes('s14-browser-fixture-2.musicxml')) {
        fail('Smoosic kept the stale first source after the second upload');
      }
      mark('data-s14-second-source-pass');

      const frameRect = editorFrame.getBoundingClientRect();
      if (frameRect.width > doc.documentElement.clientWidth + 2) {
        fail('Smoosic host iframe overflows mobile viewport');
      }
      mark('data-s14-mobile-pass');

      proofBody.setAttribute('data-s14-editor-status', secondEditorStatus.replace(/["<>]/g, ''));
      proofBody.setAttribute('data-s14-proof', 'true');
      proofStatus.textContent = 'PASS';
    }

    appFrame.addEventListener('load', () => {
      run().catch((error) => {
        if (proofBody.getAttribute('data-s14-proof') !== 'failed') fail(error?.message || error);
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
  if (url.pathname === '/__s14-proof.html') {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    })
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
  throw new Error('S14 browser proof could not acquire a local port.')
}

const targetUrl = `http://127.0.0.1:${port}/__s14-proof.html`
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
      rejectExit(new Error('S14 production Chrome proof timed out.'))
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
  console.error(`S14 production browser proof Chrome exit ${exitCode}: ${stderr.slice(-5000)}`)
  process.exit(1)
}

const requiredMarkers = [
  'data-s14-tabs-pass="true"',
  'data-s14-search-pass="true"',
  'data-s14-lazy-pass="true"',
  'data-s14-retired-pass="true"',
  'data-s14-products-pass="true"',
  'data-s14-main-musicxml-pass="true"',
  'data-s14-same-origin-pass="true"',
  'data-s14-handoff-pass="true"',
  'data-s14-second-source-pass="true"',
  'data-s14-mobile-pass="true"',
  'data-s14-proof="true"',
]

for (const marker of requiredMarkers) {
  if (!stdout.includes(marker)) {
    const error = stdout.match(/data-s14-error="([^"]+)"/)?.[1] || 'required marker missing'
    console.error(`S14 production browser proof failed: ${marker} — ${error}`)
    console.error(stdout.slice(-10000))
    process.exit(1)
  }
}

if (!/data-s14-editor-status="Yüklendi:[^"]*s14-browser-fixture-2\.musicxml/.test(stdout)) {
  console.error('S14 production browser proof failed: second MusicXML load status missing.')
  console.error(stdout.slice(-10000))
  process.exit(1)
}

console.log(`S14 production browser proof PASS using ${chrome}: top search + clean shell + lazy same-origin Smoosic + sequential MusicXML source refresh.`)
