import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

import {
  PR_B_INTERACTION_DIAGNOSTIC,
  getStagePrBInteractionDiagnostics,
} from '../src/stagePrBEditorSelectionUi.js'

test('STI-07 diagnostics distinguish event delivery, renderer miss, canonical miss and UI-state failure', () => {
  const root = { getElementById() { return null } }
  const diagnostics = getStagePrBInteractionDiagnostics(root)
  assert.equal(diagnostics.eventCount, 0)
  assert.equal(diagnostics.eventDelivery, PR_B_INTERACTION_DIAGNOSTIC.EVENT_NOT_RECEIVED)
  assert.equal(diagnostics.rendererMissCount, 0)
  assert.equal(diagnostics.canonicalMissCount, 0)
  assert.equal(diagnostics.uiStateFailureCount, 0)
  assert.equal(diagnostics.selectedCount, 0)
})

test('STI-07 preserves Safari pointer/touch/click retry while blocking legacy duplicate authority', () => {
  const source = readFileSync(new URL('../src/stagePrBEditorSelectionUi.js', import.meta.url), 'utf8')
  assert.match(source, /pointerup/)
  assert.match(source, /touchend/)
  assert.match(source, /addEventListener\('click'/)
  assert.match(source, /capture:\s*true/)
  assert.match(source, /stopImmediatePropagation/)
  assert.match(source, /lastSuccess/)
  assert.match(source, /queuedRetry/)
  assert.match(source, /if \(success\) state\.lastSuccess/)
  assert.match(source, /frame\.addEventListener\?\.\('load'/)
  assert.match(source, /state\.boundFrame === frame && state\.boundDocument === doc/)
  assert.match(source, /button,input,select,textarea,a/)
  assert.doesNotMatch(source, /nearest-note|pitch-label|elementFromPoint|svgId|domId/i)
})

test('STI-07 orders Editor selection before Package 3 projection and does not commit keypad edits', () => {
  const source = readFileSync(new URL('../src/stagePrBEditorSelectionUi.js', import.meta.url), 'utf8')
  const editorSelection = source.indexOf('selectDetailedRendererHitWithEditor({')
  const measureProjection = source.indexOf('selectPackage3MeasureKey(result.resolved.measureKey)')
  const noteProjection = source.indexOf('selectPackage3NoteIndex(result.resolved.noteIndex')
  assert.ok(editorSelection >= 0)
  assert.ok(measureProjection > editorSelection)
  assert.ok(noteProjection > editorSelection)
  assert.doesNotMatch(source, /commitKeypadAction|commitSession|applyTeacherUiCorrection/)
})

test('main initializes the PR-B capture gate before legacy S12 mobile delivery', () => {
  const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8')
  const prb = main.indexOf('initStagePrBEditorSelectionUi(document)')
  const s12 = main.indexOf('initStageS12MobileProductionAcceptanceUi(document)')
  assert.ok(prb >= 0)
  assert.ok(s12 > prb)
})
