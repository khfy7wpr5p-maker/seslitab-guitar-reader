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
  console.error('S14 source lifecycle proof failed closed: Chrome/Chromium not found.')
  process.exit(1)
}

for (const required of [
  resolve(distRoot, 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'index.html'),
]) {
  if (!existsSync(required)) {
    console.error(`S14 source lifecycle proof failed closed: missing build artifact ${required}`)
    process.exit(1)
  }
}

function scoreXml(step, title) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>${title}</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
    <note><pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
  </measure></part>
</score-partwise>`
}

const musicXmlA = scoreXml('C', 'MusicXML A')
const musicXmlC = scoreXml('E', 'MusicXML C')
const pdfXmlA = scoreXml('F', 'PDF A')
const pdfXmlB = scoreXml('G', 'PDF B')
const pdfXmlD = scoreXml('B', 'PDF D')
const invalidMusicXmlB = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Empty</part-name></score-part></part-list>
  <part id="P1"><measure number="1"></measure></part>
</score-partwise>`

const proofHtml = `<!doctype html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>S14 source lifecycle acceptance</title></head>
<body data-s14-source-lifecycle="pending">
  <iframe id="app-frame" src="/index.html" style="width:390px;height:844px;border:0"></iframe>
  <pre id="status">pending</pre>
  <script>
    const musicXmlA = ${JSON.stringify(musicXmlA)};
    const musicXmlC = ${JSON.stringify(musicXmlC)};
    const pdfXmlA = ${JSON.stringify(pdfXmlA)};
    const pdfXmlB = ${JSON.stringify(pdfXmlB)};
    const pdfXmlD = ${JSON.stringify(pdfXmlD)};
    const invalidMusicXmlB = ${JSON.stringify(invalidMusicXmlB)};
    const body = document.body;
    const status = document.getElementById('status');
    const appFrame = document.getElementById('app-frame');
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function fail(message) {
      const text = String(message || 'unknown failure');
      body.setAttribute('data-s14-source-lifecycle', 'failed');
      body.setAttribute('data-s14-source-lifecycle-error', text.replace(/["<>]/g, ''));
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

    function assignPdf(win, doc, fileName) {
      const input = doc.getElementById('file-input');
      const file = new win.File(['%PDF-1.4\\n%%EOF'], fileName, { type: 'application/pdf' });
      const transfer = new win.DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new win.Event('change', { bubbles: true }));
    }

    async function openMusicXml(win, doc, xml, fileName, expectedStep) {
      doc.getElementById('musicxml-tab-btn').click();
      assignMusicXml(win, doc, xml, fileName);
      await waitFor(() => doc.getElementById('musicxml-open-btn')?.disabled === false, fileName + ' selection');
      doc.getElementById('musicxml-open-btn').click();
      await waitFor(() => {
        const output = String(doc.getElementById('xml-output')?.textContent || '');
        const name = String(doc.getElementById('musicxml-file-name')?.textContent || '');
        return output.includes('<step>' + expectedStep + '</step>') && name.includes(fileName);
      }, fileName + ' parse');
    }

    async function waitEditorLoaded(editorDoc, fileName, label) {
      const result = await waitFor(() => {
        const text = String(editorDoc.getElementById('poc-status')?.textContent || '');
        if (text.startsWith('Yüklendi:') && text.includes(fileName)) return text;
        if (text.startsWith('Başlatma hatası:') || text.startsWith('Hata:') || text.startsWith('XML hatası:')) return '__ERROR__' + text;
        return '';
      }, label, 120000);
      if (result.startsWith('__ERROR__')) fail(result.slice('__ERROR__'.length));
      return result;
    }

    async function beginPdfTransition(win, doc, editorFrame, pdfName) {
      doc.getElementById('pdf-tab-btn').click();
      assignPdf(win, doc, pdfName);
      await waitFor(() => String(doc.getElementById('file-name')?.textContent || '') === pdfName, pdfName + ' real selection');
      doc.getElementById('progress-container').hidden = false;
      await waitFor(() => editorFrame.hidden === true, pdfName + ' pending hides stale editor');
    }

    function completePdfSuccess(doc, xml) {
      doc.getElementById('results-section').hidden = false;
      doc.getElementById('xml-output').textContent = xml;
      doc.getElementById('progress-container').hidden = true;
    }

    async function run() {
      await waitFor(() => appFrame.contentDocument?.getElementById('smoosic-tab-btn'), 'app init');
      const win = appFrame.contentWindow;
      const doc = appFrame.contentDocument;

      // MusicXML: A success -> B failure -> C success.
      await openMusicXml(win, doc, musicXmlA, 'source-a.musicxml', 'C');
      doc.getElementById('smoosic-tab-btn').click();
      const editorFrame = await waitFor(() => doc.getElementById('smoosic-editor-frame'), 'editor iframe');
      const editorDoc = await waitFor(() => editorFrame.contentDocument?.getElementById('poc-status') ? editorFrame.contentDocument : null, 'editor document');
      await waitEditorLoaded(editorDoc, 'source-a.musicxml', 'MusicXML A handoff');
      await waitFor(() => {
        const hostStatus = doc.getElementById('smoosic-editor-host-status');
        return hostStatus
          && hostStatus.hidden === true
          && String(hostStatus.textContent || '').trim() === ''
          && hostStatus.dataset.kind === 'ready';
      }, 'MusicXML A host sync settled');

      doc.getElementById('musicxml-tab-btn').click();
      assignMusicXml(win, doc, invalidMusicXmlB, 'source-b-invalid.musicxml');
      await waitFor(() => doc.getElementById('musicxml-open-btn')?.disabled === false, 'MusicXML B selection');
      doc.getElementById('musicxml-open-btn').click();
      await waitFor(() => {
        const error = doc.getElementById('musicxml-error');
        return error && error.hidden === false && String(error.textContent || '').trim().length > 0;
      }, 'MusicXML B parse failure');
      await waitFor(() => doc.getElementById('musicxml-progress')?.hidden === true, 'MusicXML B failure completion');

      doc.getElementById('smoosic-tab-btn').click();
      await waitFor(() => editorFrame.hidden === false, 'A restored after B failure');
      const afterFailure = await waitEditorLoaded(editorDoc, 'source-a.musicxml', 'MusicXML A restored after B failure');
      if (afterFailure.includes('source-b-invalid.musicxml')) fail('MusicXML B failure was promoted as a successful source');

      await openMusicXml(win, doc, musicXmlC, 'source-c.musicxml', 'E');
      await waitEditorLoaded(editorDoc, 'source-c.musicxml', 'MusicXML C automatic refresh');
      body.setAttribute('data-s14-musicxml-abc-pass', 'true');

      // PDF host lifecycle proof without touching or mocking the OMR provider.
      // The real PDF file-input selection path is used so stale MusicXML filename
      // state remains present exactly as it does in production; only the OMR
      // completion DOM contract is driven locally.
      await beginPdfTransition(win, doc, editorFrame, 'pdf-a.pdf');
      completePdfSuccess(doc, pdfXmlA);
      await waitEditorLoaded(editorDoc, 'pdf-a.pdf.musicxml', 'PDF A success refresh');

      await beginPdfTransition(win, doc, editorFrame, 'pdf-b.pdf');
      completePdfSuccess(doc, pdfXmlB);
      await waitEditorLoaded(editorDoc, 'pdf-b.pdf.musicxml', 'PDF B success refresh');
      body.setAttribute('data-s14-pdf-sequential-pass', 'true');

      await beginPdfTransition(win, doc, editorFrame, 'pdf-c-failed.pdf');
      doc.getElementById('progress-container').hidden = true;
      await waitFor(() => editorFrame.hidden === false, 'PDF C failure restores last accepted editor');
      const afterPdfFailure = await waitEditorLoaded(editorDoc, 'pdf-b.pdf.musicxml', 'PDF B retained after PDF C failure');
      if (afterPdfFailure.includes('pdf-c-failed.pdf')) fail('Failed PDF was promoted as a successful source');
      body.setAttribute('data-s14-pdf-failure-pass', 'true');

      await beginPdfTransition(win, doc, editorFrame, 'pdf-d.pdf');
      completePdfSuccess(doc, pdfXmlD);
      const finalStatus = await waitEditorLoaded(editorDoc, 'pdf-d.pdf.musicxml', 'PDF D recovery refresh');
      body.setAttribute('data-s14-pdf-recovery-pass', 'true');
      body.setAttribute('data-s14-final-editor-status', finalStatus.replace(/["<>]/g, ''));

      body.setAttribute('data-s14-source-lifecycle', 'true');
      status.textContent = 'PASS';
    }

    appFrame.addEventListener('load', () => {
      run().catch((error) => {
        if (body.getAttribute('data-s14-source-lifecycle') !== 'failed') fail(error?.message || error);
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
  if (url.pathname === '/__s14-source-lifecycle.html') {
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
  throw new Error('S14 source lifecycle proof could not acquire a local port.')
}

const targetUrl = `http://127.0.0.1:${port}/__s14-source-lifecycle.html`
const chromeArgs = [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--autoplay-policy=no-user-gesture-required',
  '--window-size=390,844',
  '--virtual-time-budget=210000',
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
      rejectExit(new Error('S14 source lifecycle Chrome proof timed out.'))
    }, 240000)
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
  console.error(`S14 source lifecycle Chrome exit ${exitCode}: ${stderr.slice(-5000)}`)
  process.exit(1)
}

const requiredMarkers = [
  'data-s14-musicxml-abc-pass="true"',
  'data-s14-pdf-sequential-pass="true"',
  'data-s14-pdf-failure-pass="true"',
  'data-s14-pdf-recovery-pass="true"',
  'data-s14-source-lifecycle="true"',
]
for (const marker of requiredMarkers) {
  if (!stdout.includes(marker)) {
    const error = stdout.match(/data-s14-source-lifecycle-error="([^"]+)"/)?.[1] || `required marker missing: ${marker}`
    console.error(`S14 source lifecycle browser proof failed: ${error}`)
    console.error(stdout.slice(-12000))
    process.exit(1)
  }
}

if (!/data-s14-final-editor-status="Yüklendi:[^"]*pdf-d\.pdf\.musicxml/.test(stdout)) {
  console.error('S14 source lifecycle browser proof failed: final PDF recovery source missing.')
  console.error(stdout.slice(-12000))
  process.exit(1)
}

console.log(`S14 source lifecycle browser proof PASS using ${chrome}: MusicXML A->B failure->C and PDF success/failure/recovery invariants hold.`)
