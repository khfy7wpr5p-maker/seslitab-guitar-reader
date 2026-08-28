// Package 7A/7B — deterministic accessible chord presentation model.
//
// This module consumes only structured Package 6 harmony evidence. It does
// not infer chords from notes, parse chord-symbol strings, invoke speech
// synthesis, touch OMR integration, or claim teacher approval.

import {
  HARMONY_SCHEMA_VERSION,
  HARMONY_PARSE_STATE,
  HARMONY_TIMING_STATE,
  normalizeHarmonyDescriptor,
} from '../../musicXmlHarmonyParser.js'

export const CHORD_PRESENTATION_STATE = Object.freeze({
  READY: 'ready',
  EMPTY: 'empty',
  REVIEW_REQUIRED: 'review-required',
  INVALID: 'invalid',
})

export const CHORD_PRESENTATION_MESSAGE = Object.freeze({
  READY: 'MusicXML kaynak akor işaretleri hazır.',
  EMPTY: 'MusicXML içinde kaynak akor işareti bulunamadı.',
  REVIEW_REQUIRED: 'Kaynak akor verisi inceleme gerektiriyor. Akor metni veya seslendirme hazırlanmadı.',
  INVALID: 'Kaynak akor verisi güvenli biçimde sunulamadı. Akor metni veya seslendirme hazırlanmadı.',
})

export const TURKISH_PITCH_NAMES = Object.freeze({
  C: 'Do',
  D: 'Re',
  E: 'Mi',
  F: 'Fa',
  G: 'Sol',
  A: 'La',
  B: 'Si',
})

export const TURKISH_KIND_NAMES = Object.freeze({
  major: 'majör',
  minor: 'minör',
  augmented: 'artmış',
  diminished: 'eksilmiş',
  dominant: 'dominant yedi',
  'major-seventh': 'majör yedi',
  'minor-seventh': 'minör yedi',
  'diminished-seventh': 'eksilmiş yedi',
  'augmented-seventh': 'artmış yedi',
  'half-diminished': 'yarı eksilmiş yedi',
  'major-minor': 'minör majör yedi',
  'major-sixth': 'majör altı',
  'minor-sixth': 'minör altı',
  'dominant-ninth': 'dominant dokuz',
  'major-ninth': 'majör dokuz',
  'minor-ninth': 'minör dokuz',
  'dominant-11th': 'dominant on bir',
  'major-11th': 'majör on bir',
  'minor-11th': 'minör on bir',
  'dominant-13th': 'dominant on üç',
  'major-13th': 'majör on üç',
  'minor-13th': 'minör on üç',
  'suspended-second': 'sus iki',
  'suspended-fourth': 'sus dört',
  power: 'beşli',
  none: 'akor yok',
})

const PRESENTATION_PROVENANCE = 'musicxml-harmony-source-presentation'
const SOURCE_PROVENANCE = 'musicxml-harmony-source'
const VALID_STEPS = new Set(Object.keys(TURKISH_PITCH_NAMES))
const VALID_ALTERS = new Set([-2, -1, 0, 1, 2])
const VALID_DEGREE_TYPES = new Set(['add', 'alter', 'subtract'])

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) freezeDeep(child)
  return Object.freeze(value)
}

function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function expectedPitchToken(step, alter) {
  if (!VALID_STEPS.has(step) || !VALID_ALTERS.has(alter)) return null
  const suffix = alter === -2 ? 'bb'
    : alter === -1 ? 'b'
      : alter === 1 ? '#'
        : alter === 2 ? '##'
          : ''
  return `${step}${suffix}`
}

function accidentalSpeech(alter) {
  if (alter === -2) return 'çift bemol'
  if (alter === -1) return 'bemol'
  if (alter === 1) return 'diyez'
  if (alter === 2) return 'çift diyez'
  if (alter === 0) return ''
  return null
}

function pitchSpeech(pitch) {
  if (!pitch || typeof pitch !== 'object') return null
  const step = cleanString(pitch.step).toUpperCase()
  const alter = pitch.alter
  const expectedToken = expectedPitchToken(step, alter)
  if (!expectedToken || pitch.token !== expectedToken) return null
  const accidental = accidentalSpeech(alter)
  if (accidental === null) return null
  return [TURKISH_PITCH_NAMES[step], accidental].filter(Boolean).join(' ')
}

