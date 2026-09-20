import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import '../scripts/runOmrQualityReport.js'

import {
  MIDI_GRACE_PLAYBACK_BEATS,
  MIDI_PPQ,
  buildCanonicalMeasureOffsets,
  buildCanonicalMidiTimeline,
  createGatedMidiArtifact,
  createMidiArtifact,
  encodeMidiFile,
  encodeVariableLength,
  midiFileName,
} from '../src/services/midiExport.js'
import { parseMusicXmlToNotes } from '../src/services/musicEngine.js'

function note(overrides = {}) {
  return {
    measureKey: '0:0',
    measureNumber: 1,
    measureIndex: 0,
    partIndex: 0,
    partId: 'P1',
    startBeat: 0,
    beats: 1,
    duration: 'quarter',
    midi: 60,
    frequency: 261.63,
    step: 'C',
    alter: 0,
    octave: 4,
    voice: 1,
    staff: 1,
    isRest: false,
    isGrace: false,
    isChordNote: false,
    tieStart: false,
    tieStop: false,
    tieContinue: false,
    ...overrides,
  }
}

function readUint32(bytes, offset) {
  return (
    (bytes[offset] * 0x1000000) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  ) >>> 0
}

function readVlq(bytes, state) {
  let value = 0
  while (true) {
    const byte = bytes[state.offset++]
    value = (value << 7) | (byte & 0x7f)
    if ((byte & 0x80) === 0) return value
  }
}

function parseFormat0(bytes) {
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'MThd')
  assert.equal(readUint32(bytes, 4), 6)
  assert.deepEqual([...bytes.slice(8, 12)], [0, 0, 0, 1])
  const ppq = (bytes[12] << 8) | bytes[13]
  assert.equal(String.fromCharCode(...bytes.slice(14, 18)), 'MTrk')
  const trackLength = readUint32(bytes, 18)
  assert.equal(trackLength, bytes.length - 22)

  const events = []
  const state = { offset: 22 }
  let tick = 0
  const trackEnd = 22 + trackLength

  while (state.offset < trackEnd) {
    tick += readVlq(bytes, state)
    const status = bytes[state.offset++]
    if (status === 0xff) {
      const type = bytes[state.offset++]
      const length = readVlq(bytes, state)
      const data = [...bytes.slice(state.offset, state.offset + length)]
      state.offset += length
      events.push({ tick, kind: 'meta', type, data })
      continue
    }

    const data1 = bytes[state.offset++]
    const data2 = bytes[state.offset++]
    const kind = (status & 0xf0) === 0x90 && data2 > 0
      ? 'on'
      : (status & 0xf0) === 0x80 || ((status & 0xf0) === 0x90 && data2 === 0)
        ? 'off'
        : 'other'
    events.push({ tick, kind, status, data1, data2 })
  }

  return { ppq, events }
}

test('Package 3G emits deterministic SMF Format 0 bytes with canonical beat timing', () => {
  const notes = [
    note({ midi: 60, startBeat: 0, beats: 1 }),
    note({ isRest: true, midi: null, step: null, octave: null, startBeat: 1, beats: 1 }),
    note({ midi: 64, step: 'E', startBeat: 2, beats: 2, duration: 'half' }),
  ]
  const before = JSON.stringify(notes)

  const first = encodeMidiFile(notes)
  const second = encodeMidiFile(notes)
  assert.deepEqual(first, second)
  assert.equal(JSON.stringify(notes), before)

  const parsed = parseFormat0(first)
  assert.equal(parsed.ppq, MIDI_PPQ)
  assert.deepEqual(
    parsed.events.filter((event) => event.kind === 'on').map((event) => [event.tick, event.data1]),
    [[0, 60], [960, 64]],
  )
  assert.deepEqual(
    parsed.events.filter((event) => event.kind === 'off').map((event) => [event.tick, event.data1]),
    [[480, 60], [1920, 64]],
  )
  assert.equal(parsed.events[0].kind, 'meta')
  assert.equal(parsed.events[0].type, 0x51)
  assert.equal(parsed.events.at(-1).type, 0x2f)
})

