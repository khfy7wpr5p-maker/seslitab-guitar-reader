// Package 7C — source-only MusicXML chord consumer.
//
// This consumer never derives a chord from notes. It parses only the exact raw
// MusicXML source registered for the current NoteObject[] and converts Package 6
// harmony evidence into the Package 7A/B presentation model. READY output is
// explicitly source-only and never teacher-approved or definitive musical truth.

import {
  HARMONY_PARSE_STATE,
  parseMusicXmlHarmony,
} from '../../musicXmlHarmonyParser.js'
import {
  CHORD_PRESENTATION_STATE,
  buildChordPresentationModel,
} from './chordPresentation.js'
import {
  MUSICXML_SOURCE_PROVENANCE,
  resolveMusicXmlSourceForNotes,
} from './musicXmlSourceRegistry.js'

export const CHORD_SOURCE_CONSUMER_STATE = Object.freeze({
  SOURCE_READY: 'source-ready',
  EMPTY: 'empty',
  REVIEW_REQUIRED: 'review-required',
  INVALID: 'invalid',
  NO_SOURCE: 'no-source',
})

export const CHORD_SOURCE_CONSUMER_MESSAGE = Object.freeze({
  SOURCE_READY: 'MusicXML kaynak akor işaretleri hazır. Bu gösterim kaynak verisidir; öğretmen onayı değildir.',
  EMPTY: 'MusicXML içinde kaynak akor işareti bulunamadı.',
  REVIEW_REQUIRED: 'MusicXML akor işaretleri inceleme gerektiriyor. Akor metni veya seslendirme hazırlanmadı.',
  INVALID: 'MusicXML akor işaretleri güvenli biçimde okunamadı. Akor metni veya seslendirme hazırlanmadı.',
  NO_SOURCE: 'Bu sonuç için exact MusicXML kaynak kaydı bulunamadı.',
})

const PRESENTATION_PROVENANCE = 'musicxml-harmony-source-presentation'
const CONSUMER_PROVENANCE = 'musicxml-harmony-source-consumer'

function result(state, message, presentation = null) {
  const ready = state === CHORD_SOURCE_CONSUMER_STATE.SOURCE_READY
  return Object.freeze({
    state,
    message,
    renderable: ready,
    speakable: ready,
    sourceOnly: true,
    definitive: false,
    teacherApproved: false,
    displayText: ready ? presentation.displayText : '',
    spokenText: ready ? presentation.spokenText : '',
    presentation: ready ? presentation : null,
    provenance: CONSUMER_PROVENANCE,
  })
}

function validReadyPresentation(presentation) {
  return Boolean(
    presentation &&
    presentation.state === CHORD_PRESENTATION_STATE.READY &&
    presentation.provenance === PRESENTATION_PROVENANCE &&
    presentation.teacherApproved === false &&
    Array.isArray(presentation.items) &&
    presentation.items.length > 0 &&
    typeof presentation.displayText === 'string' &&
    presentation.displayText.trim() !== '' &&
    typeof presentation.spokenText === 'string' &&
    presentation.spokenText.trim() !== ''
  )
}

/**
 * Consume raw MusicXML as source evidence only.
 */
export function buildChordSourceConsumer(musicXml, adapters = {}) {
  if (typeof musicXml !== 'string' || musicXml.trim() === '') {
    return result(CHORD_SOURCE_CONSUMER_STATE.INVALID, CHORD_SOURCE_CONSUMER_MESSAGE.INVALID)
  }

  const parseHarmony = adapters.parseMusicXmlHarmony ?? parseMusicXmlHarmony
  const buildPresentation = adapters.buildChordPresentationModel ?? buildChordPresentationModel

  let parsed
  let presentation
  try {
    parsed = parseHarmony(musicXml)
    presentation = buildPresentation(parsed)
  } catch {
    return result(CHORD_SOURCE_CONSUMER_STATE.INVALID, CHORD_SOURCE_CONSUMER_MESSAGE.INVALID)
  }

  if (parsed?.state === HARMONY_PARSE_STATE.INVALID || presentation?.state === CHORD_PRESENTATION_STATE.INVALID) {
    return result(CHORD_SOURCE_CONSUMER_STATE.INVALID, CHORD_SOURCE_CONSUMER_MESSAGE.INVALID)
  }

  if (
    parsed?.state === HARMONY_PARSE_STATE.REVIEW_REQUIRED ||
    presentation?.state === CHORD_PRESENTATION_STATE.REVIEW_REQUIRED
  ) {
    return result(CHORD_SOURCE_CONSUMER_STATE.REVIEW_REQUIRED, CHORD_SOURCE_CONSUMER_MESSAGE.REVIEW_REQUIRED)
  }

  if (
    parsed?.state === HARMONY_PARSE_STATE.PARSED &&
    presentation?.state === CHORD_PRESENTATION_STATE.EMPTY
  ) {
    if (presentation.displayText !== '' || presentation.spokenText !== '' || presentation.items?.length !== 0) {
      return result(CHORD_SOURCE_CONSUMER_STATE.INVALID, CHORD_SOURCE_CONSUMER_MESSAGE.INVALID)
    }
    return result(CHORD_SOURCE_CONSUMER_STATE.EMPTY, CHORD_SOURCE_CONSUMER_MESSAGE.EMPTY)
  }

  if (
    parsed?.state === HARMONY_PARSE_STATE.PARSED &&
    validReadyPresentation(presentation)
  ) {
    return result(CHORD_SOURCE_CONSUMER_STATE.SOURCE_READY, CHORD_SOURCE_CONSUMER_MESSAGE.SOURCE_READY, presentation)
  }

  return result(CHORD_SOURCE_CONSUMER_STATE.INVALID, CHORD_SOURCE_CONSUMER_MESSAGE.INVALID)
}

/**
 * Resolve only the raw MusicXML registered for this exact NoteObject[] identity.
 * A cloned/equivalent array intentionally has no source.
 */
export function buildRegisteredChordSourceConsumer(notes, adapters = {}) {
  if (!Array.isArray(notes)) {
    return result(CHORD_SOURCE_CONSUMER_STATE.NO_SOURCE, CHORD_SOURCE_CONSUMER_MESSAGE.NO_SOURCE)
  }

  const resolveSource = adapters.resolveMusicXmlSourceForNotes ?? resolveMusicXmlSourceForNotes
  const source = resolveSource(notes)
  if (
    !source ||
    source.notes !== notes ||
    source.provenance !== MUSICXML_SOURCE_PROVENANCE ||
    typeof source.musicXml !== 'string' ||
    source.musicXml.trim() === ''
  ) {
    return result(CHORD_SOURCE_CONSUMER_STATE.NO_SOURCE, CHORD_SOURCE_CONSUMER_MESSAGE.NO_SOURCE)
  }

  return buildChordSourceConsumer(source.musicXml, adapters)
}
