// Package 4C — canonical NoteObject[] to basic Guitar TAB projection.
//
// The projection is deliberately conservative. It preserves source order and
// canonical physical measure identity, applies only the Package 4B generated
// basic position policy, and refuses structures that belong to the later
// advanced/polyphonic Guitar TAB package.

import {
  BASIC_GUITAR_POSITION_POLICY_ID,
  BASIC_GUITAR_POSITION_PROVENANCE,
  BASIC_GUITAR_POSITION_SELECTION_STATE,
  selectBasicCanonicalGuitarPosition,
} from './guitarBasicPositionPolicy.js'

export const BASIC_GUITAR_TAB_PROJECTION_STATE = Object.freeze({
  PROJECTED: 'projected',
  ADVANCED_REQUIRED: 'advanced-required',
  UNPLAYABLE: 'unplayable',
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
              position: event.position ? Object.freeze({ ...event.position }) : null,
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
    policyId: BASIC_GUITAR_POSITION_POLICY_ID,
    provenance: BASIC_GUITAR_POSITION_PROVENANCE,
    sourceFingeringClaimed: false,
    noteCount: 0,
    measureCount: 0,
    measures: [],
  })
}

function isFiniteNonNegative(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0
}

function physicalPartKey(note) {
  return `${String(note.partId)}:${String(note.partIndex)}`
}

function validatePhysicalIdentity(note) {
  return (
    typeof note.measureKey === 'string' &&
    note.measureKey.trim() !== '' &&
    Number.isInteger(Number(note.measureIndex)) &&
    Number(note.measureIndex) >= 0 &&
    typeof note.partId === 'string' &&
    note.partId.trim() !== '' &&
    Number.isInteger(Number(note.partIndex)) &&
    Number(note.partIndex) >= 0 &&
    isFiniteNonNegative(note.startBeat) &&
    isFiniteNonNegative(note.beats)
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

    if (note.isChordNote === true) {
      return { reason: 'chord-structure', blockingNoteIndex: index }
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

    // Canonical NoteObject uses isGrace. Grace notes consume zero canonical
    // measure time and may share the next attack onset without representing
    // independent polyphony. Other simultaneous pitched attacks require the
    // advanced package.
    if (note.isGrace !== true) {
      const onsetKey = `${note.measureKey}:${Number(note.startBeat)}`
      if (pitchedOnsets.has(onsetKey)) {
        return { reason: 'simultaneous-pitched-events', blockingNoteIndex: index }
      }
      pitchedOnsets.set(onsetKey, index)
    }
  }

  return null
}

/**
 * Project a canonical, single-part, monophonic NoteObject[] into immutable
 * basic Guitar TAB events while preserving original NoteObject references.
 *
 * No ASCII/visual TAB is rendered here, and the production GUITAR_TAB
 * consumer remains fail-closed until a later integration slice.
 *
 * @param {Object[]} notes canonical NoteObject[]
 * @returns {Object} immutable projection result
 */
export function projectCanonicalNotesToBasicGuitarTab(notes) {
  if (!Array.isArray(notes)) {
    return terminalProjection(
      BASIC_GUITAR_TAB_PROJECTION_STATE.INVALID,
      'canonical-note-array-required',
    )
  }

  if (notes.length === 0) {
    return terminalProjection(BASIC_GUITAR_TAB_PROJECTION_STATE.INVALID, 'empty-note-array')
  }

  // Package 4B performs the canonical-shape/pitch check. Physical identity is
  // validated separately because 4C must never group measures by display
  // number or synthesize a missing measureKey.
  for (let index = 0; index < notes.length; index += 1) {
    const note = notes[index]
    const selection = selectBasicCanonicalGuitarPosition(note)

    if (selection.state === BASIC_GUITAR_POSITION_SELECTION_STATE.INVALID) {
      return terminalProjection(
        BASIC_GUITAR_TAB_PROJECTION_STATE.INVALID,
        selection.reason || 'invalid-canonical-note',
        index,
      )
    }

    if (!validatePhysicalIdentity(note)) {
      return terminalProjection(
        BASIC_GUITAR_TAB_PROJECTION_STATE.INVALID,
        'canonical-physical-identity-required',
        index,
      )
    }
  }

  const advanced = detectAdvancedStructure(notes)
  if (advanced) {
    return terminalProjection(
      BASIC_GUITAR_TAB_PROJECTION_STATE.ADVANCED_REQUIRED,
      advanced.reason,
      advanced.blockingNoteIndex,
    )
  }

  const measureMap = new Map()
  const measures = []

  for (let index = 0; index < notes.length; index += 1) {
    const note = notes[index]
    const selection = selectBasicCanonicalGuitarPosition(note)

    if (selection.state === BASIC_GUITAR_POSITION_SELECTION_STATE.UNPLAYABLE) {
      return terminalProjection(
        BASIC_GUITAR_TAB_PROJECTION_STATE.UNPLAYABLE,
        selection.reason || 'unplayable-note',
        index,
      )
    }

    if (
      selection.state !== BASIC_GUITAR_POSITION_SELECTION_STATE.SELECTED &&
      selection.state !== BASIC_GUITAR_POSITION_SELECTION_STATE.REST
    ) {
      return terminalProjection(
        BASIC_GUITAR_TAB_PROJECTION_STATE.INVALID,
        selection.reason || 'invalid-position-selection',
        index,
      )
    }

    let measure = measureMap.get(note.measureKey)
    if (!measure) {
      measure = {
        measureKey: note.measureKey,
        measureIndex: Number(note.measureIndex),
        measureNumber: note.measureNumber ?? null,
        partId: note.partId,
        partIndex: Number(note.partIndex),
        events: [],
      }
      measureMap.set(note.measureKey, measure)
      measures.push(measure)
    } else if (
      measure.measureIndex !== Number(note.measureIndex) ||
      measure.partId !== note.partId ||
      measure.partIndex !== Number(note.partIndex)
    ) {
      return terminalProjection(
        BASIC_GUITAR_TAB_PROJECTION_STATE.INVALID,
        'conflicting-measure-identity',
        index,
      )
    }

    measure.events.push({
      noteIndex: index,
      note,
      measureKey: note.measureKey,
      measureIndex: Number(note.measureIndex),
      startBeat: Number(note.startBeat),
      beats: Number(note.beats),
      voice: note.voice ?? null,
      staff: note.staff ?? null,
      isRest: note.isRest === true,
      isGrace: note.isGrace === true,
      tieStart: note.tieStart === true,
      tieStop: note.tieStop === true,
      policyId: selection.policyId,
      provenance: selection.provenance,
      sourceFingeringClaimed: false,
      position: selection.position,
    })
  }

  return freezeProjection({
    state: BASIC_GUITAR_TAB_PROJECTION_STATE.PROJECTED,
    reason: null,
    blockingNoteIndex: null,
    policyId: BASIC_GUITAR_POSITION_POLICY_ID,
    provenance: BASIC_GUITAR_POSITION_PROVENANCE,
    sourceFingeringClaimed: false,
    noteCount: notes.length,
    measureCount: measures.length,
    measures,
  })
}
