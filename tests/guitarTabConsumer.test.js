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
  GUITAR_TAB_CONSUMER_STATE,
  buildQualityGatedBasicGuitarTab,
} from '../src/services/guitarTabConsumer.js'

function verifiedState() {
  return {
    schemaVersion: CANONICAL_NOTE_SCHEMA_VERSION,
    status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
    pitch: {
      valid: true,
      status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
    },
    time: {
      valid: true,
      status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
    },
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
    step: 'E',
    alter: 0,
    octave: 4,
    ...overrides,
  })

  return {
    ...note,
    sourceVerificationState: verifiedState(),
  }
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

test('Package 4E renders definitive basic TAB only after GUITAR_TAB gate ACCEPT', () => {
  const notes = [
    makeVerifiedCanonicalNote({ step: 'E', startBeat: 0 }),
    makeVerifiedCanonicalNote({ step: 'F', startBeat: 1 }),
  ]
  const report = verifiedReport()

  const result = buildQualityGatedBasicGuitarTab(notes, { report })

  assert.equal(result.state, GUITAR_TAB_CONSUMER_STATE.RENDERED)
  assert.equal(result.allowed, true)
  assert.equal(result.definitive, true)
  assert.equal(result.gate.decision, QUALITY_GATE_DECISION.ACCEPT)
  assert.equal(result.gate.report, report)
  assert.equal(result.noteCount, 2)
  assert.equal(result.measureCount, 1)
  assert.match(result.text, /^e\|--------\|/m)
  assert.match(result.text, /^D\|-2---3--\|/m)
  assert.equal(result.projection.measures[0].events[0].note, notes[0])
  assert.equal(result.projection.measures[0].events[1].note, notes[1])
})

test('Package 4E exact-array quality evidence never transfers to a clone', () => {
  const notes = [makeVerifiedCanonicalNote()]
  const clone = [...notes]
  const report = verifiedReport()

  registerQualityReportForNotes(notes, report)
  try {
    const accepted = buildQualityGatedBasicGuitarTab(notes)
    const rejectedClone = buildQualityGatedBasicGuitarTab(clone)

    assert.equal(accepted.state, GUITAR_TAB_CONSUMER_STATE.RENDERED)
    assert.equal(rejectedClone.state, GUITAR_TAB_CONSUMER_STATE.REVIEW_REQUIRED)
    assert.equal(rejectedClone.allowed, false)
    assert.equal(rejectedClone.definitive, false)
    assert.equal(rejectedClone.text, '')
    assert.equal(rejectedClone.projection, null)
    assert.equal(rejectedClone.render, null)
  } finally {
    unregisterQualityReportForNotes(notes)
  }
})

test('Package 4E source-unverified evidence returns REVIEW with no TAB bytes or projection', () => {
  const notes = [makeVerifiedCanonicalNote()]
  const result = buildQualityGatedBasicGuitarTab(notes, {
    report: verifiedReport({
      qualityState: QUALITY_STATE.REVIEW_REQUIRED,
      sourceVerified: false,
      reviewRequired: true,
      automaticPlaybackAllowed: false,
    }),
  })

  assert.equal(result.state, GUITAR_TAB_CONSUMER_STATE.REVIEW_REQUIRED)
  assert.equal(result.allowed, false)
  assert.equal(result.definitive, false)
  assert.equal(result.text, '')
  assert.equal(result.projection, null)
  assert.equal(result.render, null)
})

test('Package 4E unreliable or structurally invalid evidence BLOCKS before projection', () => {
  const notes = [makeVerifiedCanonicalNote()]
  const result = buildQualityGatedBasicGuitarTab(notes, {
    report: verifiedReport({
      qualityState: QUALITY_STATE.UNRELIABLE,
      structurallyValid: false,
      sourceVerified: false,
      reviewRequired: true,
      reliable: false,
      automaticPlaybackAllowed: false,
    }),
  })

  assert.equal(result.state, GUITAR_TAB_CONSUMER_STATE.BLOCKED)
  assert.equal(result.allowed, false)
  assert.equal(result.definitive, false)
  assert.equal(result.text, '')
  assert.equal(result.projection, null)
  assert.equal(result.render, null)
})

test('Package 4E delegates chord/polyphonic structures without flattening or partial TAB', () => {
  const notes = [
    makeVerifiedCanonicalNote({ startBeat: 0 }),
    makeVerifiedCanonicalNote({ startBeat: 0, step: 'G', isChordNote: true }),
  ]

  const result = buildQualityGatedBasicGuitarTab(notes, {
    report: verifiedReport(),
  })

  assert.equal(result.gate.decision, QUALITY_GATE_DECISION.ACCEPT)
  assert.equal(result.state, GUITAR_TAB_CONSUMER_STATE.NOT_AVAILABLE)
  assert.equal(result.reason, 'chord-structure')
  assert.equal(result.text, '')
  assert.equal(result.render, null)
  assert.equal(result.projection.state, 'advanced-required')
})

test('Package 4E malformed input fails closed without throwing or inventing TAB', () => {
  for (const input of [null, undefined, {}, 'notes']) {
    const result = buildQualityGatedBasicGuitarTab(input)
    assert.equal(result.state, GUITAR_TAB_CONSUMER_STATE.INVALID)
    assert.equal(result.allowed, false)
    assert.equal(result.text, '')
  }
})

test('Package 4E result is immutable and never mutates canonical notes or quality evidence', () => {
  const notes = [makeVerifiedCanonicalNote()]
  const report = verifiedReport()
  const beforeNotes = structuredClone(notes)
  const beforeReport = structuredClone(report)

  const result = buildQualityGatedBasicGuitarTab(notes, { report })

  assert.equal(Object.isFrozen(result), true)
  assert.deepEqual(notes, beforeNotes)
  assert.deepEqual(report, beforeReport)
})

test('Package 4E production consumer imports no OMR/provider/gateway/runtime module', async () => {
  const source = await readFile(new URL('../src/services/guitarTabConsumer.js', import.meta.url), 'utf8')
  const forbidden = [
    'AudiverisProvider',
    'omrService',
    'omrWorker',
    'gatewayProvider',
    'providers/index',
  ]

  for (const token of forbidden) {
    assert.equal(source.includes(token), false, `forbidden production OMR dependency: ${token}`)
  }

  assert.ok(source.includes('resolveGuitarTabQualityGate'))
  assert.ok(source.includes('projectCanonicalNotesToBasicGuitarTab'))
  assert.ok(source.includes('renderBasicGuitarTabProjection'))
})