function integerToTurkish(value) {
  const small = {
    1: 'bir', 2: 'iki', 3: 'üç', 4: 'dört', 5: 'beş', 6: 'altı',
    7: 'yedi', 8: 'sekiz', 9: 'dokuz', 10: 'on', 11: 'on bir',
    12: 'on iki', 13: 'on üç', 14: 'on dört', 15: 'on beş',
  }
  return small[value] || String(value)
}

function degreeSpeech(degree) {
  if (!degree || typeof degree !== 'object') return null
  const type = cleanString(degree.type)
  const value = degree.value
  const alter = degree.alter
  if (!VALID_DEGREE_TYPES.has(type) || !Number.isInteger(value) || value < 1 || !VALID_ALTERS.has(alter)) {
    return null
  }

  if (degree.printObject === false) return ''

  const valueText = integerToTurkish(value)
  if (type === 'add') {
    if (alter === 0) return `${valueText} eklendi`
    const accidental = accidentalSpeech(alter)
    return accidental ? `${accidental} ${valueText} eklendi` : null
  }
  if (type === 'subtract') {
    if (alter !== 0) return null
    return `${valueText} çıkarıldı`
  }

  const accidental = accidentalSpeech(alter)
  if (alter === 0) return `natürel ${valueText}`
  return accidental ? `${accidental} ${valueText}` : null
}

function timingSpeech(startBeat) {
  if (!finiteNonNegative(startBeat)) return null
  if (startBeat === 0) return 'ölçü başlangıcı'
  const text = Number.isInteger(startBeat)
    ? String(startBeat)
    : String(startBeat).replace('.', ',')
  return `ölçü başlangıcından ${text} vuruş sonra`
}

function validatePhysicalIdentity(event) {
  const partId = cleanString(event?.partId)
  const measureKey = cleanString(event?.measureKey)
  return Boolean(
    partId &&
    nonNegativeInteger(event?.partIndex) &&
    nonNegativeInteger(event?.measureIndex) &&
    nonNegativeInteger(event?.sequenceIndex) &&
    measureKey === `${partId}:${event.measureIndex}`
  )
}

function validateKind(event) {
  const value = cleanString(event?.kind?.value)
  return Boolean(value && Object.prototype.hasOwnProperty.call(TURKISH_KIND_NAMES, value))
}

function validateDegrees(degrees) {
  if (!Array.isArray(degrees)) return false
  return degrees.every((degree) => degreeSpeech(degree) !== null)
}

function comparable(value) {
  return JSON.stringify(value)
}

function validateDescriptorConsistency(event) {
  const normalized = normalizeHarmonyDescriptor({
    rootStep: event.root?.step ?? null,
    rootAlter: event.root?.alter ?? null,
    kindValue: event.kind?.value ?? null,
    kindText: event.kind?.text ?? null,
    bassStep: event.bass?.step ?? null,
    bassAlter: event.bass?.alter ?? null,
    inversion: event.inversion ?? null,
    degrees: Array.isArray(event.degrees)
      ? event.degrees.map((degree) => ({
        type: degree?.type,
        value: degree?.value,
        alter: degree?.alter,
        printObject: degree?.printObject,
      }))
      : null,
    staff: event.staff ?? null,
    functionText: event.functionText ?? null,
  })

  return Boolean(
    normalized.state === HARMONY_PARSE_STATE.PARSED &&
    normalized.symbol === event.symbol &&
    comparable(normalized.root) === comparable(event.root) &&
    comparable(normalized.kind) === comparable(event.kind) &&
    comparable(normalized.bass) === comparable(event.bass) &&
    normalized.inversion === event.inversion &&
    comparable(normalized.degrees) === comparable(event.degrees) &&
    normalized.staff === event.staff &&
    normalized.functionText === event.functionText &&
    normalized.provenance === event.provenance &&
    normalized.teacherApproved === event.teacherApproved
  )
}

function buildChordSpeech(event) {
  const kindValue = cleanString(event.kind?.value)
  if (kindValue === 'none') {
    if (event.symbol !== 'N.C.' || event.root !== null || event.bass !== null) return null
    return 'akor yok'
  }

  const root = pitchSpeech(event.root)
  const kind = TURKISH_KIND_NAMES[kindValue]
  if (!root || !kind) return null

  const phrases = [`${root} ${kind} akoru`]

  if (event.bass !== null && event.bass !== undefined) {
    const bass = pitchSpeech(event.bass)
    if (!bass) return null
    phrases.push(`bas ${bass}`)
  }

  // Inversion metadata is validated and preserved by Package 6, but it is not
  // encoded in the visible symbol unless an explicit bass exists. Package 7
  // therefore does not add inversion-only information to speech.
  for (const degree of event.degrees) {
    const spoken = degreeSpeech(degree)
    if (spoken === null) return null
    if (spoken) phrases.push(spoken)
  }

  return phrases.join(', ')
}

