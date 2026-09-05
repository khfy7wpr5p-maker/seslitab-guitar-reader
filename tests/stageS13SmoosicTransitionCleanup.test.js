import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/stageS13SmoosicTransitionCleanup.css', import.meta.url), 'utf8')

test('S13 retires legacy teacher/editor/share and duplicate discovery presentation', () => {
  for (const selector of [
    '#discovery-tab-btn',
    '#review-inspector-panel',
    '#teacher-tab-btn',
    '#tab-teacher',
    '#stage-s07-inline-teacher-inspector',
    '#stage-prc-keypad',
    '#stage-e-visual-note-editor',
    '#stage-f-revision-lifecycle',
    '#stage-l-share-panel',
    '#stage-s10-educational-chords',
  ]) {
    assert.match(css, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('S13 keeps Guitar TAB and Violin product cards visible', () => {
  assert.doesNotMatch(css, /\.stage-i-instrument-card\s*\{[^}]*display\s*:\s*none/is)
  assert.doesNotMatch(css, /\[data-stage-i-instrument=['"]?(?:guitar|violin)['"]?\][^{]*\{[^}]*display\s*:\s*none/is)
})
