import { runBrowserFixture } from './support/browserFixture.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
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
  return runBrowserFixture(chrome, fixturePath, viewport)
}

test('S05 stays presentation-only and reusable, while S14 retires the old score workspace from production', () => {
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
  assert.doesNotMatch(main, /stageS05ScoreWorkspace\.css/)
  assert.doesNotMatch(main, /stageS05ScoreWorkspaceUi\.js/)
  assert.doesNotMatch(main, /initStageS05ScoreWorkspaceUi/)
  assert.match(main, /initSmoosicEditorTab\(document\)/)
})

test('S05 workspace is responsive and has no separate Nota Görünümü result tab', () => {
  const css = readFileSync(new URL('../src/stageS05ScoreWorkspace.css', import.meta.url), 'utf8')
  const source = readFileSync(new URL('../src/stageS05ScoreWorkspaceUi.js', import.meta.url), 'utf8')
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(220px, 300px\)/)
  assert.match(css, /@media \(max-width: 760px\)/)
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\)/)
  assert.doesNotMatch(source, /textContent\s*=\s*['"]Nota Görünümü['"]/)
})

test('S05 real Chrome proof covers desktop and 390px workspace behavior', async (t) => {
  const chrome = findChrome()
  if (!chrome) {
    t.skip('Chrome/Chromium not available in this environment')
    return
  }

  for (const viewport of ['1280,900', '390,844']) {
    const html = await runBrowser(chrome, viewport)
    assert.match(html, /data-stage-s05-workspace-pass="true"/)
    assert.match(html, /data-stage-s05-auto-score-pass="true"/)
    assert.match(html, /data-stage-s05-tab-preservation-pass="true"/)
    assert.match(html, /data-stage-s05-layout-pass="true"/)
  }
})
