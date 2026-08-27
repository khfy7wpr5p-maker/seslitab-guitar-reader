// Package 3C — unique measure identity and selection.
//
// Canonical MusicXML notes already carry measureKey from the parser. This
// service consumes that identity; it never manufactures canonical truth from
// the visible measure number. Legacy/TAB notes without measureKey remain
// display-only and are therefore not selectable by canonical measure actions.

export const MEASURE_IDENTITY_STATES = Object.freeze({
  CANONICAL: 'canonical',
  UNAVAILABLE: 'unavailable',
})

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function normalizeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : null
}

function normalizeVisibleMeasure(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  return null
}

function canonicalIdentityOf(note) {
  const measureKey = typeof note.measureKey === 'string' ? note.measureKey.trim() : ''
  if (!measureKey) return null

  return {
    measureKey,
    partId: typeof note.partId === 'string' && note.partId.trim() ? note.partId.trim() : null,
    partIndex: normalizeInteger(note.partIndex),
    measureIndex: normalizeInteger(note.measureIndex),
    displayNumber: normalizeVisibleMeasure(note.measureNumber ?? note.measure),
  }
}

function identitySignature(identity) {
  return JSON.stringify([
    identity.partId,
    identity.partIndex,
    identity.measureIndex,
    identity.displayNumber,
  ])
}

function freezeGroup(group) {
  Object.freeze(group.notes)
  return Object.freeze(group)
}

/**
 * Build deterministic measure groups while preserving exact note references.
 *
 * Canonical notes are grouped by their parser-supplied measureKey. Notes
 * without that key are kept in contiguous display-only runs. Display-only runs
 * deliberately expose measureKey=null/selectable=false.
 */
export function buildMeasureIndex(notes) {
  if (!Array.isArray(notes)) {
    throw new TypeError('Note array is required.')
  }

  const canonicalGroups = new Map()
  const canonicalSignatures = new Map()
  const ordered = []
  let activeLegacyGroup = null

  for (let noteIndex = 0; noteIndex < notes.length; noteIndex++) {
    const note = notes[noteIndex]
    if (!isPlainObject(note)) {
      throw new TypeError(`Invalid note at index ${noteIndex}.`)
    }

    const canonical = canonicalIdentityOf(note)
    if (canonical) {
      activeLegacyGroup = null
      const signature = identitySignature(canonical)
      const knownSignature = canonicalSignatures.get(canonical.measureKey)
      if (knownSignature && knownSignature !== signature) {
        throw new Error(`Conflicting canonical measure identity: ${canonical.measureKey}`)
      }

      let group = canonicalGroups.get(canonical.measureKey)
      if (!group) {
        group = {
          identityState: MEASURE_IDENTITY_STATES.CANONICAL,
          selectable: true,
          measureKey: canonical.measureKey,
          partId: canonical.partId,
          partIndex: canonical.partIndex,
          measureIndex: canonical.measureIndex,
          displayNumber: canonical.displayNumber,
          firstNoteIndex: noteIndex,
          notes: [],
        }
        canonicalGroups.set(canonical.measureKey, group)
        canonicalSignatures.set(canonical.measureKey, signature)
        ordered.push(group)
      }
      group.notes.push(note)
      continue
    }

    const displayNumber = normalizeVisibleMeasure(note.measureNumber ?? note.measure)
    const sameLegacyRun = activeLegacyGroup && activeLegacyGroup.displayNumber === displayNumber

    if (!sameLegacyRun) {
      activeLegacyGroup = {
        identityState: MEASURE_IDENTITY_STATES.UNAVAILABLE,
        selectable: false,
        measureKey: null,
        partId: null,
        partIndex: null,
        measureIndex: null,
        displayNumber,
        firstNoteIndex: noteIndex,
        notes: [],
      }
      ordered.push(activeLegacyGroup)
    }
    activeLegacyGroup.notes.push(note)
  }

  const frozenGroups = ordered.map(freezeGroup)
  Object.freeze(frozenGroups)
  return frozenGroups
}

export function selectCanonicalMeasure(notes, measureKey) {
  const key = typeof measureKey === 'string' ? measureKey.trim() : ''
  if (!key) return null

  const match = buildMeasureIndex(notes).find(
    (group) => group.selectable && group.measureKey === key,
  )
  return match ?? null
}
