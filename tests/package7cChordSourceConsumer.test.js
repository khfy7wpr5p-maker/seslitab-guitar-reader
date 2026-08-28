import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  HARMONY_PARSE_STATE,
} from '../musicXmlHarmonyParser.js'
import {
  CHORD_PRESENTATION_STATE,
} from '../src/services/chordPresentation.js'
import {
  CHORD_SOURCE_CONSUMER_STATE,
  buildChordSourceConsumer,
  buildRegisteredChordSourceConsumer,
} from '../src/services/chordSourceConsumer.js'
import {
  MUSICXML_SOURCE_PROVENANCE,
  registerMusicXmlSourceForNotes,
  resolveMusicXmlSourceForNotes,
} from '../src/services/musicXmlSourceRegistry.js'

const XML = '<score-partwise version="4.0"><part-list/><part id="P1"><measure number="1"/></part></score-partwise>'

function presentation(state, overrides = {}) {
  const ready = state === CHORD_PRESENTATION_STATE.READY
  return Object.freeze({
    state,
    message: '',
    items: Object.freeze(ready ? [Object.freeze({ symbol: 'C' })] : []),
    displayText: ready ? 'Ölçü 1, ölçü başlangıcı: C' : '',
    spokenText: ready ? 'Ölçü 1, ölçü başlangıcı, kaynak akor işareti: Do majör akoru.' : '',
    provenance: 'musicxml-harmony-source-presentation',
    teacherApproved: false,
    ...overrides,
  })
}

function adapters(parseState, presentationState, overrides = {}) {
  return {
    parseMusicXmlHarmony(xml) {
      overrides.onParse?.(xml)
      return Object.freeze({ state: parseState, harmonies: Object.freeze([]), parts: Object.freeze([]) })
    },
    buildChordPresentationModel(parsed) {
      overrides.onPresentation?.(parsed)
      return presentation(presentationState, overrides.presentationOverrides)
    },
  }
}

test('Package 7C registry preserves exact NoteObject[] and raw MusicXML identity', () => {
  const notes = [{ noteName: 'Do' }]
  const record = registerMusicXmlSourceForNotes(notes, XML)

  assert.equal(record.notes, notes)
  assert.equal(record.musicXml, XML)
  assert.equal(record.provenance, MUSICXML_SOURCE_PROVENANCE)
  assert.equal(resolveMusicXmlSourceForNotes(notes), record)
  assert.equal(Object.isFrozen(record), true)
})

test('Package 7C source evidence never transfers to an equivalent cloned array', () => {
  const notes = [{ noteName: 'Do' }]
  registerMusicXmlSourceForNotes(notes, XML)
  const clone = [...notes]

  assert.equal(resolveMusicXmlSourceForNotes(clone), null)
  const result = buildRegisteredChordSourceConsumer(clone)
  assert.equal(result.state, CHORD_SOURCE_CONSUMER_STATE.NO_SOURCE)
  assert.equal(result.displayText, '')
  assert.equal(result.spokenText, '')
})

test('Package 7C registry rejects malformed notes or blank source without changing valid evidence', () => {
  assert.throws(() => registerMusicXmlSourceForNotes(null, XML), TypeError)
  assert.throws(() => registerMusicXmlSourceForNotes([], '   '), TypeError)
  assert.equal(resolveMusicXmlSourceForNotes(null), null)
})

test('Package 7C registered consumer passes the exact raw MusicXML to Package 6 parsing', () => {
  const notes = [{ noteName: 'Do' }]
  registerMusicXmlSourceForNotes(notes, XML)
  let receivedXml = null

  const result = buildRegisteredChordSourceConsumer(notes, adapters(
    HARMONY_PARSE_STATE.PARSED,
    CHORD_PRESENTATION_STATE.READY,
    { onParse: (xml) => { receivedXml = xml } },
  ))

  assert.equal(receivedXml, XML)
  assert.equal(result.state, CHORD_SOURCE_CONSUMER_STATE.SOURCE_READY)
  assert.equal(result.renderable, true)
  assert.equal(result.speakable, true)
  assert.equal(result.sourceOnly, true)
  assert.equal(result.definitive, false)
  assert.equal(result.teacherApproved, false)
  assert.match(result.displayText, /: C$/)
  assert.match(result.spokenText, /kaynak akor işareti/)
})

