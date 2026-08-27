import test from 'node:test'
import assert from 'node:assert/strict'

import {
  SELECTED_MEASURE_CONSUMER,
  playSelectedMeasure,
  resolveSelectedMeasureConsumption,
  speakSelectedMeasure,
} from '../src/services/selectedMeasureConsumer.js'

function note(key, measureIndex, midi) {
  return {
    measureKey: key,
    measureNumber: measureIndex + 1,
    measureIndex,
    partIndex: 0,
    partId: 'P1',
    startBeat: 0,
    beats: 1,
    duration: 'quarter',
    midi,
    frequency: 440,
    noteName: 'La',
  }
}

const acceptGate = () => ({ decision: 'ACCEPT' })

test('Package 3E gates the exact full canonical array before selecting a measure', () => {
  const notes = [note('0:0', 0, 60), note('0:1', 1, 62)]
  let gated = null
  const result = resolveSelectedMeasureConsumption({
    notes,
    measureKey: '0:1',
    consumer: SELECTED_MEASURE_CONSUMER.TTS,
    gateOverrides: {
      resolveTtsGate(value) {
        gated = value
        return { decision: 'ACCEPT' }
      },
    },
  })

  assert.equal(gated, notes)
  assert.equal(result.ok, true)
  assert.equal(result.measureKey, '0:1')
  assert.equal(result.notes.length, 1)
  assert.equal(result.notes[0], notes[1])
})

test('Package 3E REVIEW/BLOCK never starts a selected consumer', async () => {
  const notes = [note('0:0', 0, 60)]
  const calls = []
  const result = await speakSelectedMeasure({
    notes,
    measureKey: '0:0',
    gateOverrides: { resolveTtsGate: () => ({ decision: 'REVIEW' }) },
    adapters: {
      stopRhythm: () => calls.push('stopRhythm'),
      stopSpeech: () => calls.push('stopSpeech'),
      notesToSpokenText: () => calls.push('text'),
      speakRhythmicText: async () => calls.push('speak'),
    },
  })

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'quality-gate-not-accepted')
  assert.deepEqual(calls, [])
})

test('Package 3E missing or stale measureKey fails closed after an ACCEPT gate', async () => {
  const notes = [note('0:0', 0, 60)]
  const calls = []
  const result = await playSelectedMeasure({
    notes,
    measureKey: '0:99',
    gateOverrides: { resolvePlaybackGate: acceptGate },
    adapters: {
      stopSpeech: () => calls.push('stopSpeech'),
      stopRhythm: () => calls.push('stopRhythm'),
      playRhythm: async () => calls.push('play'),
    },
  })

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'canonical-measure-not-selected')
  assert.deepEqual(calls, [])
})

test('Package 3E TTS stops other consumers and speaks only exact selected NoteObject references', async () => {
  const notes = [note('0:0', 0, 60), note('0:1', 1, 62)]
  const calls = []
  let projected = null
  const result = await speakSelectedMeasure({
    notes,
    measureKey: '0:1',
    rate: 1.25,
    gateOverrides: { resolveTtsGate: acceptGate },
    adapters: {
      stopRhythm: () => calls.push('stopRhythm'),
      stopSpeech: () => calls.push('stopSpeech'),
      notesToSpokenText(selected) {
        projected = selected
        calls.push('text')
        return 'ölçü metni'
      },
      async speakRhythmicText(text, rate) {
        calls.push(['speak', text, rate])
      },
    },
  })

  assert.equal(projected[0], notes[1])
  assert.deepEqual(calls, [
    'stopRhythm',
    'stopSpeech',
    'text',
    ['speak', 'ölçü metni', 1.25],
  ])
  assert.equal(result.ok, true)
  assert.equal(result.text, 'ölçü metni')
})

test('Package 3E playback stops other consumers and plays only exact selected NoteObject references', async () => {
  const notes = [note('0:0', 0, 60), note('0:1', 1, 62)]
  const calls = []
  let played = null
  const result = await playSelectedMeasure({
    notes,
    measureKey: '0:0',
    speed: 0.75,
    gateOverrides: { resolvePlaybackGate: acceptGate },
    adapters: {
      stopSpeech: () => calls.push('stopSpeech'),
      stopRhythm: () => calls.push('stopRhythm'),
      async playRhythm(selected, speed) {
        played = selected
        calls.push(['play', speed])
      },
    },
  })

  assert.equal(played[0], notes[0])
  assert.deepEqual(calls, ['stopSpeech', 'stopRhythm', ['play', 0.75]])
  assert.equal(result.ok, true)
})

test('Package 3E unsupported consumer fails closed and never mutates notes', () => {
  const notes = [note('0:0', 0, 60)]
  const before = JSON.stringify(notes)
  assert.throws(
    () => resolveSelectedMeasureConsumption({
      notes,
      measureKey: '0:0',
      consumer: 'unknown',
    }),
    /Unsupported selected-measure consumer/,
  )
  assert.equal(JSON.stringify(notes), before)
})
