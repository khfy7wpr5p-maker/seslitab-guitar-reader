// Package 3D / Stage C / S06-S07 — minimal NoteObject[] handoff for measure/note UI.
//
// `notes` remains the exact source/canonical array most recently projected to
// Rhythmic HTML and therefore remains the array seen by existing quality and
// product consumers. S07 may bind a separate `selectionNotes` projection only
// after corrected MusicXML has passed the existing Stage F verification chain.
// That projection is used only for exact visual-note selection. It never
// replaces source truth or transfers quality evidence to corrected content.
//
// Selection binds the existing ScoreNoteRef plus immutable teacher revision
// identity. No pitch labels, SVG proximity or nearest-note guesses are used;
// stale or mismatched evidence fails closed.

import {
  buildStageS06SelectionIdentity,
  createStageS06RevisionIdentity,
  sameStageS06RevisionIdentity,
} from './src/services/stageS06SelectionIdentity.js'

let currentNotes = null
let currentSelectionNotes = null
let selectedMeasureKey = null
let selectedNoteIndex = null
let revisionIdentity = null
let selectedNoteIdentity = null
const listeners = new Set()

const STABLE_SELECTION_LOCATOR_FIELDS = Object.freeze([
  'measureKey',
  'partId',
  'partIndex',
  'measureIndex',
  'voice',
  'staff',
  'isRest',
  'isGrace',
  'isChordNote',
])

function snapshot() {
  return Object.freeze({
    notes: currentNotes,
    selectionNotes: currentSelectionNotes,
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

function sameStableSelectionLocators(sourceNotes, selectionNotes) {
  if (!Array.isArray(sourceNotes) || !Array.isArray(selectionNotes)) return false
  if (sourceNotes.length !== selectionNotes.length) return false

  for (let index = 0; index < sourceNotes.length; index++) {
    const source = sourceNotes[index]
    const projected = selectionNotes[index]
    if (!source || !projected || typeof source !== 'object' || typeof projected !== 'object') return false
    if (!STABLE_SELECTION_LOCATOR_FIELDS.every((field) => Object.is(source[field], projected[field]))) {
      return false
    }
  }
  return true
}

export function publishPackage3Notes(notes) {
  if (!Array.isArray(notes)) {
    throw new TypeError('Note array is required.')
  }
  currentNotes = notes
  currentSelectionNotes = notes
  selectedMeasureKey = null
  revisionIdentity = null
  clearNoteSelectionState()
  return notify()
}

export function clearPackage3Notes() {
  currentNotes = null
  currentSelectionNotes = null
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
  // A revision transition invalidates any prior corrected selection projection
  // until the new revision has passed Stage F materialization/revalidation.
  currentSelectionNotes = currentNotes
  clearNoteSelectionState()
  notify()
  return true
}

/**
 * Bind a verified corrected/current revision as the visual-selection projection
 * while preserving `notes` as the exact source/quality array.
 *
 * S07 correction scope cannot change part/measure/voice/staff/rest/chord locator
 * identity. A projection that changes those stable locators fails closed.
 * `startBeat` is intentionally not a stable locator here because Stage F
 * duration canonicalization may legitimately shift later onsets; the exact
 * renderer ScoreNoteRef is rebuilt from the verified projected timeline.
 */
export function bindPackage3SelectionProjection({
  notes,
  selectionNotes,
  sourceId,
  sourceRevisionId,
  revisionId,
  contentFingerprint,
} = {}) {
  if (!currentNotes || notes !== currentNotes) return false
  if (!sameStableSelectionLocators(currentNotes, selectionNotes)) return false

  const next = createStageS06RevisionIdentity({
    sourceId,
    sourceRevisionId,
    revisionId,
    contentFingerprint,
  })
  if (!next || !sameStageS06RevisionIdentity(revisionIdentity, next)) return false

  if (currentSelectionNotes === selectionNotes) return true
  currentSelectionNotes = selectionNotes
  clearNoteSelectionState()
  notify()
  return true
}

export function clearPackage3SelectionProjection(notes = currentNotes) {
  if (!currentNotes || notes !== currentNotes) return false
  if (currentSelectionNotes === currentNotes) return true
  currentSelectionNotes = currentNotes
  clearNoteSelectionState()
  notify()
  return true
}

export function clearPackage3RevisionIdentity(notes = currentNotes) {
  if (!currentNotes || notes !== currentNotes) return false
  if (revisionIdentity === null && currentSelectionNotes === currentNotes) return true
  revisionIdentity = null
  currentSelectionNotes = currentNotes
  clearNoteSelectionState()
  notify()
  return true
}

export function selectPackage3MeasureKey(measureKey) {
  const key = typeof measureKey === 'string' ? measureKey.trim() : ''
  if (!key || !currentSelectionNotes) return false
  if (!currentSelectionNotes.some((note) => note?.measureKey === key)) return false
  selectedMeasureKey = key
  clearNoteSelectionState()
  notify()
  return true
}

export function selectPackage3NoteIndex(noteIndex, options = {}) {
  if (!currentSelectionNotes || !selectedMeasureKey) return false
  if (!Number.isSafeInteger(noteIndex) || noteIndex < 0 || noteIndex >= currentSelectionNotes.length) return false

  const note = currentSelectionNotes[noteIndex]
  if (!note || note.measureKey !== selectedMeasureKey) return false

  const identity = buildStageS06SelectionIdentity({
    notes: currentSelectionNotes,
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
