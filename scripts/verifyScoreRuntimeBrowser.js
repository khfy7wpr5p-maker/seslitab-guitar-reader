import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const fixturePath = path.join(repoRoot, 'tests', 'fixtures', 'score-runtime-browser-proof.html')
const candidates = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean)

let chrome
for (const candidate of candidates) {
  const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' })
  if (probe.status === 0) {
    chrome = candidate
    break
  }
}

if (!chrome) {
  console.error('Score browser proof failed closed: Chrome/Chromium not found.')
  process.exit(1)
}

function fail(label, message, dom) {
  console.error(`${label}: ${message}`)
  const error = dom.match(/data-render-error="([^"]*)"/)
  if (error) console.error(`SCORE_BROWSER_ERROR: ${error[1]}`)
  else console.error(dom.slice(-6000))
  process.exit(1)
}

function runProof(label, viewportArg = null) {
  const args = [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--allow-file-access-from-files', '--virtual-time-budget=12000', '--dump-dom',
  ]
  if (viewportArg) args.push(viewportArg)
  args.push(pathToFileURL(fixturePath).href)

  const result = spawnSync(chrome, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 45000,
    maxBuffer: 16 * 1024 * 1024,
  })

  if (result.error || result.status !== 0) {
    console.error(`${label}: ${result.error?.message || result.stderr?.slice(-4000) || `Chrome exit ${result.status}`}`)
    process.exit(1)
  }

  const dom = result.stdout || ''
  if (!dom.includes('data-score-render-pass="true"') || !dom.includes('<svg')) {
    fail(label, 'rendered SVG evidence missing.', dom)
  }
  if (!dom.includes('data-score-cursor-pass="true"') || !dom.includes('data-cursor-part-id="P1"') || !dom.includes('data-cursor-measure-index="0"')) {
    fail(label, 'bounded runtime cursor evidence missing.', dom)
  }
  if (!dom.includes('data-score-note-hit-pass="true"') || !dom.includes('data-note-part-id="P1"') || !dom.includes('data-note-measure-index="0"') || !dom.includes('data-note-voice="1"')) {
    fail(label, 'exact rendered-note hit-test evidence missing.', dom)
  }
  if (!dom.includes('data-score-note-resolver-pass="true"') || !/data-canonical-note-index="[0-9]+"/.test(dom)) {
    fail(label, 'SesliTab canonical note resolver evidence missing.', dom)
  }
  if (!dom.includes('data-score-note-highlight-pass="true"') || !dom.includes('data-st-score-highlight="true"') || !dom.includes('seslitab-note-focus')) {
    fail(label, 'exact renderer note highlight evidence missing.', dom)
  }
}

runProof('Desktop score browser proof')
runProof('Narrow viewport score browser proof', '--window-size=390,844')
console.log(`Desktop + narrow viewport score render/cursor/hit-test/canonical-resolver/highlight proof PASS using ${chrome}`)
