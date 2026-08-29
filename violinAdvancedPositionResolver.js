// Package 10 — bounded generated advanced violin position alternatives.
//
// This resolver deliberately models only standard tuning and generated
// chromatic hand-position zones for first, second and third position. It does
// not claim recovered source fingering, teacher approval or pedagogical
// optimality. The table is an explicit mechanical policy used only after the
// existing VIOLIN quality gate.

export const ADVANCED_VIOLIN_POSITION_POLICY_ID = 'violin-position-zones-v1'
export const ADVANCED_VIOLIN_PROVENANCE = 'generated-advanced'

export const ADVANCED_VIOLIN_POSITION_STATE = Object.freeze({
  CANDIDATES: 'candidates',
  REST: 'rest',
  OUT_OF_RANGE: 'out-of-range',
  INVALID: 'invalid',
})

export const ADVANCED_VIOLIN_STRINGS = Object.freeze([
  Object.freeze({ stringNumber: 1, stringName: 'E', openMidi: 76 }),
  Object.freeze({ stringNumber: 2, stringName: 'A', openMidi: 69 }),
  Object.freeze({ stringNumber: 3, stringName: 'D', openMidi: 62 }),
  Object.freeze({ stringNumber: 4, stringName: 'G', openMidi: 55 }),
])

// A mechanical semitone-zone model. Low/high chromatic finger variants are
// represented as alternatives, not silently collapsed into one "correct"
// pedagogical fingering.
const POSITION_ZONES = Object.freeze([
  Object.freeze({ positionNumber: 1, fingerNumber: 1, offsets: Object.freeze([1, 2]) }),
  Object.freeze({ positionNumber: 1, fingerNumber: 2, offsets: Object.freeze([3, 4]) }),
  Object.freeze({ positionNumber: 1, fingerNumber: 3, offsets: Object.freeze([5, 6]) }),
  Object.freeze({ positionNumber: 1, fingerNumber: 4, offsets: Object.freeze([7]) }),
  Object.freeze({ positionNumber: 2, fingerNumber: 1, offsets: Object.freeze([3, 4]) }),
  Object.freeze({ positionNumber: 2, fingerNumber: 2, offsets: Object.freeze([5, 6]) }),
  Object.freeze({ positionNumber: 2, fingerNumber: 3, offsets: Object.freeze([7, 8]) }),
  Object.freeze({ positionNumber: 2, fingerNumber: 4, offsets: Object.freeze([9]) }),
  Object.freeze({ positionNumber: 3, fingerNumber: 1, offsets: Object.freeze([5, 6]) }),
  Object.freeze({ positionNumber: 3, fingerNumber: 2, offsets: Object.freeze([7, 8]) }),
  Object.freeze({ positionNumber: 3, fingerNumber: 3, offsets: Object.freeze([9, 10]) }),
  Object.freeze({ positionNumber: 3, fingerNumber: 4, offsets: Object.freeze([11, 12]) }),
])

const STEP_TO_SEMITONE = Object.freeze({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 })

function freezeResult(result) {
  return Object.freeze({
    ...result,
    candidates: Object.freeze((result.candidates || []).map((candidate) => Object.freeze({ ...candidate }))),
  })
}

function terminal(state, reason, writtenMidi = null, candidates = []) {
  return freezeResult({
    state,
    reason,
    writtenMidi,
    policyId: ADVANCED_VIOLIN_POSITION_POLICY_ID,
    provenance: ADVANCED_VIOLIN_PROVENANCE,
    teacherApproved: false,
    sourceFingeringClaimed: false,
    candidates,
  })
}

function resolveWrittenMidi(note) {
  if (!note || typeof note !== 'object' || Array.isArray(note)) return null
  if (note.isRest === true) return null
  if (typeof note.step !== 'string' || !Object.hasOwn(STEP_TO_SEMITONE, note.step)) return null
  if (!Number.isInteger(note.octave) || note.octave < 0 || note.octave > 9) return null
  const alter = note.alter ?? 0
  if (!Number.isInteger(alter) || alter < -2 || alter > 2) return null
  const midi = (note.octave + 1) * 12 + STEP_TO_SEMITONE[note.step] + alter
  return Number.isInteger(midi) && midi >= 0 && midi <= 127 ? midi : null
}

function variantForOffset(zone, offset) {
  const index = zone.offsets.indexOf(offset)
  if (zone.offsets.length === 1) return 'fixed'
  return index === 0 ? 'low' : 'high'
}

/**
 * Enumerate bounded generated violin alternatives through third position.
 * The result preserves every mechanically valid alternative and makes no
 * pedagogical ranking claim.
 */
export function enumerateAdvancedViolinPositionCandidates(note) {
  if (!note || typeof note !== 'object' || Array.isArray(note)) {
    return terminal(ADVANCED_VIOLIN_POSITION_STATE.INVALID, 'canonical-note-required')
  }
  if (note.isRest === true) {
    return terminal(ADVANCED_VIOLIN_POSITION_STATE.REST, null)
  }

  const writtenMidi = resolveWrittenMidi(note)
  if (writtenMidi === null) {
    return terminal(ADVANCED_VIOLIN_POSITION_STATE.INVALID, 'valid-written-pitch-required')
  }

  const candidates = []
  for (const string of ADVANCED_VIOLIN_STRINGS) {
    const offset = writtenMidi - string.openMidi
    if (offset < 0 || offset > 12) continue

    if (offset === 0) {
      candidates.push({
        ...string,
        writtenMidi,
        semitoneOffset: 0,
        positionNumber: 1,
        fingerNumber: 0,
        fingerVariant: 'open',
        policyId: ADVANCED_VIOLIN_POSITION_POLICY_ID,
        provenance: ADVANCED_VIOLIN_PROVENANCE,
        teacherApproved: false,
        sourceFingeringClaimed: false,
      })
      continue
    }

    for (const zone of POSITION_ZONES) {
      if (!zone.offsets.includes(offset)) continue
      candidates.push({
        ...string,
        writtenMidi,
        semitoneOffset: offset,
        positionNumber: zone.positionNumber,
        fingerNumber: zone.fingerNumber,
        fingerVariant: variantForOffset(zone, offset),
        policyId: ADVANCED_VIOLIN_POSITION_POLICY_ID,
        provenance: ADVANCED_VIOLIN_PROVENANCE,
        teacherApproved: false,
        sourceFingeringClaimed: false,
      })
    }
  }

  candidates.sort((a, b) =>
    (a.positionNumber - b.positionNumber) ||
    (a.fingerNumber - b.fingerNumber) ||
    (a.stringNumber - b.stringNumber) ||
    (a.semitoneOffset - b.semitoneOffset),
  )

  if (candidates.length === 0) {
    return terminal(ADVANCED_VIOLIN_POSITION_STATE.OUT_OF_RANGE, 'outside-bounded-first-through-third-position', writtenMidi)
  }

  return terminal(ADVANCED_VIOLIN_POSITION_STATE.CANDIDATES, null, writtenMidi, candidates)
}