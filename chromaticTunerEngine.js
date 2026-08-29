export const TUNER_DETECTION_STATE = Object.freeze({
  DETECTED: 'detected',
  NO_SIGNAL: 'no-signal',
  UNSTABLE: 'unstable',
  INVALID: 'invalid',
})

export const TUNER_GUIDANCE_STATE = Object.freeze({
  VERY_FLAT: 'very-flat',
  FLAT: 'flat',
  NEAR_FLAT: 'near-flat',
  IN_TUNE: 'in-tune',
  NEAR_SHARP: 'near-sharp',
  SHARP: 'sharp',
  VERY_SHARP: 'very-sharp',
})

export const DEFAULT_REFERENCE_A4_HZ = 440
export const MIN_REFERENCE_A4_HZ = 415
export const MAX_REFERENCE_A4_HZ = 466.2
export const DEFAULT_TUNER_MIN_HZ = 40
export const DEFAULT_TUNER_MAX_HZ = 2000

const NOTE_NAMES = Object.freeze([
  Object.freeze({ latin: 'C', turkish: 'Do', enharmonic: 'Do' }),
  Object.freeze({ latin: 'C♯/D♭', turkish: 'Do diyez / Re bemol', enharmonic: 'Do♯ / Re♭' }),
  Object.freeze({ latin: 'D', turkish: 'Re', enharmonic: 'Re' }),
  Object.freeze({ latin: 'D♯/E♭', turkish: 'Re diyez / Mi bemol', enharmonic: 'Re♯ / Mi♭' }),
  Object.freeze({ latin: 'E', turkish: 'Mi', enharmonic: 'Mi' }),
  Object.freeze({ latin: 'F', turkish: 'Fa', enharmonic: 'Fa' }),
  Object.freeze({ latin: 'F♯/G♭', turkish: 'Fa diyez / Sol bemol', enharmonic: 'Fa♯ / Sol♭' }),
  Object.freeze({ latin: 'G', turkish: 'Sol', enharmonic: 'Sol' }),
  Object.freeze({ latin: 'G♯/A♭', turkish: 'Sol diyez / La bemol', enharmonic: 'Sol♯ / La♭' }),
  Object.freeze({ latin: 'A', turkish: 'La', enharmonic: 'La' }),
  Object.freeze({ latin: 'A♯/B♭', turkish: 'La diyez / Si bemol', enharmonic: 'La♯ / Si♭' }),
  Object.freeze({ latin: 'B', turkish: 'Si', enharmonic: 'Si' }),
])

export const CHROMATIC_NOTE_NAMES = NOTE_NAMES

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function validReference(referenceA4) {
  return isFiniteNumber(referenceA4)
    && referenceA4 >= MIN_REFERENCE_A4_HZ
    && referenceA4 <= MAX_REFERENCE_A4_HZ
}

