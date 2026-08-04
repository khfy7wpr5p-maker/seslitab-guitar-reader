// Canonical MusicXML bridge tests.
//
// This suite protects the boundary between raw MusicXML parser notes and
// the NoteObject shape consumed by playback, rhythm and Turkish TTS.
//
// Guitar notation can be octave-transposing. Written pitch and string/fret
// performance position are therefore validated as separate candidates.

import {
  describe,
  test,
} from 'node:test'

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import '../scripts/runOmrQualityReport.js'

import {
  midiToFrequency,
} from '../noteTheory.js'

import {
  createCanonicalMusicXmlBridgeNote,
  parseMusicXmlToNotes,
  resolveMusicXmlBridgePitch,
  resolveMusicXmlBridgeTime,
} from '../src/services/musicEngine.js'


function makeSource(overrides = {}) {
  return {
    measure: 1,
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
    isGrace: false,
    isChordNote: false,
    tieStart: false,
    tieStop: false,
    tieContinue: false,
    confidence: 0.85,
    confidenceReason: 'Canonical bridge test',
    ...overrides,
  }
}


function technicalGuitarSource(overrides = {}) {
  return makeSource({
    step: 'E',
    alter: 0,
    octave: 5,
    string: 'e',
    fret: 0,
    noteName: 'Mi',
    midi: 64,
    frequency: midiToFrequency(64),
    confidenceReason: 'MusicXML technical string/fret',
    ...overrides,
  })
}


function writtenPitchSource(overrides = {}) {
  return makeSource({
    step: 'E',
    alter: 0,
    octave: 5,
    string: 'e',
    fret: 0,
    noteName: 'Mi',
    midi: 76,
    frequency: midiToFrequency(76),
    confidenceReason: 'MusicXML written pitch',
    ...overrides,
  })
}


describe('resolveMusicXmlBridgePitch', () => {
  test(
    'selects technical string and fret pitch for octave-transposing notation',
    () => {
      const source = technicalGuitarSource()
      const before = structuredClone(source)

      const result =
        resolveMusicXmlBridgePitch(source)

      assert.deepEqual(source, before)
      assert.equal(result.valid, true)
      assert.equal(result.status, 'partial')
      assert.equal(result.authority, 'guitar')
      assert.equal(result.value.midi, 64)
      assert.ok(result.value.frequency > 0)
      assert.equal(
        result.candidates.combined.valid,
        false,
      )
      assert.equal(
        result.candidates.guitar.valid,
        true,
      )
    },
  )

  test(
    'selects written pitch when MIDI follows the written octave',
    () => {
      const source = writtenPitchSource()
      const before = structuredClone(source)

      const result =
        resolveMusicXmlBridgePitch(source)

      assert.deepEqual(source, before)
      assert.equal(result.valid, true)
      assert.equal(result.status, 'partial')
      assert.equal(result.authority, 'written')
      assert.equal(result.value.midi, 76)
      assert.equal(
        result.candidates.written.valid,
        true,
      )
      assert.equal(
        result.candidates.guitar.valid,
        false,
      )
    },
  )

  test(
    'accepts fully consistent written and guitar pitch',
    () => {
      const result =
        resolveMusicXmlBridgePitch(
          technicalGuitarSource({
            octave: 4,
          }),
        )

      assert.equal(result.valid, true)
      assert.equal(result.status, 'verified')
      assert.equal(result.authority, 'combined')
      assert.equal(result.value.midi, 64)
    },
  )

  test(
    'marks conflicting written and guitar candidates as ambiguous',
    () => {
      const result =
        resolveMusicXmlBridgePitch(
          makeSource({
            step: 'E',
            alter: 0,
            octave: 5,
            string: 'e',
            fret: 0,
            midi: undefined,
            frequency: undefined,
            noteName: 'Mi',
          }),
        )

      assert.equal(result.valid, false)
      assert.equal(result.status, 'invalid')
      assert.equal(result.authority, 'ambiguous')
      assert.equal(
        result.reason,
        'ambiguous-pitch-candidates',
      )
      assert.equal(
        result.candidates.written.valid,
        true,
      )
      assert.equal(
        result.candidates.guitar.valid,
        true,
      )
    },
  )

  test(
    'rejects malformed source values without throwing',
    () => {
      const result =
        resolveMusicXmlBridgePitch(null)

      assert.equal(result.valid, false)
      assert.equal(result.status, 'invalid')
      assert.equal(result.authority, 'none')
      assert.equal(
        result.reason,
        'invalid-source-note',
      )
    },
  )
})


