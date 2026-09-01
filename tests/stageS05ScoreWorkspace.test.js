import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

import { STAGE_S05_WORKSPACE_COPY } from '../src/stageS05ScoreWorkspaceUi.js'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const fixturePath = path.join(repoRoot, 'tests', 'fixtures', 'stage-s05-score-workspace-browser-proof.html')

function findChrome() {
  for (const candidate of [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean)) {
    if (spawnSync(candidate, ['--version'], { encoding: 'utf8' }).status === 0) return candidate
  }
  return null
}

function runBrowser(chrome, viewport) {
  const result = spawnSync(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--allow-file-access-from-files', '--virtual-time-budget=4000', `--window-size=${viewport}`,
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

test('S05 stays presentation-only and reuses the existing score-view authority', () => {
  const source = readFileSync(new URL('../src/stageS05ScoreWorkspaceUi.js', import.meta.url), 'utf8')
  const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8')

  assert.equal(STAGE_S05_WORKSPACE_COPY.heading, 'Nota Çalışma Alanı')
  assert.equal(STAGE_S05_WORKSPACE_COPY.inspectorHeading, 'Nota İncelemesi')
  assert.match(source, /activateScoreView, ensureScoreViewPanel/)
  assert.match(source, /legacyButton\?\.remove/)
  assert.match(source, /stage-s05-score-inspector/)
  assert.match(source, /restoreResultTabs/)
  assert.doesNotMatch(source, /parseMusicXml|DOMParser|hitTestScoreNote|resolveCanonicalNoteFromScoreRef|renderScoreView\s*\(|getUserMedia|AudioContext/)
  assert.doesNotMatch(source, /qualityGate|stageGProductRouting|stageIInstrumentProduct|teacherWorkspaceModel|Audiveris|OmrProvider|gatewayProvider|fetch\s*\(|XMLHttpRequest|WebSocket/)
  assert.doesNotMatch(source, /\.textContent\s*=\s*musicxml|xmlOutput\.textContent\s*=/)
  assert.match(main, /stageS05ScoreWorkspace\.css/)
  assert.match(main, /initStageS05ScoreWorkspaceUi/)
})

test('S05 workspace is responsive and has no separate Nota Görünümü result tab', () => {
  const css = readFileSync(new URL('../src/stageS05ScoreWorkspace.css', import.meta.url), 'utf8')
  const source = readFileSync(new URL('../src/stageS05ScoreWorkspaceUi.js', import.meta.url), 'utf8')
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(220px, 300px\)/)
  assert.match(css, /@media \(max-width: 760px\)/)
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\)/)
  assert.doesNotMatch(source, /textContent\s*=\s*['"]Nota Görünümü['"]/)
})

test('S05 real Chrome proof covers desktop and 390px workspace behavior', (t) => {
  const chrome = findChrome()
  if (!chrome) {
    t.skip('Chrome/Chromium not available in this environment')
    return
  }

  for (const viewport of ['1280,900', '390,844']) {
    const html = runBrowser(chrome, viewport)
    assert.match(html, /data-stage-s05-workspace-pass="true"/)
    assert.match(html, /data-stage-s05-auto-score-pass="true"/)
    assert.match(html, /data-stage-s05-tab-preservation-pass="true"/)
    assert.match(html, /data-stage-s05-layout-pass="true"/)
  }
})
