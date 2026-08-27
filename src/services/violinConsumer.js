// Package 5E — production canonical Basic Violin consumer boundary.
//
// This adapter is the only production entry point that may turn the exact
// canonical NoteObject[] into generated basic first-position violin fingering.
// Package 2D ACCEPT is required before Package 5C projection may run.

import {
  QUALITY_GATE_DECISION,
  resolveViolinQualityGate,
} from './qualityGateIntegration.js'
import {
  BASIC_VIOLIN_PROJECTION_STATE,
  projectCanonicalNotesToBasicViolin,
} from '../../violinBasicProjection.js'

export const VIOLIN_CONSUMER_STATE = Object.freeze({
  PROJECTED: 'projected',
  REVIEW_REQUIRED: 'review-required',
  BLOCKED: 'blocked',
  NOT_AVAILABLE: 'not-available',
  INVALID: 'invalid',
})

function terminalResult(state, reason, gate = null, projection = null) {
  return Object.freeze({
    state,
    reason,
    allowed: false,
    definitive: false,
    teacherApproved: false,
    noteCount: 0,
    measureCount: 0,
    gate,
    projection,
  })
}

/**
 * Build definitive basic first-position violin projection only after the exact
 * canonical array has passed Package 2D for the VIOLIN consumer.
 *
 * A quality-gate REVIEW/BLOCK produces no projection. A Package 5C string
 * crossing ambiguity remains REVIEW_REQUIRED even after gate ACCEPT and emits
 * no finalized measure. Advanced structures and out-of-range notes remain
 * unavailable for Basic Violin instead of being flattened or guessed.
 */
export function buildQualityGatedBasicViolin(notes, options = {}) {
  if (!Array.isArray(notes)) {
    return terminalResult(
      VIOLIN_CONSUMER_STATE.INVALID,
      'canonical-note-array-required',
    )
  }

  let gate
  try {
    gate = resolveViolinQualityGate(notes, options)
  } catch {
    return terminalResult(
      VIOLIN_CONSUMER_STATE.INVALID,
      'quality-gate-resolution-failed',
    )
  }

  if (gate.decision === QUALITY_GATE_DECISION.REVIEW) {
    return terminalResult(
      VIOLIN_CONSUMER_STATE.REVIEW_REQUIRED,
      gate.reason,
      gate,
    )
  }

  if (gate.decision !== QUALITY_GATE_DECISION.ACCEPT) {
    return terminalResult(
      VIOLIN_CONSUMER_STATE.BLOCKED,
      gate.reason,
      gate,
    )
  }

  const projection = projectCanonicalNotesToBasicViolin(notes)

  if (projection.state === BASIC_VIOLIN_PROJECTION_STATE.REVIEW_REQUIRED) {
    return terminalResult(
      VIOLIN_CONSUMER_STATE.REVIEW_REQUIRED,
      projection.reason || 'violin-string-choice-review-required',
      gate,
      projection,
    )
  }

  if (
    projection.state === BASIC_VIOLIN_PROJECTION_STATE.ADVANCED_REQUIRED ||
    projection.state === BASIC_VIOLIN_PROJECTION_STATE.OUT_OF_RANGE
  ) {
    return terminalResult(
      VIOLIN_CONSUMER_STATE.NOT_AVAILABLE,
      projection.reason || 'basic-violin-projection-not-available',
      gate,
      projection,
    )
  }

  if (projection.state !== BASIC_VIOLIN_PROJECTION_STATE.PROJECTED) {
    return terminalResult(
      VIOLIN_CONSUMER_STATE.INVALID,
      projection.reason || 'basic-violin-projection-invalid',
      gate,
      projection,
    )
  }

  return Object.freeze({
    state: VIOLIN_CONSUMER_STATE.PROJECTED,
    reason: null,
    allowed: true,
    definitive: true,
    teacherApproved: false,
    noteCount: projection.noteCount,
    measureCount: projection.measureCount,
    gate,
    projection,
  })
}
