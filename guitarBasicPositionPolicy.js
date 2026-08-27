// Package 4B — deterministic basic guitar-position selection policy.
//
// This policy chooses a generated basic position from Package 4A's physical
// candidate evidence. It is not source MusicXML fingering, teacher approval,
// or advanced/pedagogical fingering.

import {
  GUITAR_POSITION_CANDIDATE_STATE,
  enumerateCanonicalGuitarPositionCandidates,
} from './guitarPositionResolver.js'

export const BASIC_GUITAR_POSITION_POLICY_ID = 'lowest-fret-v1'
export const BASIC_GUITAR_POSITION_PROVENANCE = 'generated-basic'

export const BASIC_GUITAR_POSITION_SELECTION_STATE = Object.freeze({
  SELECTED: 'selected',
  REST: 'rest',
  UNPLAYABLE: 'unplayable',
  INVALID: 'invalid',
})

function freezeSelection(result) {
  return Object.freeze({
    ...result,
    position: result.position ? Object.freeze({ ...result.position }) : null,
  })
}

/**
 * Resolve one deterministic basic guitar position for a canonical NoteObject.
 *
 * Policy v1:
 * 1. enumerate Package 4A physical candidates;
 * 2. choose the lowest fret;
 * 3. if fret ties, choose the lower string number (higher-pitched string).
 *
 * The result is explicitly generated-basic. It must never be represented as
 * source-provided technical fingering or teacher-approved fingering.
 *
 * @param {Object} note canonical NoteObject
 * @returns {Object} immutable selection result
 */
export function selectBasicCanonicalGuitarPosition(note) {
  const evidence = enumerateCanonicalGuitarPositionCandidates(note)

  if (evidence.state === GUITAR_POSITION_CANDIDATE_STATE.REST) {
    return freezeSelection({
      state: BASIC_GUITAR_POSITION_SELECTION_STATE.REST,
      reason: null,
      policyId: BASIC_GUITAR_POSITION_POLICY_ID,
      provenance: BASIC_GUITAR_POSITION_PROVENANCE,
      sourceFingeringClaimed: false,
      candidateCount: 0,
      position: null,
    })
  }

  if (evidence.state === GUITAR_POSITION_CANDIDATE_STATE.UNPLAYABLE) {
    return freezeSelection({
      state: BASIC_GUITAR_POSITION_SELECTION_STATE.UNPLAYABLE,
      reason: evidence.reason,
      policyId: BASIC_GUITAR_POSITION_POLICY_ID,
      provenance: BASIC_GUITAR_POSITION_PROVENANCE,
      sourceFingeringClaimed: false,
      candidateCount: 0,
      position: null,
    })
  }

  if (evidence.state !== GUITAR_POSITION_CANDIDATE_STATE.CANDIDATES) {
    return freezeSelection({
      state: BASIC_GUITAR_POSITION_SELECTION_STATE.INVALID,
      reason: evidence.reason || 'invalid-candidate-evidence',
      policyId: BASIC_GUITAR_POSITION_POLICY_ID,
      provenance: BASIC_GUITAR_POSITION_PROVENANCE,
      sourceFingeringClaimed: false,
      candidateCount: 0,
      position: null,
    })
  }

  if (!Array.isArray(evidence.candidates) || evidence.candidates.length === 0) {
    return freezeSelection({
      state: BASIC_GUITAR_POSITION_SELECTION_STATE.INVALID,
      reason: 'missing-candidates',
      policyId: BASIC_GUITAR_POSITION_POLICY_ID,
      provenance: BASIC_GUITAR_POSITION_PROVENANCE,
      sourceFingeringClaimed: false,
      candidateCount: 0,
      position: null,
    })
  }

  const selected = [...evidence.candidates].sort((a, b) =>
    (a.fret - b.fret) || (a.stringNumber - b.stringNumber),
  )[0]

  return freezeSelection({
    state: BASIC_GUITAR_POSITION_SELECTION_STATE.SELECTED,
    reason: null,
    policyId: BASIC_GUITAR_POSITION_POLICY_ID,
    provenance: BASIC_GUITAR_POSITION_PROVENANCE,
    sourceFingeringClaimed: false,
    candidateCount: evidence.candidates.length,
    position: {
      stringNumber: selected.stringNumber,
      stringLetter: selected.stringLetter,
      fret: selected.fret,
      soundingMidi: selected.soundingMidi,
      writtenMidi: selected.writtenMidi,
    },
  })
}
