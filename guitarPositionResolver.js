// Package 4A — canonical written-pitch to basic guitar-position candidates.
//
// This module is intentionally diagnostic/pure at this stage. It does not
// choose a preferred fingering, does not mutate MusicXML/parser output, and
// does not activate the production Guitar TAB consumer boundary.

import {
  CANONICAL_NOTE_FIELDS,
  STRING_LETTER,
  noteToMidi,
  resolveCanonicalPitch,
} from './noteTheory.js'

export const BASIC_GUITAR_MAX_FRET = 24
export const BASIC_GUITAR_WRITTEN_TRANSPOSITION = -12

export const GUITAR_POSITION_CANDIDATE_STATE = Object.freeze({
  CANDIDATES: 'candidates',
  REST: 'rest',
  UNPLAYABLE: 'unplayable',
  INVALID: 'invalid',
})

export const BASIC_GUITAR_TUNING = Object.freeze(
  STRING_LETTER.map((stringLetter, index) =>
    Object.freeze({
      stringNumber: index + 1,
      stringLetter,
      openMidi: noteToMidi(stringLetter, 0),
    }),
  ),
)

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function hasCanonicalNoteShape(note) {
  return (
    note &&
    typeof note === 'object' &&
    !Array.isArray(note) &&
    CANONICAL_NOTE_FIELDS.every((field) => hasOwn(note, field))
  )
}

function freezeResult(result) {
  const candidates = Object.freeze(
    (result.candidates || []).map((candidate) => Object.freeze({ ...candidate })),
  )

  return Object.freeze({
    ...result,
    candidates,
  })
}

function invalidResult(reason) {
  return freezeResult({
    state: GUITAR_POSITION_CANDIDATE_STATE.INVALID,
    reason,
    writtenMidi: null,
    mappingMidi: null,
    transpositionSemitones: BASIC_GUITAR_WRITTEN_TRANSPOSITION,
    candidates: [],
  })
}

function resolveWrittenPitch(note) {
  if (
    note.step === undefined ||
    note.step === null ||
    note.step === '' ||
    note.octave === undefined ||
    note.octave === null ||
    note.octave === ''
  ) {
    return { valid: false, reason: 'missing-written-pitch' }
  }

  const pitchInput = {
    step: note.step,
    octave: note.octave,
  }

  if (note.alter !== undefined && note.alter !== null && note.alter !== '') {
    pitchInput.alter = note.alter
  }

  const resolution = resolveCanonicalPitch(pitchInput)

  if (!resolution.valid) {
    return {
      valid: false,
      reason: resolution.reason || 'invalid-written-pitch',
    }
  }

  return {
    valid: true,
    midi: resolution.midi,
  }
}

/**
 * Enumerate every physically representable position in SesliTab's current
 * basic standard-tuning / 24-fret contract for one canonical MusicXML note.
 *
 * Guitar staff notation is treated as octave-transposing exactly as the
 * existing parser regression contract does: the position-mapping pitch is the
 * written pitch minus 12 semitones. No preferred fingering is selected here.
 *
 * @param {Object} note canonical NoteObject
 * @returns {Object} immutable candidate result
 */
export function enumerateCanonicalGuitarPositionCandidates(note) {
  if (!hasCanonicalNoteShape(note)) {
    return invalidResult('canonical-note-required')
  }

  if (note.isRest === true) {
    return freezeResult({
      state: GUITAR_POSITION_CANDIDATE_STATE.REST,
      reason: null,
      writtenMidi: null,
      mappingMidi: null,
      transpositionSemitones: BASIC_GUITAR_WRITTEN_TRANSPOSITION,
      candidates: [],
    })
  }

  const writtenPitch = resolveWrittenPitch(note)
  if (!writtenPitch.valid) {
    return invalidResult(writtenPitch.reason)
  }

  const writtenMidi = writtenPitch.midi
  const mappingMidi = writtenMidi + BASIC_GUITAR_WRITTEN_TRANSPOSITION

  if (!Number.isInteger(mappingMidi) || mappingMidi < 0 || mappingMidi > 127) {
    return freezeResult({
      state: GUITAR_POSITION_CANDIDATE_STATE.UNPLAYABLE,
      reason: 'mapping-pitch-out-of-midi-range',
      writtenMidi,
      mappingMidi,
      transpositionSemitones: BASIC_GUITAR_WRITTEN_TRANSPOSITION,
      candidates: [],
    })
  }

  const candidates = BASIC_GUITAR_TUNING
    .map((string) => ({
      stringNumber: string.stringNumber,
      stringLetter: string.stringLetter,
      fret: mappingMidi - string.openMidi,
      soundingMidi: mappingMidi,
      writtenMidi,
    }))
    .filter((candidate) =>
      Number.isInteger(candidate.fret) &&
      candidate.fret >= 0 &&
      candidate.fret <= BASIC_GUITAR_MAX_FRET,
    )
    .sort((a, b) =>
      (a.fret - b.fret) ||
      (a.stringNumber - b.stringNumber),
    )

  if (candidates.length === 0) {
    return freezeResult({
      state: GUITAR_POSITION_CANDIDATE_STATE.UNPLAYABLE,
      reason: 'no-basic-guitar-position',
      writtenMidi,
      mappingMidi,
      transpositionSemitones: BASIC_GUITAR_WRITTEN_TRANSPOSITION,
      candidates: [],
    })
  }

  return freezeResult({
    state: GUITAR_POSITION_CANDIDATE_STATE.CANDIDATES,
    reason: null,
    writtenMidi,
    mappingMidi,
    transpositionSemitones: BASIC_GUITAR_WRITTEN_TRANSPOSITION,
    candidates,
  })
}
