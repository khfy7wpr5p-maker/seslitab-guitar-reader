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
  console.error('S14 failed-replacement proof failed closed: Chrome/Chromium not found.')
  process.exit(1)
}

for (const required of [
  resolve(distRoot, 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'index.html'),
]) {
  if (!existsSync(required)) {
    console.error(`S14 failed-replacement proof failed closed: missing build artifact ${required}`)
    process.exit(1)
  }
}

const validXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
  </measure></part>
</score-partwise>`

const invalidReplacementXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Empty</part-name></score-part></part-list>
  <part id="P1"><measure number="1"></measure></part>
</score-partwise>`

const proofHtml = `<!doctype html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>S14 failed replacement proof</title></head>
<body data-s14-failed-replacement="pending">
  <iframe id="app-frame" src="/index.html" style="width:390px;height:844px;border:0"></iframe>
  <pre id="status">pending</pre>
  <script>
    const validXml = ${JSON.stringify(validXml)};
    const invalidReplacementXml = ${JSON.stringify(invalidReplacementXml)};
    const body = document.body;
    const status = document.getElementById('status');
    const appFrame = document.getElementById('app-frame');
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function fail(message) {
      const text = String(message || 'unknown failure');
      body.setAttribute('data-s14-failed-replacement', 'failed');
      body.setAttribute('data-s14-failed-replacement-error', text.replace(/["<>]/g, ''));
      status.textContent = text;
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

    function assignMusicXml(win, doc, xml, fileName) {
      const input = doc.getElementById('musicxml-file-input');
      const file = new win.File([xml], fileName, { type: 'application/vnd.recordare.musicxml+xml' });
      const transfer = new win.DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new win.Event('change', { bubbles: true }));
    }

    async function run() {
      await waitFor(() => appFrame.contentDocument?.getElementById('smoosic-tab-btn'), 'app init');
      const win = appFrame.contentWindow;
      const doc = appFrame.contentDocument;

      doc.getElementById('musicxml-tab-btn').click();
      assignMusicXml(win, doc, validXml, 'accepted-source.musicxml');
      await waitFor(() => doc.getElementById('musicxml-open-btn')?.disabled === false, 'accepted source selection');
      doc.getElementById('musicxml-open-btn').click();
      await waitFor(() => String(doc.getElementById('xml-output')?.textContent || '').includes('<step>C</step>'), 'accepted source parse');

      doc.getElementById('smoosic-tab-btn').click();
      const editorFrame = await waitFor(() => doc.getElementById('smoosic-editor-frame'), 'editor iframe');
      const editorDoc = await waitFor(() => editorFrame.contentDocument?.getElementById('poc-status') ? editorFrame.contentDocument : null, 'editor document');
      await waitFor(() => String(editorDoc.getElementById('poc-status')?.textContent || '').includes('accepted-source.musicxml'), 'accepted source handoff');

      doc.getElementById('musicxml-tab-btn').click();
      assignMusicXml(win, doc, invalidReplacementXml, 'failed-replacement.musicxml');
      await waitFor(() => doc.getElementById('musicxml-open-btn')?.disabled === false, 'failed replacement selection');
      doc.getElementById('musicxml-open-btn').click();
      await waitFor(() => {
        const error = doc.getElementById('musicxml-error');
        return error && error.hidden === false && String(error.textContent || '').trim().length > 0;
      }, 'failed replacement error');
      await waitFor(() => doc.getElementById('musicxml-progress')?.hidden === true, 'failed replacement completion');

      if (!String(doc.getElementById('xml-output')?.textContent || '').includes('<step>C</step>')) {
        fail('failed replacement destroyed the last accepted MusicXML');
      }
      if (!String(doc.getElementById('musicxml-file-name')?.textContent || '').includes('failed-replacement.musicxml')) {
        fail('fixture did not exercise the stale XML + new filename condition');
      }

      doc.getElementById('smoosic-tab-btn').click();
      await waitFor(() => editorFrame.hidden === false, 'accepted editor restored after failure');
      const editorStatus = await waitFor(() => {
        const activeEditorDoc = editorFrame.contentDocument;
        const text = String(activeEditorDoc?.getElementById('poc-status')?.textContent || '');
        if (text.startsWith('Yüklendi:') && text.includes('accepted-source.musicxml')) return text;
        if (text.startsWith('Başlatma hatası:') || text.startsWith('Hata:') || text.startsWith('XML hatası:')) return text;
        return '';
      }, 'accepted source terminal load after failed replacement');
      if (!editorStatus.includes('accepted-source.musicxml')) {
        fail('Smoosic did not retain the last accepted source after replacement failure: ' + editorStatus);
      }
      if (editorStatus.includes('failed-replacement.musicxml')) {
        fail('failed replacement was incorrectly promoted into Smoosic');
      }

      body.setAttribute('data-s14-failed-replacement', 'true');
      body.setAttribute('data-s14-retained-status', editorStatus.replace(/["<>]/g, ''));
      status.textContent = 'PASS';
    }

    appFrame.addEventListener('load', () => {
      run().catch((error) => {
        if (body.getAttribute('data-s14-failed-replacement') !== 'failed') fail(error?.message || error);
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
  if (url.pathname === '/__s14-failed-replacement.html') {
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
  throw new Error('S14 failed-replacement proof could not acquire a local port.')
}

const targetUrl = `http://127.0.0.1:${port}/__s14-failed-replacement.html`
const chromeArgs = [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--autoplay-policy=no-user-gesture-required',
  '--window-size=390,844',
  '--virtual-time-budget=150000',
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
      rejectExit(new Error('S14 failed-replacement Chrome proof timed out.'))
    }, 180000)
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
  console.error(`S14 failed-replacement Chrome exit ${exitCode}: ${stderr.slice(-5000)}`)
  process.exit(1)
}

if (!stdout.includes('data-s14-failed-replacement="true"')) {
  const error = stdout.match(/data-s14-failed-replacement-error="([^"]+)"/)?.[1] || 'required marker missing'
  console.error(`S14 failed-replacement browser proof failed: ${error}`)
  console.error(stdout.slice(-10000))
  process.exit(1)
}

if (!/data-s14-retained-status="Yüklendi:[^"]*accepted-source\.musicxml/.test(stdout)) {
  console.error('S14 failed-replacement browser proof failed: accepted source status was not retained.')
  console.error(stdout.slice(-10000))
  process.exit(1)
}

console.log(`S14 failed-replacement browser proof PASS using ${chrome}: failed source was not promoted over the last accepted score.`)
