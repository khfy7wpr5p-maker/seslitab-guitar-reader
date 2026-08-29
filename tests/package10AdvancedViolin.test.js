import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { createCanonicalNote } from '../canonicalNoteModel.js'
import {
  CANONICAL_NOTE_SCHEMA_VERSION,
  CANONICAL_VERIFICATION_STATUS,
} from '../noteTheory.js'
import { QUALITY_STATE } from '../src/services/qualityErrorReport.js'
import {
  VIOLIN_CONSUMER_STATE,
  buildQualityGatedBasicViolin,
  buildQualityGatedViolin,
} from '../src/services/violinConsumer.js'
import {
  ADVANCED_VIOLIN_POSITION_STATE,
  enumerateAdvancedViolinPositionCandidates,
} from '../violinAdvancedPositionResolver.js'
import {
  ADVANCED_VIOLIN_PROJECTION_STATE,
  projectCanonicalNotesToAdvancedViolin,
} from '../violinAdvancedProjection.js'
import {
  buildViolinUiModel,
  formatAdvancedViolinProjectionForUi,
  VIOLIN_UI_MESSAGE,
  VIOLIN_UI_STATE,
} from '../src/package5Ui.js'

function verifiedState() {
  return {
    schemaVersion: CANONICAL_NOTE_SCHEMA_VERSION,
    status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
    pitch: { valid: true, status: CANONICAL_VERIFICATION_STATUS.VERIFIED },
    time: { valid: true, status: CANONICAL_VERIFICATION_STATUS.VERIFIED },
  }
}

