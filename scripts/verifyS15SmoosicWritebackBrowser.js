import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'

const repoRoot = resolve('.')
const distRoot = resolve(repoRoot, 'dist')
const fixturePath = resolve(repoRoot, 'tests', 'fixtures', 's15-smoosic-writeback-browser-proof.html')
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

for (const required of [
  resolve(distRoot, 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'build', 'mobile.js'),
  fixturePath,
]) {
  if (!existsSync(required)) {
    console.error(`S15 write-back proof failed closed: missing required file ${required}`)
    process.exit(1)
  }
}

const proofHtml = readFileSync(fixturePath, 'utf8')

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
  if (url.pathname === '/__s15-writeback.html') {
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
  throw new Error('S15 write-back proof could not acquire a local port.')
}

const targetUrl = `http://127.0.0.1:${port}/__s15-writeback.html`
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
      rejectExit(new Error('S15 write-back Chrome proof timed out.'))
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
  console.error(`S15 write-back Chrome exit ${exitCode}: ${stderr.slice(-5000)}`)
  process.exit(1)
}

const requiredMarkers = [
  'data-s15-writeback="true"',
  'data-s15-supported-edit="true"',
  'data-s15-consumers-refreshed="true"',
  'data-s15-stale-writeback-rejected="true"',
  'data-s15-editor-usable="true"',
]

for (const marker of requiredMarkers) {
  if (!stdout.includes(marker)) {
    const error = stdout.match(/data-s15-writeback-error="([^"]+)"/)?.[1]
      || `required marker missing: ${marker}`
    console.error(`S15 write-back browser proof failed: ${error}`)
    console.error(stdout.slice(-16000))
    process.exit(1)
  }
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

console.log(`S15 Smoosic write-back browser proof PASS using ${chrome}: supported edit committed, consumers refreshed, stale response rejected, editor remained usable.`)
