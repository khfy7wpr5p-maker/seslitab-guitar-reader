export const GUITAR_TAB_TARGET_SELECTION_STATE = Object.freeze({
  RESOLVED: 'resolved',
  PART_REQUIRED: 'part-required',
  STAFF_REQUIRED: 'staff-required',
  VOICE_REQUIRED: 'voice-required',
  INVALID: 'invalid',
  EMPTY: 'empty',
})

function normalizePartId(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed && trimmed === value ? trimmed : null
}

function normalizeNonNegativeInteger(value) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return Number.isSafeInteger(number) && number >= 0 ? number : null
}

function normalizePositiveInteger(value) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return Number.isSafeInteger(number) && number >= 1 ? number : null
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function freezeResult({
  state,
  targetSelection = null,
  partCandidates = [],
  staffCandidates = [],
  voiceCandidates = [],
}) {
  return Object.freeze({
    state,
    targetSelection: targetSelection ? Object.freeze({ ...targetSelection }) : null,
    partCandidates: Object.freeze([...partCandidates]),
    staffCandidates: Object.freeze([...staffCandidates]),
    voiceCandidates: Object.freeze([...voiceCandidates]),
  })
}

function invalidResult(candidates = {}) {
  return freezeResult({
    state: GUITAR_TAB_TARGET_SELECTION_STATE.INVALID,
    ...candidates,
  })
}

function normalizeInventory(inventory) {
  if (!inventory || typeof inventory !== 'object' || !Array.isArray(inventory.parts)) return null

  const seenParts = new Set()
  const parts = []

  for (const part of inventory.parts) {
    if (!part || typeof part !== 'object' || !Array.isArray(part.staves)) return null

    const partId = normalizePartId(part.partId)
    const partIndex = normalizeNonNegativeInteger(part.partIndex)
    if (!partId || partIndex === null) return null

    const partKey = `${partId}\u0000${partIndex}`
    if (seenParts.has(partKey)) return null
    seenParts.add(partKey)

    const seenStaves = new Set()
    const staves = []
    for (const staffRecord of part.staves) {
      if (!staffRecord || typeof staffRecord !== 'object' || !Array.isArray(staffRecord.voices)) return null
      const staff = normalizePositiveInteger(staffRecord.staff)
      if (staff === null || seenStaves.has(staff)) return null
      seenStaves.add(staff)

      const seenVoices = new Set()
      const voices = []
      for (const voiceRecord of staffRecord.voices) {
        if (!voiceRecord || typeof voiceRecord !== 'object') return null
        const voice = normalizeNonNegativeInteger(voiceRecord.voice)
        const pitchedEventCount = normalizePositiveInteger(voiceRecord.pitchedEventCount)
        if (voice === null || pitchedEventCount === null || seenVoices.has(voice)) return null
        seenVoices.add(voice)
        voices.push(Object.freeze({ voice, pitchedEventCount }))
      }

      if (voices.length > 0) {
        staves.push(Object.freeze({ staff, voices: Object.freeze(voices) }))
      }
    }

    if (staves.length > 0) {
      parts.push(Object.freeze({
        partId,
        partIndex,
        name: typeof part.name === 'string' ? part.name : '',
        staves: Object.freeze(staves),
      }))
    }
  }

  return Object.freeze(parts)
}

function normalizePartialSelection(partialSelection) {
  if (partialSelection === undefined) return Object.freeze({})
  if (!partialSelection || typeof partialSelection !== 'object' || Array.isArray(partialSelection)) return null

  const normalized = {}
  const hasPartId = hasOwn(partialSelection, 'partId')
  const hasPartIndex = hasOwn(partialSelection, 'partIndex')
  if (hasPartId !== hasPartIndex) return null

  if (hasPartId) {
    const partId = normalizePartId(partialSelection.partId)
    const partIndex = normalizeNonNegativeInteger(partialSelection.partIndex)
    if (!partId || partIndex === null) return null
    normalized.partId = partId
    normalized.partIndex = partIndex
  }

  if (hasOwn(partialSelection, 'staff')) {
    const staff = normalizePositiveInteger(partialSelection.staff)
    if (staff === null) return null
    normalized.staff = staff
  }

  if (hasOwn(partialSelection, 'voice')) {
    const voice = normalizeNonNegativeInteger(partialSelection.voice)
    if (voice === null) return null
    normalized.voice = voice
  }

  return Object.freeze(normalized)
}

