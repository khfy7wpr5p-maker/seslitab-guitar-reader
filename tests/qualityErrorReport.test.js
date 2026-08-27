import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  QUALITY_ERROR_CODE,
  QUALITY_STATE,
  buildQualityErrorReport,
  isRequiredQualityErrorCode,
} from '../src/services/qualityErrorReport.js'
import {
  STRUCTURAL_FINDING_CLASS,
  STRUCTURAL_FINDING_CODE,
} from '../src/services/structuralRhythmValidator.js'

function location({
  partId = 'P1',
  measureIndex = 0,
  measureNumber = 1,
  voice = 1,
  staff = 1,
} = {}) {
  return {
    partId,
    partIndex: partId === 'P1' ? 0 : 1,
    measureIndex,
    measureNumber,
    measureKey: `${partId}:${measureIndex}`,
    voice,
    staff,
  }
}

function structuralFinding({
  code,
  classification = STRUCTURAL_FINDING_CLASS.STRUCTURAL_ERROR,
  severity = 'error',
  expected = null,
  actual = null,
  message = 'test finding',
  ...loc
}) {
  return {
    code,
    classification,
    severity,
    ...location(loc),
    expected,
    actual,
    message,
  }
}

function structuralResult(findings = [], { valid = findings.every((item) => item.severity !== 'error') } = {}) {
  return {
    valid,
    findings,
    summary: {
      errors: findings.filter((item) => item.severity === 'error').length,
      warnings: findings.filter((item) => item.severity === 'warning').length,
    },
  }
}

function verifiedState({ pitchValid = true, timeValid = true, pitchReason = null } = {}) {
  const pitchStatus = pitchValid ? 'verified' : 'invalid'
  const timeStatus = timeValid ? 'verified' : 'invalid'
  const status = pitchValid && timeValid ? 'verified' : 'invalid'
  return {
    schemaVersion: 1,
    status,
    pitch: {
      valid: pitchValid,
      status: pitchStatus,
      authority: 'written',
      source: pitchValid ? 'written+midi' : 'invalid',
      reason: pitchReason,
    },
    time: {
      valid: timeValid,
      status: timeStatus,
      authority: 'duration-metadata',
      source: timeValid ? 'duration-divisions' : 'invalid',
      reason: null,
    },
  }
}

function scoreNote({
  verification = verifiedState(),
  step = 'C',
  octave = 4,
  midi = 60,
  noteName = 'Do',
  frequency = 261.625565,
  ...loc
} = {}) {
  return {
    ...location(loc),
    step,
    alter: 0,
    octave,
    midi,
    noteName,
    frequency,
    stringLetter: null,
    fret: null,
    sourceVerificationState: verification,
    _raw: { step, alter: 0, octave, midi },
  }
}

function assertFindingContract(finding) {
  for (const field of [
    'errorCode',
    'severity',
    'partId',
    'measureKey',
    'visibleMeasureNumber',
    'voice',
    'staff',
    'expected',
    'actual',
    'explanation',
    'automaticPlaybackAllowed',
  ]) {
    assert.ok(Object.prototype.hasOwnProperty.call(finding, field), `missing ${field}`)
  }
  assert.equal(typeof finding.explanation, 'string')
  assert.equal(typeof finding.automaticPlaybackAllowed, 'boolean')
}

