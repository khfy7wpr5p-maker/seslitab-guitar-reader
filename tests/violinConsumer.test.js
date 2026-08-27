import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { createCanonicalNote } from '../canonicalNoteModel.js'
import {
  CANONICAL_NOTE_SCHEMA_VERSION,
  CANONICAL_VERIFICATION_STATUS,
} from '../noteTheory.js'
import {
  QUALITY_GATE_DECISION,
  registerQualityReportForNotes,
  unregisterQualityReportForNotes,
} from '../src/services/qualityGateIntegration.js'
import { QUALITY_STATE } from '../src/services/qualityErrorReport.js'
import {
  VIOLIN_CONSUMER_STATE,
  buildQualityGatedBasicViolin,
} from '../src/services/violinConsumer.js'

function verifiedState() {
  return {
    schemaVersion: CANONICAL_NOTE_SCHEMA_VERSION,
    status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
    pitch: { valid: true, status: CANONICAL_VERIFICATION_STATUS.VERIFIED },
    time: { valid: true, status: CANONICAL_VERIFICATION_STATUS.VERIFIED },
  }
}

function makeVerifiedCanonicalNote(overrides = {}) {
  const note = createCanonicalNote({
    measureNumber: 1,
    measureKey: 'P1:0',
    measureIndex: 0,
    partId: 'P1',
    partIndex: 0,
    startBeat: 0,
    duration: 'quarter',
    beats: 1,
    durationValue: 4,
    divisions: 4,
    dotCount: 0,
    voice: 1,
    staff: 1,
    isRest: false,
    isChordNote: false,
    isGrace: false,
    tieStart: false,
    tieStop: false,
    step: 'G',
    alter: 0,
    octave: 3,
    ...overrides,
  })

  return { ...note, sourceVerificationState: verifiedState() }
}

function verifiedReport(overrides = {}) {
  return {
    qualityState: QUALITY_STATE.SOURCE_VERIFIED,
    structurallyValid: true,
    sourceVerified: true,
    reviewRequired: false,
    reliable: true,
    automaticPlaybackAllowed: true,
    findings: [],
    ...overrides,
  }
}

test('Package 5E projects definitive basic violin only after VIOLIN gate ACCEPT', () => {
  const notes = [
    makeVerifiedCanonicalNote({ step: 'G', octave: 3, startBeat: 0 }),
    makeVerifiedCanonicalNote({ step: 'A', octave: 3, startBeat: 1 }),
  ]
  const report = verifiedReport()
  const result = buildQualityGatedBasicViolin(notes, { report })

  assert.equal(result.state, VIOLIN_CONSUMER_STATE.PROJECTED)
  assert.equal(result.allowed, true)
  assert.equal(result.definitive, true)
  assert.equal(result.teacherApproved, false)
  assert.equal(result.gate.decision, QUALITY_GATE_DECISION.ACCEPT)
  assert.equal(result.gate.report, report)
  assert.equal(result.noteCount, 2)
  assert.equal(result.measureCount, 1)
  assert.equal(result.projection.measures[0].events[0].note, notes[0])
  assert.equal(result.projection.measures[0].events[1].note, notes[1])
  assert.equal(result.projection.measures[0].events[0].fingering.stringNumber, 4)
  assert.equal(result.projection.measures[0].events[0].fingering.fingerNumber, 0)
  assert.equal(result.projection.measures[0].events[1].fingering.stringNumber, 4)
  assert.equal(result.projection.measures[0].events[1].fingering.fingerNumber, 1)
})

test('Package 5E exact-array quality evidence never transfers to a clone', () => {
  const notes = [makeVerifiedCanonicalNote()]
  const clone = [...notes]
  registerQualityReportForNotes(notes, verifiedReport())
  try {
    const accepted = buildQualityGatedBasicViolin(notes)
    const rejectedClone = buildQualityGatedBasicViolin(clone)
    assert.equal(accepted.state, VIOLIN_CONSUMER_STATE.PROJECTED)
    assert.equal(rejectedClone.state, VIOLIN_CONSUMER_STATE.REVIEW_REQUIRED)
    assert.equal(rejectedClone.allowed, false)
    assert.equal(rejectedClone.definitive, false)
    assert.equal(rejectedClone.projection, null)
  } finally {
    unregisterQualityReportForNotes(notes)
  }
})

