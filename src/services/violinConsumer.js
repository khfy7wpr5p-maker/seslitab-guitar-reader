// Package 5E + Package 10 — production canonical Violin consumer boundary.
//
// The exact canonical NoteObject[] must pass Package 2D VIOLIN quality gating
// before either the Basic Violin or generated Advanced Violin solver may run.

import {
  QUALITY_GATE_DECISION,
  resolveViolinQualityGate,
} from './qualityGateIntegration.js'
import {
  BASIC_VIOLIN_PROJECTION_STATE,
  projectCanonicalNotesToBasicViolin,
} from '../../violinBasicProjection.js'
import {
  ADVANCED_VIOLIN_PROJECTION_STATE,
  projectCanonicalNotesToAdvancedViolin,
} from '../../violinAdvancedProjection.js'

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

function resolveGate(notes, options) {
  if (!Array.isArray(notes)) {
    return { terminal: terminalResult(VIOLIN_CONSUMER_STATE.INVALID, 'canonical-note-array-required') }
  }

  let gate
  try {
    gate = resolveViolinQualityGate(notes, options)
  } catch {
    return { terminal: terminalResult(VIOLIN_CONSUMER_STATE.INVALID, 'quality-gate-resolution-failed') }
  }

  if (gate.decision === QUALITY_GATE_DECISION.REVIEW) {
    return { terminal: terminalResult(VIOLIN_CONSUMER_STATE.REVIEW_REQUIRED, gate.reason, gate) }
  }

  if (gate.decision !== QUALITY_GATE_DECISION.ACCEPT) {
    return { terminal: terminalResult(VIOLIN_CONSUMER_STATE.BLOCKED, gate.reason, gate) }
  }

  return { gate }
}

/**
 * Package 5E conservative basic first-position consumer. Kept unchanged as the
 * public basic-only boundary so existing callers and pedagogical semantics do
 * not silently widen.
 */
export function buildQualityGatedBasicViolin(notes, options = {}) {
  const gateResult = resolveGate(notes, options)
  if (gateResult.terminal) return gateResult.terminal
  const gate = gateResult.gate

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

/**
 * Package 10 full Violin boundary.
 *
 * The conservative Package 5 path is always attempted first. Only when that
 * path is review-required because of generated string-choice ambiguity, or
 * unavailable because the structure/range needs advanced handling, does the
 * bounded Package 10 solver run. A Package 2D REVIEW/BLOCK never reaches either
 * solver.
 *
 * Advanced output is definitive only as generated output under its explicit
 * policy. It is never teacher-approved, recovered source fingering or a claim
 * of pedagogical optimum.
 */
export function buildQualityGatedViolin(notes, options = {}) {
  const gateResult = resolveGate(notes, options)
  if (gateResult.terminal) return gateResult.terminal
  const gate = gateResult.gate

  const basic = projectCanonicalNotesToBasicViolin(notes)
  if (basic.state === BASIC_VIOLIN_PROJECTION_STATE.PROJECTED) {
    return Object.freeze({
      state: VIOLIN_CONSUMER_STATE.PROJECTED,
      reason: null,
      allowed: true,
      definitive: true,
      teacherApproved: false,
      mode: 'basic',
      noteCount: basic.noteCount,
      measureCount: basic.measureCount,
      gate,
      projection: basic,
    })
  }

  const advancedEligible = basic.state === BASIC_VIOLIN_PROJECTION_STATE.REVIEW_REQUIRED ||
    basic.state === BASIC_VIOLIN_PROJECTION_STATE.ADVANCED_REQUIRED ||
    basic.state === BASIC_VIOLIN_PROJECTION_STATE.OUT_OF_RANGE

  if (!advancedEligible) {
    return terminalResult(
      VIOLIN_CONSUMER_STATE.INVALID,
      basic.reason || 'basic-violin-projection-invalid',
      gate,
      basic,
    )
  }

  const advanced = projectCanonicalNotesToAdvancedViolin(notes)
  if (advanced.state === ADVANCED_VIOLIN_PROJECTION_STATE.UNPLAYABLE) {
    return terminalResult(
      VIOLIN_CONSUMER_STATE.NOT_AVAILABLE,
      advanced.reason || 'advanced-violin-projection-not-available',
      gate,
      advanced,
    )
  }
  if (advanced.state !== ADVANCED_VIOLIN_PROJECTION_STATE.PROJECTED) {
    return terminalResult(
      VIOLIN_CONSUMER_STATE.INVALID,
      advanced.reason || 'advanced-violin-projection-invalid',
      gate,
      advanced,
    )
  }

  return Object.freeze({
    state: VIOLIN_CONSUMER_STATE.PROJECTED,
    reason: null,
    allowed: true,
    definitive: true,
    teacherApproved: false,
    mode: 'advanced',
    noteCount: advanced.noteCount,
    measureCount: advanced.measureCount,
    gate,
    projection: advanced,
  })
}