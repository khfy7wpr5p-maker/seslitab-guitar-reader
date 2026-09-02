// SesliTab-owned resolver between renderer ScoreNoteRef and canonical NoteObject[]
// identity. Rendering remains presentation-only; this module never derives
// musical truth from SVG, pitch, proximity, or visible labels.

import { isRealmSafePlainObject } from './realmSafePlainObject.js'

function normalizePartId(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed !== value || trimmed.length > 128) return null
  return trimmed
}

function normalizeNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

function normalizePositiveInteger(value) {
  return Number.isSafeInteger(value) && value >= 1 ? value : null
}

function normalizeStartBeat(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

export function validateRendererScoreNoteRef(value) {
  if (!isRealmSafePlainObject(value)) return null
  const keys = Object.keys(value)
  if (keys.some((key) => !['partId', 'measureIndex', 'noteIndex', 'voice'].includes(key))) return null

  const partId = normalizePartId(value.partId)
  const measureIndex = normalizeNonNegativeInteger(value.measureIndex)
  const noteIndex = normalizeNonNegativeInteger(value.noteIndex)
  const hasVoice = Object.prototype.hasOwnProperty.call(value, 'voice') && value.voice !== undefined
  const voice = hasVoice ? normalizeNonNegativeInteger(value.voice) : null
  if (!partId || measureIndex === null || noteIndex === null || (hasVoice && voice === null)) return null

  return hasVoice
    ? Object.freeze({ partId, measureIndex, noteIndex, voice })
    : Object.freeze({ partId, measureIndex, noteIndex })
}

function collectMeasureRecords(notes, partId, measureIndex) {
  if (!Array.isArray(notes)) return null
  const records = []

  for (let globalIndex = 0; globalIndex < notes.length; globalIndex++) {
    const note = notes[globalIndex]
    if (!isRealmSafePlainObject(note)) return null
    if (note.partId !== partId || note.measureIndex !== measureIndex) continue

    const voice = normalizeNonNegativeInteger(note.voice)
    const staff = normalizePositiveInteger(note.staff)
    const startBeat = normalizeStartBeat(note.startBeat)
    if (voice === null || staff === null || startBeat === null) return null

    records.push({ note, globalIndex, voice, staff, startBeat })
  }
  return records
}

function canonicalRecords(notes, ref) {
  const all = collectMeasureRecords(notes, ref.partId, ref.measureIndex)
  if (!all) return null

  let records
  if (Object.prototype.hasOwnProperty.call(ref, 'voice')) {
    records = all.filter((record) => record.voice === ref.voice)
  } else {
    // Rendering Layer 0.2.0 defines omitted voice as a global traversal index.
    // SesliTab can reproduce that index exactly only when the canonical measure
    // has one proven voice. In a multi-voice measure the OSMD graphical voice
    // entry ordering is renderer-owned evidence that Package 3 does not expose;
    // therefore abstain instead of inventing or inferring a voice.
    const voices = new Set(all.map((record) => record.voice))
    if (voices.size !== 1) return null
    records = all
  }

  records.sort((a, b) =>
    a.staff - b.staff ||
    a.startBeat - b.startBeat ||
    a.globalIndex - b.globalIndex
  )
  return records
}

function scoreRefForRecord(records, record, partId, measureIndex, voice) {
  const noteIndex = records.indexOf(record)
  if (noteIndex < 0) return null
  return Object.freeze({ partId, measureIndex, noteIndex, voice })
}

export function resolveCanonicalNoteFromScoreRef(notes, rendererRef) {
  const ref = validateRendererScoreNoteRef(rendererRef)
  if (!ref) return null

  const records = canonicalRecords(notes, ref)
  if (!records || ref.noteIndex >= records.length) return null
  const record = records[ref.noteIndex]
  if (!record || record.note?.isRest === true) return null

  const measureKey = typeof record.note.measureKey === 'string' ? record.note.measureKey.trim() : ''
  if (!measureKey) return null

  return Object.freeze({
    note: record.note,
    noteIndex: record.globalIndex,
    measureKey,
    rendererTarget: ref,
  })
}

export function deriveScoreNoteRefForCanonicalNote(notes, globalNoteIndex) {
  if (!Array.isArray(notes) || !Number.isSafeInteger(globalNoteIndex) || globalNoteIndex < 0 || globalNoteIndex >= notes.length) {
    return null
  }

  const note = notes[globalNoteIndex]
  if (!isRealmSafePlainObject(note) || note.isRest === true) return null
  const partId = normalizePartId(note.partId)
  const measureIndex = normalizeNonNegativeInteger(note.measureIndex)
  const voice = normalizeNonNegativeInteger(note.voice)
  if (!partId || measureIndex === null || voice === null) return null

  const ref = Object.freeze({ partId, measureIndex, noteIndex: 0, voice })
  const records = canonicalRecords(notes, ref)
  if (!records) return null
  const matches = records.filter((record) => record.note === note && record.globalIndex === globalNoteIndex)
  if (matches.length !== 1) return null

  return scoreRefForRecord(records, matches[0], partId, measureIndex, voice)
}