describe('Package 2C required vocabulary', () => {
  test('all eight required error codes are immutable and recognized', () => {
    assert.ok(Object.isFrozen(QUALITY_ERROR_CODE))
    assert.ok(Object.isFrozen(QUALITY_STATE))
    assert.deepEqual(Object.values(QUALITY_ERROR_CODE).sort(), [
      'INVALID_DIVISIONS',
      'MEASURE_DURATION_MISMATCH',
      'OMR_NOTE_MISSING_SUSPECTED',
      'PITCH_OUTPUT_MISMATCH',
      'SOURCE_NOT_VERIFIED',
      'TIE_ORPHAN',
      'TUPLET_INCOMPLETE',
      'VOICE_OVERLAP',
    ])
    for (const code of Object.values(QUALITY_ERROR_CODE)) assert.equal(isRequiredQualityErrorCode(code), true)
    assert.equal(isRequiredQualityErrorCode('UNKNOWN'), false)
  })

  test('quality states preserve structural and source verification as different concepts', () => {
    assert.notEqual(QUALITY_STATE.STRUCTURALLY_VALID, QUALITY_STATE.SOURCE_VERIFIED)
    assert.deepEqual(Object.values(QUALITY_STATE).sort(), [
      'review_required',
      'source_unverified',
      'source_verified',
      'structurally_valid',
      'unreliable',
    ])
  })
})

describe('Package 2C mapping for every required error code', () => {
  test('MEASURE_DURATION_MISMATCH and OMR_NOTE_MISSING_SUSPECTED come from underfilled suspected OMR evidence', () => {
    const underfilled = structuralFinding({
      code: STRUCTURAL_FINDING_CODE.MEASURE_UNDERFILLED,
      classification: STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR,
      severity: 'error',
      expected: 4,
      actual: 1,
      message: 'Measure is underfilled.',
    })
    const report = buildQualityErrorReport(
      { notes: [scoreNote()] },
      { structuralResult: structuralResult([underfilled], { valid: false }) },
    )

    const mismatch = report.findings.find((item) => item.errorCode === QUALITY_ERROR_CODE.MEASURE_DURATION_MISMATCH)
    const missing = report.findings.find((item) => item.errorCode === QUALITY_ERROR_CODE.OMR_NOTE_MISSING_SUSPECTED)
    assert.ok(mismatch)
    assert.ok(missing)
    assert.equal(mismatch.expected, 4)
    assert.equal(mismatch.actual, 1)
    assert.equal(missing.classification, STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR)
    assert.match(missing.explanation, /suspicion, not proof/i)
  })

  test('INVALID_DIVISIONS maps without losing exact location', () => {
    const finding = structuralFinding({
      code: STRUCTURAL_FINDING_CODE.INVALID_DIVISIONS,
      expected: 'positive finite divisions',
      actual: 0,
      voice: null,
      staff: null,
    })
    const report = buildQualityErrorReport({ notes: [scoreNote()] }, { structuralResult: structuralResult([finding]) })
    const item = report.findings.find((entry) => entry.errorCode === QUALITY_ERROR_CODE.INVALID_DIVISIONS)
    assert.ok(item)
    assert.equal(item.measureKey, 'P1:0')
    assert.equal(item.visibleMeasureNumber, 1)
    assert.equal(item.actual, 0)
  })

  test('TUPLET_INCOMPLETE maps malformed time-modification evidence', () => {
    const finding = structuralFinding({
      code: STRUCTURAL_FINDING_CODE.INVALID_TUPLET_RATIO,
      expected: 'positive integer actualNotes/normalNotes',
      actual: { actualNotes: 3, normalNotes: 0 },
    })
    const report = buildQualityErrorReport({ notes: [scoreNote()] }, { structuralResult: structuralResult([finding]) })
    assert.ok(report.findings.some((item) => item.errorCode === QUALITY_ERROR_CODE.TUPLET_INCOMPLETE))
  })

  test('TIE_ORPHAN maps both orphan tie directions', () => {
    const findings = [
      structuralFinding({
        code: STRUCTURAL_FINDING_CODE.TIE_STOP_WITHOUT_START,
        classification: STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR,
        severity: 'warning',
        actual: 'tie stop',
      }),
      structuralFinding({
        code: STRUCTURAL_FINDING_CODE.TIE_START_WITHOUT_STOP,
        classification: STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR,
        severity: 'warning',
        actual: 'tie start',
        measureIndex: 1,
        measureNumber: 2,
      }),
    ]
    const report = buildQualityErrorReport({ notes: [scoreNote()] }, { structuralResult: structuralResult(findings) })
    assert.equal(report.findings.filter((item) => item.errorCode === QUALITY_ERROR_CODE.TIE_ORPHAN).length, 2)
  })

  test('VOICE_OVERLAP preserves voice, staff, expected and actual', () => {
    const finding = structuralFinding({
      code: STRUCTURAL_FINDING_CODE.VOICE_OVERLAP,
      classification: STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR,
      expected: 2,
      actual: 1,
      voice: 3,
      staff: 2,
    })
    const report = buildQualityErrorReport({ notes: [scoreNote()] }, { structuralResult: structuralResult([finding]) })
    const item = report.findings.find((entry) => entry.errorCode === QUALITY_ERROR_CODE.VOICE_OVERLAP)
    assert.ok(item)
    assert.equal(item.voice, 3)
    assert.equal(item.staff, 2)
    assert.equal(item.expected, 2)
    assert.equal(item.actual, 1)
  })

  test('SOURCE_NOT_VERIFIED is emitted when verification metadata is absent regardless of confidence', () => {
    const unverified = { ...scoreNote(), sourceVerificationState: null, confidence: 0.999 }
    const report = buildQualityErrorReport(
      { notes: [unverified] },
      { structuralResult: structuralResult([], { valid: true }) },
    )
    const item = report.findings.find((entry) => entry.errorCode === QUALITY_ERROR_CODE.SOURCE_NOT_VERIFIED)
    assert.ok(item)
    assert.equal(item.actual, 'unverified')
    assert.equal(item.automaticPlaybackAllowed, false)
    assert.match(item.explanation, /confidence values are not treated as proof/i)
  })

  test('PITCH_OUTPUT_MISMATCH is emitted only from explicit invalid pitch verification', () => {
    const note = scoreNote({
      verification: verifiedState({ pitchValid: false, pitchReason: 'ambiguous-pitch-candidates' }),
      midi: 64,
      noteName: 'Mi',
    })
    note._raw = { step: 'E', alter: 0, octave: 5, midi: 76 }

    const report = buildQualityErrorReport(
      { notes: [note] },
      { structuralResult: structuralResult([], { valid: true }) },
    )
    const item = report.findings.find((entry) => entry.errorCode === QUALITY_ERROR_CODE.PITCH_OUTPUT_MISMATCH)
    assert.ok(item)
    assert.equal(item.expected.midi, 76)
    assert.equal(item.actual.midi, 64)
    assert.equal(item.actual.reason, 'ambiguous-pitch-candidates')
    assert.equal(item.automaticPlaybackAllowed, false)
  })
})