describe('resolveMusicXmlBridgeTime', () => {
  test(
    'verifies consistent MusicXML duration metadata',
    () => {
      const source = makeSource()
      const before = structuredClone(source)

      const result =
        resolveMusicXmlBridgeTime(source)

      assert.deepEqual(source, before)
      assert.equal(result.valid, true)
      assert.equal(result.status, 'verified')
      assert.equal(result.authority, 'all')
      assert.equal(result.value.beats, 1)
      assert.equal(result.value.startBeat, 0)
    },
  )

  test(
    'normalizes consistent dotted-quarter duration',
    () => {
      const result =
        resolveMusicXmlBridgeTime(
          makeSource({
            duration: 'dotted-quarter',
            beats: 1.5,
            durationValue: 6,
            divisions: 4,
            dotCount: 1,
          }),
        )

      assert.equal(result.valid, true)
      assert.equal(result.status, 'verified')
      assert.equal(result.authority, 'all')
      assert.equal(result.value.beats, 1.5)
      assert.equal(result.value.dotCount, 1)
    },
  )

  test(
    'uses duration metadata for a tuplet type disagreement',
    () => {
      const result =
        resolveMusicXmlBridgeTime(
          makeSource({
            duration: 'eighth',
            beats: 1 / 3,
            durationValue: 1,
            divisions: 3,
          }),
        )

      assert.equal(result.valid, true)
      assert.equal(result.status, 'partial')
      assert.equal(
        result.authority,
        'duration-metadata',
      )
      assert.equal(result.value.beats, 1 / 3)
      assert.equal(
        result.candidates.full.valid,
        false,
      )
    },
  )

  test(
    'marks conflicting duration metadata invalid',
    () => {
      const result =
        resolveMusicXmlBridgeTime(
          makeSource({
            duration: 'quarter',
            beats: 2,
            durationValue: 1,
            divisions: 1,
          }),
        )

      assert.equal(result.valid, false)
      assert.equal(result.status, 'invalid')
      assert.equal(
        result.authority,
        'duration-metadata',
      )
      assert.equal(
        result.candidates.full.valid,
        false,
      )
    },
  )
})


