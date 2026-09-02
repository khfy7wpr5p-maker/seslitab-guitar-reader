import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const fixturePath = '/tests/fixtures/sti17-single-selection-authority-browser-proof.html'
const candidates = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean)

let chrome = null
for (const candidate of candidates) {
  if (spawnSync(candidate, ['--version'], { encoding: 'utf8' }).status === 0) {
    chrome = candidate
    break
  }
}
if (!chrome) {
  console.error('STI-17 single-selection browser proof failed closed: Chrome/Chromium not found.')
  process.exit(1)
}

for (const required of [
  path.join(repoRoot, 'public', 'st-score-runtime', 'index.html'),
  path.join(repoRoot, 'public', 'st-score-editor-core-runtime', 'st-score-editor-core.runtime.js'),
]) {
  if (!existsSync(required)) {
    console.error(`STI-17 single-selection browser proof failed closed: missing ${required}.`)
    process.exit(1)
  }
}

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.woff2', 'font/woff2'],
  ['.svg', 'image/svg+xml'],
])

function safePath(urlPath) {
  let decoded
  try { decoded = decodeURIComponent(urlPath) } catch { return null }
  const relative = decoded.replace(/^\/+/, '')
  const absolute = path.resolve(repoRoot, relative)
  if (absolute !== repoRoot && !absolute.startsWith(`${repoRoot}${path.sep}`)) return null
  return absolute
}

const server = createServer(async (request, response) => {
  try {
    const parsed = new URL(request.url ?? '/', 'http://127.0.0.1')
    let absolute = safePath(parsed.pathname)
    if (!absolute) return response.writeHead(403).end('Forbidden')
    const info = await stat(absolute).catch(() => null)
    if (info?.isDirectory()) absolute = path.join(absolute, 'index.html')
    const finalInfo = await stat(absolute).catch(() => null)
    if (!finalInfo?.isFile()) return response.writeHead(404).end('Not found')
    const body = await readFile(absolute)
    response.writeHead(200, {
      'content-type': mime.get(path.extname(absolute).toLowerCase()) ?? 'application/octet-stream',
      'cache-control': 'no-store',
    })
    response.end(body)
  } catch (error) {
    response.writeHead(500).end(String(error?.message ?? error))
  }
})

await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolve)
})
const address = server.address()
const port = typeof address === 'object' && address ? address.port : null
if (!Number.isInteger(port)) {
  server.close()
  throw new Error('STI-17 single-selection proof could not allocate a local port.')
}

const child = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--hide-scrollbars',
  '--window-size=390,844',
  '--virtual-time-budget=18000',
  '--dump-dom',
  `http://127.0.0.1:${port}${fixturePath}`,
], { stdio: ['ignore', 'pipe', 'pipe'] })

let stdout = ''
let stderr = ''
child.stdout.setEncoding('utf8')
child.stderr.setEncoding('utf8')
child.stdout.on('data', (chunk) => { stdout += chunk })
child.stderr.on('data', (chunk) => { stderr += chunk })

const exitCode = await new Promise((resolve) => {
  const timer = setTimeout(() => {
    child.kill('SIGKILL')
    resolve(124)
  }, 35000)
  child.once('exit', (code) => {
    clearTimeout(timer)
    resolve(code ?? 1)
  })
})
await new Promise((resolve) => server.close(resolve))

if (exitCode !== 0) {
  console.error(stderr || `Chrome exited with ${exitCode}.`)
  process.exit(1)
}

const required = [
  'data-initial-editor-tap-pass="true"',
  'data-legacy-authority-blocked-pass="true"',
  'data-edited-current-revision-pass="true"',
  'data-second-editor-tap-pass="true"',
  'data-keypad-ready-selection-pass="true"',
  '>PASS</div>',
]
for (const marker of required) {
  if (!stdout.includes(marker)) {
    const error = stdout.match(/data-error="([^"]*)"/)?.[1]
    console.error(`STI-17 single-selection browser proof missing marker: ${marker}`)
    if (error) console.error(`Fixture error: ${error}`)
    if (stderr) console.error(stderr)
    process.exit(1)
  }
}

console.log('STI-17 single-selection authority browser proof passed.')
