import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const fixturePath = '/tests/fixtures/sti17-cross-realm-iframe-browser-proof.html'
const candidates = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean)

let chrome = null
for (const candidate of candidates) {
  if (spawnSync(candidate, ['--version'], { encoding: 'utf8' }).status === 0) {
    chrome = candidate
    break
  }
}
if (!chrome) {
  console.error('STI-17 cross-realm browser proof failed closed: Chrome/Chromium not found.')
  process.exit(1)
}

const runtimeIndex = path.join(repoRoot, 'public', 'st-score-runtime', 'index.html')
if (!existsSync(runtimeIndex)) {
  console.error('STI-17 cross-realm browser proof failed closed: prepared renderer runtime is missing.')
  process.exit(1)
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
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  const relative = decoded.replace(/^\/+/, '')
  const absolute = path.resolve(repoRoot, relative)
  if (absolute !== repoRoot && !absolute.startsWith(`${repoRoot}${path.sep}`)) return null
  return absolute
}

const server = createServer(async (request, response) => {
  try {
    const parsed = new URL(request.url ?? '/', 'http://127.0.0.1')
    let absolute = safePath(parsed.pathname)
    if (!absolute) {
      response.writeHead(403).end('Forbidden')
      return
    }
    const info = await stat(absolute).catch(() => null)
    if (info?.isDirectory()) absolute = path.join(absolute, 'index.html')
    const finalInfo = await stat(absolute).catch(() => null)
    if (!finalInfo?.isFile()) {
      response.writeHead(404).end('Not found')
      return
    }
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
  throw new Error('STI-17 browser proof could not allocate a local port.')
}
const url = `http://127.0.0.1:${port}${fixturePath}`

const args = [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--hide-scrollbars',
  '--virtual-time-budget=12000',
  '--dump-dom',
  url,
]

const child = spawn(chrome, args, { stdio: ['ignore', 'pipe', 'pipe'] })
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
  }, 30000)
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
  'data-sti17-iframe-render-pass="true"',
  'data-sti17-iframe-hit-pass="true"',
  'data-sti17-iframe-outbound-pass="true"',
  'data-sti17-iframe-highlight-pass="true"',
  '>PASS</div>',
]
for (const marker of required) {
  if (!stdout.includes(marker)) {
    const errorMatch = stdout.match(/data-render-error="([^"]*)"/)
    console.error(`STI-17 cross-realm browser proof missing marker: ${marker}`)
    if (errorMatch) console.error(`Fixture error: ${errorMatch[1]}`)
    if (stderr) console.error(stderr)
    process.exit(1)
  }
}

console.log('STI-17 cross-realm iframe browser proof passed.')
