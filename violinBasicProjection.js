// Package 5C — conservative canonical NoteObject[] to basic violin projection.
//
// This projection preserves exact source NoteObject references and canonical
// physical measure identity. It consumes only Package 5B generated first-
// position evidence and refuses unresolved crossings or advanced violin
// structures instead of inventing a pedagogical choice.

import {
  BASIC_VIOLIN_FINGERING_POLICY_ID,
  BASIC_VIOLIN_FINGERING_STATE,
  resolveBasicViolinFirstPositionFingering,
} from './violinFingeringPolicy.js'

export const BASIC_VIOLIN_PROJECTION_STATE = Object.freeze({
  PROJECTED: 'projected',
  REVIEW_REQUIRED: 'review-required',
  ADVANCED_REQUIRED: 'advanced-required',
  OUT_OF_RANGE: 'out-of-range',
  INVALID: 'invalid',
})

function freezeProjection(result) {
  const measures = Object.freeze(
    (result.measures || []).map((measure) =>
      Object.freeze({
        ...measure,
        events: Object.freeze(
          (measure.events || []).map((event) =>
            Object.freeze({
              ...event,
              fingering: event.fingering
                ? Object.freeze({ ...event.fingering })
                : null,
            }),
          ),
        ),
      }),
    ),
  )

  return Object.freeze({
    ...result,
    measures,
  })
}

function terminalProjection(state, reason, blockingNoteIndex = null) {
  return freezeProjection({
    state,
    reason,
    blockingNoteIndex,
    policyId: BASIC_VIOLIN_FINGERING_POLICY_ID,
    provenance: 'generated-basic-first-position-fingering',
    teacherApproved: false,
    noteCount: 0,
    measureCount: 0,
    measures: [],
  })
}

function isFiniteNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isNonNegativeInteger(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function physicalPartKey(note) {
  return `${note.partId}:${note.partIndex}`
}

function validatePhysicalIdentity(note) {
  return (
    typeof note.measureKey === 'string' &&
    note.measureKey.trim() !== '' &&
    isNonNegativeInteger(note.measureIndex) &&
    typeof note.partId === 'string' &&
    note.partId.trim() !== '' &&
    isNonNegativeInteger(note.partIndex) &&
    isFiniteNonNegativeNumber(note.startBeat) &&
    isFiniteNonNegativeNumber(note.beats)
  )
}

function detectAdvancedStructure(notes) {
  const partKeys = new Set()
  const pitchedVoices = new Set()
  const pitchedStaves = new Set()
  const pitchedOnsets = new Map()

  for (let index = 0; index < notes.length; index += 1) {
    const note = notes[index]
    partKeys.add(physicalPartKey(note))

    if (partKeys.size > 1) {
      return { reason: 'multiple-parts', blockingNoteIndex: index }
    }

    if (
      note.isChordNote === true ||
      note.isChord === true ||
      (Array.isArray(note.chordNotes) && note.chordNotes.length > 0)
    ) {
      return { reason: 'double-stop-or-chord-structure', blockingNoteIndex: index }
    }

    if (note.isRest === true) continue

    const voiceKey = String(note.voice ?? '')
    const staffKey = String(note.staff ?? '')
    pitchedVoices.add(voiceKey)
    pitchedStaves.add(staffKey)

    if (pitchedVoices.size > 1) {
      return { reason: 'multiple-voices', blockingNoteIndex: index }
    }

    if (pitchedStaves.size > 1) {
      return { reason: 'multiple-staves', blockingNoteIndex: index }
    }

    // Grace notes consume no canonical measure time and may share the next
    // attack onset. Other simultaneous pitched attacks are outside Basic Violin.
    if (note.isGrace !== true) {
      const onsetKey = `${note.measureKey}:${note.startBeat}`
      if (pitchedOnsets.has(onsetKey)) {
        return { reason: 'simultaneous-pitched-events', blockingNoteIndex: index }
      }
      pitchedOnsets.set(onsetKey, index)
    }
  }

  return null
}

/**
 * Project a canonical, single-part, single-staff, monophonic NoteObject[] into
 * basic first-position violin events.
 *
 * A finalized projection is produced only when every pitched note has exactly
 * one Package 5B generated first-position candidate. Any unresolved string
 * crossing returns REVIEW_REQUIRED with no partial measures. Double stops,
 * chords, multiple voices/staves/parts and independent simultaneous attacks
 * return ADVANCED_REQUIRED for the later advanced violin package.
 *
 * @param {Object[]} notes canonical NoteObject[]
 * @returns {Object} immutable projection result
 */
export function projectCanonicalNotesToBasicViolin(notes) {
  if (!Array.isArray(notes)) {
    return terminalProjection(
      BASIC_VIOLIN_PROJECTION_STATE.INVALID,
      'canonical-note-array-required',
    )
  }

  if (notes.length === 0) {
    return terminalProjection(BASIC_VIOLIN_PROJECTION_STATE.INVALID, 'empty-note-array')
  }

  // Package 5B validates canonical note shape and written pitch. Physical
  // identity is checked independently so visible measure numbers are never
  // promoted to unique identity and invalid numeric values are never coerced.
  for (let index = 0; index < notes.length; index += 1) {
    const note = notes[index]
    const fingering = resolveBasicViolinFirstPositionFingering(note)

    if (fingering.state === BASIC_VIOLIN_FINGERING_STATE.INVALID) {
      return terminalProjection(
        BASIC_VIOLIN_PROJECTION_STATE.INVALID,
        fingering.reason || 'invalid-canonical-note',
        index,
      )
    }

    if (!validatePhysicalIdentity(note)) {
      return terminalProjection(
        BASIC_VIOLIN_PROJECTION_STATE.INVALID,
        'canonical-physical-identity-required',
        index,
      )
    }
  }

  const advanced = detectAdvancedStructure(notes)
  if (advanced) {
    return terminalProjection(
      BASIC_VIOLIN_PROJECTION_STATE.ADVANCED_REQUIRED,
      advanced.reason,
      advanced.blockingNoteIndex,
    )
  }

  // Resolve all generated fingering evidence before creating any measure so a
  // late ambiguity/out-of-range note cannot leave a partial projection.
  const fingerings = []
  for (let index = 0; index < notes.length; index += 1) {
    const fingering = resolveBasicViolinFirstPositionFingering(notes[index])

    if (fingering.state === BASIC_VIOLIN_FINGERING_STATE.AMBIGUOUS) {
      return terminalProjection(
        BASIC_VIOLIN_PROJECTION_STATE.REVIEW_REQUIRED,
        fingering.reason || 'violin-string-choice-review-required',
        index,
      )
    }

    if (fingering.state === BASIC_VIOLIN_FINGERING_STATE.OUT_OF_RANGE) {
      return terminalProjection(
        BASIC_VIOLIN_PROJECTION_STATE.OUT_OF_RANGE,
        fingering.reason || 'violin-note-out-of-basic-range',
        index,
      )
    }

    if (
      fingering.state !== BASIC_VIOLIN_FINGERING_STATE.GENERATED_BASIC &&
      fingering.state !== BASIC_VIOLIN_FINGERING_STATE.REST
    ) {
      return terminalProjection(
        BASIC_VIOLIN_PROJECTION_STATE.INVALID,
        fingering.reason || 'invalid-violin-fingering-evidence',
        index,
      )
    }

    if (
      fingering.state === BASIC_VIOLIN_FINGERING_STATE.GENERATED_BASIC &&
      fingering.fingeringCandidates.length !== 1
    ) {
      return terminalProjection(
        BASIC_VIOLIN_PROJECTION_STATE.INVALID,
        'single-generated-fingering-required',
        index,
      )
    }

    fingerings.push(fingering)
  }

  const measureMap = new Map()
  const measures = []

  for (let index = 0; index < notes.length; index += 1) {
    const note = notes[index]
    const fingering = fingerings[index]

    let measure = measureMap.get(note.measureKey)
    if (!measure) {
      measure = {
        measureKey: note.measureKey,
        measureIndex: note.measureIndex,
        measureNumber: note.measureNumber ?? null,
        partId: note.partId,
        partIndex: note.partIndex,
        events: [],
      }
      measureMap.set(note.measureKey, measure)
      measures.push(measure)
    } else if (
      measure.measureIndex !== note.measureIndex ||
      measure.partId !== note.partId ||
      measure.partIndex !== note.partIndex
    ) {
      return terminalProjection(
        BASIC_VIOLIN_PROJECTION_STATE.INVALID,
        'conflicting-measure-identity',
        index,
      )
    }

    measure.events.push({
      noteIndex: index,
      note,
      measureKey: note.measureKey,
      measureIndex: note.measureIndex,
      startBeat: note.startBeat,
      beats: note.beats,
      voice: note.voice ?? null,
      staff: note.staff ?? null,
      isRest: note.isRest === true,
      isGrace: note.isGrace === true,
      tieStart: note.tieStart === true,
      tieStop: note.tieStop === true,
      policyId: fingering.policyId,
      provenance: 'generated-basic-first-position-fingering',
      teacherApproved: false,
      fingering:
        fingering.state === BASIC_VIOLIN_FINGERING_STATE.GENERATED_BASIC
          ? fingering.fingeringCandidates[0]
          : null,
    })
  }

  return freezeProjection({
    state: BASIC_VIOLIN_PROJECTION_STATE.PROJECTED,
    reason: null,
    blockingNoteIndex: null,
    policyId: BASIC_VIOLIN_FINGERING_POLICY_ID,
    provenance: 'generated-basic-first-position-fingering',
    teacherApproved: false,
    noteCount: notes.length,
    measureCount: measures.length,
    measures,
  })
}
