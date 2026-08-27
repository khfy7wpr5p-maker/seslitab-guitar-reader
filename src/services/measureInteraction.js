// Package 3D — read-only bridge between canonical NoteObject[] and measure UI.
//
// This module keeps the exact NoteObject[] reference supplied by the existing
// frontend projection path. It exposes only canonical measure descriptors to
// UI code. Visible measure numbers are display metadata and are never used as
// identity.

import { buildMeasureIndex, selectCanonicalMeasure } from './measureIdentity.js'

let currentNotes = null
let selectedMeasureKey = null
const listeners = new Set()

function freezeDescriptor(group, selected) {
  return Object.freeze({
    measureKey: group.measureKey,
    displayNumber: group.displayNumber,
    partId: group.partId,
    partIndex: group.partIndex,
    measureIndex: group.measureIndex,
    noteCount: group.notes.length,
    selected,
  })
}

function createSnapshot() {
  if (!currentNotes) {
    return Object.freeze({
      available: false,
      selectedMeasureKey: null,
      measures: Object.freeze([]),
    })
  }

  const measures = buildMeasureIndex(currentNotes)
    .filter((group) => group.selectable)
    .map((group) => freezeDescriptor(
      group,
      group.measureKey === selectedMeasureKey,
    ))

  Object.freeze(measures)
  return Object.freeze({
    available: measures.length > 0,
    selectedMeasureKey,
    measures,
  })
}

function notify() {
  const snapshot = createSnapshot()
  for (const listener of [...listeners]) {
    listener(snapshot)
  }
  return snapshot
}

/**
 * Publish the exact canonical consumer array for measure UI use.
 * Validation happens before state changes so malformed input cannot replace a
 * previously truthful state.
 */
export function publishMeasureInteractionNotes(notes) {
  if (!Array.isArray(notes)) {
    throw new TypeError('Note array is required.')
  }

  // Validate the complete identity set before committing it to UI state.
  buildMeasureIndex(notes)
  currentNotes = notes
  selectedMeasureKey = null
  return notify()
}

export function clearMeasureInteractionNotes() {
  currentNotes = null
  selectedMeasureKey = null
  return notify()
}

export function getMeasureInteractionSnapshot() {
  return createSnapshot()
}

/**
 * Select a canonical measure. The returned group contains the exact original
 * NoteObject references; no musical data is cloned or rewritten.
 */
export function selectMeasureInteractionMeasure(measureKey) {
  if (!currentNotes) return null

  const group = selectCanonicalMeasure(currentNotes, measureKey)
  if (!group) return null

  selectedMeasureKey = group.measureKey
  notify()
  return group
}

export function getSelectedMeasureInteractionMeasure() {
  if (!currentNotes || !selectedMeasureKey) return null
  return selectCanonicalMeasure(currentNotes, selectedMeasureKey)
}

export function subscribeMeasureInteraction(listener) {
  if (typeof listener !== 'function') {
    throw new TypeError('Listener function is required.')
  }

  listeners.add(listener)
  listener(createSnapshot())
  return () => listeners.delete(listener)
}
