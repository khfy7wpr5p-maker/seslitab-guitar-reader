// Package 3D / Stage C / S06 — minimal NoteObject[] handoff for measure/note UI.
//
// This module deliberately contains no parser, quality, playback or renderer
// inference logic. It retains the exact array reference most recently projected
// to Rhythmic HTML and bounded selection into that same array. S06 additionally
// binds a selected note to the exact existing ScoreNoteRef plus immutable
// teacher source/revision identity when that authority exists. It never
// manufactures renderer identity from pitch, labels, proximity, or nearest-note
// guesses; stale or mismatched evidence fails closed.

import {
  buildStageS06SelectionIdentity,
  createStageS06RevisionIdentity,
  sameStageS06RevisionIdentity,
} from './src/services/stageS06SelectionIdentity.js'

let currentNotes = null
let selectedMeasureKey = null
let selectedNoteIndex = null
let revisionIdentity = null
let selectedNoteIdentity = null
const listeners = new Set()

function snapshot() {
  return Object.freeze({
    notes: currentNotes,
    selectedMeasureKey,
    selectedNoteIndex,
    revisionIdentity,
    selectedNoteIdentity,
  })
}

function notify() {
  const value = snapshot()
  for (const listener of [...listeners]) listener(value)
  return value
}

function clearNoteSelectionState() {
  selectedNoteIndex = null
  selectedNoteIdentity = null
}

export function publishPackage3Notes(notes) {
  if (!Array.isArray(notes)) {
    throw new TypeError('Note array is required.')
  }
  currentNotes = notes
  selectedMeasureKey = null
  revisionIdentity = null
  clearNoteSelectionState()
  return notify()
}

export function clearPackage3Notes() {
  currentNotes = null
  selectedMeasureKey = null
  revisionIdentity = null
  clearNoteSelectionState()
  return notify()
}

export function bindPackage3RevisionIdentity({
  notes,
  sourceId,
  sourceRevisionId,
  revisionId,
  contentFingerprint,
} = {}) {
  if (!currentNotes || notes !== currentNotes) return false
  const next = createStageS06RevisionIdentity({
    sourceId,
    sourceRevisionId,
    revisionId,
    contentFingerprint,
  })
  if (!next) return false
  if (sameStageS06RevisionIdentity(revisionIdentity, next)) return true

  revisionIdentity = next
  // A selected note belongs to one exact revision identity. Changing from no
  // revision to a real revision, correcting, or undoing always invalidates the
  // old selection rather than silently carrying a numeric index forward.
  clearNoteSelectionState()
  notify()
  return true
}

export function clearPackage3RevisionIdentity(notes = currentNotes) {
  if (!currentNotes || notes !== currentNotes) return false
  if (revisionIdentity === null) return true
  revisionIdentity = null
  clearNoteSelectionState()
  notify()
  return true
}

export function selectPackage3MeasureKey(measureKey) {
  const key = typeof measureKey === 'string' ? measureKey.trim() : ''
  if (!key || !currentNotes) return false
  selectedMeasureKey = key
  clearNoteSelectionState()
  notify()
  return true
}

export function selectPackage3NoteIndex(noteIndex, options = {}) {
  if (!currentNotes || !selectedMeasureKey) return false
  if (!Number.isSafeInteger(noteIndex) || noteIndex < 0 || noteIndex >= currentNotes.length) return false

  const note = currentNotes[noteIndex]
  if (!note || note.measureKey !== selectedMeasureKey) return false

  const identity = buildStageS06SelectionIdentity({
    notes: currentNotes,
    measureKey: selectedMeasureKey,
    noteIndex,
    revisionIdentity,
    rendererTarget: options?.rendererTarget ?? null,
    interaction: options?.interaction ?? 'canonical-control',
  })
  if (!identity) return false

  selectedNoteIndex = noteIndex
  selectedNoteIdentity = identity
  notify()
  return true
}

export function clearPackage3NoteSelection() {
  if (selectedNoteIndex === null && selectedNoteIdentity === null) return false
  clearNoteSelectionState()
  notify()
  return true
}

export function getPackage3MeasureSnapshot() {
  return snapshot()
}

export function subscribePackage3Measures(listener) {
  if (typeof listener !== 'function') {
    throw new TypeError('Listener function is required.')
  }
  listeners.add(listener)
  listener(snapshot())
  return () => listeners.delete(listener)
}
