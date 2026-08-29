import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  CHROMATIC_NOTE_NAMES,
  DEFAULT_REFERENCE_A4_HZ,
  TUNER_DETECTION_STATE,
  TUNER_GUIDANCE_STATE,
  analyzeChromaticTunerFrame,
  detectFundamentalYin,
  evaluateTuningCents,
  frequencyToChromaticPitch,
} from '../chromaticTunerEngine.js'

function sine(frequencyHz, sampleRate = 48000, length = 8192, amplitude = 0.6) {
  const samples = new Float32Array(length)
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = amplitude * Math.sin((2 * Math.PI * frequencyHz * i) / sampleRate)
  }
  return samples
}

function centsBetween(actual, expected) {
  return 1200 * Math.log2(actual / expected)
}

test('Package 11 exposes exactly 12 chromatic pitch classes including enharmonic accidentals', () => {
  assert.equal(CHROMATIC_NOTE_NAMES.length, 12)
  assert.equal(CHROMATIC_NOTE_NAMES[1].enharmonic, 'Do♯ / Re♭')
  assert.ok(Object.isFrozen(CHROMATIC_NOTE_NAMES))
})

test('Package 11 maps standard A4 to La4 at zero cents', () => {
  const pitch = frequencyToChromaticPitch(440)
  assert.equal(pitch.turkishName, 'La')
  assert.equal(pitch.octave, 4)
  assert.equal(pitch.midi, 69)
  assert.ok(Math.abs(pitch.cents) < 1e-9)
  assert.equal(pitch.referenceA4, DEFAULT_REFERENCE_A4_HZ)
})

test('Package 11 calibration makes 442 Hz exact La4 when A4 is 442 Hz', () => {
  const pitch = frequencyToChromaticPitch(442, 442)
  assert.equal(pitch.midi, 69)
  assert.ok(Math.abs(pitch.cents) < 1e-9)
})

test('Package 11 maps all 12 chromatic classes without guitar-string assumptions', () => {
  const seen = new Set()
  for (let midi = 60; midi < 72; midi += 1) {
    const frequency = 440 * (2 ** ((midi - 69) / 12))
    const pitch = frequencyToChromaticPitch(frequency)
    seen.add(pitch.pitchClass)
  }
  assert.equal(seen.size, 12)
})

test('Package 11 classifies cent direction with explicit accessible guidance', () => {
  assert.equal(evaluateTuningCents(0).state, TUNER_GUIDANCE_STATE.IN_TUNE)
  assert.equal(evaluateTuningCents(-4).state, TUNER_GUIDANCE_STATE.NEAR_FLAT)
  assert.equal(evaluateTuningCents(4).state, TUNER_GUIDANCE_STATE.NEAR_SHARP)
  assert.equal(evaluateTuningCents(-18).state, TUNER_GUIDANCE_STATE.FLAT)
  assert.equal(evaluateTuningCents(18).state, TUNER_GUIDANCE_STATE.SHARP)
})

test('Package 11 YIN detector resolves guitar low E2 with sub-cent synthetic error', () => {
  const expected = 82.4068892282
  const result = detectFundamentalYin(sine(expected), 48000)
  assert.equal(result.state, TUNER_DETECTION_STATE.DETECTED)
  assert.ok(Math.abs(centsBetween(result.frequencyHz, expected)) < 1)
  assert.ok(result.confidence > 0.95)
})

test('Package 11 YIN detector resolves concert A4 with professional-scale cent precision', () => {
  const result = detectFundamentalYin(sine(440), 48000)
  assert.equal(result.state, TUNER_DETECTION_STATE.DETECTED)
  assert.ok(Math.abs(centsBetween(result.frequencyHz, 440)) < 1)
})

test('Package 11 remains chromatic above the violin open strings', () => {
  const expected = 1318.51022765
  const result = detectFundamentalYin(sine(expected), 48000)
  assert.equal(result.state, TUNER_DETECTION_STATE.DETECTED)
  assert.ok(Math.abs(centsBetween(result.frequencyHz, expected)) < 3)
  const pitch = frequencyToChromaticPitch(result.frequencyHz)
  assert.equal(pitch.turkishName, 'Mi')
  assert.equal(pitch.octave, 6)
})

test('Package 11 rejects silence instead of inventing a note', () => {
  const result = detectFundamentalYin(new Float32Array(8192), 48000)
  assert.equal(result.state, TUNER_DETECTION_STATE.NO_SIGNAL)
  assert.equal(result.frequencyHz, null)
})

test('Package 11 full-frame analysis returns pitch plus guidance only for detected audio', () => {
  const detected = analyzeChromaticTunerFrame(sine(440), 48000)
  assert.equal(detected.state, TUNER_DETECTION_STATE.DETECTED)
  assert.equal(detected.pitch.midi, 69)
  assert.ok(detected.guidance)

  const silent = analyzeChromaticTunerFrame(new Float32Array(8192), 48000)
  assert.equal(silent.state, TUNER_DETECTION_STATE.NO_SIGNAL)
  assert.equal(silent.pitch, null)
  assert.equal(silent.guidance, null)
})

test('Package 11 fails closed for invalid calibration, sample type and analysis bounds', () => {
  assert.equal(frequencyToChromaticPitch(440, 500), null)
  assert.equal(detectFundamentalYin([], 48000).state, TUNER_DETECTION_STATE.INVALID)
  assert.equal(detectFundamentalYin(sine(440), 48000, { minHz: 2000, maxHz: 1000 }).state, TUNER_DETECTION_STATE.INVALID)
})

test('Package 11 source keeps microphone processing local and isolated from OMR/deployment boundaries', async () => {
  const engine = await readFile(new URL('../chromaticTunerEngine.js', import.meta.url), 'utf8')
  const ui = await readFile(new URL('../src/package11TunerUi.js', import.meta.url), 'utf8')
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8')
  const combined = `${engine}\n${ui}`

  assert.match(ui, /getUserMedia/)
  assert.match(ui, /getFloatTimeDomainData/)
  assert.match(ui, /echoCancellation: false/)
  assert.match(ui, /noiseSuppression: false/)
  assert.match(ui, /autoGainControl: false/)
  assert.equal(combined.includes('fetch('), false)
  for (const forbidden of ['AudiverisProvider', 'gatewayProvider', 'omrWorker', 'render.yaml', 'Dockerfile']) {
    assert.equal(combined.includes(forbidden), false, `forbidden tuner dependency: ${forbidden}`)
  }
  assert.match(main, /package11TunerUi\.css/)
  assert.match(main, /package11TunerUi\.js/)
})