test('Package 5E source-unverified evidence returns REVIEW before projection', () => {
  const notes = [makeVerifiedCanonicalNote()]
  const result = buildQualityGatedBasicViolin(notes, {
    report: verifiedReport({
      qualityState: QUALITY_STATE.REVIEW_REQUIRED,
      sourceVerified: false,
      reviewRequired: true,
      automaticPlaybackAllowed: false,
    }),
  })
  assert.equal(result.state, VIOLIN_CONSUMER_STATE.REVIEW_REQUIRED)
  assert.equal(result.allowed, false)
  assert.equal(result.projection, null)
})

test('Package 5E unresolved D4 string crossing remains REVIEW_REQUIRED with zero finalized measures', () => {
  const notes = [makeVerifiedCanonicalNote({ step: 'D', octave: 4 })]
  const result = buildQualityGatedBasicViolin(notes, { report: verifiedReport() })
  assert.equal(result.gate.decision, QUALITY_GATE_DECISION.ACCEPT)
  assert.equal(result.state, VIOLIN_CONSUMER_STATE.REVIEW_REQUIRED)
  assert.equal(result.allowed, false)
  assert.equal(result.definitive, false)
  assert.equal(result.projection.state, 'review-required')
  assert.equal(result.projection.measureCount, 0)
  assert.deepEqual(result.projection.measures, [])
})

test('Package 5E advanced structure and out-of-range note remain unavailable without partial output', () => {
  const chord = buildQualityGatedBasicViolin([
    makeVerifiedCanonicalNote({ startBeat: 0 }),
    makeVerifiedCanonicalNote({ startBeat: 0, step: 'B', isChordNote: true }),
  ], { report: verifiedReport() })
  assert.equal(chord.state, VIOLIN_CONSUMER_STATE.NOT_AVAILABLE)
  assert.equal(chord.projection.state, 'advanced-required')
  assert.equal(chord.projection.measureCount, 0)

  const outOfRange = buildQualityGatedBasicViolin([
    makeVerifiedCanonicalNote({ step: 'C', octave: 6 }),
  ], { report: verifiedReport() })
  assert.equal(outOfRange.state, VIOLIN_CONSUMER_STATE.NOT_AVAILABLE)
  assert.equal(outOfRange.projection.state, 'out-of-range')
  assert.equal(outOfRange.projection.measureCount, 0)
})

test('Package 5E malformed input fails closed and result is immutable', () => {
  for (const input of [null, undefined, {}, 'notes']) {
    const result = buildQualityGatedBasicViolin(input)
    assert.equal(result.state, VIOLIN_CONSUMER_STATE.INVALID)
    assert.equal(result.allowed, false)
    assert.equal(Object.isFrozen(result), true)
  }

  const notes = [makeVerifiedCanonicalNote()]
  const report = verifiedReport()
  const beforeNotes = structuredClone(notes)
  const beforeReport = structuredClone(report)
  const result = buildQualityGatedBasicViolin(notes, { report })
  assert.equal(Object.isFrozen(result), true)
  assert.deepEqual(notes, beforeNotes)
  assert.deepEqual(report, beforeReport)
})

test('Package 5E production consumer imports no OMR/provider/gateway/runtime module', async () => {
  const source = await readFile(new URL('../src/services/violinConsumer.js', import.meta.url), 'utf8')
  for (const token of [
    'AudiverisProvider',
    'omrService',
    'omrWorker',
    'gatewayProvider',
    'providers/index',
  ]) {
    assert.equal(source.includes(token), false, `forbidden production OMR dependency: ${token}`)
  }
  assert.ok(source.includes('resolveViolinQualityGate'))
  assert.ok(source.includes('projectCanonicalNotesToBasicViolin'))
})
