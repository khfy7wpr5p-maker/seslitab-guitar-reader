// Package 3D — minimal read-only NoteObject[] handoff for measure UI.
//
// This module deliberately contains no parser, quality, playback or measure
// identity logic. It only retains the exact array reference most recently
// projected to Rhythmic HTML so Package 3 UI can apply the existing canonical
// measureKey policy without reparsing or cloning musical data.

let currentNotes = null
let selectedMeasureKey = null
const listeners = new Set()

function snapshot() {
  return Object.freeze({
    notes: currentNotes,
    selectedMeasureKey,
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
  return notify()
}

export function clearPackage3Notes() {
  currentNotes = null
  selectedMeasureKey = null
  return notify()
}

export function selectPackage3MeasureKey(measureKey) {
  const key = typeof measureKey === 'string' ? measureKey.trim() : ''
  if (!key || !currentNotes) return false
  selectedMeasureKey = key
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