function note(overrides = {}) {
  const value = createCanonicalNote({
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
    step: 'D',
    alter: 0,
    octave: 4,
    ...overrides,
  })
  return { ...value, sourceVerificationState: verifiedState() }
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

function pitchedEvents(group) {
  return group.events.filter((event) => !event.isRest)
}

test('Package 10 preserves all bounded generated alternatives for a D4 string crossing', () => {
  const result = enumerateAdvancedViolinPositionCandidates(note({ step: 'D', octave: 4 }))
  assert.equal(result.state, ADVANCED_VIOLIN_POSITION_STATE.CANDIDATES)
  assert.ok(result.candidates.some((candidate) => candidate.stringName === 'D' && candidate.fingerNumber === 0))
  assert.ok(result.candidates.some((candidate) => candidate.stringName === 'G' && candidate.positionNumber === 1 && candidate.fingerNumber === 4))
  assert.ok(result.candidates.some((candidate) => candidate.stringName === 'G' && candidate.positionNumber === 2))
  assert.ok(result.candidates.some((candidate) => candidate.stringName === 'G' && candidate.positionNumber === 3))
  assert.ok(result.candidates.every((candidate) => candidate.teacherApproved === false && candidate.sourceFingeringClaimed === false))
})

test('Package 10 supports a bounded third-position note without calling it teacher fingering', () => {
  const result = enumerateAdvancedViolinPositionCandidates(note({ step: 'D', octave: 6 }))
  assert.equal(result.state, ADVANCED_VIOLIN_POSITION_STATE.CANDIDATES)
  assert.ok(result.candidates.length >= 1)
  assert.ok(result.candidates.every((candidate) => candidate.positionNumber === 3))
  assert.ok(result.candidates.every((candidate) => candidate.provenance === 'generated-advanced'))
})

test('Package 10 resolves a quality-gated D4 crossing as generated advanced output', () => {
  const notes = [note({ step: 'D', octave: 4 })]
  const basic = buildQualityGatedBasicViolin(notes, { report: verifiedReport() })
  assert.equal(basic.state, VIOLIN_CONSUMER_STATE.REVIEW_REQUIRED)

  const advanced = buildQualityGatedViolin(notes, { report: verifiedReport() })
  assert.equal(advanced.state, VIOLIN_CONSUMER_STATE.PROJECTED)
  assert.equal(advanced.mode, 'advanced')
  assert.equal(advanced.projection.state, ADVANCED_VIOLIN_PROJECTION_STATE.PROJECTED)
  const event = advanced.projection.measures[0].groups[0].events[0]
  assert.equal(event.position.stringName, 'D')
  assert.equal(event.position.fingerNumber, 0)
  assert.ok(event.alternatives.length > 1)
})

test('Package 10 renders a two-note double stop on distinct violin strings', () => {
  const notes = [
    note({ step: 'D', octave: 4, startBeat: 0, voice: 1 }),
    note({ step: 'A', octave: 4, startBeat: 0, voice: 2, isChordNote: true }),
  ]
  const result = buildQualityGatedViolin(notes, { report: verifiedReport() })
  assert.equal(result.state, VIOLIN_CONSUMER_STATE.PROJECTED)
  assert.equal(result.mode, 'advanced')
  const events = pitchedEvents(result.projection.measures[0].groups[0])
  assert.equal(events.length, 2)
  assert.equal(new Set(events.map((event) => event.position.stringNumber)).size, 2)
})

test('Package 10 sustained polyphony does not reuse a still-busy violin string', () => {
  const notes = [
    note({ step: 'D', octave: 4, startBeat: 0, beats: 2, voice: 1 }),
    note({ step: 'F', octave: 4, startBeat: 1, beats: 1, voice: 2 }),
  ]
  const result = buildQualityGatedViolin(notes, { report: verifiedReport() })
  assert.equal(result.state, VIOLIN_CONSUMER_STATE.PROJECTED)
  assert.equal(result.mode, 'advanced')
  const first = pitchedEvents(result.projection.measures[0].groups[0])[0].position
  const second = pitchedEvents(result.projection.measures[0].groups[1])[0].position
  assert.notEqual(first.stringNumber, second.stringNumber)
})

test('Package 10 tie continuation preserves exact generated string position and finger', () => {
  const notes = [
    note({ step: 'D', octave: 4, startBeat: 0, tieStart: true, voice: 1 }),
    note({ step: 'D', octave: 4, startBeat: 1, tieStop: true, voice: 1 }),
    note({ step: 'F', octave: 4, startBeat: 1, voice: 2 }),
  ]
  const result = buildQualityGatedViolin(notes, { report: verifiedReport() })
  assert.equal(result.state, VIOLIN_CONSUMER_STATE.PROJECTED)
  const first = result.projection.measures[0].groups[0].events[0].position
  const continuation = result.projection.measures[0].groups[1].events.find((event) => event.noteIndex === 1).position
  const independent = result.projection.measures[0].groups[1].events.find((event) => event.noteIndex === 2).position
  assert.deepEqual(continuation, first)
  assert.notEqual(independent.stringNumber, continuation.stringNumber)
})

test('Package 10 rejects a dangling tie start with zero partial projection', () => {
  const projection = projectCanonicalNotesToAdvancedViolin([
    note({ step: 'D', octave: 4, tieStart: true }),
  ])
  assert.equal(projection.state, ADVANCED_VIOLIN_PROJECTION_STATE.UNPLAYABLE)
  assert.equal(projection.reason, 'dangling-tie-start')
  assert.equal(projection.noteCount, 0)
  assert.equal(projection.measureCount, 0)
})

test('Package 10 refuses a three-note simultaneous stop instead of flattening it', () => {
  const notes = [
    note({ step: 'D', octave: 4, startBeat: 0, voice: 1 }),
    note({ step: 'A', octave: 4, startBeat: 0, voice: 2, isChordNote: true }),
    note({ step: 'E', octave: 5, startBeat: 0, voice: 3, isChordNote: true }),
  ]
  const result = buildQualityGatedViolin(notes, { report: verifiedReport() })
  assert.equal(result.state, VIOLIN_CONSUMER_STATE.NOT_AVAILABLE)
  assert.equal(result.allowed, false)
  assert.equal(result.projection.state, ADVANCED_VIOLIN_PROJECTION_STATE.UNPLAYABLE)
  assert.equal(result.projection.reason, 'more-than-two-simultaneous-pitched-notes')
})

test('Package 10 never bypasses a REVIEW quality gate', () => {
  const notes = [note(), note({ step: 'A', octave: 4, voice: 2, isChordNote: true })]
  const result = buildQualityGatedViolin(notes, {
    report: verifiedReport({
      qualityState: QUALITY_STATE.REVIEW_REQUIRED,
      sourceVerified: false,
      reviewRequired: true,
      automaticPlaybackAllowed: false,
    }),
  })
  assert.equal(result.state, VIOLIN_CONSUMER_STATE.REVIEW_REQUIRED)
  assert.equal(result.projection, null)
})

test('Package 10 fails closed for multiple score parts', () => {
  const notes = [
    note({ partId: 'P1', partIndex: 0, measureKey: 'P1:0' }),
    note({ partId: 'P2', partIndex: 1, measureKey: 'P2:0', voice: 2 }),
  ]
  const result = buildQualityGatedViolin(notes, { report: verifiedReport() })
  assert.equal(result.state, VIOLIN_CONSUMER_STATE.INVALID)
  assert.equal(result.allowed, false)
})

test('Package 10 projection is deterministic and preserves exact note references without mutation', () => {
  const notes = [
    note({ step: 'D', octave: 4, startBeat: 0, voice: 1 }),
    note({ step: 'A', octave: 4, startBeat: 0, voice: 2, isChordNote: true }),
    note({ step: 'D', octave: 6, startBeat: 1, voice: 1 }),
  ]
  const before = structuredClone(notes)
  const first = projectCanonicalNotesToAdvancedViolin(notes)
  const second = projectCanonicalNotesToAdvancedViolin(notes)
  assert.equal(first.state, ADVANCED_VIOLIN_PROJECTION_STATE.PROJECTED)
  assert.deepEqual(first, second)
  assert.deepEqual(notes, before)
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.measures[0].groups[0].events[0]))
  assert.equal(first.measures[0].groups[0].events[0].note, notes[0])
  assert.equal(Object.isFrozen(notes[0]), false)
})

