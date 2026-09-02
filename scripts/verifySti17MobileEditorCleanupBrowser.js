import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const fixtureUrl = pathToFileURL(path.join(repoRoot, 'tests', 'fixtures', 'sti17-mobile-editor-cleanup-browser-proof.html')).href
const candidates = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean)

let chrome = null
for (const candidate of candidates) {
  if (spawnSync(candidate, ['--version'], { encoding: 'utf8' }).status === 0) {
    chrome = candidate
    break
  }
}
if (!chrome) {
  console.error('STI-17 mobile editor cleanup proof failed closed: Chrome/Chromium not found.')
  process.exit(1)
}

const result = spawnSync(chrome, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--allow-file-access-from-files',
  '--window-size=390,844',
  '--virtual-time-budget=5000',
  '--dump-dom',
  fixtureUrl,
], {
  cwd: repoRoot,
  encoding: 'utf8',
  timeout: 20000,
  maxBuffer: 8 * 1024 * 1024,
})

if (result.error || result.status !== 0) {
  console.error(result.error?.message ?? result.stderr ?? `Chrome exited with ${result.status}.`)
  process.exit(1)
}

const dom = result.stdout ?? ''
const required = [
  'data-legacy-sheet-closed="true"',
  'data-legacy-sheet-hidden="true"',
  'data-keypad-status-voiceover-only="true"',
  '>PASS</div>',
]
for (const marker of required) {
  if (!dom.includes(marker)) {
    const error = dom.match(/data-error="([^"]*)"/)?.[1]
    console.error(`STI-17 mobile editor cleanup proof missing marker: ${marker}`)
    if (error) console.error(`Fixture error: ${error}`)
    process.exit(1)
  }
}

console.log('STI-17 mobile editor cleanup browser proof passed.')