function freezeResult(value) {
  return Object.freeze(value)
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function frequencyToChromaticPitch(frequencyHz, referenceA4 = DEFAULT_REFERENCE_A4_HZ) {
  if (!isFiniteNumber(frequencyHz) || frequencyHz <= 0 || !validReference(referenceA4)) return null

  const midiFloat = 69 + (12 * Math.log2(frequencyHz / referenceA4))
  if (!Number.isFinite(midiFloat)) return null

  const midi = Math.round(midiFloat)
  const pitchClass = ((midi % 12) + 12) % 12
  const octave = Math.floor(midi / 12) - 1
  const cents = (midiFloat - midi) * 100
  const names = NOTE_NAMES[pitchClass]
  const targetFrequencyHz = referenceA4 * (2 ** ((midi - 69) / 12))

  return freezeResult({
    midi,
    pitchClass,
    octave,
    frequencyHz,
    targetFrequencyHz,
    cents,
    latinName: names.latin,
    turkishName: names.turkish,
    displayName: names.enharmonic,
    referenceA4,
  })
}

export function evaluateTuningCents(cents, options = {}) {
  if (!isFiniteNumber(cents)) return null

  const inTuneCents = isFiniteNumber(options.inTuneCents) ? Math.abs(options.inTuneCents) : 2
  const nearCents = isFiniteNumber(options.nearCents) ? Math.abs(options.nearCents) : 5
  const veryCents = isFiniteNumber(options.veryCents) ? Math.abs(options.veryCents) : 25
  if (inTuneCents <= 0 || nearCents < inTuneCents || veryCents < nearCents) return null

  const abs = Math.abs(cents)
  if (abs <= inTuneCents) {
    return freezeResult({ state: TUNER_GUIDANCE_STATE.IN_TUNE, direction: 'center', label: 'Akortta' })
  }
  if (cents < 0) {
    if (abs <= nearCents) return freezeResult({ state: TUNER_GUIDANCE_STATE.NEAR_FLAT, direction: 'up', label: 'Çok yakın — biraz tizleştir' })
    if (abs <= veryCents) return freezeResult({ state: TUNER_GUIDANCE_STATE.FLAT, direction: 'up', label: 'Pes — tizleştir' })
    return freezeResult({ state: TUNER_GUIDANCE_STATE.VERY_FLAT, direction: 'up', label: 'Çok pes — tizleştir' })
  }

  if (abs <= nearCents) return freezeResult({ state: TUNER_GUIDANCE_STATE.NEAR_SHARP, direction: 'down', label: 'Çok yakın — biraz pesleştir' })
  if (abs <= veryCents) return freezeResult({ state: TUNER_GUIDANCE_STATE.SHARP, direction: 'down', label: 'Tiz — pesleştir' })
  return freezeResult({ state: TUNER_GUIDANCE_STATE.VERY_SHARP, direction: 'down', label: 'Çok tiz — pesleştir' })
}

function downsampleByAveraging(samples, sampleRate, targetSampleRate = 24000) {
  const factor = Math.max(1, Math.floor(sampleRate / targetSampleRate))
  if (factor === 1) return { samples, sampleRate }

  const outputLength = Math.floor(samples.length / factor)
  const output = new Float64Array(outputLength)
  for (let i = 0; i < outputLength; i += 1) {
    let sum = 0
    const offset = i * factor
    for (let j = 0; j < factor; j += 1) sum += samples[offset + j]
    output[i] = sum / factor
  }
  return { samples: output, sampleRate: sampleRate / factor }
}

function rootMeanSquare(samples) {
  let sum = 0
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}

function interpolateTau(cmnd, tau) {
  if (tau <= 1 || tau >= cmnd.length - 1) return tau
  const left = cmnd[tau - 1]
  const center = cmnd[tau]
  const right = cmnd[tau + 1]
  const denominator = left - (2 * center) + right
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-12) return tau
  const shift = clamp(0.5 * (left - right) / denominator, -1, 1)
  return tau + shift
}

