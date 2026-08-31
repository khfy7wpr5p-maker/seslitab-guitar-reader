import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

import { STAGE_S04_TUNER_COPY } from '../src/stageS04MiniTunerUi.js'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const fixturePath = path.join(repoRoot, 'tests', 'fixtures', 'stage-s04-mini-tuner-browser-proof.html')

function findChrome() {
  for (const candidate of [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean)) {
    if (spawnSync(candidate, ['--version'], { encoding: 'utf8' }).status === 0) return candidate
  }
  return null
}

function runBrowser(chrome, viewport) {
  const result = spawnSync(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--allow-file-access-from-files', '--virtual-time-budget=5000', `--window-size=${viewport}`,
    '--dump-dom', pathToFileURL(fixturePath).href,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 8 * 1024 * 1024,
  })
  assert.equal(result.status, 0, result.error?.message || result.stderr)
  return result.stdout || ''
}

test('S04 stays presentation-only and preserves explicit microphone authority', () => {
  const source = readFileSync(new URL('../src/stageS04MiniTunerUi.js', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/stageS04MiniTuner.css', import.meta.url), 'utf8')
  const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8')

  assert.equal(STAGE_S04_TUNER_COPY.toggleOpen, 'Akort cihazını aç')
  assert.doesNotMatch(source, /AudioContext|analyzeChromaticTunerFrame|frequencyToChromaticPitch|evaluateTuningCents|requestAnimationFrame|fetch\s*\(|XMLHttpRequest|WebSocket/)
  assert.doesNotMatch(source, /start\.click\s*\(/)
  assert.match(source, /tuner-start-btn/)
  assert.match(source, /tuner-stop-btn/)
  assert.match(source, /MutationObserver/)
  assert.match(source, /start\.disabled === true && stop\.disabled === true/)
  assert.match(source, /stop\.click/)
  assert.match(source, /panel\.hidden/)
  assert.match(css, /width:\s*48px/)
  assert.match(css, /height:\s*48px/)
  assert.match(css, /position:\s*fixed/)
  assert.match(main, /stageS04MiniTuner\.css/)
  assert.match(main, /initStageS04MiniTunerUi/)
  assert.ok(main.indexOf('initStageKTunerPresentation(document)') < main.indexOf('initStageS04MiniTunerUi(document)'))
})

test('S04 real Chrome proof covers desktop/mobile and pending microphone close safety', (t) => {
  const chrome = findChrome()
  if (!chrome) {
    t.skip('Chrome/Chromium not available in this environment')
    return
  }

  const desktop = runBrowser(chrome, '1280,900')
  assert.match(desktop, /data-stage-s04-layout-pass="true"/)
  assert.match(desktop, /data-stage-s04-desktop-pass="true"/)
  assert.match(desktop, /data-stage-s04-local-audio-pass="true"/)
  assert.match(desktop, /data-stage-s04-no-auto-mic-pass="true"/)
  assert.match(desktop, /data-stage-s04-pending-close-pass="true"/)

  const mobile = runBrowser(chrome, '390,844')
  assert.match(mobile, /data-stage-s04-layout-pass="true"/)
  assert.match(mobile, /data-stage-s04-mobile-pass="true"/)
  assert.match(mobile, /data-stage-s04-local-audio-pass="true"/)
  assert.match(mobile, /data-stage-s04-no-auto-mic-pass="true"/)
  assert.match(mobile, /data-stage-s04-pending-close-pass="true"/)
})
