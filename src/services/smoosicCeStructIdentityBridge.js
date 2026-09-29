import { parseMusicXmlToNotes } from './musicEngine.js'

const FNV_1A_64_OFFSET = 0xcbf29ce484222325n
const FNV_1A_64_PRIME = 0x100000001b3n
const UINT64_MASK = 0xffffffffffffffffn

const STABLE_FIELDS = Object.freeze([
  'partId',
  'partIndex',
  'measureIndex',
  'measureKey',
  'voice',
  'staff',
  'isRest',
  'isChordNote',
  'durationValue',
])

function requiredString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${label} is required.`)
  }
  return value.trim()
}

function sameValue(left, right) {
  if (typeof left === 'number' || typeof right === 'number') {
    return typeof left === 'number'
      && typeof right === 'number'
      && Number.isFinite(left)
      && Number.isFinite(right)
      && Math.abs(left - right) <= 1e-9
  }
  return Object.is(left ?? null, right ?? null)
}

function fingerprint(value) {
  const text = JSON.stringify(value)
  let hash = FNV_1A_64_OFFSET
  for (const char of text) {
    hash ^= BigInt(char.codePointAt(0))
    hash = (hash * FNV_1A_64_PRIME) & UINT64_MASK
  }
  return hash.toString(16).padStart(16, '0')
}

function validateRevisionAgainstMusicXml(currentRevision, currentMusicXml) {
  requiredString(currentRevision?.revisionId, 'current revision id')
  requiredString(currentRevision?.sourceId, 'current source id')
  if (!Array.isArray(currentRevision?.content) || currentRevision.content.length === 0) {
    throw new TypeError('Current revision content is required.')
  }
  if (typeof currentMusicXml !== 'string' || !currentMusicXml.trim()) {
    throw new TypeError('Exact current MusicXML is required.')
  }

  const parsed = parseMusicXmlToNotes(currentMusicXml)
  if (parsed?.error || !Array.isArray(parsed?.notes)) {
    throw new Error('Exact current MusicXML cannot be parsed for structural identity.')
  }
  if (parsed.notes.length !== currentRevision.content.length) {
    throw new Error('Current revision/MusicXML identity drift: note cardinality mismatch.')
  }

  for (let index = 0; index < parsed.notes.length; index += 1) {
    const revisionNote = currentRevision.content[index]
    const xmlNote = parsed.notes[index]
    if (!revisionNote || !xmlNote) {
      throw new Error('Current revision/MusicXML identity drift.')
    }
    for (const field of STABLE_FIELDS) {
      if (!sameValue(revisionNote[field], xmlNote[field])) {
        throw new Error(
          `Current revision/MusicXML identity drift at note ${index} field ${field}.`,
        )
      }
    }
  }
  return parsed.notes
}

function staffOffsets(notes) {
  const maxStaffByPart = new Map()
  for (const note of notes) {
    const partIndex = Number(note.partIndex)
    const staff = Number(note.staff)
    if (!Number.isSafeInteger(partIndex) || partIndex < 0) {
      throw new Error('Current revision/MusicXML identity drift: invalid part index.')
    }
    if (!Number.isSafeInteger(staff) || staff < 1) {
      throw new Error('Current revision/MusicXML identity drift: invalid staff.')
    }
    maxStaffByPart.set(partIndex, Math.max(maxStaffByPart.get(partIndex) ?? 0, staff))
  }

  const offsets = new Map()
  let cursor = 0
  const partIndexes = [...maxStaffByPart.keys()].sort((left, right) => left - right)
  for (let expected = 0; expected < partIndexes.length; expected += 1) {
    if (partIndexes[expected] !== expected) {
      throw new Error('Current revision/MusicXML identity drift: non-contiguous parts.')
    }
    offsets.set(expected, cursor)
    cursor += maxStaffByPart.get(expected)
  }
  return offsets
}

function canonicalRecords(currentRevision) {
  const notes = currentRevision.content
  const offsets = staffOffsets(notes)
  const noteIndexByLane = new Map()
  const records = []

  for (let rawNoteOrdinal = 0; rawNoteOrdinal < notes.length; rawNoteOrdinal += 1) {
    const note = notes[rawNoteOrdinal]
    const isChordNote = note.isChordNote === true

    if (isChordNote) {
      const previous = records.at(-1)
      if (
        !previous
        || previous.isRest
        || previous.partIndex !== note.partIndex
        || previous.measureIndex !== note.measureIndex
        || previous.voice !== note.voice
        || previous.staff !== note.staff
      ) {
        throw new Error('Current revision/MusicXML identity drift: ambiguous chord expansion.')
      }
      previous.rawSpan += 1
      continue
    }

    const staffIndex = offsets.get(note.partIndex) + note.staff - 1
    const voiceIndex = note.voice - 1
    const lane = JSON.stringify([
      note.partIndex,
      note.measureIndex,
      staffIndex,
      voiceIndex,
    ])
    const noteIndex = noteIndexByLane.get(lane) ?? 0
    noteIndexByLane.set(lane, noteIndex + 1)

    records.push({
      rawNoteOrdinal,
      staffIndex,
      measureIndex: note.measureIndex,
      voiceIndex,
      noteIndex,
      rawSpan: 1,
      isRest: note.isRest === true,
      revisionIndex: rawNoteOrdinal,
      partId: note.partId,
      partIndex: note.partIndex,
      measureKey: note.measureKey,
      voice: note.voice,
      staff: note.staff,
    })
  }
  return records
}

function publicRecord(record, revisionId) {
  return Object.freeze({
    rawNoteOrdinal: record.rawNoteOrdinal,
    staffIndex: record.staffIndex,
    measureIndex: record.measureIndex,
    voiceIndex: record.voiceIndex,
    noteIndex: record.noteIndex,
    rawSpan: record.rawSpan,
    isRest: record.isRest,
    revisionIndex: record.revisionIndex,
    eventId: `seslitab:${revisionId}:event:${record.rawNoteOrdinal}`,
    partId: record.partId,
    partIndex: record.partIndex,
    measureKey: record.measureKey,
    voice: record.voice,
    staff: record.staff,
  })
}

export function createSmoosicCeStructIdentityBridge({
  currentRevision,
  currentMusicXml,
} = {}) {
  validateRevisionAgainstMusicXml(currentRevision, currentMusicXml)
  const revisionId = currentRevision.revisionId
  const records = canonicalRecords(currentRevision).map((record) => publicRecord(record, revisionId))

  const baseMappingFingerprint = fingerprint(records.map((record) => ({
    rawNoteOrdinal: record.rawNoteOrdinal,
    staffIndex: record.staffIndex,
    measureIndex: record.measureIndex,
    voiceIndex: record.voiceIndex,
    noteIndex: record.noteIndex,
    rawSpan: record.rawSpan,
    isRest: record.isRest,
  })))

  const byRawOrdinal = new Map(records.map((record) => [record.rawNoteOrdinal, record]))
  const byEventId = new Map(records.map((record) => [record.eventId, record]))

  function eventIdForRawOrdinal(rawNoteOrdinal) {
    const record = byRawOrdinal.get(rawNoteOrdinal)
    if (!record) throw new Error('Ambiguous structural identity: raw note ordinal is not mapped.')
    return record.eventId
  }

  function rawOrdinalForEventId(eventId) {
    const record = byEventId.get(eventId)
    if (!record) throw new Error('Ambiguous structural identity: event id is not mapped.')
    return record.rawNoteOrdinal
  }

  function resolveManifestOperation(manifestOperation) {
    if (!manifestOperation || typeof manifestOperation !== 'object') {
      throw new TypeError('Structural manifest operation is required.')
    }
    const record = byRawOrdinal.get(manifestOperation.rawNoteOrdinal)
    if (
      !record
      || record.staffIndex !== manifestOperation.staffIndex
      || record.measureIndex !== manifestOperation.measureIndex
      || record.voiceIndex !== manifestOperation.voiceIndex
      || record.noteIndex !== manifestOperation.noteIndex
    ) {
      throw new Error('Ambiguous structural identity or locator mismatch.')
    }
    return Object.freeze({
      revisionIndex: record.revisionIndex,
      eventId: record.eventId,
      record,
      manifestOperation,
    })
  }

  return Object.freeze({
    baseMappingFingerprint,
    records: Object.freeze(records),
    eventIdForRawOrdinal,
    rawOrdinalForEventId,
    resolveManifestOperation,
  })
}
