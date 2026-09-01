// Stage E / S06-S07 — bounded visual note editor projection.
//
// This module does not mutate notes and does not create revision/history truth.
// It exposes only four teacher-visible primitive correction targets after S06
// proves that the selected canonical note belongs to the exact current teacher
// revision. S07 may supply a verified corrected selection projection while the
// original `snapshot.notes` remains source truth for existing consumers. The
// existing Package 8 immutable correction/history boundary remains authoritative.

import { getTeacherWorkspaceCurrentRevision } from './teacherWorkspaceModel.js'
import { stageS06SelectionMatchesRevision } from './stageS06SelectionIdentity.js'

export const STAGE_E_EDIT_FIELD = Object.freeze({
  PITCH: 'step',
  ACCIDENTAL: 'alter',
  OCTAVE: 'octave',
  DURATION: 'durationValue',
})

const ALLOWED = Object.freeze(Object.values(STAGE_E_EDIT_FIELD))

const LABELS = Object.freeze({
  step: 'Nota harfi',
  alter: 'Arıza',
  octave: 'Oktav',
  durationValue: 'Süre',
})

function own(note, field) {
  return Boolean(note && Object.prototype.hasOwnProperty.call(note, field))
}

export function validateStageEEditValue(field, rawValue) {
  if (!ALLOWED.includes(field)) throw new TypeError('Unsupported Stage E edit field.')

  if (field === STAGE_E_EDIT_FIELD.PITCH) {
    const value = typeof rawValue === 'string' ? rawValue.trim().toUpperCase() : ''
    if (!/^[A-G]$/.test(value)) throw new TypeError('Pitch step must be A through G.')
    return value
  }

  const numeric = typeof rawValue === 'number'
    ? rawValue
    : Number(typeof rawValue === 'string' ? rawValue.trim() : NaN)
  if (!Number.isFinite(numeric)) throw new TypeError('Stage E numeric edit must be finite.')

  if (field === STAGE_E_EDIT_FIELD.ACCIDENTAL) {
    if (!Number.isInteger(numeric) || numeric < -2 || numeric > 2) {
      throw new TypeError('Accidental must be an integer from -2 through 2.')
    }
  } else if (field === STAGE_E_EDIT_FIELD.OCTAVE) {
    if (!Number.isInteger(numeric) || numeric < 0 || numeric > 9) {
      throw new TypeError('Octave must be an integer from 0 through 9.')
    }
  } else if (field === STAGE_E_EDIT_FIELD.DURATION) {
    if (!Number.isSafeInteger(numeric) || numeric <= 0 || numeric > 1_000_000) {
      throw new TypeError('Duration value must be a bounded positive integer.')
    }
  }
  return Object.is(numeric, -0) ? 0 : numeric
}

export function buildStageEVisualEditModel({ workspace, snapshot } = {}) {
  if (!workspace || !Array.isArray(snapshot?.notes)) return null
  if (!Number.isSafeInteger(snapshot.selectedNoteIndex)) return null

  const revision = getTeacherWorkspaceCurrentRevision(workspace)
  if (!Array.isArray(revision.content)) return null
  // S06 hard gate: a numeric note index alone is never sufficient to open the
  // editor. The selection must be current, exact-ScoreNoteRef capable, bound to
  // this source/revision/content fingerprint, and structurally the same event.
  if (!stageS06SelectionMatchesRevision(snapshot, revision)) return null

  const noteIndex = snapshot.selectedNoteIndex
  const selectionNotes = Array.isArray(snapshot.selectionNotes)
    ? snapshot.selectionNotes
    : snapshot.notes
  if (noteIndex < 0 || noteIndex >= revision.content.length || noteIndex >= selectionNotes.length) return null

  const selectedNote = selectionNotes[noteIndex]
  const currentNote = revision.content[noteIndex]
  if (!selectedNote || !currentNote) return null
  if (selectedNote.measureKey !== snapshot.selectedMeasureKey) return null
  if (currentNote.measureKey !== selectedNote.measureKey) return null

  const isRest = currentNote.isRest === true
  const fields = []
  for (const field of ALLOWED) {
    if (!own(currentNote, field)) continue
    if (isRest && field !== STAGE_E_EDIT_FIELD.DURATION) continue
    const value = currentNote[field]
    try {
      validateStageEEditValue(field, value)
    } catch {
      continue
    }
    fields.push(Object.freeze({
      field,
      fieldKey: `${noteIndex}:${field}`,
      label: LABELS[field],
      value,
    }))
  }

  return Object.freeze({
    noteIndex,
    measureKey: snapshot.selectedMeasureKey,
    sourceNote: snapshot.notes[noteIndex],
    selectedNote,
    currentNote,
    fields: Object.freeze(fields),
  })
}
