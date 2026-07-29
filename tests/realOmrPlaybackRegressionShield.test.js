// Regression shield for the clean, real Audiveris MusicXML fixtures.
//
// These fingerprints are intentionally strict. If a future parser change
// alters a fixture's notes, voices, chords, rests, parts, or pitch range, the
// change must be reviewed instead of silently reaching playback.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Installs the minimal DOMParser used by the repository's Node test suite.
import '../scripts/runOmrQualityReport.js'
import { parseMusicXmlWithStructure } from '../musicXmlParser.js'
import { midiToFrequency } from '../noteTheory.js'
import { parseMusicXmlToNotes } from '../src/services/musicEngine.js'

const fixtureDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'real-omr'
)

const expectedFixtures = [
  {
    fileName: 'django-clean.xml',
    parts: [{ partId: 'P1', measureCount: 38, pitchedNoteCount: 209, restCount: 16 }],
    primaryPartId: 'P1',
    primaryMeasures: 38,
    structuredNotes: 225,
    playbackNotes: 225,
    pitchedNotes: 209,
    rests: 16,
    voices: [1],
    chordContinuations: 0,
    multiVoiceMeasures: 0,
    backups: 0,
    midiRange: [60, 87],
  },
  {
    fileName: 'fikriminincegulu-clean.xml',
    parts: [{ partId: 'P1', measureCount: 24, pitchedNoteCount: 69, restCount: 2 }],
    primaryPartId: 'P1',
    primaryMeasures: 24,
    structuredNotes: 71,
    playbackNotes: 71,
    pitchedNotes: 69,
    rests: 2,
    voices: [1, 2],
    chordContinuations: 0,
    multiVoiceMeasures: 1,
    backups: 1,
    midiRange: [67, 82],
  },
  {
    fileName: 'fug1001-clean.xml',
    parts: [{ partId: 'P1', measureCount: 94, pitchedNoteCount: 1566, restCount: 179 }],
    primaryPartId: 'P1',
    primaryMeasures: 94,
    structuredNotes: 1745,
    playbackNotes: 1745,
    pitchedNotes: 1566,
    rests: 179,
    voices: [1, 2, 3, 4, 5, 6, 7],
    chordContinuations: 186,
    multiVoiceMeasures: 62,
    backups: 166,
    midiRange: [51, 89],
  },
  {
    fileName: 'gesi-clean.xml',
    parts: [{ partId: 'P1', measureCount: 26, pitchedNoteCount: 104, restCount: 8 }],
    primaryPartId: 'P1',
    primaryMeasures: 26,
    structuredNotes: 112,
    playbackNotes: 112,
    pitchedNotes: 104,
    rests: 8,
    voices: [1, 2, 3, 4, 5],
    chordContinuations: 15,
    multiVoiceMeasures: 4,
    backups: 33,
    midiRange: [58, 79],
  },
  {
    fileName: 'karayip-korsanlari-clean.xml',
    parts: [
      { partId: 'P1', measureCount: 64, pitchedNoteCount: 157, restCount: 22 },
      { partId: 'P2', measureCount: 64, pitchedNoteCount: 0, restCount: 17 },
    ],
    primaryPartId: 'P1',
    primaryMeasures: 64,
    structuredNotes: 196,
    playbackNotes: 179,
    pitchedNotes: 157,
    rests: 22,
    voices: [1, 2],
    chordContinuations: 0,
    multiVoiceMeasures: 2,
    backups: 24,
    midiRange: [64, 77],
  },
  {
    fileName: 'samanyolu-clean.xml',
    parts: [{ partId: 'P1', measureCount: 24, pitchedNoteCount: 41, restCount: 0 }],
    primaryPartId: 'P1',
    primaryMeasures: 24,
    structuredNotes: 41,
    playbackNotes: 41,
    pitchedNotes: 41,
    rests: 0,
    voices: [1],
    chordContinuations: 0,
    multiVoiceMeasures: 0,
    backups: 0,
    midiRange: [64, 76],
  },
  {
    fileName: 'shostywaltz-clean.xml',
    parts: [{ partId: 'P1', measureCount: 211, pitchedNoteCount: 546, restCount: 72 }],
    primaryPartId: 'P1',
    primaryMeasures: 211,
    structuredNotes: 618,
    playbackNotes: 618,
    pitchedNotes: 546,
    rests: 72,
    voices: [1],
    chordContinuations: 5,
    multiVoiceMeasures: 0,
    backups: 2,
    midiRange: [55, 91],
  },
]

const parsedFixtureCache = new Map()