describe('Package 2C acceptance behavior', () => {
  test('every finding exposes the required downstream contract', () => {
    const findings = [
      structuralFinding({
        code: STRUCTURAL_FINDING_CODE.INVALID_DIVISIONS,
        actual: null,
        voice: null,
        staff: null,
      }),
      structuralFinding({
        code: STRUCTURAL_FINDING_CODE.VOICE_OVERLAP,
        classification: STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR,
        expected: 2,
        actual: 1,
      }),
    ]
    const report = buildQualityErrorReport(
      { notes: [{ ...scoreNote(), sourceVerificationState: null }] },
      { structuralResult: structuralResult(findings, { valid: false }) },
    )
    assert.ok(report.findings.length >= 3)
    for (const item of report.findings) assertFindingContract(item)
  })

  test('multiple findings in one measure remain separate and deterministic', () => {
    const ctx = { partId: 'P1', measureIndex: 4, measureNumber: 5, voice: 2, staff: 1 }
    const findings = [
      structuralFinding({ ...ctx, code: STRUCTURAL_FINDING_CODE.MEASURE_UNDERFILLED, classification: STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR, expected: 4, actual: 2 }),
      structuralFinding({ ...ctx, code: STRUCTURAL_FINDING_CODE.VOICE_OVERLAP, classification: STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR, expected: 1.5, actual: 1 }),
    ]
    const note = scoreNote({ ...ctx })
    const report1 = buildQualityErrorReport({ notes: [note] }, { structuralResult: structuralResult(findings, { valid: false }) })
    const report2 = buildQualityErrorReport({ notes: [note] }, { structuralResult: structuralResult(findings, { valid: false }) })
    assert.deepEqual(report1, report2)
    assert.ok(report1.findings.filter((item) => item.measureKey === 'P1:4').length >= 3)
  })

  test('duplicate visible measure numbers remain distinct through measureKey', () => {
    const findings = [
      structuralFinding({ code: STRUCTURAL_FINDING_CODE.INVALID_DIVISIONS, measureIndex: 0, measureNumber: 1, actual: 0 }),
      structuralFinding({ code: STRUCTURAL_FINDING_CODE.INVALID_DIVISIONS, measureIndex: 1, measureNumber: 1, actual: -1 }),
    ]
    const report = buildQualityErrorReport(
      { notes: [scoreNote()] },
      { structuralResult: structuralResult(findings, { valid: false }) },
    )
    const items = report.findings.filter((item) => item.errorCode === QUALITY_ERROR_CODE.INVALID_DIVISIONS)
    assert.equal(items.length, 2)
    assert.deepEqual(items.map((item) => item.visibleMeasureNumber), [1, 1])
    assert.deepEqual(items.map((item) => item.measureKey), ['P1:0', 'P1:1'])
  })

  test('structurally valid but source-unverified music remains review_required and cannot auto-play by report policy', () => {
    const note = { ...scoreNote(), sourceVerificationState: null }
    const report = buildQualityErrorReport(
      { notes: [note] },
      { structuralResult: structuralResult([], { valid: true }) },
    )
    assert.equal(report.structuralState, QUALITY_STATE.STRUCTURALLY_VALID)
    assert.equal(report.sourceState, QUALITY_STATE.SOURCE_UNVERIFIED)
    assert.equal(report.qualityState, QUALITY_STATE.REVIEW_REQUIRED)
    assert.deepEqual(report.qualityStates, [
      QUALITY_STATE.STRUCTURALLY_VALID,
      QUALITY_STATE.SOURCE_UNVERIFIED,
      QUALITY_STATE.REVIEW_REQUIRED,
    ])
    assert.equal(report.automaticPlaybackAllowed, false)
  })

  test('structurally valid and source-verified music records both states without conflating them', () => {
    const report = buildQualityErrorReport(
      { notes: [scoreNote()] },
      { structuralResult: structuralResult([], { valid: true }) },
    )
    assert.equal(report.structuralState, QUALITY_STATE.STRUCTURALLY_VALID)
    assert.equal(report.sourceState, QUALITY_STATE.SOURCE_VERIFIED)
    assert.equal(report.qualityState, QUALITY_STATE.SOURCE_VERIFIED)
    assert.deepEqual(report.qualityStates, [QUALITY_STATE.STRUCTURALLY_VALID, QUALITY_STATE.SOURCE_VERIFIED])
    assert.equal(report.automaticPlaybackAllowed, true)
    assert.equal(report.findings.length, 0)
  })

  test('report generation never mutates musical input or structural findings', () => {
    const note = { ...scoreNote(), sourceVerificationState: null }
    const finding = structuralFinding({
      code: STRUCTURAL_FINDING_CODE.MEASURE_UNDERFILLED,
      classification: STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR,
      expected: 4,
      actual: 1,
    })
    const score = { notes: [note] }
    const validation = structuralResult([finding], { valid: false })
    const beforeScore = structuredClone(score)
    const beforeValidation = structuredClone(validation)

    buildQualityErrorReport(score, { structuralResult: validation })

    assert.deepEqual(score, beforeScore)
    assert.deepEqual(validation, beforeValidation)
  })
})
