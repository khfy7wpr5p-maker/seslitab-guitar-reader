import { selectCanonicalMeasure } from './measureIdentity.js'

function emptySelection() {
  return Object.freeze({
    selected: false,
    measureKey: null,
    noteIndex: null,
    measureNoteOrdinal: null,
    note: null,
    rendererTarget: null,
  })
}

export function deriveCanonicalNoteSelection(notes, measureKey, noteIndex) {
  if (!Array.isArray(notes) || !Number.isSafeInteger(noteIndex) || noteIndex < 0 || noteIndex >= notes.length) {
    return emptySelection()
  }

  const key = typeof measureKey === 'string' ? measureKey.trim() : ''
  if (!key) return emptySelection()

  let measure
  try {
    measure = selectCanonicalMeasure(notes, key)
  } catch {
    return emptySelection()
  }
  if (!measure) return emptySelection()

  const note = notes[noteIndex]
  if (!note || note.measureKey !== key) return emptySelection()

  const exactMatches = measure.notes.filter((candidate) => candidate === note)
  if (exactMatches.length !== 1) return emptySelection()

  const ordinal = measure.notes.findIndex((candidate) => candidate === note)
  if (ordinal < 0) return emptySelection()

  return Object.freeze({
    selected: true,
    measureKey: key,
    noteIndex,
    measureNoteOrdinal: ordinal,
    note,
    // The pinned renderer contract defines a different traversal-based ScoreNoteRef.
    // SesliTab must not guess that its canonical array index is the same locator.
    rendererTarget: null,
  })
}

export function buildCanonicalNoteControlModels(notes, measureKey, selectedNoteIndex = null) {
  if (!Array.isArray(notes)) return Object.freeze([])
  const key = typeof measureKey === 'string' ? measureKey.trim() : ''
  if (!key) return Object.freeze([])

  let measure
  try {
    measure = selectCanonicalMeasure(notes, key)
  } catch {
    return Object.freeze([])
  }
  if (!measure) return Object.freeze([])

  const models = []
  for (let globalIndex = 0; globalIndex < notes.length; globalIndex++) {
    const note = notes[globalIndex]
    if (note?.measureKey !== key) continue
    const exactMatches = measure.notes.filter((candidate) => candidate === note)
    if (exactMatches.length !== 1) return Object.freeze([])
    const ordinal = measure.notes.findIndex((candidate) => candidate === note)
    if (ordinal < 0) return Object.freeze([])
    models.push(Object.freeze({
      noteIndex: globalIndex,
      measureNoteOrdinal: ordinal,
      visibleLabel: `Nota ${ordinal + 1}`,
      ariaLabel: `Seçili ölçüde nota ${ordinal + 1} seç`,
      selected: globalIndex === selectedNoteIndex,
      note,
    }))
  }

  Object.freeze(models)
  return models
}
