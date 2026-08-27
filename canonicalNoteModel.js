// Canonical NoteObject migration boundary for SesliTab.
//
// This module deliberately wraps the legacy createNote() factory instead of
// changing existing producers. It allows Package 2A consumers to opt into the
// complete canonical contract without changing the working OMR/E2E path.

import {
  CANONICAL_NOTE_FIELDS,
  createNote,
} from './noteTheory.js'

function hasOwn(object, field) {
  return Object.prototype.hasOwnProperty.call(object, field)
}

/**
 * Build a NoteObject that exposes every field in CANONICAL_NOTE_FIELDS.
 *
 * Canonical-only metadata is pass-through data: this function never invents
 * tuplet/beam information and never promotes a note to a verified state.
 * Missing verification metadata remains null and therefore non-definitive
 * under resolveCanonicalConsumptionPolicy().
 *
 * @param {Object} data
 * @returns {Object}
 */
export function createCanonicalNote(data = {}) {
  const note = {
    ...createNote(data),
    tuplet: data.tuplet ?? null,
    beam: data.beam ?? null,
    sourceVerificationState:
      data.sourceVerificationState ?? null,
  }

  const missingFields = CANONICAL_NOTE_FIELDS.filter(
    (field) => !hasOwn(note, field),
  )

  if (missingFields.length > 0) {
    throw new Error(
      `Canonical NoteObject contract incomplete: ${missingFields.join(', ')}`,
    )
  }

  return note
}

/**
 * Clone a canonical note without silently dropping canonical-only metadata.
 * Overrides remain explicit and are passed through the same fail-closed
 * contract check as newly created canonical notes.
 *
 * @param {Object} note
 * @param {Object} overrides
 * @returns {Object}
 */
export function cloneCanonicalNote(
  note,
  overrides = {},
) {
  if (
    !note ||
    typeof note !== 'object' ||
    Array.isArray(note)
  ) {
    throw new TypeError(
      'Canonical NoteObject clone requires a note object.',
    )
  }

  return createCanonicalNote({
    ...note,
    ...overrides,
  })
}