export function detectFundamentalYin(samples, sampleRate, options = {}) {
  const supportedSamples = samples instanceof Float32Array || samples instanceof Float64Array
  if (!supportedSamples || samples.length < 512 || !isFiniteNumber(sampleRate) || sampleRate <= 0) {
    return freezeResult({ state: TUNER_DETECTION_STATE.INVALID, frequencyHz: null, confidence: 0, rms: 0 })
  }

  const minHz = isFiniteNumber(options.minHz) ? options.minHz : DEFAULT_TUNER_MIN_HZ
  const maxHz = isFiniteNumber(options.maxHz) ? options.maxHz : DEFAULT_TUNER_MAX_HZ
  const threshold = isFiniteNumber(options.threshold) ? options.threshold : 0.12
  const minConfidence = isFiniteNumber(options.minConfidence) ? options.minConfidence : 0.72
  const minRms = isFiniteNumber(options.minRms) ? options.minRms : 0.004
  if (minHz <= 0 || maxHz <= minHz || maxHz >= sampleRate / 2 || threshold <= 0 || threshold >= 1 || minConfidence < 0 || minConfidence > 1 || minRms < 0) {
    return freezeResult({ state: TUNER_DETECTION_STATE.INVALID, frequencyHz: null, confidence: 0, rms: 0 })
  }

  const rms = rootMeanSquare(samples)
  if (!Number.isFinite(rms) || rms < minRms) {
    return freezeResult({ state: TUNER_DETECTION_STATE.NO_SIGNAL, frequencyHz: null, confidence: 0, rms: Number.isFinite(rms) ? rms : 0 })
  }

  const reduced = downsampleByAveraging(samples, sampleRate)
  const signal = reduced.samples
  const effectiveRate = reduced.sampleRate
  const minLag = Math.max(2, Math.floor(effectiveRate / maxHz))
  const maxLag = Math.min(Math.floor(effectiveRate / minHz), Math.floor(signal.length / 2) - 1)
  if (maxLag <= minLag + 2) {
    return freezeResult({ state: TUNER_DETECTION_STATE.INVALID, frequencyHz: null, confidence: 0, rms })
  }

  const difference = new Float64Array(maxLag + 1)
  const cmnd = new Float64Array(maxLag + 1)
  cmnd[0] = 1

  for (let tau = 1; tau <= maxLag; tau += 1) {
    let sum = 0
    const limit = signal.length - tau
    for (let i = 0; i < limit; i += 1) {
      const delta = signal[i] - signal[i + tau]
      sum += delta * delta
    }
    difference[tau] = sum
  }

  let runningSum = 0
  for (let tau = 1; tau <= maxLag; tau += 1) {
    runningSum += difference[tau]
    cmnd[tau] = runningSum > 0 ? (difference[tau] * tau) / runningSum : 1
  }

  let tauEstimate = -1
  for (let tau = minLag; tau <= maxLag; tau += 1) {
    if (cmnd[tau] < threshold) {
      while (tau + 1 <= maxLag && cmnd[tau + 1] < cmnd[tau]) tau += 1
      tauEstimate = tau
      break
    }
  }

  if (tauEstimate < 0) {
    let bestTau = minLag
    for (let tau = minLag + 1; tau <= maxLag; tau += 1) {
      if (cmnd[tau] < cmnd[bestTau]) bestTau = tau
    }
    tauEstimate = bestTau
  }

  const confidence = clamp(1 - cmnd[tauEstimate], 0, 1)
  if (!Number.isFinite(confidence) || confidence < minConfidence) {
    return freezeResult({ state: TUNER_DETECTION_STATE.UNSTABLE, frequencyHz: null, confidence: Number.isFinite(confidence) ? confidence : 0, rms })
  }

  const refinedTau = interpolateTau(cmnd, tauEstimate)
  const frequencyHz = effectiveRate / refinedTau
  if (!Number.isFinite(frequencyHz) || frequencyHz < minHz || frequencyHz > maxHz) {
    return freezeResult({ state: TUNER_DETECTION_STATE.UNSTABLE, frequencyHz: null, confidence, rms })
  }

  return freezeResult({ state: TUNER_DETECTION_STATE.DETECTED, frequencyHz, confidence, rms })
}

export function analyzeChromaticTunerFrame(samples, sampleRate, options = {}) {
  const referenceA4 = options.referenceA4 ?? DEFAULT_REFERENCE_A4_HZ
  if (!validReference(referenceA4)) {
    return freezeResult({ state: TUNER_DETECTION_STATE.INVALID, detection: null, pitch: null, guidance: null })
  }

  const detection = detectFundamentalYin(samples, sampleRate, options)
  if (detection.state !== TUNER_DETECTION_STATE.DETECTED) {
    return freezeResult({ state: detection.state, detection, pitch: null, guidance: null })
  }

  const pitch = frequencyToChromaticPitch(detection.frequencyHz, referenceA4)
  const guidance = pitch ? evaluateTuningCents(pitch.cents, options) : null
  if (!pitch || !guidance) {
    return freezeResult({ state: TUNER_DETECTION_STATE.INVALID, detection, pitch: null, guidance: null })
  }

  return freezeResult({ state: TUNER_DETECTION_STATE.DETECTED, detection, pitch, guidance })
}
