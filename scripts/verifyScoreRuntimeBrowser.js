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
    console.error(`${label}: rendered SVG evidence missing.`)
    console.error(dom.slice(-6000))
    process.exit(1)
  }
  if (!dom.includes('data-score-cursor-pass="true"') || !dom.includes('data-cursor-part-id="P1"') || !dom.includes('data-cursor-measure-index="0"')) {
    console.error(`${label}: bounded runtime cursor evidence missing.`)
    console.error(dom.slice(-6000))
    process.exit(1)
  }
}

runProof('Desktop score browser proof')
runProof('Narrow viewport score browser proof', '--window-size=390,844')
console.log(`Desktop + narrow viewport score render/cursor browser proof PASS using ${chrome}`)
