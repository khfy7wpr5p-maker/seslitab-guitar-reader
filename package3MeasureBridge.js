// Package 3D / Stage C — minimal read-only NoteObject[] handoff for measure/note UI.
//
// This module deliberately contains no parser, quality, playback or renderer
// identity logic. It retains the exact array reference most recently projected
// to Rhythmic HTML and bounded selection indexes into that same array. It never
// manufactures renderer note identity from canonical array order.

let currentNotes = null
let selectedMeasureKey = null
let selectedNoteIndex = null
const listeners = new Set()

function snapshot() {
  return Object.freeze({
    notes: currentNotes,
    selectedMeasureKey,
    selectedNoteIndex,
  })
}

function notify() {
  const value = snapshot()
  for (const listener of [...listeners]) listener(value)
  return value
}

export function publishPackage3Notes(notes) {
  if (!Array.isArray(notes)) {
    throw new TypeError('Note array is required.')
  }
  currentNotes = notes
  selectedMeasureKey = null
  selectedNoteIndex = null
  return notify()
}

export function clearPackage3Notes() {
  currentNotes = null
  selectedMeasureKey = null
  selectedNoteIndex = null
  return notify()
}

export function selectPackage3MeasureKey(measureKey) {
  const key = typeof measureKey === 'string' ? measureKey.trim() : ''
  if (!key || !currentNotes) return false
  selectedMeasureKey = key
  selectedNoteIndex = null
  notify()
  return true
}

export function selectPackage3NoteIndex(noteIndex) {
  if (!currentNotes || !selectedMeasureKey) return false
  if (!Number.isSafeInteger(noteIndex) || noteIndex < 0 || noteIndex >= currentNotes.length) return false

  const note = currentNotes[noteIndex]
  if (!note || note.measureKey !== selectedMeasureKey) return false

  selectedNoteIndex = noteIndex
  notify()
  return true
}

export function clearPackage3NoteSelection() {
  if (selectedNoteIndex === null) return false
  selectedNoteIndex = null
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