test('Package 3G chord members retain the exact same start tick', () => {
  const notes = [
    note({ midi: 60, startBeat: 0 }),
    note({ midi: 64, step: 'E', startBeat: 0, isChordNote: true }),
    note({ isRest: true, midi: null, step: null, octave: null, startBeat: 1, beats: 3 }),
  ]
  const parsed = parseFormat0(encodeMidiFile(notes))
  assert.deepEqual(
    parsed.events.filter((event) => event.kind === 'on').map((event) => [event.tick, event.data1]),
    [[0, 60], [0, 64]],
  )
})

test('Package 3G tie chain produces one MIDI attack with summed canonical duration', () => {
  const notes = [
    note({ startBeat: 0, beats: 2, isRest: true, midi: null, step: null, octave: null }),
    note({ startBeat: 2, beats: 2, tieStart: true }),
    note({
      measureKey: '0:1', measureNumber: 2, measureIndex: 1,
      startBeat: 0, beats: 2, tieStop: true,
    }),
    note({
      measureKey: '0:1', measureNumber: 2, measureIndex: 1,
      startBeat: 2, beats: 2, isRest: true, midi: null, step: null, octave: null,
    }),
  ]
  const parsed = parseFormat0(encodeMidiFile(notes))
  assert.deepEqual(
    parsed.events.filter((event) => event.kind === 'on').map((event) => [event.tick, event.data1]),
    [[960, 60]],
  )
  assert.deepEqual(
    parsed.events.filter((event) => event.kind === 'off').map((event) => [event.tick, event.data1]),
    [[2880, 60]],
  )
})

test('Package 3G grace-note MIDI duration reuses the existing playback approximation', () => {
  const notes = [
    note({ isGrace: true, beats: 0, duration: null, startBeat: 0, midi: 62, step: 'D' }),
    note({ startBeat: 0, midi: 64, step: 'E' }),
    note({ isRest: true, midi: null, step: null, octave: null, startBeat: 1, beats: 3 }),
  ]
  const timeline = buildCanonicalMidiTimeline(notes)
  const grace = timeline.events.find((event) => event.isGrace)
  assert.equal(grace.durationBeats, MIDI_GRACE_PLAYBACK_BEATS)

  const parsed = parseFormat0(encodeMidiFile(notes))
  const graceOff = parsed.events.find((event) => event.kind === 'off' && event.data1 === 62)
  assert.equal(graceOff.tick, Math.round(MIDI_GRACE_PLAYBACK_BEATS * MIDI_PPQ))
})

test('Package 3G derives measure offsets from observed canonical spans and refuses gaps', () => {
  const notes = [
    note({ startBeat: 0, beats: 4, duration: 'whole' }),
    note({ measureKey: '0:1', measureNumber: 2, measureIndex: 1, startBeat: 0, beats: 3, duration: 'half' }),
  ]
  const layout = buildCanonicalMeasureOffsets(notes)
  assert.deepEqual(
    layout.measures.map((measure) => [measure.measureIndex, measure.offsetBeat, measure.durationBeats]),
    [[0, 0, 4], [1, 4, 3]],
  )

  assert.throws(
    () => buildCanonicalMeasureOffsets([
      note(),
      note({ measureKey: '0:2', measureNumber: 3, measureIndex: 2 }),
    ]),
    /missing physical measure/,
  )
})

test('Package 3G fails closed for invalid pitch, timing, part or identity instead of guessing', () => {
  assert.throws(() => encodeMidiFile([note({ midi: 128 })]), /integer pitch/)
  assert.throws(() => encodeMidiFile([note({ startBeat: -1 })]), /measureIndex and startBeat/)
  assert.throws(() => encodeMidiFile([note({ beats: 0, duration: null })]), /positive canonical duration/)
  assert.throws(() => encodeMidiFile([note({ measureKey: null })]), /canonical measureKey/)
  assert.throws(
    () => encodeMidiFile([note(), note({ partIndex: 1 })]),
    /exactly one canonical part/,
  )
})

