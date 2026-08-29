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
  GUITAR_TAB_CONSUMER_STATE,
  buildQualityGatedBasicGuitarTab,
  buildQualityGatedGuitarTab,
} from '../src/services/guitarTabConsumer.js'
import {
  ADVANCED_GUITAR_TAB_PROJECTION_STATE,
  projectCanonicalNotesToAdvancedGuitarTab,
} from '../guitarAdvancedTabProjection.js'
import {
  ADVANCED_GUITAR_TAB_RENDER_STATE,
  renderAdvancedGuitarTabProjection,
} from '../guitarAdvancedTabRenderer.js'

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
    step: 'E',
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

function stringsForGroup(group) {
  return group.events.filter((event) => !event.isRest).map((event) => event.position.stringNumber)
}

test('Package 9 renders a quality-gated three-note chord instead of the basic advanced-required terminal', () => {
  const notes = [
    note({ step: 'C', octave: 5, startBeat: 0 }),
    note({ step: 'E', octave: 5, startBeat: 0, isChordNote: true }),
    note({ step: 'G', octave: 5, startBeat: 0, isChordNote: true }),
  ]

  const basic = buildQualityGatedBasicGuitarTab(notes, { report: verifiedReport() })
  assert.equal(basic.state, GUITAR_TAB_CONSUMER_STATE.NOT_AVAILABLE)
  assert.equal(basic.projection.state, 'advanced-required')

  const advanced = buildQualityGatedGuitarTab(notes, { report: verifiedReport() })
  assert.equal(advanced.state, GUITAR_TAB_CONSUMER_STATE.RENDERED)
  assert.equal(advanced.allowed, true)
  assert.equal(advanced.definitive, true)
  assert.equal(advanced.mode, 'advanced')
  assert.equal(advanced.projection.state, ADVANCED_GUITAR_TAB_PROJECTION_STATE.PROJECTED)
  assert.equal(advanced.render.state, ADVANCED_GUITAR_TAB_RENDER_STATE.RENDERED)
  assert.equal(advanced.projection.measures[0].groups.length, 1)
  assert.equal(new Set(stringsForGroup(advanced.projection.measures[0].groups[0])).size, 3)
  assert.match(advanced.text, /^e\|/m)
})

test('Package 9 supports simultaneous independent voices on distinct guitar strings', () => {
  const notes = [
    note({ step: 'E', octave: 4, startBeat: 0, voice: 1 }),
    note({ step: 'G', octave: 4, startBeat: 0, voice: 2 }),
  ]
  const result = buildQualityGatedGuitarTab(notes, { report: verifiedReport() })
  assert.equal(result.state, GUITAR_TAB_CONSUMER_STATE.RENDERED)
  assert.equal(result.mode, 'advanced')
  assert.equal(new Set(stringsForGroup(result.projection.measures[0].groups[0])).size, 2)
})

test('Package 9 sustained polyphony never reuses a still-busy string', () => {
  const notes = [
    note({ step: 'E', octave: 4, startBeat: 0, beats: 2, voice: 1 }),
    note({ step: 'F', octave: 4, startBeat: 1, beats: 1, voice: 2 }),
  ]
  const result = buildQualityGatedGuitarTab(notes, { report: verifiedReport() })
  assert.equal(result.state, GUITAR_TAB_CONSUMER_STATE.RENDERED)
  const first = result.projection.measures[0].groups[0].events[0].position
  const second = result.projection.measures[0].groups[1].events[0].position
  assert.notEqual(first.stringNumber, second.stringNumber)
})

test('Package 9 refuses more than six simultaneous pitched notes with zero partial TAB', () => {
  const pitches = [
    ['E', 4], ['F', 4], ['G', 4], ['A', 4], ['B', 4], ['C', 5], ['D', 5],
  ]
  const notes = pitches.map(([step, octave], index) => note({
    step,
    octave,
    startBeat: 0,
    voice: index + 1,
    isChordNote: index > 0,
  }))
  const result = buildQualityGatedGuitarTab(notes, { report: verifiedReport() })
  assert.equal(result.state, GUITAR_TAB_CONSUMER_STATE.NOT_AVAILABLE)
  assert.equal(result.allowed, false)
  assert.equal(result.definitive, false)
  assert.equal(result.text, '')
  assert.equal(result.projection.state, ADVANCED_GUITAR_TAB_PROJECTION_STATE.UNPLAYABLE)
})

