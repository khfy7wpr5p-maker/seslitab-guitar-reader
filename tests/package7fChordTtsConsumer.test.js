import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { CHORD_SOURCE_CONSUMER_STATE } from '../src/services/chordSourceConsumer.js'
import {
  CHORD_TTS_STATE,
  speakChordSourceResult,
} from '../src/services/chordTtsConsumer.js'

function sourceReady(overrides = {}) {
  return Object.freeze({
    state: CHORD_SOURCE_CONSUMER_STATE.SOURCE_READY,
    renderable: true,
    speakable: true,
    sourceOnly: true,
    definitive: false,
    teacherApproved: false,
    displayText: 'Ölçü 1, ölçü başlangıcı: C',
    spokenText: 'Ölçü 1, ölçü başlangıcı, kaynak akor işareti: Do majör akoru.',
    message: '',
    ...overrides,
  })
}

test('Package 7F speaks the exact Package 7C source text through the existing adapter contract', async () => {
  const source = sourceReady()
  let receivedText = null
  let receivedRate = null
  let started = false
  const result = await speakChordSourceResult(source, {
    rate: 1.25,
    onStart: () => { started = true },
    adapters: {
      async speakRhythmicText(text, rate, onStart) {
        receivedText = text
        receivedRate = rate
        onStart?.()
      },
    },
  })

  assert.equal(receivedText, source.spokenText)
  assert.equal(receivedRate, 1.25)
  assert.equal(started, true)
  assert.equal(result.ok, true)
  assert.equal(result.state, CHORD_TTS_STATE.SPOKEN)
  assert.equal(result.text, source.spokenText)
  assert.equal(result.sourceOnly, true)
  assert.equal(result.definitive, false)
  assert.equal(result.teacherApproved, false)
})

test('Package 7F never speaks REVIEW, EMPTY, INVALID or NO_SOURCE evidence', async () => {
  let calls = 0
  for (const state of [
    CHORD_SOURCE_CONSUMER_STATE.REVIEW_REQUIRED,
    CHORD_SOURCE_CONSUMER_STATE.EMPTY,
    CHORD_SOURCE_CONSUMER_STATE.INVALID,
    CHORD_SOURCE_CONSUMER_STATE.NO_SOURCE,
  ]) {
    const result = await speakChordSourceResult({ state, spokenText: 'Do majör' }, {
      adapters: { async speakRhythmicText() { calls += 1 } },
    })
    assert.equal(result.ok, false)
    assert.equal(result.state, CHORD_TTS_STATE.NOT_AVAILABLE)
    assert.equal(result.text, '')
  }
  assert.equal(calls, 0)
})

test('Package 7F rejects promoted teacher/definitive or contradictory source-ready evidence', async () => {
  let calls = 0
  const invalid = [
    sourceReady({ teacherApproved: true }),
    sourceReady({ definitive: true }),
    sourceReady({ sourceOnly: false }),
    sourceReady({ speakable: false }),
    sourceReady({ spokenText: '' }),
  ]
  for (const source of invalid) {
    const result = await speakChordSourceResult(source, {
      adapters: { async speakRhythmicText() { calls += 1 } },
    })
    assert.equal(result.ok, false)
  }
  assert.equal(calls, 0)
})

test('Package 7F uses a safe rate fallback without changing text', async () => {
  const rates = []
  const source = sourceReady()
  await speakChordSourceResult(source, {
    rate: Number.NaN,
    adapters: { async speakRhythmicText(text, rate) { assert.equal(text, source.spokenText); rates.push(rate) } },
  })
  assert.deepEqual(rates, [1])
})

test('Package 7F source reuses voiceService and imports no OMR/network/parser inference surface', async () => {
  const source = await readFile(new URL('../src/services/chordTtsConsumer.js', import.meta.url), 'utf8')
  assert.match(source, /voiceService\.js/)
  assert.doesNotMatch(source, /Audiveris|omrService|gateway|worker/i)
  assert.doesNotMatch(source, /DOMParser|parseMusicXml|inferChord|notesToChord/i)
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket/)
})