test('Package 3G playback gate is checked against the exact full array before bytes exist', () => {
  const notes = [note({ beats: 4, duration: 'whole' })]
  let gated = null
  const accepted = createGatedMidiArtifact(notes, {
    sourceName: 'örnek.musicxml',
    resolveGate(value) {
      gated = value
      return { decision: 'ACCEPT' }
    },
  })
  assert.equal(gated, notes)
  assert.equal(accepted.ok, true)
  assert.equal(accepted.artifact.fileName, 'örnek.mid')
  assert.equal(accepted.artifact.bytes instanceof Uint8Array, true)

  const review = createGatedMidiArtifact(notes, {
    resolveGate: () => ({ decision: 'REVIEW' }),
  })
  assert.equal(review.ok, false)
  assert.equal(review.artifact, null)
  assert.match(review.message, /henüz doğrulanmadı/)
})

test('Package 3G artifact naming is deterministic and path-safe', () => {
  assert.equal(midiFileName('parça.musicxml'), 'parça.mid')
  assert.equal(midiFileName('C:\\scores\\parça.pdf'), 'parça.mid')
  assert.equal(midiFileName('../bad:name?.xml'), 'bad_name_.mid')
  assert.equal(midiFileName('lesson...   '), 'lesson.mid')
  assert.equal(midiFileName(`lesson${'. '.repeat(20000)}`), 'lesson.mid')
  assert.equal(midiFileName(''), 'seslitab.mid')

  const artifact = createMidiArtifact([note({ beats: 4, duration: 'whole' })], {
    sourceName: 'ders.pdf',
    tempo: 90,
  })
  assert.equal(artifact.fileName, 'ders.mid')
  assert.equal(artifact.mimeType, 'audio/midi')
  assert.equal(artifact.tempo, 90)
})

test('Package 3G variable-length encoding covers MIDI boundary values', () => {
  assert.deepEqual(encodeVariableLength(0), [0])
  assert.deepEqual(encodeVariableLength(127), [0x7f])
  assert.deepEqual(encodeVariableLength(128), [0x81, 0x00])
  assert.deepEqual(encodeVariableLength(0x0fffffff), [0xff, 0xff, 0xff, 0x7f])
  assert.throws(() => encodeVariableLength(0x10000000), /VLQ range/)
})

test('Package 3G reviewed real-OMR fixture produces stable bytes only when gate is explicitly accepted', () => {
  const xml = readFileSync(new URL('./fixtures/real-omr/django-clean.xml', import.meta.url), 'utf8')
  const notes = parseMusicXmlToNotes(xml).notes
  const before = JSON.stringify(notes)

  const blocked = createGatedMidiArtifact(notes)
  assert.equal(blocked.ok, false)
  assert.equal(blocked.artifact, null)

  const first = createGatedMidiArtifact(notes, { resolveGate: () => ({ decision: 'ACCEPT' }) })
  const second = createGatedMidiArtifact(notes, { resolveGate: () => ({ decision: 'ACCEPT' }) })
  assert.equal(first.ok, true)
  assert.deepEqual(first.artifact.bytes, second.artifact.bytes)
  assert.equal(JSON.stringify(notes), before)
})

test('Package 3G MIDI encoder introduces no external MIDI dependency or production OMR import', () => {
  const source = readFileSync(new URL('../src/services/midiExport.js', import.meta.url), 'utf8')
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

  assert.doesNotMatch(source, /AudiverisProvider|omrWorker|gatewayProvider|omrService/)
  assert.equal(Object.keys(packageJson.dependencies).some((name) => /midi/i.test(name)), false)
  assert.equal(Object.keys(packageJson.devDependencies).some((name) => /midi/i.test(name)), false)
})
