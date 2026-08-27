// Package 3E — quality-gated selected-measure TTS and playback.
//
// Quality evidence is registered against the exact full canonical NoteObject[]
// identity by Package 2D. Therefore the full array is always gated first.
// Only after ACCEPT do we resolve the selected canonical measureKey and pass
// its exact original NoteObject references to the requested consumer.

import { selectCanonicalMeasure } from './measureIdentity.js'
import {
  QUALITY_GATE_DECISION,
  qualityGateUserMessage,
  resolveAppPlaybackGate,
  resolveAppTtsGate,
} from './appQualityGate.js'
import { notesToSpokenText } from './musicEngine.js'
import {
  playRhythm,
  speakRhythmicText,
  stopRhythm,
  stopSpeech,
} from './voiceService.js'

export const SELECTED_MEASURE_CONSUMER = Object.freeze({
  TTS: 'tts',
  PLAYBACK: 'playback',
})

function assertConsumer(consumer) {
  if (!Object.values(SELECTED_MEASURE_CONSUMER).includes(consumer)) {
    throw new TypeError('Unsupported selected-measure consumer.')
  }
}

function resolveGate(notes, consumer, overrides = {}) {
  if (consumer === SELECTED_MEASURE_CONSUMER.TTS) {
    return (overrides.resolveTtsGate ?? resolveAppTtsGate)(notes)
  }
  return (overrides.resolvePlaybackGate ?? resolveAppPlaybackGate)(notes)
}

function frozenDenied(consumer, gate, reason, message) {
  return Object.freeze({
    ok: false,
    consumer,
    reason,
    message,
    gate,
    measureKey: null,
    notes: null,
  })
}

/**
 * Resolve one selected measure without cloning musical data.
 * The full NoteObject[] is quality-gated before the selected sub-array is used.
 */
export function resolveSelectedMeasureConsumption({
  notes,
  measureKey,
  consumer,
  gateOverrides = {},
}) {
  if (!Array.isArray(notes)) {
    throw new TypeError('Full canonical NoteObject array is required.')
  }
  assertConsumer(consumer)

  const gate = resolveGate(notes, consumer, gateOverrides)
  if (gate?.decision !== QUALITY_GATE_DECISION.ACCEPT) {
    return frozenDenied(
      consumer,
      gate,
      'quality-gate-not-accepted',
      qualityGateUserMessage(gate) || 'Bu ölçü güvenli tüketim için doğrulanmadı.',
    )
  }

  const group = selectCanonicalMeasure(notes, measureKey)
  if (!group) {
    return frozenDenied(
      consumer,
      gate,
      'canonical-measure-not-selected',
      'Önce doğrulanmış bir ölçü seçin.',
    )
  }

  return Object.freeze({
    ok: true,
    consumer,
    reason: 'accepted',
    message: '',
    gate,
    measureKey: group.measureKey,
    notes: group.notes,
  })
}

export async function speakSelectedMeasure({
  notes,
  measureKey,
  rate = 1,
  gateOverrides = {},
  adapters = {},
}) {
  const resolved = resolveSelectedMeasureConsumption({
    notes,
    measureKey,
    consumer: SELECTED_MEASURE_CONSUMER.TTS,
    gateOverrides,
  })
  if (!resolved.ok) return resolved

  const stopAudio = adapters.stopRhythm ?? stopRhythm
  const stopVoice = adapters.stopSpeech ?? stopSpeech
  const toSpokenText = adapters.notesToSpokenText ?? notesToSpokenText
  const speak = adapters.speakRhythmicText ?? speakRhythmicText

  // Selected consumers are mutually exclusive. Stop both current browser
  // consumers before starting the newly requested one.
  stopAudio()
  stopVoice()

  const text = toSpokenText(resolved.notes)
  await speak(text, rate)

  return Object.freeze({ ...resolved, text })
}

export async function playSelectedMeasure({
  notes,
  measureKey,
  speed = 1,
  onNote = undefined,
  gateOverrides = {},
  adapters = {},
}) {
  const resolved = resolveSelectedMeasureConsumption({
    notes,
    measureKey,
    consumer: SELECTED_MEASURE_CONSUMER.PLAYBACK,
    gateOverrides,
  })
  if (!resolved.ok) return resolved

  const stopVoice = adapters.stopSpeech ?? stopSpeech
  const stopAudio = adapters.stopRhythm ?? stopRhythm
  const play = adapters.playRhythm ?? playRhythm

  stopVoice()
  stopAudio()
  await play(resolved.notes, speed, onNote)
  return resolved
}
