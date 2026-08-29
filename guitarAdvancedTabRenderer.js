// Package 9 — deterministic ASCII renderer for advanced Guitar TAB projection.
//
// One display cell represents one canonical onset group. Simultaneous notes
// appear vertically in the same cell. Spacing is display-only and does not
// replace canonical timing, tie or grace evidence.

import {
  ADVANCED_GUITAR_TAB_POLICY_ID,
  ADVANCED_GUITAR_TAB_PROJECTION_STATE,
  ADVANCED_GUITAR_TAB_PROVENANCE,
} from './guitarAdvancedTabProjection.js'
import { BASIC_GUITAR_TAB_STRING_ORDER } from './guitarBasicTabRenderer.js'

export const ADVANCED_GUITAR_TAB_FORMAT_ID = 'seslitab-advanced-ascii-tab-v1'
export const ADVANCED_GUITAR_TAB_CELL_WIDTH = 4

export const ADVANCED_GUITAR_TAB_RENDER_STATE = Object.freeze({
  RENDERED: 'rendered',
  NOT_RENDERABLE: 'not-renderable',
  INVALID: 'invalid',
})

const STRING_LETTER_BY_NUMBER = Object.freeze(
  Object.fromEntries(BASIC_GUITAR_TAB_STRING_ORDER.map((entry) => [entry.stringNumber, entry.stringLetter])),
)

function freezeResult(result) {
  return Object.freeze({
    ...result,
    stringOrder: BASIC_GUITAR_TAB_STRING_ORDER,
    measures: Object.freeze((result.measures || []).map((measure) => Object.freeze({
      ...measure,
      lines: Object.freeze((measure.lines || []).map((line) => Object.freeze({ ...line }))),
    }))),
  })
}

function terminal(state, reason) {
  return freezeResult({
    state,
    reason,
    formatId: ADVANCED_GUITAR_TAB_FORMAT_ID,
    policyId: ADVANCED_GUITAR_TAB_POLICY_ID,
    provenance: ADVANCED_GUITAR_TAB_PROVENANCE,
    sourceFingeringClaimed: false,
    noteCount: 0,
    measureCount: 0,
    cellWidth: ADVANCED_GUITAR_TAB_CELL_WIDTH,
    rhythmEncoded: false,
    graceEncoded: false,
    tieEncoded: false,
    roundTripLossless: false,
    text: '',
    measures: [],
  })
}

function validPosition(position) {
  return Boolean(
    position &&
    typeof position === 'object' &&
    !Array.isArray(position) &&
    Number.isInteger(position.stringNumber) &&
    position.stringNumber >= 1 &&
    position.stringNumber <= 6 &&
    STRING_LETTER_BY_NUMBER[position.stringNumber] === position.stringLetter &&
    Number.isInteger(position.fret) &&
    position.fret >= 0 &&
    position.fret <= 24
  )
}

function validateProjection(projection) {
  if (!projection || typeof projection !== 'object' || Array.isArray(projection)) return 'projection-required'
  if (projection.policyId !== ADVANCED_GUITAR_TAB_POLICY_ID) return 'projection-policy-mismatch'
  if (projection.provenance !== ADVANCED_GUITAR_TAB_PROVENANCE) return 'projection-provenance-mismatch'
  if (projection.sourceFingeringClaimed !== false) return 'projection-source-fingering-claim-invalid'
  if (!Number.isInteger(projection.noteCount) || projection.noteCount < 1) return 'projection-note-count-invalid'
  if (!Number.isInteger(projection.measureCount) || projection.measureCount < 1) return 'projection-measure-count-invalid'
  if (!Array.isArray(projection.measures) || projection.measures.length !== projection.measureCount) {
    return 'projection-measure-count-mismatch'
  }

  const seenNoteIndices = new Set()
  for (const measure of projection.measures) {
    if (!measure || typeof measure !== 'object' || Array.isArray(measure)) return 'projection-measure-invalid'
    if (typeof measure.measureKey !== 'string' || measure.measureKey.trim() === '') return 'projection-measure-key-invalid'
    if (!Array.isArray(measure.groups) || measure.groups.length === 0) return 'projection-groups-invalid'

    let previousStartBeat = -1
    for (const group of measure.groups) {
      if (!group || typeof group !== 'object' || Array.isArray(group)) return 'projection-group-invalid'
      if (typeof group.startBeat !== 'number' || !Number.isFinite(group.startBeat) || group.startBeat < 0) {
        return 'projection-group-time-invalid'
      }
      if (group.startBeat < previousStartBeat) return 'projection-group-order-invalid'
      previousStartBeat = group.startBeat
      if (!Array.isArray(group.events) || group.events.length === 0) return 'projection-group-events-invalid'

      const usedStrings = new Set()
      for (const event of group.events) {
        if (!event || typeof event !== 'object' || Array.isArray(event)) return 'projection-event-invalid'
        if (!Number.isInteger(event.noteIndex) || event.noteIndex < 0 || event.noteIndex >= projection.noteCount) {
          return 'projection-note-index-invalid'
        }
        if (seenNoteIndices.has(event.noteIndex)) return 'projection-note-index-duplicate'
        seenNoteIndices.add(event.noteIndex)
        if (event.measureKey !== measure.measureKey || event.startBeat !== group.startBeat) {
          return 'projection-event-identity-mismatch'
        }
        if (event.policyId !== ADVANCED_GUITAR_TAB_POLICY_ID || event.provenance !== ADVANCED_GUITAR_TAB_PROVENANCE) {
          return 'projection-event-policy-mismatch'
        }
        if (event.sourceFingeringClaimed !== false) return 'projection-event-fingering-claim-invalid'

        if (event.isRest) {
          if (event.position !== null) return 'projection-rest-position-invalid'
          continue
        }
        if (!validPosition(event.position)) return 'projection-position-invalid'
        if (usedStrings.has(event.position.stringNumber)) return 'projection-simultaneous-string-collision'
        usedStrings.add(event.position.stringNumber)
      }
    }
  }

  if (seenNoteIndices.size !== projection.noteCount) return 'projection-note-count-mismatch'
  return null
}

