// Package 4D — deterministic basic ASCII Guitar TAB renderer.
//
// This module renders only the already-conservative Package 4C projection.
// It preserves physical measure identity in the returned structure and uses
// source event order for fixed-width display cells. ASCII spacing is not a
// rhythm model and does not encode grace or tie semantics.

import {
  BASIC_GUITAR_POSITION_POLICY_ID,
  BASIC_GUITAR_POSITION_PROVENANCE,
} from './guitarBasicPositionPolicy.js'
import { BASIC_GUITAR_TAB_PROJECTION_STATE } from './guitarBasicTabProjection.js'

export const BASIC_GUITAR_TAB_FORMAT_ID = 'seslitab-basic-ascii-tab-v1'
export const BASIC_GUITAR_TAB_CELL_WIDTH = 4

export const BASIC_GUITAR_TAB_RENDER_STATE = Object.freeze({
  RENDERED: 'rendered',
  NOT_RENDERABLE: 'not-renderable',
  INVALID: 'invalid',
})

export const BASIC_GUITAR_TAB_STRING_ORDER = Object.freeze([
  Object.freeze({ stringNumber: 1, stringLetter: 'e' }),
  Object.freeze({ stringNumber: 2, stringLetter: 'B' }),
  Object.freeze({ stringNumber: 3, stringLetter: 'G' }),
  Object.freeze({ stringNumber: 4, stringLetter: 'D' }),
  Object.freeze({ stringNumber: 5, stringLetter: 'A' }),
  Object.freeze({ stringNumber: 6, stringLetter: 'E' }),
])

const STRING_LETTER_BY_NUMBER = Object.freeze(
  Object.fromEntries(BASIC_GUITAR_TAB_STRING_ORDER.map((entry) => [entry.stringNumber, entry.stringLetter])),
)

