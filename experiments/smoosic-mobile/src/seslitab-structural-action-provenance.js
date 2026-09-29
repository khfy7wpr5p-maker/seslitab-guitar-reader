const FNV_1A_64_OFFSET = 0xcbf29ce484222325n
const FNV_1A_64_PRIME = 0x100000001b3n
const UINT64_MASK = 0xffffffffffffffffn

function requiredString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim()
}

function positiveDuration(value, label) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} must be a positive duration`)
  return number
}

function noteIdentity(note) {
  return requiredString(note?.attrs?.id, 'note identity')
}

function orderedNotes(score) {
  if (!Array.isArray(score?.staves)) throw new Error('Invalid imported score')
  const result = []
  for (let staffIndex = 0; staffIndex < score.staves.length; staffIndex += 1) {
    const staff = score.staves[staffIndex]
    if (staff.partInfo?.stavesBefore > 0) continue
    const partStaffIndexes = [staffIndex]
    if (staff.partInfo?.stavesAfter > 0) {
      if (!score.staves[staffIndex + 1]) throw new Error('Missing part staff')
      partStaffIndexes.push(staffIndex + 1)
    }
    if (!Array.isArray(staff.measures)) throw new Error('Missing score measures')
    for (let measureIndex = 0; measureIndex < staff.measures.length; measureIndex += 1) {
      for (const partStaffIndex of partStaffIndexes) {
        const voices = score.staves[partStaffIndex].measures?.[measureIndex]?.voices
        if (!Array.isArray(voices)) throw new Error('Missing score voices')
        voices.forEach((voice, voiceIndex) => {
          if (!Array.isArray(voice?.notes)) throw new Error('Missing score notes')
          voice.notes.forEach((note, noteIndex) => {
            const isRest = note?.noteType === 'r'
            const rawSpan = isRest ? 1 : Math.max(1, Array.isArray(note?.pitches) ? note.pitches.length : 0)
            result.push({
              note,
              staffIndex: partStaffIndex,
              measureIndex,
              voiceIndex,
              noteIndex,
              rawSpan,
              isRest,
            })
          })
        })
      }
    }
  }
  return result
}

function fingerprint(value) {
  const text = JSON.stringify(value)
  let hash = FNV_1A_64_OFFSET
  for (const char of text) {
    hash ^= BigInt(char.codePointAt(0))
    hash = (hash * FNV_1A_64_PRIME) & UINT64_MASK
  }
  return hash.toString(16).padStart(16, '0')
}

function freezeOperation(value) {
  return Object.freeze({ ...value })
}

function createSmoosicStructuralActionTracker({ isPaddingRest = () => false } = {}) {
  if (typeof isPaddingRest !== 'function') throw new TypeError('isPaddingRest must be a function')

  let baseScore = null
  let editorSessionId = null
  let baseMappingFingerprint = null
  let baseRecords = []
  let recordByNote = new Map()
  let active = new Map()
  let sequence = 0

  function clear() {
    baseScore = null
    editorSessionId = null
    baseMappingFingerprint = null
    baseRecords = []
    recordByNote = new Map()
    active = new Map()
    sequence = 0
  }

  function beginImport({ score, editorSessionId: sessionId, sourceDurationByRawOrdinal = null } = {}) {
    clear()
    const ordered = orderedNotes(score)
    if (!ordered.length) throw new Error('Imported score contains no notes')
    editorSessionId = requiredString(sessionId, 'editorSessionId')
    let rawNoteOrdinal = 0
    baseRecords = ordered.map((entry) => {
      const baseDuration = positiveDuration(entry.note?.tickCount, 'import duration')
      const sourceDurationValue = Array.isArray(sourceDurationByRawOrdinal)
        ? Number(sourceDurationByRawOrdinal[rawNoteOrdinal])
        : NaN
      const record = {
        ...entry,
        rawNoteOrdinal,
        baseDuration,
        currentDuration: baseDuration,
        sourceDuration: Number.isFinite(sourceDurationValue) && sourceDurationValue > 0
          ? sourceDurationValue
          : null,
      }
      rawNoteOrdinal += entry.rawSpan
      return record
    })
    recordByNote = new Map(baseRecords.map((record) => [record.note, record]))
    baseMappingFingerprint = fingerprint(baseRecords.map((record) => ({
      rawNoteOrdinal: record.rawNoteOrdinal,
      staffIndex: record.staffIndex,
      measureIndex: record.measureIndex,
      voiceIndex: record.voiceIndex,
      noteIndex: record.noteIndex,
      rawSpan: record.rawSpan,
      isRest: record.isRest,
    })))
    baseScore = score
    return score
  }

  function reconcileRenderedScore(renderedScore) {
    if (!baseScore || !baseRecords.length) throw new Error('Structural action import registry is unavailable')
    const rendered = orderedNotes(renderedScore)
    if (rendered.length !== baseRecords.length) throw new Error('Rendered score structural shape changed without explicit action')

    const nextMap = new Map()
    rendered.forEach((entry, index) => {
      const base = baseRecords[index]
      if (
        entry.staffIndex !== base.staffIndex
        || entry.measureIndex !== base.measureIndex
        || entry.voiceIndex !== base.voiceIndex
        || entry.noteIndex !== base.noteIndex
        || entry.rawSpan !== base.rawSpan
        || entry.isRest !== base.isRest
      ) {
        throw new Error('Rendered score locator changed without explicit action')
      }

      const duration = positiveDuration(entry.note?.tickCount, 'rendered duration')
      const action = active.get(base.rawNoteOrdinal)
      if (duration !== base.baseDuration) {
        if (!action || duration !== action.afterTicks) {
          throw new Error('Unrecorded duration mutation requires explicit teacher action')
        }
      } else if (action) {
        active.delete(base.rawNoteOrdinal)
      }

      base.note = entry.note
      base.currentDuration = duration
      nextMap.set(entry.note, base)
    })

    recordByNote = nextMap
    baseScore = renderedScore
    return renderedScore
  }

  function recordDurationAction({ note, beforeDuration, afterDuration } = {}) {
    const record = recordByNote.get(note)
    if (!record) throw new Error('Duration target is not part of the explicit imported mapping')
    if (isPaddingRest(note)) throw new Error('Certified padding rest cannot be a structural duration target')

    const before = positiveDuration(beforeDuration, 'beforeDuration')
    const after = positiveDuration(afterDuration, 'afterDuration')
    if (before !== record.currentDuration) throw new Error('Duration before state is stale')
    if (Number(note?.tickCount) !== after) throw new Error('Duration after state does not match rendered note')

    const existing = active.get(record.rawNoteOrdinal)
    const originalBeforeTicks = existing?.beforeTicks ?? before
    const toSourceDuration = (ticks) => record.sourceDuration == null
      ? ticks
      : record.sourceDuration * (ticks / record.baseDuration)
    const originalBefore = existing?.before ?? toSourceDuration(originalBeforeTicks)
    const normalizedAfter = toSourceDuration(after)
    record.currentDuration = after

    if (after === record.baseDuration) {
      active.delete(record.rawNoteOrdinal)
      return null
    }

    const value = {
      sequence: existing?.sequence ?? sequence++,
      rawNoteOrdinal: record.rawNoteOrdinal,
      staffIndex: record.staffIndex,
      measureIndex: record.measureIndex,
      voiceIndex: record.voiceIndex,
      noteIndex: record.noteIndex,
      noteIdentity: noteIdentity(note),
      beforeTicks: originalBeforeTicks,
      afterTicks: after,
      before: originalBefore,
      after: normalizedAfter,
    }
    active.set(record.rawNoteOrdinal, value)
    return freezeOperation(value)
  }

  function authorizedDurationIdentitySet() {
    return new Set(
      [...active.values()]
        .sort((left, right) => left.sequence - right.sequence)
        .map((entry) => entry.noteIdentity),
    )
  }

  function createApplyManifest({ sourceRevision, actionId } = {}) {
    if (!Number.isSafeInteger(sourceRevision) || sourceRevision < 0) {
      throw new Error('sourceRevision must be a non-negative safe integer')
    }
    const normalizedActionId = requiredString(actionId, 'actionId')
    const ordered = [...active.values()].sort((left, right) => left.sequence - right.sequence)
    if (!ordered.length) return null
    if (ordered.length > 128) throw new Error('Structural action manifest operation limit exceeded')

    const operations = Object.freeze(ordered.map((entry, order) => freezeOperation({
      order,
      operation: 'CHANGE_EVENT_DURATION',
      rawNoteOrdinal: entry.rawNoteOrdinal,
      staffIndex: entry.staffIndex,
      measureIndex: entry.measureIndex,
      voiceIndex: entry.voiceIndex,
      noteIndex: entry.noteIndex,
      noteIdentity: entry.noteIdentity,
      before: entry.before,
      after: entry.after,
    })))

    const manifest = Object.freeze({
      version: 1,
      sourceRevision,
      editorSessionId,
      actionId: normalizedActionId,
      operations,
      baseMappingFingerprint,
      createdFromExplicitTeacherApply: true,
    })
    if (JSON.stringify(manifest).length > 64 * 1024) {
      throw new Error('Structural action manifest byte limit exceeded')
    }
    return manifest
  }

  return {
    beginImport,
    recordDurationAction,
    reconcileRenderedScore,
    createApplyManifest,
    clear,
    authorizedDurationIdentitySet,
  }
}

exports.createSmoosicStructuralActionTracker = createSmoosicStructuralActionTracker