function fretCell(fret) {
  const token = String(fret)
  return `-${token}${'-'.repeat(ADVANCED_GUITAR_TAB_CELL_WIDTH - token.length - 1)}`
}

function renderMeasure(measure) {
  const bodies = new Map(BASIC_GUITAR_TAB_STRING_ORDER.map(({ stringNumber }) => [stringNumber, '']))

  for (const group of measure.groups) {
    const byString = new Map()
    for (const event of group.events) {
      if (!event.isRest) byString.set(event.position.stringNumber, event.position.fret)
    }
    for (const { stringNumber } of BASIC_GUITAR_TAB_STRING_ORDER) {
      const fret = byString.get(stringNumber)
      const cell = fret === undefined ? '-'.repeat(ADVANCED_GUITAR_TAB_CELL_WIDTH) : fretCell(fret)
      bodies.set(stringNumber, `${bodies.get(stringNumber)}${cell}`)
    }
  }

  const lines = BASIC_GUITAR_TAB_STRING_ORDER.map(({ stringNumber, stringLetter }) => ({
    stringNumber,
    stringLetter,
    body: bodies.get(stringNumber),
    text: `${stringLetter}|${bodies.get(stringNumber)}|`,
  }))

  return {
    measureKey: measure.measureKey,
    measureIndex: measure.measureIndex,
    measureNumber: measure.measureNumber ?? null,
    partId: measure.partId,
    partIndex: measure.partIndex,
    onsetGroupCount: measure.groups.length,
    lines,
    text: lines.map((line) => line.text).join('\n'),
  }
}

export function renderAdvancedGuitarTabProjection(projection) {
  if (!projection || typeof projection !== 'object' || Array.isArray(projection)) {
    return terminal(ADVANCED_GUITAR_TAB_RENDER_STATE.INVALID, 'projection-required')
  }
  if (projection.state !== ADVANCED_GUITAR_TAB_PROJECTION_STATE.PROJECTED) {
    return terminal(ADVANCED_GUITAR_TAB_RENDER_STATE.NOT_RENDERABLE, 'projection-not-renderable')
  }

  const validationError = validateProjection(projection)
  if (validationError) return terminal(ADVANCED_GUITAR_TAB_RENDER_STATE.INVALID, validationError)

  const measures = projection.measures.map(renderMeasure)
  return freezeResult({
    state: ADVANCED_GUITAR_TAB_RENDER_STATE.RENDERED,
    reason: null,
    formatId: ADVANCED_GUITAR_TAB_FORMAT_ID,
    policyId: ADVANCED_GUITAR_TAB_POLICY_ID,
    provenance: ADVANCED_GUITAR_TAB_PROVENANCE,
    sourceFingeringClaimed: false,
    noteCount: projection.noteCount,
    measureCount: projection.measureCount,
    cellWidth: ADVANCED_GUITAR_TAB_CELL_WIDTH,
    rhythmEncoded: false,
    graceEncoded: false,
    tieEncoded: false,
    roundTripLossless: false,
    text: measures.map((measure) => measure.text).join('\n\n'),
    measures,
  })
}
