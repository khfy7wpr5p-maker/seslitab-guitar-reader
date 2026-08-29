// Package 4E + Package 9 — production canonical Guitar TAB consumer boundary.
//
// Basic TAB remains the first deterministic path. Package 9 is invoked only
// after the same exact canonical NoteObject[] has already received a Package
// 2D GUITAR_TAB ACCEPT decision and Package 4C reports advanced structure.

import {
  QUALITY_GATE_DECISION,
  resolveGuitarTabQualityGate,
} from './qualityGateIntegration.js'
import {
  BASIC_GUITAR_TAB_PROJECTION_STATE,
  projectCanonicalNotesToBasicGuitarTab,
} from '../../guitarBasicTabProjection.js'
import {
  BASIC_GUITAR_TAB_RENDER_STATE,
  renderBasicGuitarTabProjection,
} from '../../guitarBasicTabRenderer.js'
import {
  ADVANCED_GUITAR_TAB_PROJECTION_STATE,
  projectCanonicalNotesToAdvancedGuitarTab,
} from '../../guitarAdvancedTabProjection.js'
import {
  ADVANCED_GUITAR_TAB_RENDER_STATE,
  renderAdvancedGuitarTabProjection,
} from '../../guitarAdvancedTabRenderer.js'

export const GUITAR_TAB_CONSUMER_STATE = Object.freeze({
  RENDERED: 'rendered',
  REVIEW_REQUIRED: 'review-required',
  BLOCKED: 'blocked',
  NOT_AVAILABLE: 'not-available',
  INVALID: 'invalid',
})

function terminalResult(state, reason, gate = null, projection = null, render = null) {
  return Object.freeze({
    state,
    reason,
    allowed: false,
    definitive: false,
    text: '',
    noteCount: 0,
    measureCount: 0,
    gate,
    projection,
    render,
  })
}

/**
 * Build definitive basic Guitar TAB only after the exact canonical array has
 * passed Package 2D for the GUITAR_TAB consumer.
 */
export function buildQualityGatedBasicGuitarTab(notes, options = {}) {
  if (!Array.isArray(notes)) {
    return terminalResult(
      GUITAR_TAB_CONSUMER_STATE.INVALID,
      'canonical-note-array-required',
    )
  }

  let gate
  try {
    gate = resolveGuitarTabQualityGate(notes, options)
  } catch {
    return terminalResult(
      GUITAR_TAB_CONSUMER_STATE.INVALID,
      'quality-gate-resolution-failed',
    )
  }

  if (gate.decision === QUALITY_GATE_DECISION.REVIEW) {
    return terminalResult(
      GUITAR_TAB_CONSUMER_STATE.REVIEW_REQUIRED,
      gate.reason,
      gate,
    )
  }

  if (gate.decision !== QUALITY_GATE_DECISION.ACCEPT) {
    return terminalResult(
      GUITAR_TAB_CONSUMER_STATE.BLOCKED,
      gate.reason,
      gate,
    )
  }

  const projection = projectCanonicalNotesToBasicGuitarTab(notes)
  if (projection.state !== BASIC_GUITAR_TAB_PROJECTION_STATE.PROJECTED) {
    return terminalResult(
      GUITAR_TAB_CONSUMER_STATE.NOT_AVAILABLE,
      projection.reason || 'basic-tab-projection-not-available',
      gate,
      projection,
    )
  }

  const render = renderBasicGuitarTabProjection(projection)
  if (render.state !== BASIC_GUITAR_TAB_RENDER_STATE.RENDERED) {
    return terminalResult(
      GUITAR_TAB_CONSUMER_STATE.INVALID,
      render.reason || 'basic-tab-render-failed',
      gate,
      projection,
      render,
    )
  }

  return Object.freeze({
    state: GUITAR_TAB_CONSUMER_STATE.RENDERED,
    reason: null,
    allowed: true,
    definitive: true,
    mode: 'basic',
    text: render.text,
    noteCount: render.noteCount,
    measureCount: render.measureCount,
    gate,
    projection,
    render,
  })
}

/**
 * Package 9 production fallback. The advanced solver is never called for a
 * REVIEW/BLOCK gate. It runs only when Package 4 has truthfully delegated an
 * otherwise accepted single-guitar score because of chord/polyphonic shape.
 */
export function buildQualityGatedGuitarTab(notes, options = {}) {
  const basic = buildQualityGatedBasicGuitarTab(notes, options)

  if (
    basic.state !== GUITAR_TAB_CONSUMER_STATE.NOT_AVAILABLE ||
    basic.projection?.state !== BASIC_GUITAR_TAB_PROJECTION_STATE.ADVANCED_REQUIRED
  ) {
    return basic
  }

  const projection = projectCanonicalNotesToAdvancedGuitarTab(notes)
  if (projection.state !== ADVANCED_GUITAR_TAB_PROJECTION_STATE.PROJECTED) {
    const state = projection.state === ADVANCED_GUITAR_TAB_PROJECTION_STATE.INVALID
      ? GUITAR_TAB_CONSUMER_STATE.INVALID
      : GUITAR_TAB_CONSUMER_STATE.NOT_AVAILABLE
    return terminalResult(
      state,
      projection.reason || 'advanced-tab-projection-not-available',
      basic.gate,
      projection,
    )
  }

  const render = renderAdvancedGuitarTabProjection(projection)
  if (render.state !== ADVANCED_GUITAR_TAB_RENDER_STATE.RENDERED) {
    return terminalResult(
      GUITAR_TAB_CONSUMER_STATE.INVALID,
      render.reason || 'advanced-tab-render-failed',
      basic.gate,
      projection,
      render,
    )
  }

  return Object.freeze({
    state: GUITAR_TAB_CONSUMER_STATE.RENDERED,
    reason: null,
    allowed: true,
    definitive: true,
    mode: 'advanced',
    text: render.text,
    noteCount: render.noteCount,
    measureCount: render.measureCount,
    gate: basic.gate,
    projection,
    render,
  })
}