test('Package 10 advanced UI exposes generated position and simultaneous double-stop text', () => {
  const notes = [
    note({ step: 'D', octave: 4, noteName: 'Re', startBeat: 0, voice: 1 }),
    note({ step: 'A', octave: 4, noteName: 'La', startBeat: 0, voice: 2, isChordNote: true }),
  ]
  const result = buildQualityGatedViolin(notes, { report: verifiedReport() })
  const text = formatAdvancedViolinProjectionForUi(result.projection)
  assert.match(text, /aynı anda/)
  assert.match(text, /pozisyon/)

  const model = buildViolinUiModel(notes, { buildQualityGatedViolin: () => result })
  assert.equal(model.state, VIOLIN_UI_STATE.RENDERED)
  assert.equal(model.mode, 'advanced')
  assert.equal(model.status, VIOLIN_UI_MESSAGE.ADVANCED_RENDERED)
  assert.match(model.text, /fiziksel kimlik P1:0/)
})

test('Package 10 source remains isolated from OMR, backend, network and deployment boundaries', async () => {
  const resolver = await readFile(new URL('../violinAdvancedPositionResolver.js', import.meta.url), 'utf8')
  const projection = await readFile(new URL('../violinAdvancedProjection.js', import.meta.url), 'utf8')
  const consumer = await readFile(new URL('../src/services/violinConsumer.js', import.meta.url), 'utf8')
  const ui = await readFile(new URL('../src/package5Ui.js', import.meta.url), 'utf8')
  const combined = `${resolver}\n${projection}\n${consumer}\n${ui}`
  for (const token of ['AudiverisProvider', 'omrWorker', 'gatewayProvider', 'render.yaml', 'Dockerfile', 'fetch(', 'XMLHttpRequest']) {
    assert.equal(combined.includes(token), false, `forbidden Package 10 dependency: ${token}`)
  }
  assert.match(consumer, /resolveViolinQualityGate/)
  assert.match(consumer, /projectCanonicalNotesToAdvancedViolin/)
})