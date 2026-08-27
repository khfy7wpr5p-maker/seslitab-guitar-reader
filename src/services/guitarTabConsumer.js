// Package 4E — production canonical Guitar TAB consumer boundary.
//
// This adapter is the only production entry point that may turn the exact
// canonical NoteObject[] into generated basic Guitar TAB. It requires a
// Package 2D ACCEPT decision before Package 4C projection or Package 4D
// rendering is allowed to run.

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
 *
 * REVIEW/BLOCK decisions return no TAB text. Unsupported basic structures
 * (polyphony, chords, multiple voices/staves/parts, unplayable pitch) also
 * return no partial TAB and remain delegated to later packages.
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
    text: render.text,
    noteCount: render.noteCount,
    measureCount: render.measureCount,
    gate,
    projection,
    render,
  })
}
