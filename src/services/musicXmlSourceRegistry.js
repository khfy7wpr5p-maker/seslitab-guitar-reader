// Package 7C — exact-array raw MusicXML source registry.
//
// The registry binds raw MusicXML to the exact NoteObject[] identity that was
// produced from it. It does not parse, clone, normalize, verify, or infer any
// musical data. WeakMap identity prevents evidence from transferring to cloned
// note arrays and lets old results disappear naturally when no longer used.

const sourcesByNotes = new WeakMap()

export const MUSICXML_SOURCE_PROVENANCE = 'exact-note-array-musicxml-source'

function validNotes(notes) {
  return Array.isArray(notes)
}

function validMusicXml(musicXml) {
  return typeof musicXml === 'string' && musicXml.trim() !== ''
}

export function registerMusicXmlSourceForNotes(notes, musicXml) {
  if (!validNotes(notes)) {
    throw new TypeError('MusicXML source registry requires a NoteObject array.')
  }
  if (!validMusicXml(musicXml)) {
    throw new TypeError('MusicXML source registry requires non-empty MusicXML text.')
  }

  const record = Object.freeze({
    notes,
    musicXml,
    provenance: MUSICXML_SOURCE_PROVENANCE,
  })
  sourcesByNotes.set(notes, record)
  return record
}

export function clearMusicXmlSourceForNotes(notes) {
  if (!validNotes(notes)) {
    throw new TypeError('MusicXML source registry requires a NoteObject array.')
  }
  return sourcesByNotes.delete(notes)
}

export function resolveMusicXmlSourceForNotes(notes) {
  if (!validNotes(notes)) return null
  return sourcesByNotes.get(notes) ?? null
}
