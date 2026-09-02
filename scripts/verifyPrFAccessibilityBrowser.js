import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const fixturePath = path.join(repoRoot, 'tests', 'fixtures', 'pr-f-accessibility-browser-proof.html')
const candidates = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean)

let chrome = null
for (const candidate of candidates) {
  if (spawnSync(candidate, ['--version'], { encoding: 'utf8' }).status === 0) {
    chrome = candidate
    break
  }
}
if (!chrome) {
  console.error('PR-F browser proof failed closed: Chrome/Chromium not found.')
  process.exit(1)
}

const cases = [
  { size: '320,568', viewport: 'narrow' },
  { size: '568,320', viewport: 'landscape' },
  { size: '1280,900', viewport: 'desktop' },
]

const required = [
  'data-prf-44px-pass="true"',
  'data-prf-focus-pass="true"',
  'data-prf-disabled-reason-pass="true"',
  'data-prf-viewport-pass="true"',
  'data-prf-stress-loop-pass="true"',
  'data-prf-exact-selection-loop-pass="true"',
]

for (const testCase of cases) {
  const result = spawnSync(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--allow-file-access-from-files',
    '--virtual-time-budget=20000',
    `--window-size=${testCase.size}`,
    '--dump-dom',
    pathToFileURL(fixturePath).href,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 16 * 1024 * 1024,
  })

  if (result.error || result.status !== 0) {
    console.error(result.error?.message || result.stderr?.slice(-4000) || `Chrome exit ${result.status}`)
    process.exit(1)
  }

  const dom = result.stdout || ''
  for (const marker of required) {
    if (!dom.includes(marker)) {
      const error = dom.match(/data-prf-error="([^"]*)"/)?.[1]
      console.error(`PR-F ${testCase.viewport} browser proof missing ${marker}${error ? `: ${error}` : ''}`)
      console.error(dom.slice(-7000))
      process.exit(1)
    }
  }
  const viewportMarker = `data-prf-viewport="${testCase.viewport}"`
  if (!dom.includes(viewportMarker)) {
    const error = dom.match(/data-prf-error="([^"]*)"/)?.[1]
    console.error(`PR-F viewport classification mismatch: expected ${viewportMarker}${error ? `: ${error}` : ''}`)
    console.error(dom.slice(-7000))
    process.exit(1)
  }
}

console.log(`PR-F supporting Chrome accessibility + repeated edit/rerender/undo proof PASS using ${chrome} at 320px, landscape, and desktop viewports`)
