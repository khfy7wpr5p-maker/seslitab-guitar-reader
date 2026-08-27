// Package 2C — Safe Quality and Error Report
//
// Read-only aggregation layer over Package 2B structural findings and
// Package 2A source-verification metadata. This module reports uncertainty;
// it does not repair music and does not enforce consumer behavior.

import {
  CANONICAL_VERIFICATION_STATUS,
  resolveCanonicalConsumptionPolicy,
} from '../../noteTheory.js'
import {
  STRUCTURAL_FINDING_CLASS,
  STRUCTURAL_FINDING_CODE,
  validateStructuralRhythm,
} from './structuralRhythmValidator.js'

export const QUALITY_ERROR_CODE = Object.freeze({
  MEASURE_DURATION_MISMATCH: 'MEASURE_DURATION_MISMATCH',
  INVALID_DIVISIONS: 'INVALID_DIVISIONS',
  TUPLET_INCOMPLETE: 'TUPLET_INCOMPLETE',
  TIE_ORPHAN: 'TIE_ORPHAN',
  VOICE_OVERLAP: 'VOICE_OVERLAP',
  SOURCE_NOT_VERIFIED: 'SOURCE_NOT_VERIFIED',
  OMR_NOTE_MISSING_SUSPECTED: 'OMR_NOTE_MISSING_SUSPECTED',
  PITCH_OUTPUT_MISMATCH: 'PITCH_OUTPUT_MISMATCH',
})

export const QUALITY_STATE = Object.freeze({
  STRUCTURALLY_VALID: 'structurally_valid',
  SOURCE_VERIFIED: 'source_verified',
  SOURCE_UNVERIFIED: 'source_unverified',
  REVIEW_REQUIRED: 'review_required',
  UNRELIABLE: 'unreliable',
})

const REQUIRED_ERROR_CODES = Object.freeze(Object.values(QUALITY_ERROR_CODE))

const STRUCTURAL_CODE_MAP = Object.freeze({
  [STRUCTURAL_FINDING_CODE.MEASURE_UNDERFILLED]: QUALITY_ERROR_CODE.MEASURE_DURATION_MISMATCH,
  [STRUCTURAL_FINDING_CODE.MEASURE_OVERFILLED]: QUALITY_ERROR_CODE.MEASURE_DURATION_MISMATCH,
  [STRUCTURAL_FINDING_CODE.EMPTY_MEASURE]: QUALITY_ERROR_CODE.MEASURE_DURATION_MISMATCH,
  [STRUCTURAL_FINDING_CODE.EVENT_EXCEEDS_MEASURE_BOUNDARY]: QUALITY_ERROR_CODE.MEASURE_DURATION_MISMATCH,
  [STRUCTURAL_FINDING_CODE.INVALID_DIVISIONS]: QUALITY_ERROR_CODE.INVALID_DIVISIONS,
  [STRUCTURAL_FINDING_CODE.INVALID_TUPLET_RATIO]: QUALITY_ERROR_CODE.TUPLET_INCOMPLETE,
  [STRUCTURAL_FINDING_CODE.TIE_STOP_WITHOUT_START]: QUALITY_ERROR_CODE.TIE_ORPHAN,
  [STRUCTURAL_FINDING_CODE.TIE_START_WITHOUT_STOP]: QUALITY_ERROR_CODE.TIE_ORPHAN,
  [STRUCTURAL_FINDING_CODE.VOICE_OVERLAP]: QUALITY_ERROR_CODE.VOICE_OVERLAP,
})

function locationFrom(value = {}) {
  return {
    partId: value.partId ?? null,
    measureKey: value.measureKey ?? null,
    visibleMeasureNumber: value.measureNumber ?? value.measure ?? null,
    measureIndex: Number.isFinite(value.measureIndex) ? value.measureIndex : null,
    voice: value.voice ?? null,
    staff: value.staff ?? null,
  }
}

function freezeFinding({
  errorCode,
  severity,
  classification,
  sourceCode = null,
  location,
  expected = null,
  actual = null,
  explanation,
  verificationState = null,
  automaticPlaybackAllowed = false,
}) {
  return Object.freeze({
    errorCode,
    severity,
    classification,
    sourceCode,
    ...locationFrom(location),
    expected,
    actual,
    explanation,
    verificationState,
    automaticPlaybackAllowed,
  })
}

function compareNullableNumber(a, b) {
  const av = Number.isFinite(a) ? a : Number.MAX_SAFE_INTEGER
  const bv = Number.isFinite(b) ? b : Number.MAX_SAFE_INTEGER
  return av - bv
}