export function resolveGuitarTabTargetSelection(inventory, partialSelection = {}) {
  const partCandidates = normalizeInventory(inventory)
  const selection = normalizePartialSelection(partialSelection)

  if (!partCandidates || !selection) return invalidResult()
  if (partCandidates.length === 0) {
    return freezeResult({ state: GUITAR_TAB_TARGET_SELECTION_STATE.EMPTY })
  }

  let part
  const hasExplicitPart = hasOwn(selection, 'partId')
  if (hasExplicitPart) {
    part = partCandidates.find((candidate) =>
      candidate.partId === selection.partId && candidate.partIndex === selection.partIndex)
    if (!part) return invalidResult({ partCandidates })
  } else if (partCandidates.length === 1) {
    part = partCandidates[0]
  } else {
    if (hasOwn(selection, 'staff') || hasOwn(selection, 'voice')) {
      return invalidResult({ partCandidates })
    }
    return freezeResult({
      state: GUITAR_TAB_TARGET_SELECTION_STATE.PART_REQUIRED,
      partCandidates,
    })
  }

  const staffCandidates = part.staves
  let staffRecord
  if (hasOwn(selection, 'staff')) {
    staffRecord = staffCandidates.find((candidate) => candidate.staff === selection.staff)
    if (!staffRecord) return invalidResult({ partCandidates, staffCandidates })
  } else if (staffCandidates.length === 1) {
    staffRecord = staffCandidates[0]
  } else {
    if (hasOwn(selection, 'voice')) {
      return invalidResult({ partCandidates, staffCandidates })
    }
    return freezeResult({
      state: GUITAR_TAB_TARGET_SELECTION_STATE.STAFF_REQUIRED,
      partCandidates,
      staffCandidates,
    })
  }

  const voiceCandidates = staffRecord.voices
  let voiceRecord
  if (hasOwn(selection, 'voice')) {
    voiceRecord = voiceCandidates.find((candidate) => candidate.voice === selection.voice)
    if (!voiceRecord) return invalidResult({ partCandidates, staffCandidates, voiceCandidates })
  } else if (voiceCandidates.length === 1) {
    voiceRecord = voiceCandidates[0]
  } else {
    return freezeResult({
      state: GUITAR_TAB_TARGET_SELECTION_STATE.VOICE_REQUIRED,
      partCandidates,
      staffCandidates,
      voiceCandidates,
    })
  }

  return freezeResult({
    state: GUITAR_TAB_TARGET_SELECTION_STATE.RESOLVED,
    targetSelection: {
      partId: part.partId,
      partIndex: part.partIndex,
      staff: staffRecord.staff,
      voice: voiceRecord.voice,
    },
    partCandidates,
    staffCandidates,
    voiceCandidates,
  })
}

function normalizeExactTargetSelection(targetSelection) {
  if (!targetSelection || typeof targetSelection !== 'object' || Array.isArray(targetSelection)) return null
  if (
    !hasOwn(targetSelection, 'partId') ||
    !hasOwn(targetSelection, 'partIndex') ||
    !hasOwn(targetSelection, 'staff') ||
    !hasOwn(targetSelection, 'voice')
  ) return null

  const partId = normalizePartId(targetSelection.partId)
  const partIndex = normalizeNonNegativeInteger(targetSelection.partIndex)
  const staff = normalizePositiveInteger(targetSelection.staff)
  const voice = normalizeNonNegativeInteger(targetSelection.voice)
  if (!partId || partIndex === null || staff === null || voice === null) return null

  return Object.freeze({ partId, partIndex, staff, voice })
}

export function selectCanonicalNotesForGuitarTabTarget(notes, targetSelection) {
  if (!Array.isArray(notes)) {
    throw new Error('guitar-tab-target-selection-invalid-notes')
  }

  const target = normalizeExactTargetSelection(targetSelection)
  if (!target) {
    throw new Error('guitar-tab-target-selection-invalid')
  }

  const selected = notes.filter((note) =>
    note &&
    typeof note === 'object' &&
    note.isRest !== true &&
    normalizePartId(note.partId) === target.partId &&
    normalizeNonNegativeInteger(note.partIndex) === target.partIndex &&
    normalizePositiveInteger(note.staff) === target.staff &&
    normalizeNonNegativeInteger(note.voice) === target.voice)

  if (selected.length === 0) {
    throw new Error('guitar-tab-target-selection-empty')
  }

  return Object.freeze(selected)
}