function parseFixture(fileName) {
  if (parsedFixtureCache.has(fileName)) return parsedFixtureCache.get(fileName)

  const xml = readFileSync(path.join(fixtureDir, fileName), 'utf8')
  const structured = parseMusicXmlWithStructure(xml)
  const playback = parseMusicXmlToNotes(xml)

  assert.equal(structured.error, undefined, `${fileName}: structural parse failed`)
  assert.equal(playback.error, undefined, `${fileName}: playback parse failed`)

  const primaryNotes = structured.notes.filter(
    (note) => note.partId === structured.primaryPartId
  )
  const pitchedPlaybackNotes = playback.notes.filter((note) => !note.isRest)
  const voicesByMeasure = new Map()

  for (const note of primaryNotes) {
    if (!voicesByMeasure.has(note.measureKey)) {
      voicesByMeasure.set(note.measureKey, new Set())
    }
    voicesByMeasure.get(note.measureKey).add(note.voice)
  }

  const parsed = {
    structured,
    playback: playback.notes,
    primaryNotes,
    pitchedPlaybackNotes,
    multiVoiceMeasureCount: [...voicesByMeasure.values()].filter(
      (voices) => voices.size > 1
    ).length,
  }
  parsedFixtureCache.set(fileName, parsed)
  return parsed
}

function partFingerprint(parts) {
  return parts.map(({ partId, measureCount, pitchedNoteCount, restCount }) => ({
    partId,
    measureCount,
    pitchedNoteCount,
    restCount,
  }))
}

describe('Real OMR playback regression shield', () => {
  for (const expected of expectedFixtures) {
    test(`${expected.fileName} keeps its reviewed playback fingerprint`, () => {
      const {
        structured,
        playback,
        primaryNotes,
        pitchedPlaybackNotes,
        multiVoiceMeasureCount,
      } = parseFixture(expected.fileName)

      assert.equal(structured.primaryPartId, expected.primaryPartId)
      assert.deepEqual(partFingerprint(structured.parts), expected.parts)
      assert.equal(
        structured.measureMetadata.filter(
          (measure) => measure.partId === expected.primaryPartId
        ).length,
        expected.primaryMeasures
      )
      assert.equal(structured.notes.length, expected.structuredNotes)
      assert.equal(playback.length, expected.playbackNotes)
      assert.ok(
        playback.every((note) => note.partId === expected.primaryPartId),
        `${expected.fileName}: playback must contain only the selected primary part`
      )
      assert.equal(pitchedPlaybackNotes.length, expected.pitchedNotes)
      assert.equal(
        playback.filter((note) => note.isRest).length,
        expected.rests
      )
      assert.deepEqual(
        [...new Set(primaryNotes.map((note) => note.voice))].sort((a, b) => a - b),
        expected.voices
      )
      assert.equal(
        playback.filter((note) => note.isChordNote).length,
        expected.chordContinuations
      )
      assert.equal(multiVoiceMeasureCount, expected.multiVoiceMeasures)
      assert.equal(
        structured.measureEvents.filter(
          (event) =>
            event.partId === expected.primaryPartId && event.type === 'backup'
        ).length,
        expected.backups
      )
      assert.deepEqual(
        [
          Math.min(...pitchedPlaybackNotes.map((note) => note.midi)),
          Math.max(...pitchedPlaybackNotes.map((note) => note.midi)),
        ],
        expected.midiRange
      )
    })
  }

  test('all reviewed pitches keep finite MIDI values and matching frequencies', () => {
    for (const expected of expectedFixtures) {
      const { pitchedPlaybackNotes } = parseFixture(expected.fileName)

      for (const note of pitchedPlaybackNotes) {
        assert.ok(Number.isFinite(note.midi), `${expected.fileName}: invalid MIDI`)
        assert.ok(
          Number.isFinite(note.frequency) && note.frequency > 0,
          `${expected.fileName}: invalid frequency for MIDI ${note.midi}`
        )
        const expectedFrequency = midiToFrequency(note.midi)
        const relativeFrequencyError =
          Math.abs(note.frequency - expectedFrequency) / expectedFrequency
        assert.ok(
          relativeFrequencyError < 1e-4,
          `${expected.fileName}: pitch/frequency mismatch for MIDI ${note.midi}`
        )
      }
    }
  })

  for (const fileName of ['fug1001-clean.xml', 'gesi-clean.xml']) {
    test(`${fileName} keeps every chord continuation on its original onset`, () => {
      const { playback } = parseFixture(fileName)
      const chordIndexes = playback
        .map((note, index) => (note.isChordNote ? index : -1))
        .filter((index) => index >= 0)

      assert.ok(chordIndexes.length > 0)
      for (const index of chordIndexes) {
        const previous = playback[index - 1]
        const continuation = playback[index]
        assert.ok(previous, `${fileName}: chord continuation has no leading note`)
        assert.equal(continuation.measureKey, previous.measureKey)
        assert.equal(continuation.startBeat, previous.startBeat)
      }
    })
  }
})