function compareFindings(a, b) {
  const part = String(a.partId ?? '').localeCompare(String(b.partId ?? ''))
  if (part !== 0) return part
  const measure = compareNullableNumber(a.measureIndex, b.measureIndex)
  if (measure !== 0) return measure
  const voice = compareNullableNumber(a.voice, b.voice)
  if (voice !== 0) return voice
  const staff = compareNullableNumber(a.staff, b.staff)
  if (staff !== 0) return staff
  const code = a.errorCode.localeCompare(b.errorCode)
  if (code !== 0) return code
  return String(a.sourceCode ?? '').localeCompare(String(b.sourceCode ?? ''))
}

function mapStructuralFinding(finding) {
  const mappedCode = STRUCTURAL_CODE_MAP[finding.code] ?? finding.code
  return freezeFinding({
    errorCode: mappedCode,
    severity: finding.severity,
    classification: finding.classification,
    sourceCode: finding.code,
    location: finding,
    expected: finding.expected,
    actual: finding.actual,
    explanation: finding.message,
    verificationState: null,
    automaticPlaybackAllowed: false,
  })
}

function suspectedMissingEventFinding(finding) {
  if (finding.code !== STRUCTURAL_FINDING_CODE.MEASURE_UNDERFILLED &&
      finding.code !== STRUCTURAL_FINDING_CODE.EMPTY_MEASURE) {
    return null
  }
  if (finding.classification !== STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR) {
    return null
  }

  return freezeFinding({
    errorCode: QUALITY_ERROR_CODE.OMR_NOTE_MISSING_SUSPECTED,
    severity: 'warning',
    classification: STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR,
    sourceCode: finding.code,
    location: finding,
    expected: finding.expected,
    actual: finding.actual,
    explanation: 'OMR may have omitted a timed musical event in this measure. This is a suspicion, not proof of a missing note.',
    verificationState: QUALITY_STATE.SOURCE_UNVERIFIED,
    automaticPlaybackAllowed: false,
  })
}

function sourceVerificationFinding(note, policy) {
  if (policy.status === CANONICAL_VERIFICATION_STATUS.VERIFIED && policy.definitive) {
    return null
  }

  return freezeFinding({
    errorCode: QUALITY_ERROR_CODE.SOURCE_NOT_VERIFIED,
    severity: policy.status === CANONICAL_VERIFICATION_STATUS.INVALID ? 'error' : 'warning',
    classification: 'unverified_musical_data',
    sourceCode: policy.reason,
    location: note,
    expected: QUALITY_STATE.SOURCE_VERIFIED,
    actual: policy.status,
    explanation: 'Musical source verification is incomplete or unavailable. Confidence values are not treated as proof of musical correctness.',
    verificationState: QUALITY_STATE.SOURCE_UNVERIFIED,
    automaticPlaybackAllowed: false,
  })
}

function pitchOutputMismatchFinding(note) {
  const pitch = note?.sourceVerificationState?.pitch
  if (!pitch || (pitch.valid !== false && pitch.status !== CANONICAL_VERIFICATION_STATUS.INVALID)) {
    return null
  }

  const raw = note?._raw && typeof note._raw === 'object' ? note._raw : {}
  return freezeFinding({
    errorCode: QUALITY_ERROR_CODE.PITCH_OUTPUT_MISMATCH,
    severity: 'error',
    classification: 'unverified_musical_data',
    sourceCode: pitch.reason ?? 'pitch-verification-invalid',
    location: note,
    expected: {
      step: raw.step ?? null,
      alter: raw.alter ?? null,
      octave: raw.octave ?? null,
      midi: raw.midi ?? null,
    },
    actual: {
      noteName: note.noteName ?? null,
      midi: note.midi ?? null,
      frequency: note.frequency ?? null,
      stringLetter: note.stringLetter ?? null,
      fret: note.fret ?? null,
      reason: pitch.reason ?? null,
    },
    explanation: 'Canonical pitch verification found conflicting or invalid output representations. The report does not choose or repair a pitch automatically.',
    verificationState: QUALITY_STATE.SOURCE_UNVERIFIED,
    automaticPlaybackAllowed: false,
  })
}

