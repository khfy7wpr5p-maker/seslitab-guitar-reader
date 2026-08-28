// Package 7F — source-only chord TTS adapter.
//
// Reuses the existing Turkish speech lifecycle in voiceService. It accepts only
// a Package 7C source-ready result and never parses/invents musical semantics.

import { CHORD_SOURCE_CONSUMER_STATE } from './chordSourceConsumer.js'
import { speakRhythmicText } from './voiceService.js'

export const CHORD_TTS_STATE = Object.freeze({
  SPOKEN: 'spoken',
  NOT_AVAILABLE: 'not-available',
})

function denied(message) {
  return Object.freeze({
    ok: false,
    state: CHORD_TTS_STATE.NOT_AVAILABLE,
    message,
    text: '',
    sourceOnly: true,
    definitive: false,
    teacherApproved: false,
  })
}

function validateSourceReady(result) {
  return Boolean(
    result &&
    result.state === CHORD_SOURCE_CONSUMER_STATE.SOURCE_READY &&
    result.renderable === true &&
    result.speakable === true &&
    result.sourceOnly === true &&
    result.definitive === false &&
    result.teacherApproved === false &&
    typeof result.spokenText === 'string' &&
    result.spokenText.trim() !== ''
  )
}

export async function speakChordSourceResult(result, options = {}) {
  if (!validateSourceReady(result)) {
    return denied(result?.message || 'Kaynak akor seslendirmesi kullanılamıyor.')
  }

  const rate = typeof options.rate === 'number' && Number.isFinite(options.rate) && options.rate > 0
    ? options.rate
    : 1
  const speak = options.adapters?.speakRhythmicText ?? speakRhythmicText

  await speak(result.spokenText, rate, options.onStart)

  return Object.freeze({
    ok: true,
    state: CHORD_TTS_STATE.SPOKEN,
    message: '',
    text: result.spokenText,
    sourceOnly: true,
    definitive: false,
    teacherApproved: false,
  })
}
