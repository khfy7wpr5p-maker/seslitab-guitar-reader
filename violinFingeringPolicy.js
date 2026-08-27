// Package 5B — deterministic basic first-position violin fingering policy.
//
// This module annotates Package 5A physical string candidates with a narrow
// mechanical first-position finger zone. It never chooses between overlapping
// strings and never represents generated fingering as source or teacher truth.

import {
  VIOLIN_POSITION_CANDIDATE_STATE,
  enumerateCanonicalViolinFirstPositionCandidates,
} from './violinPositionResolver.js'

export const BASIC_VIOLIN_FINGERING_POLICY_ID = 'first-position-semitone-zone-v1'

export const BASIC_VIOLIN_FINGERING_STATE = Object.freeze({
  GENERATED_BASIC: 'generated-basic',
  AMBIGUOUS: 'ambiguous',
  REST: 'rest',
  OUT_OF_RANGE: 'out-of-range',
  INVALID: 'invalid',
})

const FINGER_BY_SEMITONE_OFFSET = Object.freeze([
  0, // open string
  1, 1,
  2, 2,
  3, 3,
  4,
])

function freezeResult(result) {
  const fingeringCandidates = Object.freeze(
    (result.fingeringCandidates || []).map((candidate) =>
      Object.freeze({ ...candidate }),
    ),
  )

  return Object.freeze({
    ...result,
    fingeringCandidates,
  })
}

function passthroughResult(state, reason, writtenMidi = null) {
  return freezeResult({
    state,
    reason,
    policyId: BASIC_VIOLIN_FINGERING_POLICY_ID,
    writtenMidi,
    fingeringCandidates: [],
    requiresTeacherReview: false,
    teacherApproved: false,
  })
}

export function basicViolinFingerForSemitoneOffset(semitoneOffset) {
  if (
    !Number.isInteger(semitoneOffset) ||
    semitoneOffset < 0 ||
    semitoneOffset >= FINGER_BY_SEMITONE_OFFSET.length
  ) {
    return null
  }

  return FINGER_BY_SEMITONE_OFFSET[semitoneOffset]
}

/**
 * Apply the narrow Package 5B mechanical fingering policy to a canonical note.
 *
 * The policy maps first-position semitone zones to fingers:
 * 0 -> open, 1-2 -> finger 1, 3-4 -> finger 2,
 * 5-6 -> finger 3, 7 -> finger 4.
 *
 * This is generated basic position metadata, not a teacher-approved fingering.
 * If Package 5A exposes more than one string candidate, all candidates are
 * retained and the result is AMBIGUOUS. No preferred string is selected.
 *
 * @param {Object} note canonical NoteObject
 * @returns {Object} immutable policy result
 */
export function resolveBasicViolinFirstPositionFingering(note) {
  const candidateResult = enumerateCanonicalViolinFirstPositionCandidates(note)

  if (candidateResult.state === VIOLIN_POSITION_CANDIDATE_STATE.INVALID) {
    return passthroughResult(
      BASIC_VIOLIN_FINGERING_STATE.INVALID,
      candidateResult.reason,
      candidateResult.writtenMidi,
    )
  }

  if (candidateResult.state === VIOLIN_POSITION_CANDIDATE_STATE.REST) {
    return passthroughResult(BASIC_VIOLIN_FINGERING_STATE.REST, null, null)
  }

  if (candidateResult.state === VIOLIN_POSITION_CANDIDATE_STATE.OUT_OF_RANGE) {
    return passthroughResult(
      BASIC_VIOLIN_FINGERING_STATE.OUT_OF_RANGE,
      candidateResult.reason,
      candidateResult.writtenMidi,
    )
  }

  const fingeringCandidates = candidateResult.candidates.map((candidate) => {
    const fingerNumber = basicViolinFingerForSemitoneOffset(candidate.semitoneOffset)

    if (fingerNumber === null) {
      return null
    }

    return {
      ...candidate,
      fingerNumber,
      policyId: BASIC_VIOLIN_FINGERING_POLICY_ID,
      provenance: 'generated-basic-first-position-fingering',
      teacherApproved: false,
    }
  })

  if (
    fingeringCandidates.length !== candidateResult.candidates.length ||
    fingeringCandidates.some((candidate) => candidate === null)
  ) {
    return passthroughResult(
      BASIC_VIOLIN_FINGERING_STATE.INVALID,
      'unsupported-semitone-offset',
      candidateResult.writtenMidi,
    )
  }

  const ambiguous = fingeringCandidates.length > 1

  return freezeResult({
    state: ambiguous
      ? BASIC_VIOLIN_FINGERING_STATE.AMBIGUOUS
      : BASIC_VIOLIN_FINGERING_STATE.GENERATED_BASIC,
    reason: ambiguous ? 'multiple-first-position-string-candidates' : null,
    policyId: BASIC_VIOLIN_FINGERING_POLICY_ID,
    writtenMidi: candidateResult.writtenMidi,
    fingeringCandidates,
    requiresTeacherReview: ambiguous,
    teacherApproved: false,
  })
}
