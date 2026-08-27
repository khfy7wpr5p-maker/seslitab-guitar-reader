// Package 5A — canonical written-pitch to basic first-position violin string candidates.
//
// This module is intentionally pure and diagnostic. It does not select a
// fingering, does not mutate MusicXML/parser output, and does not activate a
// production violin consumer boundary.

import {
  CANONICAL_NOTE_FIELDS,
  resolveCanonicalPitch,
} from './noteTheory.js'

export const BASIC_VIOLIN_FIRST_POSITION_MAX_SEMITONES = 7

export const VIOLIN_POSITION_CANDIDATE_STATE = Object.freeze({
  CANDIDATES: 'candidates',
  REST: 'rest',
  OUT_OF_RANGE: 'out-of-range',
  INVALID: 'invalid',
})

// Standard violin tuning. String numbering follows the conventional
// high-to-low order: 1=E, 2=A, 3=D, 4=G.
export const BASIC_VIOLIN_TUNING = Object.freeze([
  Object.freeze({ stringNumber: 1, stringName: 'E', openMidi: 76 }),
  Object.freeze({ stringNumber: 2, stringName: 'A', openMidi: 69 }),
  Object.freeze({ stringNumber: 3, stringName: 'D', openMidi: 62 }),
  Object.freeze({ stringNumber: 4, stringName: 'G', openMidi: 55 }),
])

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
    state: VIOLIN_POSITION_CANDIDATE_STATE.INVALID,
    reason,
    writtenMidi: null,
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
 * Enumerate every supported basic first-position string candidate for one
 * canonical MusicXML note.
 *
 * Violin is treated at concert pitch: written MIDI is the position-mapping
 * MIDI. A candidate exists when the note lies from the open string through a
 * perfect fifth (0..7 semitones) above it. Finger-number policy is deliberately
 * deferred to Package 5B.
 *
 * Candidate ordering is serialization-only and must not be interpreted as a
 * preferred fingering.
 *
 * @param {Object} note canonical NoteObject
 * @returns {Object} immutable candidate result
 */
export function enumerateCanonicalViolinFirstPositionCandidates(note) {
  if (!hasCanonicalNoteShape(note)) {
    return invalidResult('canonical-note-required')
  }

  if (note.isRest === true) {
    return freezeResult({
      state: VIOLIN_POSITION_CANDIDATE_STATE.REST,
      reason: null,
      writtenMidi: null,
      candidates: [],
    })
  }

  const writtenPitch = resolveWrittenPitch(note)
  if (!writtenPitch.valid) {
    return invalidResult(writtenPitch.reason)
  }

  const writtenMidi = writtenPitch.midi
  const candidates = BASIC_VIOLIN_TUNING
    .map((string) => ({
      stringNumber: string.stringNumber,
      stringName: string.stringName,
      openMidi: string.openMidi,
      semitoneOffset: writtenMidi - string.openMidi,
      writtenMidi,
      position: 'first',
      provenance: 'generated-basic-physical-candidate',
    }))
    .filter((candidate) =>
      Number.isInteger(candidate.semitoneOffset) &&
      candidate.semitoneOffset >= 0 &&
      candidate.semitoneOffset <= BASIC_VIOLIN_FIRST_POSITION_MAX_SEMITONES,
    )
    .sort((a, b) => a.stringNumber - b.stringNumber)

  if (candidates.length === 0) {
    return freezeResult({
      state: VIOLIN_POSITION_CANDIDATE_STATE.OUT_OF_RANGE,
      reason: 'no-basic-first-position-string',
      writtenMidi,
      candidates: [],
    })
  }

  return freezeResult({
    state: VIOLIN_POSITION_CANDIDATE_STATE.CANDIDATES,
    reason: null,
    writtenMidi,
    candidates,
  })
}