function summarizeSourceVerification(notes) {
  if (!Array.isArray(notes) || notes.length === 0) {
    return {
      sourceState: QUALITY_STATE.SOURCE_UNVERIFIED,
      allVerified: false,
      verifiedNotes: 0,
      unverifiedNotes: 0,
    }
  }

  let verifiedNotes = 0
  let unverifiedNotes = 0
  for (const note of notes) {
    const policy = resolveCanonicalConsumptionPolicy(note)
    if (policy.status === CANONICAL_VERIFICATION_STATUS.VERIFIED && policy.definitive) verifiedNotes++
    else unverifiedNotes++
  }

  return {
    sourceState: unverifiedNotes === 0
      ? QUALITY_STATE.SOURCE_VERIFIED
      : QUALITY_STATE.SOURCE_UNVERIFIED,
    allVerified: unverifiedNotes === 0,
    verifiedNotes,
    unverifiedNotes,
  }
}

/**
 * Build a deterministic Package 2C report without mutating the score or notes.
 *
 * The report calculates policy metadata only. It does not wire those decisions
 * into TTS, playback, TAB, UI, OMR, or any other consumer; enforcement remains
 * Package 2D.
 */
export function buildQualityErrorReport(structuredScore, options = {}) {
  if (!structuredScore || typeof structuredScore !== 'object' || Array.isArray(structuredScore)) {
    throw new TypeError('structuredScore must be an object')
  }

  const notes = Array.isArray(options.notes)
    ? options.notes
    : (Array.isArray(structuredScore.notes) ? structuredScore.notes : [])
  const structuralResult = options.structuralResult ?? validateStructuralRhythm(structuredScore, options.structuralOptions)

  if (!structuralResult || typeof structuralResult !== 'object' || !Array.isArray(structuralResult.findings)) {
    throw new TypeError('structuralResult must contain a findings array')
  }

  const findings = []

  for (const finding of structuralResult.findings) {
    findings.push(mapStructuralFinding(finding))
    const suspected = suspectedMissingEventFinding(finding)
    if (suspected) findings.push(suspected)
  }

  for (const note of notes) {
    const policy = resolveCanonicalConsumptionPolicy(note)
    const sourceFinding = sourceVerificationFinding(note, policy)
    if (sourceFinding) findings.push(sourceFinding)
    const pitchFinding = pitchOutputMismatchFinding(note)
    if (pitchFinding) findings.push(pitchFinding)
  }

  findings.sort(compareFindings)

  const sourceSummary = summarizeSourceVerification(notes)
  const structuralErrors = structuralResult.summary?.errors ?? findings.filter((finding) =>
    finding.classification === STRUCTURAL_FINDING_CLASS.STRUCTURAL_ERROR && finding.severity === 'error'
  ).length
  const hasReviewFinding = findings.some((finding) => finding.severity === 'warning') || !sourceSummary.allVerified
  const structuralState = structuralResult.valid
    ? QUALITY_STATE.STRUCTURALLY_VALID
    : QUALITY_STATE.UNRELIABLE
  const qualityState = !structuralResult.valid || structuralErrors > 0
    ? QUALITY_STATE.UNRELIABLE
    : hasReviewFinding
      ? QUALITY_STATE.REVIEW_REQUIRED
      : QUALITY_STATE.SOURCE_VERIFIED

  const qualityStates = []
  if (structuralResult.valid) qualityStates.push(QUALITY_STATE.STRUCTURALLY_VALID)
  qualityStates.push(sourceSummary.sourceState)
  if (qualityState === QUALITY_STATE.REVIEW_REQUIRED) qualityStates.push(QUALITY_STATE.REVIEW_REQUIRED)
  if (qualityState === QUALITY_STATE.UNRELIABLE) qualityStates.push(QUALITY_STATE.UNRELIABLE)

  const errorCount = findings.filter((finding) => finding.severity === 'error').length
  const warningCount = findings.filter((finding) => finding.severity === 'warning').length

  return Object.freeze({
    qualityState,
    qualityStates: Object.freeze(qualityStates),
    structuralState,
    sourceState: sourceSummary.sourceState,
    structurallyValid: structuralResult.valid === true,
    sourceVerified: sourceSummary.allVerified,
    reviewRequired: qualityState === QUALITY_STATE.REVIEW_REQUIRED || qualityState === QUALITY_STATE.UNRELIABLE,
    reliable: qualityState !== QUALITY_STATE.UNRELIABLE,
    automaticPlaybackAllowed: qualityState === QUALITY_STATE.SOURCE_VERIFIED && structuralResult.valid === true,
    summary: Object.freeze({
      totalFindings: findings.length,
      errors: errorCount,
      warnings: warningCount,
      verifiedNotes: sourceSummary.verifiedNotes,
      unverifiedNotes: sourceSummary.unverifiedNotes,
    }),
    findings: Object.freeze(findings),
  })
}

export function isRequiredQualityErrorCode(value) {
  return REQUIRED_ERROR_CODES.includes(value)
}