describe('createCanonicalMusicXmlBridgeNote', () => {
  test(
    'preserves source object and stores an independent raw clone',
    () => {
      const source =
        technicalGuitarSource({
          tuplet: {
            actualNotes: 3,
            normalNotes: 2,
          },
          beam: [
            {
              number: 1,
              value: 'begin',
            },
          ],
        })

      const before = structuredClone(source)

      const note =
        createCanonicalMusicXmlBridgeNote(
          source,
        )

      assert.deepEqual(source, before)
      assert.deepEqual(note._raw, before)
      assert.notStrictEqual(note._raw, source)
      assert.notStrictEqual(
        note._raw.tuplet,
        source.tuplet,
      )
      assert.notStrictEqual(
        note._raw.beam,
        source.beam,
      )

      source.tuplet.actualNotes = 9
      source.beam[0].value = 'changed'

      assert.equal(
        note._raw.tuplet.actualNotes,
        3,
      )
      assert.equal(
        note._raw.beam[0].value,
        'begin',
      )
    },
  )

  test(
    'preserves playback rhythm and score fields',
    () => {
      const source =
        technicalGuitarSource({
          measure: 7,
          measureKey: 'P1:6',
          measureIndex: 6,
          partId: 'P1',
          partIndex: 0,
          startBeat: 1.5,
          duration: 'eighth',
          beats: 0.5,
          durationValue: 2,
          divisions: 4,
          dotCount: 0,
          voice: 2,
          staff: 1,
          tieStart: true,
          tieStop: false,
          tieContinue: false,
          isChordNote: true,
          tuplet: null,
          beam: {
            number: 1,
            value: 'continue',
          },
        })

      const note =
        createCanonicalMusicXmlBridgeNote(
          source,
        )

      assert.equal(note.stringLetter, 'e')
      assert.equal(note.fret, 0)
      assert.equal(note.noteName, 'Mi')
      assert.equal(note.midi, 64)
      assert.equal(
        note.frequency,
        source.frequency,
      )
      assert.equal(note.measureNumber, 7)
      assert.equal(note.measureKey, 'P1:6')
      assert.equal(note.measureIndex, 6)
      assert.equal(note.partId, 'P1')
      assert.equal(note.partIndex, 0)
      assert.equal(note.startBeat, 1.5)
      assert.equal(note.beats, 0.5)
      assert.equal(note.durationValue, 2)
      assert.equal(note.divisions, 4)
      assert.equal(note.voice, 2)
      assert.equal(note.staff, 1)
      assert.equal(note.tieStart, true)
      assert.equal(note.tieStop, false)
      assert.equal(note.isChordNote, true)
      assert.deepEqual(
        note.beam,
        source.beam,
      )
      assert.equal(
        note.sourceVerificationState.status,
        'partial',
      )
      assert.equal(
        note.sourceVerificationState.pitch.authority,
        'guitar',
      )
    },
  )

  test(
    'verifies rests without inventing pitch',
    () => {
      const source =
        makeSource({
          isRest: true,
          step: undefined,
          alter: undefined,
          octave: undefined,
          string: undefined,
          stringNumber: undefined,
          fret: undefined,
          noteName: undefined,
          midi: undefined,
          frequency: undefined,
          confidenceReason: 'MusicXML rest',
        })

      const note =
        createCanonicalMusicXmlBridgeNote(
          source,
        )

      assert.equal(note.isRest, true)
      assert.equal(
        note.sourceVerificationState.status,
        'verified',
      )
      assert.equal(
        note.sourceVerificationState.pitch.authority,
        'rest',
      )
      assert.equal(
        note.sourceVerificationState.time.valid,
        true,
      )
      assert.equal(note._raw.isRest, true)
    },
  )

  test(
    'keeps ambiguous pitch marked invalid',
    () => {
      const source =
        makeSource({
          step: 'E',
          alter: 0,
          octave: 5,
          string: 'e',
          fret: 0,
          midi: undefined,
          frequency: undefined,
          noteName: 'Mi',
        })

      const note =
        createCanonicalMusicXmlBridgeNote(
          source,
        )

      assert.equal(
        note.sourceVerificationState.status,
        'invalid',
      )
      assert.equal(
        note.sourceVerificationState.pitch.valid,
        false,
      )
      assert.equal(
        note.sourceVerificationState.pitch.authority,
        'ambiguous',
      )
      assert.deepEqual(note._raw, source)
    },
  )
})


describe('parseMusicXmlToNotes canonical integration', () => {
  test(
    'keeps the primary part and attaches canonical metadata',
    () => {
      const fixtureUrl = new URL(
        './fixtures/real-omr/karayip-korsanlari-clean.xml',
        import.meta.url,
      )

      const xml =
        readFileSync(fixtureUrl, 'utf8')

      const result =
        parseMusicXmlToNotes(xml)

      assert.equal(result.error, undefined)
      assert.equal(result.notes.length, 179)

      assert.ok(
        result.notes.every(
          (note) => note.partId === 'P1',
        ),
      )

      assert.ok(
        result.notes.every(
          (note) =>
            note.sourceVerificationState &&
            typeof note.sourceVerificationState.status ===
              'string',
        ),
      )

      assert.ok(
        result.notes.every(
          (note) =>
            note._raw &&
            note._raw.partId === 'P1',
        ),
      )

      assert.ok(
        result.notes.some(
          (note) => !note.isRest,
        ),
      )

      assert.ok(
        result.notes.some(
          (note) => note.isRest,
        ),
      )
    },
  )
})