function buildPresentationItem(event) {
  if (
    !event ||
    typeof event !== 'object' ||
    event.schemaVersion !== HARMONY_SCHEMA_VERSION ||
    event.state !== HARMONY_PARSE_STATE.PARSED ||
    event.timingState !== HARMONY_TIMING_STATE.MEASURED ||
    event.provenance !== SOURCE_PROVENANCE ||
    event.teacherApproved !== false ||
    !validatePhysicalIdentity(event) ||
    !validateKind(event) ||
    !validateDegrees(event.degrees) ||
    !finiteNonNegative(event.startBeat) ||
    !cleanString(event.symbol) ||
    !validateDescriptorConsistency(event)
  ) {
    return null
  }

  const chordSpeech = buildChordSpeech(event)
  const timing = timingSpeech(event.startBeat)
  if (!chordSpeech || !timing) return null

  const physicalMeasure = event.measureIndex + 1
  const displayText = `Ölçü ${physicalMeasure}, ${timing}: ${event.symbol}`
  const spokenText = `Ölçü ${physicalMeasure}, ${timing}, kaynak akor işareti: ${chordSpeech}.`

  return freezeDeep({
    measureKey: event.measureKey,
    measureIndex: event.measureIndex,
    sequenceIndex: event.sequenceIndex,
    startBeat: event.startBeat,
    symbol: event.symbol,
    displayText,
    spokenText,
    provenance: PRESENTATION_PROVENANCE,
    sourceProvenance: SOURCE_PROVENANCE,
    teacherApproved: false,
  })
}

function model(state, message, items = []) {
  const safeItems = Array.isArray(items) ? items : []
  return freezeDeep({
    state,
    message,
    items: safeItems,
    displayText: state === CHORD_PRESENTATION_STATE.READY
      ? safeItems.map((item) => item.displayText).join('\n')
      : '',
    spokenText: state === CHORD_PRESENTATION_STATE.READY
      ? safeItems.map((item) => item.spokenText).join(' ')
      : '',
    provenance: PRESENTATION_PROVENANCE,
    teacherApproved: false,
  })
}

/**
 * Convert a complete Package 6 parse result into a presentation model.
 * No partial presentation is emitted when any Package 6 evidence needs review.
 */
export function buildChordPresentationModel(parseResult) {
  if (!parseResult || typeof parseResult !== 'object' || !Array.isArray(parseResult.harmonies)) {
    return model(CHORD_PRESENTATION_STATE.INVALID, CHORD_PRESENTATION_MESSAGE.INVALID)
  }

  if (parseResult.state === HARMONY_PARSE_STATE.INVALID) {
    return model(CHORD_PRESENTATION_STATE.INVALID, CHORD_PRESENTATION_MESSAGE.INVALID)
  }

  if (parseResult.state === HARMONY_PARSE_STATE.REVIEW_REQUIRED) {
    return model(CHORD_PRESENTATION_STATE.REVIEW_REQUIRED, CHORD_PRESENTATION_MESSAGE.REVIEW_REQUIRED)
  }

  if (parseResult.state !== HARMONY_PARSE_STATE.PARSED) {
    return model(CHORD_PRESENTATION_STATE.INVALID, CHORD_PRESENTATION_MESSAGE.INVALID)
  }

  if (parseResult.harmonies.length === 0) {
    return model(CHORD_PRESENTATION_STATE.EMPTY, CHORD_PRESENTATION_MESSAGE.EMPTY)
  }

  const items = []
  for (const event of parseResult.harmonies) {
    const item = buildPresentationItem(event)
    if (!item) {
      return model(CHORD_PRESENTATION_STATE.INVALID, CHORD_PRESENTATION_MESSAGE.INVALID)
    }
    items.push(item)
  }

  return model(CHORD_PRESENTATION_STATE.READY, CHORD_PRESENTATION_MESSAGE.READY, items)
}

export const chordPresentationInternals = Object.freeze({
  pitchSpeech,
  degreeSpeech,
  timingSpeech,
})