test('Package 7C source-ready presentation can never be promoted to teacher-approved or definitive truth', () => {
  const approved = buildChordSourceConsumer(XML, adapters(
    HARMONY_PARSE_STATE.PARSED,
    CHORD_PRESENTATION_STATE.READY,
    { presentationOverrides: { teacherApproved: true } },
  ))
  const wrongProvenance = buildChordSourceConsumer(XML, adapters(
    HARMONY_PARSE_STATE.PARSED,
    CHORD_PRESENTATION_STATE.READY,
    { presentationOverrides: { provenance: 'invented' } },
  ))

  for (const result of [approved, wrongProvenance]) {
    assert.equal(result.state, CHORD_SOURCE_CONSUMER_STATE.INVALID)
    assert.equal(result.renderable, false)
    assert.equal(result.displayText, '')
    assert.equal(result.spokenText, '')
  }
})

test('Package 7C REVIEW_REQUIRED emits zero display and speech bytes', () => {
  const result = buildChordSourceConsumer(XML, adapters(
    HARMONY_PARSE_STATE.REVIEW_REQUIRED,
    CHORD_PRESENTATION_STATE.REVIEW_REQUIRED,
  ))
  assert.equal(result.state, CHORD_SOURCE_CONSUMER_STATE.REVIEW_REQUIRED)
  assert.equal(result.renderable, false)
  assert.equal(result.speakable, false)
  assert.equal(result.displayText, '')
  assert.equal(result.spokenText, '')
  assert.equal(result.presentation, null)
})

test('Package 7C empty source remains empty and never invents a chord', () => {
  const result = buildChordSourceConsumer(XML, adapters(
    HARMONY_PARSE_STATE.PARSED,
    CHORD_PRESENTATION_STATE.EMPTY,
  ))
  assert.equal(result.state, CHORD_SOURCE_CONSUMER_STATE.EMPTY)
  assert.equal(result.displayText, '')
  assert.equal(result.spokenText, '')
})

test('Package 7C invalid parser/presentation evidence and thrown adapters fail closed', () => {
  const invalid = buildChordSourceConsumer(XML, adapters(
    HARMONY_PARSE_STATE.INVALID,
    CHORD_PRESENTATION_STATE.INVALID,
  ))
  const thrown = buildChordSourceConsumer(XML, {
    parseMusicXmlHarmony() { throw new Error('boom') },
  })
  const blank = buildChordSourceConsumer('   ')

  for (const result of [invalid, thrown, blank]) {
    assert.equal(result.state, CHORD_SOURCE_CONSUMER_STATE.INVALID)
    assert.equal(result.displayText, '')
    assert.equal(result.spokenText, '')
  }
})

test('Package 7C consumer results are immutable and deterministic', () => {
  const a = buildChordSourceConsumer(XML, adapters(HARMONY_PARSE_STATE.PARSED, CHORD_PRESENTATION_STATE.READY))
  const b = buildChordSourceConsumer(XML, adapters(HARMONY_PARSE_STATE.PARSED, CHORD_PRESENTATION_STATE.READY))
  assert.deepEqual(a, b)
  assert.equal(Object.isFrozen(a), true)
})

test('Package 7C production handoff is isolated from OMR/provider/gateway code', async () => {
  const registrySource = await readFile(new URL('../src/services/musicXmlSourceRegistry.js', import.meta.url), 'utf8')
  const consumerSource = await readFile(new URL('../src/services/chordSourceConsumer.js', import.meta.url), 'utf8')
  const gateSource = await readFile(new URL('../src/services/appQualityGate.js', import.meta.url), 'utf8')

  assert.doesNotMatch(registrySource, /Audiveris|omrService|gateway|worker/i)
  assert.doesNotMatch(consumerSource, /Audiveris|omrService|gateway|worker/i)
  assert.match(gateSource, /registerMusicXmlSourceForNotes\(notes, musicXmlString\)/)
  assert.doesNotMatch(consumerSource, /notesToChord|inferChord|chordAnalyzer/i)
})