test('Package 9 never bypasses REVIEW quality evidence to reach the advanced solver', () => {
  const notes = [
    note({ startBeat: 0 }),
    note({ step: 'G', startBeat: 0, voice: 2, isChordNote: true }),
  ]
  const result = buildQualityGatedGuitarTab(notes, {
    report: verifiedReport({
      qualityState: QUALITY_STATE.REVIEW_REQUIRED,
      sourceVerified: false,
      reviewRequired: true,
      automaticPlaybackAllowed: false,
    }),
  })
  assert.equal(result.state, GUITAR_TAB_CONSUMER_STATE.REVIEW_REQUIRED)
  assert.equal(result.text, '')
  assert.equal(result.projection, null)
})

test('Package 9 fails closed for multiple parts rather than merging instruments into one guitar', () => {
  const notes = [
    note({ partId: 'P1', partIndex: 0, measureKey: 'P1:0', startBeat: 0 }),
    note({ partId: 'P2', partIndex: 1, measureKey: 'P2:0', startBeat: 0, voice: 2 }),
  ]
  const result = buildQualityGatedGuitarTab(notes, { report: verifiedReport() })
  assert.equal(result.state, GUITAR_TAB_CONSUMER_STATE.INVALID)
  assert.equal(result.text, '')
})

test('Package 9 projection and rendering are deterministic, immutable and preserve exact note references', () => {
  const notes = [
    note({ step: 'C', octave: 5, startBeat: 0 }),
    note({ step: 'E', octave: 5, startBeat: 0, isChordNote: true }),
    note({ step: 'G', octave: 5, startBeat: 0, isChordNote: true }),
    note({ step: 'A', octave: 4, startBeat: 1, voice: 2 }),
  ]
  const before = structuredClone(notes)
  const first = projectCanonicalNotesToAdvancedGuitarTab(notes)
  const second = projectCanonicalNotesToAdvancedGuitarTab(notes)
  assert.equal(first.state, ADVANCED_GUITAR_TAB_PROJECTION_STATE.PROJECTED)
  assert.deepEqual(first, second)
  assert.deepEqual(notes, before)
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.measures[0].groups[0].events[0]))
  assert.equal(first.measures[0].groups[0].events[0].note, notes[0])

  const firstRender = renderAdvancedGuitarTabProjection(first)
  const secondRender = renderAdvancedGuitarTabProjection(second)
  assert.equal(firstRender.state, ADVANCED_GUITAR_TAB_RENDER_STATE.RENDERED)
  assert.equal(firstRender.text, secondRender.text)
  assert.ok(Object.isFrozen(firstRender))
})

test('Package 9 renderer uses one display cell per simultaneous onset group', () => {
  const notes = [
    note({ step: 'C', octave: 5, startBeat: 0 }),
    note({ step: 'E', octave: 5, startBeat: 0, isChordNote: true }),
    note({ step: 'G', octave: 5, startBeat: 0, isChordNote: true }),
  ]
  const projection = projectCanonicalNotesToAdvancedGuitarTab(notes)
  const rendered = renderAdvancedGuitarTabProjection(projection)
  assert.equal(rendered.state, ADVANCED_GUITAR_TAB_RENDER_STATE.RENDERED)
  for (const line of rendered.measures[0].lines) {
    assert.equal(line.body.length, 4)
  }
})

test('Package 9 source remains isolated from OMR, backend, network and deployment boundaries', async () => {
  const projection = await readFile(new URL('../guitarAdvancedTabProjection.js', import.meta.url), 'utf8')
  const renderer = await readFile(new URL('../guitarAdvancedTabRenderer.js', import.meta.url), 'utf8')
  const consumer = await readFile(new URL('../src/services/guitarTabConsumer.js', import.meta.url), 'utf8')
  const combined = `${projection}\n${renderer}\n${consumer}`

  for (const token of ['AudiverisProvider', 'omrWorker', 'gatewayProvider', 'render.yaml', 'Dockerfile', 'fetch(', 'XMLHttpRequest']) {
    assert.equal(combined.includes(token), false, `forbidden Package 9 dependency: ${token}`)
  }
  assert.match(consumer, /resolveGuitarTabQualityGate/)
  assert.match(consumer, /projectCanonicalNotesToAdvancedGuitarTab/)
})
