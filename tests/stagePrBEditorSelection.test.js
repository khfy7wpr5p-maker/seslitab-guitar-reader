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
  assert.equal(diagnostics.boundToCurrentIframe, false)
})

test('STI-17 makes PR-B window-capture the single Safari selection authority and retries iframe readiness', () => {
  const source = readFileSync(new URL('../src/stagePrBEditorSelectionUi.js', import.meta.url), 'utf8')
  assert.match(source, /pointerup/)
  assert.match(source, /touchend/)
  assert.match(source, /win\.addEventListener\('click'/)
  assert.match(source, /capture:\s*true/)
  assert.match(source, /stopImmediatePropagation/)
  assert.match(source, /lastSuccess/)
  assert.match(source, /queuedRetry/)
  assert.match(source, /if \(success\) state\.lastSuccess/)
  assert.match(source, /frame\.addEventListener\?\.\('load'/)
  assert.match(source, /scheduleBindRetry/)
  assert.match(source, /BIND_RETRY_LIMIT/)
  assert.match(source, /button,input,select,textarea,a/)
  assert.doesNotMatch(source, /nearest-note|pitch-label|elementFromPoint|svgId|domId/i)
})

test('STI-17 projects Editor selection atomically and does not expose legacy two-step selection', () => {
  const source = readFileSync(new URL('../src/stagePrBEditorSelectionUi.js', import.meta.url), 'utf8')
  const editorSelection = source.indexOf('selectDetailedRendererHitWithEditor({')
  const exactProjection = source.indexOf('selectPackage3ExactNote(result.resolved.noteIndex')
  assert.ok(editorSelection >= 0)
  assert.ok(exactProjection > editorSelection)
  assert.doesNotMatch(source, /selectPackage3MeasureKey\(/)
  assert.doesNotMatch(source, /selectPackage3NoteIndex\(/)
  assert.doesNotMatch(source, /commitKeypadAction|commitSession|applyTeacherUiCorrection/)
})

test('STI-17 exact selection context prefers current PR-D product MusicXML and fails closed for edited revision without it', () => {
  const source = readFileSync(new URL('../src/stagePrBEditorSelectionUi.js', import.meta.url), 'utf8')
  assert.match(source, /resolvePrDProductMusicXml\(revision\)/)
  assert.match(source, /revision\.revisionId !== rootRevision\.revisionId/)
  assert.match(source, /return null/)
})

test('main initializes the PR-B capture gate before legacy S12 mobile delivery', () => {
  const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8')
  const prb = main.indexOf('initStagePrBEditorSelectionUi(document)')
  const s12 = main.indexOf('initStageS12MobileProductionAcceptanceUi(document)')
  assert.ok(prb >= 0)
  assert.ok(s12 > prb)
})
