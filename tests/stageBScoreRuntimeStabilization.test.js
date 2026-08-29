import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const scoreViewSource = await readFile(new URL('../src/scoreViewUi.js', import.meta.url), 'utf8')
const mobileCss = await readFile(new URL('../src/mobileReviewUi.css', import.meta.url), 'utf8')
const browserProof = await readFile(new URL('../scripts/verifyScoreRuntimeBrowser.js', import.meta.url), 'utf8')

test('Stage B removes transform-based mobile score scaling hacks', () => {
  assert.doesNotMatch(mobileCss, /transform:\s*scale\(/)
  assert.doesNotMatch(mobileCss, /margin-bottom:\s*-\d/)
  assert.doesNotMatch(mobileCss, /121\.96%/)
  assert.match(mobileCss, /\.score-view-surface[\s\S]*overflow-x:\s*auto/)
  assert.match(mobileCss, /\.score-view-runtime-frame[\s\S]*min-width:\s*720px/)
})

test('Stage B keeps narrow score navigation accessible', () => {
  assert.match(scoreViewSource, /surface\.tabIndex\s*=\s*0/)
  assert.match(scoreViewSource, /aria-describedby', 'score-view-mobile-hint'/)
  assert.match(scoreViewSource, /Dar ekranda nota görünümünü yatay kaydırabilirsiniz\./)
  assert.match(mobileCss, /\.score-view-surface:focus-visible/)
})

test('Stage B fails closed by discarding a poisoned renderer frame before retry', () => {
  assert.match(scoreViewSource, /async function resetScoreRuntime\(root, runtime\)/)
  assert.match(scoreViewSource, /await clearScoreView\(runtime\)/)
  assert.match(scoreViewSource, /removeRuntimeFrame\(root\)/)
  assert.match(scoreViewSource, /Renderer temizlendi; yeniden deneyebilirsiniz\./)
})

test('Stage B does not add renderer semantic authority or OSMD imports to SesliTab UI', () => {
  assert.doesNotMatch(scoreViewSource, /OpenSheetMusicDisplay|opensheetmusicdisplay|new\s+Note|pitch\s*=/i)
  assert.match(scoreViewSource, /presentation-only score view shell/)
})

test('Stage B browser gate covers desktop and iPhone-sized narrow viewport', () => {
  assert.match(browserProof, /runProof\('Desktop score browser proof'\)/)
  assert.match(browserProof, /--window-size=390,844/)
  assert.match(browserProof, /data-score-render-pass=/)
  assert.match(browserProof, /data-score-cursor-pass=/)
})
