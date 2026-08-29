import { buildMeasureIndex } from './measureIdentity.js'

function visibleMeasureLabel(group) {
  if (group?.displayNumber !== null && group?.displayNumber !== undefined) {
    return String(group.displayNumber)
  }
  if (Number.isInteger(group?.measureIndex)) return String(group.measureIndex + 1)
  return null
}

function cursorTarget(group) {
  const partId = typeof group?.partId === 'string' ? group.partId.trim() : ''
  const measureIndex = group?.measureIndex
  if (!partId || !Number.isSafeInteger(measureIndex) || measureIndex < 0) return null
  return Object.freeze({ partId, measureIndex })
}

export function deriveScoreMeasureSelection(snapshot) {
  const notes = snapshot?.notes
  const selectedMeasureKey = typeof snapshot?.selectedMeasureKey === 'string'
    ? snapshot.selectedMeasureKey.trim()
    : ''

  if (!Array.isArray(notes) || notes.length === 0 || !selectedMeasureKey) {
    return Object.freeze({
      selected: false,
      measureKey: null,
      visibleLabel: null,
      cursorTarget: null,
    })
  }

  let group = null
  try {
    group = buildMeasureIndex(notes).find((candidate) => candidate.measureKey === selectedMeasureKey) ?? null
  } catch {
    group = null
  }

  if (!group) {
    return Object.freeze({
      selected: false,
      measureKey: null,
      visibleLabel: null,
      cursorTarget: null,
    })
  }

  return Object.freeze({
    selected: true,
    measureKey: selectedMeasureKey,
    visibleLabel: visibleMeasureLabel(group),
    cursorTarget: cursorTarget(group),
  })
}
