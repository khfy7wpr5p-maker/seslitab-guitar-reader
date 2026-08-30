import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  buildQualityOverlayModel,
  QUALITY_OVERLAY_STATE,
  qualityOverlayStatusCopy,
} from '../src/services/qualityOverlay.js'
import {
  registerQualityReportForNotes,
  unregisterQualityReportForNotes,
} from '../src/services/qualityGateIntegration.js'

function note(measureKey, measureIndex, extra = {}) {
  return {
    measureKey,
    partId: 'P1',
    partIndex: 0,
    measureIndex,
    measureNumber: measureIndex + 1,
    voice: 1,
    staff: 1,
    startBeat: 0,
    isRest: false,
    ...extra,
  }
}

function report(overrides = {}) {
  return Object.freeze({
    qualityState: 'source_verified',
    structurallyValid: true,
    sourceVerified: true,
    reviewRequired: false,
    reliable: true,
    summary: Object.freeze({ totalFindings: 0, errors: 0, warnings: 0, verifiedNotes: 1, unverifiedNotes: 0 }),
    findings: Object.freeze([]),
    ...overrides,
  })
}

test('Stage D shows REVIEW when the exact canonical array has no quality report', () => {
  const notes = [note('P1:m0', 0)]
  const model = buildQualityOverlayModel(notes)
  assert.equal(model.state, QUALITY_OVERLAY_STATE.REVIEW)
  assert.equal(model.statusText, 'İnceleme gerekiyor')
  assert.equal(model.report, null)
  assert.deepEqual(model.measures, [])
})

test('Stage D uses the approved automatic PASS wording without claiming teacher approval', () => {
  const notes = [note('P1:m0', 0)]
  registerQualityReportForNotes(notes, report())
  const model = buildQualityOverlayModel(notes)
  assert.equal(model.state, QUALITY_OVERLAY_STATE.PASS)
  assert.equal(model.statusText, 'Otomatik kontrollerden geçti')
  assert.doesNotMatch(model.statusText, /öğretmen|onaylandı/i)
  unregisterQualityReportForNotes(notes)
})

test('Stage D blocks an unreliable or structurally invalid registered report', () => {
  const notes = [note('P1:m0', 0)]
  registerQualityReportForNotes(notes, report({
    qualityState: 'unreliable',
    structurallyValid: false,
    reliable: false,
    reviewRequired: true,
  }))
  const model = buildQualityOverlayModel(notes)
  assert.equal(model.state, QUALITY_OVERLAY_STATE.BLOCK)
  assert.equal(model.statusText, 'Kullanım engellendi')
  unregisterQualityReportForNotes(notes)
})

test('Stage D groups only report-backed findings by canonical measureKey and never invents a note target', () => {
  const notes = [note('P1:m0', 0), note('P1:m1', 1)]
  const findings = Object.freeze([
    Object.freeze({
      errorCode: 'MEASURE_DURATION_MISMATCH',
      severity: 'error',
      classification: 'structural_error',
      partId: 'P1',
      measureKey: 'P1:m1',
      visibleMeasureNumber: 2,
      measureIndex: 1,
      voice: 1,
      staff: 1,
      explanation: 'fixture',
    }),
    Object.freeze({
      errorCode: 'SOURCE_NOT_VERIFIED',
      severity: 'warning',
      classification: 'unverified_musical_data',
      partId: null,
      measureKey: null,
      explanation: 'fixture global',
    }),
  ])
  registerQualityReportForNotes(notes, report({
    qualityState: 'unreliable',
    structurallyValid: false,
    reliable: false,
    reviewRequired: true,
    findings,
    summary: Object.freeze({ totalFindings: 2, errors: 1, warnings: 1, verifiedNotes: 0, unverifiedNotes: 2 }),
  }))

  const model = buildQualityOverlayModel(notes, 'P1:m1')
  assert.equal(model.measures.length, 1)
  assert.equal(model.measures[0].measureKey, 'P1:m1')
  assert.equal(model.measures[0].state, QUALITY_OVERLAY_STATE.BLOCK)
  assert.equal(model.selectedMeasure, model.measures[0])
  assert.equal(model.selectedMeasure.findings[0].exactNoteTarget, null)
  assert.equal(model.globalFindings.length, 1)
  unregisterQualityReportForNotes(notes)
})

test('Stage D status copy is bounded to PASS REVIEW BLOCK product language', () => {
  assert.equal(qualityOverlayStatusCopy(QUALITY_OVERLAY_STATE.PASS), 'Otomatik kontrollerden geçti')
  assert.equal(qualityOverlayStatusCopy(QUALITY_OVERLAY_STATE.REVIEW), 'İnceleme gerekiyor')
  assert.equal(qualityOverlayStatusCopy(QUALITY_OVERLAY_STATE.BLOCK), 'Kullanım engellendi')
})

test('Stage D UI is accessible and refuses renderer/note inference authority', async () => {
  const source = await readFile(new URL('../src/stageDQualityOverlayUi.js', import.meta.url), 'utf8')
  assert.match(source, /Otomatik kontrol/)
  assert.match(source, /aria-live/)
  assert.match(source, /data-quality-state/)
  assert.match(source, /data-exact-note-target.*none/)
  assert.match(source, /yeni nota veya hata tahmini yapmaz/)
  assert.doesNotMatch(source, /hitTestNote|\.highlight\(|opensheetmusicdisplay|OSMD|nearest|pitch matching/i)
})

test('Stage D is wired after canonical measure and note selection UI', async () => {
  const source = await readFile(new URL('../main.js', import.meta.url), 'utf8')
  const measureUi = source.indexOf("import './src/package3Ui.js'")
  const noteUi = source.indexOf("import './src/stageCNoteSelectionUi.js'")
  const overlayUi = source.indexOf("import './src/stageDQualityOverlayUi.js'")
  assert.ok(measureUi >= 0)
  assert.ok(noteUi > measureUi)
  assert.ok(overlayUi > noteUi)
  assert.match(source, /stageDQualityOverlay\.css/)
})
