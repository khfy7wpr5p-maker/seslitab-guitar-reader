import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const fixturePath = path.join(repoRoot, 'tests', 'fixtures', 'pr-d-editor-pipeline-browser-proof.html')
const candidates = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean)

let chrome = null
for (const candidate of candidates) {
  if (spawnSync(candidate, ['--version'], { encoding: 'utf8' }).status === 0) {
    chrome = candidate
    break
  }
}
if (!chrome) {
  console.error('PR-D browser proof failed closed: Chrome/Chromium not found.')
  process.exit(1)
}

const result = spawnSync(chrome, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--allow-file-access-from-files',
  '--virtual-time-budget=12000',
  '--window-size=390,844',
  '--dump-dom',
  pathToFileURL(fixturePath).href,
], {
  cwd: repoRoot,
  encoding: 'utf8',
  timeout: 45000,
  maxBuffer: 16 * 1024 * 1024,
})

if (result.error || result.status !== 0) {
  console.error(result.error?.message || result.stderr?.slice(-4000) || `Chrome exit ${result.status}`)
  process.exit(1)
}

const dom = result.stdout || ''
const required = [
  'data-prd-runtime-rehydration-pass="true"',
  'data-prd-existing-tie-remove-pass="true"',
  'data-prd-onset-preservation-pass="true"',
  'data-prd-product-revision-pass="true"',
  'data-prd-undo-redo-pass="true"',
  'data-prd-approval-reset-pass="true"',
]
for (const marker of required) {
  if (!dom.includes(marker)) {
    const error = dom.match(/data-prd-error="([^"]*)"/)?.[1]
    console.error(`PR-D browser proof missing ${marker}${error ? `: ${error}` : ''}`)
    console.error(dom.slice(-6000))
    process.exit(1)
  }
}
console.log(`PR-D real Editor rehydration + product revision + undo/redo browser proof PASS using ${chrome}`)