function isNonNegativeInteger(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isFiniteNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function freezeRenderResult(result) {
  const measures = Object.freeze(
    (result.measures || []).map((measure) =>
      Object.freeze({
        ...measure,
        lines: Object.freeze(
          (measure.lines || []).map((line) => Object.freeze({ ...line })),
        ),
      }),
    ),
  )

  return Object.freeze({
    ...result,
    stringOrder: BASIC_GUITAR_TAB_STRING_ORDER,
    measures,
  })
}

function terminalRender(state, reason) {
  return freezeRenderResult({
    state,
    reason,
    formatId: BASIC_GUITAR_TAB_FORMAT_ID,
    policyId: BASIC_GUITAR_POSITION_POLICY_ID,
    provenance: BASIC_GUITAR_POSITION_PROVENANCE,
    sourceFingeringClaimed: false,
    noteCount: 0,
    measureCount: 0,
    cellWidth: BASIC_GUITAR_TAB_CELL_WIDTH,
    rhythmEncoded: false,
    graceEncoded: false,
    tieEncoded: false,
    roundTripLossless: false,
    text: '',
    measures: [],
  })
}

function validatePosition(position) {
  if (!position || typeof position !== 'object' || Array.isArray(position)) return false

  const { stringNumber, stringLetter, fret } = position
  if (!Number.isInteger(stringNumber) || stringNumber < 1 || stringNumber > 6) return false
  if (STRING_LETTER_BY_NUMBER[stringNumber] !== stringLetter) return false
  if (!Number.isInteger(fret) || fret < 0 || fret > 24) return false

  return true
}

function validateProjection(projection) {
  if (!projection || typeof projection !== 'object' || Array.isArray(projection)) {
    return 'projection-required'
  }

  if (projection.policyId !== BASIC_GUITAR_POSITION_POLICY_ID) return 'projection-policy-mismatch'
  if (projection.provenance !== BASIC_GUITAR_POSITION_PROVENANCE) return 'projection-provenance-mismatch'
  if (projection.sourceFingeringClaimed !== false) return 'projection-fingering-claim-invalid'
  if (!isNonNegativeInteger(projection.noteCount) || projection.noteCount === 0) {
    return 'projection-note-count-invalid'
  }
  if (!isNonNegativeInteger(projection.measureCount) || projection.measureCount === 0) {
    return 'projection-measure-count-invalid'
  }
  if (!Array.isArray(projection.measures) || projection.measures.length !== projection.measureCount) {
    return 'projection-measure-count-mismatch'
  }

  const measureKeys = new Set()
  const seenNoteIndices = new Set()

  for (const measure of projection.measures) {
    if (!measure || typeof measure !== 'object' || Array.isArray(measure)) {
      return 'projection-measure-invalid'
    }
    if (typeof measure.measureKey !== 'string' || measure.measureKey.trim() === '') {
      return 'projection-measure-key-invalid'
    }
    if (measureKeys.has(measure.measureKey)) return 'projection-measure-key-duplicate'
    measureKeys.add(measure.measureKey)

    if (!isNonNegativeInteger(measure.measureIndex)) return 'projection-measure-index-invalid'
    if (typeof measure.partId !== 'string' || measure.partId.trim() === '') {
      return 'projection-part-id-invalid'
    }
    if (!isNonNegativeInteger(measure.partIndex)) return 'projection-part-index-invalid'
    if (!Array.isArray(measure.events) || measure.events.length === 0) {
      return 'projection-events-invalid'
    }

    let previousNoteIndex = -1
    for (const event of measure.events) {
      if (!event || typeof event !== 'object' || Array.isArray(event)) {
        return 'projection-event-invalid'
      }
      if (!isNonNegativeInteger(event.noteIndex) || event.noteIndex >= projection.noteCount) {
        return 'projection-note-index-invalid'
      }
      if (seenNoteIndices.has(event.noteIndex)) return 'projection-note-index-duplicate'
      if (event.noteIndex <= previousNoteIndex) return 'projection-note-order-invalid'
      previousNoteIndex = event.noteIndex
      seenNoteIndices.add(event.noteIndex)

      if (!event.note || typeof event.note !== 'object' || Array.isArray(event.note)) {
        return 'projection-note-reference-invalid'
      }
      if (event.measureKey !== measure.measureKey || event.measureIndex !== measure.measureIndex) {
        return 'projection-event-measure-identity-mismatch'
      }
      if (!isFiniteNonNegativeNumber(event.startBeat) || !isFiniteNonNegativeNumber(event.beats)) {
        return 'projection-event-time-invalid'
      }
      if (typeof event.isRest !== 'boolean' || typeof event.isGrace !== 'boolean') {
        return 'projection-event-kind-invalid'
      }
      if (typeof event.tieStart !== 'boolean' || typeof event.tieStop !== 'boolean') {
        return 'projection-event-tie-invalid'
      }
      if (event.policyId !== BASIC_GUITAR_POSITION_POLICY_ID) return 'projection-event-policy-mismatch'
      if (event.provenance !== BASIC_GUITAR_POSITION_PROVENANCE) {
        return 'projection-event-provenance-mismatch'
      }
      if (event.sourceFingeringClaimed !== false) return 'projection-event-fingering-claim-invalid'

      if (event.isRest) {
        if (event.position !== null) return 'projection-rest-position-invalid'
      } else if (!validatePosition(event.position)) {
        return 'projection-position-invalid'
      }
    }
  }

  if (seenNoteIndices.size !== projection.noteCount) return 'projection-note-count-mismatch'
  for (let noteIndex = 0; noteIndex < projection.noteCount; noteIndex += 1) {
    if (!seenNoteIndices.has(noteIndex)) return 'projection-note-index-missing'
  }
  return null
}

function renderFretCell(fret) {
  const token = String(fret)
  return `-${token}${'-'.repeat(BASIC_GUITAR_TAB_CELL_WIDTH - token.length - 1)}`
}

function renderMeasure(measure) {
  const bodies = new Map(
    BASIC_GUITAR_TAB_STRING_ORDER.map(({ stringNumber }) => [stringNumber, '']),
  )

  for (const event of measure.events) {
    for (const { stringNumber } of BASIC_GUITAR_TAB_STRING_ORDER) {
      const body = event.isRest || event.position.stringNumber !== stringNumber
        ? '-'.repeat(BASIC_GUITAR_TAB_CELL_WIDTH)
        : renderFretCell(event.position.fret)
      bodies.set(stringNumber, `${bodies.get(stringNumber)}${body}`)
    }
  }

  const lines = BASIC_GUITAR_TAB_STRING_ORDER.map(({ stringNumber, stringLetter }) => {
    const body = bodies.get(stringNumber)
    return {
      stringNumber,
      stringLetter,
      body,
      text: `${stringLetter}|${body}|`,
    }
  })

  return {
    measureKey: measure.measureKey,
    measureIndex: measure.measureIndex,
    measureNumber: measure.measureNumber ?? null,
    partId: measure.partId,
    partIndex: measure.partIndex,
    eventCount: measure.events.length,
    lines,
    text: lines.map((line) => line.text).join('\n'),
  }
}

/**
 * Render a Package 4C basic Guitar TAB projection into deterministic six-line
 * ASCII blocks. Each physical measure is returned separately and the combined
 * text joins measure blocks with one blank line.
 *
 * Fixed-width cells preserve event order only. They do not claim rhythmic
 * spacing and do not encode grace/tie semantics. The canonical projection
 * remains authoritative for those details.
 *
 * @param {Object} projection Package 4C projection result
 * @returns {Object} immutable render result
 */
export function renderBasicGuitarTabProjection(projection) {
  if (!projection || typeof projection !== 'object' || Array.isArray(projection)) {
    return terminalRender(BASIC_GUITAR_TAB_RENDER_STATE.INVALID, 'projection-required')
  }

  if (projection.state !== BASIC_GUITAR_TAB_PROJECTION_STATE.PROJECTED) {
    return terminalRender(BASIC_GUITAR_TAB_RENDER_STATE.NOT_RENDERABLE, 'projection-not-renderable')
  }

  const validationError = validateProjection(projection)
  if (validationError) {
    return terminalRender(BASIC_GUITAR_TAB_RENDER_STATE.INVALID, validationError)
  }

  const renderedMeasures = projection.measures.map(renderMeasure)

  return freezeRenderResult({
    state: BASIC_GUITAR_TAB_RENDER_STATE.RENDERED,
    reason: null,
    formatId: BASIC_GUITAR_TAB_FORMAT_ID,
    policyId: BASIC_GUITAR_POSITION_POLICY_ID,
    provenance: BASIC_GUITAR_POSITION_PROVENANCE,
    sourceFingeringClaimed: false,
    noteCount: projection.noteCount,
    measureCount: projection.measureCount,
    cellWidth: BASIC_GUITAR_TAB_CELL_WIDTH,
    rhythmEncoded: false,
    graceEncoded: false,
    tieEncoded: false,
    roundTripLossless: false,
    text: renderedMeasures.map((measure) => measure.text).join('\n\n'),
    measures: renderedMeasures,
  })
}
