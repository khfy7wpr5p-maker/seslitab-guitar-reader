import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const fixturePath = path.join(repoRoot, 'tests', 'fixtures', 'score-runtime-browser-proof.html')
const stageFFixturePath = path.join(repoRoot, 'tests', 'fixtures', 'stage-f-corrected-musicxml-browser-proof.html')
const stageFDurationFixturePath = path.join(repoRoot, 'tests', 'fixtures', 'stage-f-duration-hit-test-browser-proof.html')
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

function runChrome(label, targetPath, viewportArg = null) {
  const args = [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--allow-file-access-from-files', '--virtual-time-budget=12000', '--dump-dom',
  ]
  if (viewportArg) args.push(viewportArg)
  args.push(pathToFileURL(targetPath).href)

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
  return result.stdout || ''
}

function runProof(label, viewportArg = null) {
  const dom = runChrome(label, fixturePath, viewportArg)
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

function runStageFCorrectedMusicXmlProof() {
  const label = 'Stage F corrected MusicXML browser proof'
  const dom = runChrome(label, stageFFixturePath)
  if (!dom.includes('data-stage-f-materialize-pass="true"')) {
    fail(label, 'corrected MusicXML materialization evidence missing.', dom)
  }
  if (!dom.includes('data-stage-f-reparse-pass="true"') || !dom.includes('data-source-root-immutable="true"')) {
    fail(label, 'corrected MusicXML reparse/root-immutability evidence missing.', dom)
  }
  if (!dom.includes('data-stage-f-double-flat-pass="true"')) {
    fail(label, 'MusicXML flat-flat accidental evidence missing.', dom)
  }
  if (!/data-corrected-musicxml-fingerprint="corrected-musicxml-fnv1a64-v1:[^"]+"/.test(dom)) {
    fail(label, 'corrected MusicXML fingerprint evidence missing.', dom)
  }
}

function runStageFDurationHitProof() {
  const label = 'Stage F duration corrected hit-test browser proof'
  const dom = runChrome(label, stageFDurationFixturePath)
  if (!dom.includes('data-stage-f-duration-pass="true"') || !dom.includes('data-corrected-second-start-beat="0.5"')) {
    fail(label, 'corrected duration timeline evidence missing.', dom)
  }
  if (!dom.includes('data-stage-f-duration-render-pass="true"') || !dom.includes('<svg')) {
    fail(label, 'corrected duration renderer evidence missing.', dom)
  }
  if (!dom.includes('data-stage-f-duration-hit-pass="true"')) {
    fail(label, 'corrected duration exact hit-test/resolver evidence missing.', dom)
  }
}

runProof('Desktop score browser proof')
runProof('Narrow viewport score browser proof', '--window-size=390,844')
runStageFCorrectedMusicXmlProof()
runStageFDurationHitProof()
console.log(`Desktop + narrow viewport score runtime, corrected MusicXML, and Stage F duration hit-test browser proofs PASS using ${chrome}`)
