// Smoosic 1.0.44 emits parts, measures, staves within a part, voices, then notes.
// The factory is injected so this module can exercise that boundary without a browser.
const importMarker = Symbol('seslitab.importPaddingRest')

function identity(note) {
  const id = note?.attrs?.id
  if (typeof id !== 'string' || !id.length) throw new Error('Padding rest is missing its note identity')
  return id
}

function pitchSignature(note) {
  const pitches = Array.isArray(note?.pitches) ? note.pitches : []
  return JSON.stringify(pitches.map((pitch) => ({
    letter: String(pitch?.letter || ''),
    octave: Number(pitch?.octave || 0),
    accidental: String(pitch?.accidental || ''),
    cents: Number(pitch?.cents || 0),
  })))
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
          if (!Array.isArray(voice.notes)) throw new Error('Missing score notes')
          voice.notes.forEach((note, noteIndex) => {
            result.push({ note, staffIndex: partStaffIndex, measureIndex, voiceIndex, noteIndex })
          })
        })
      }
    }
  }
  return result
}

function rawNotesFrom(xml) {
  if (typeof xml !== 'string' || !xml.length || typeof DOMParser !== 'function') {
    throw new Error('Invalid raw MusicXML')
  }
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (!document?.querySelector('score-partwise') || document.querySelector('parsererror')) {
    throw new Error('Invalid raw MusicXML')
  }
  return [...document.querySelectorAll('note')]
}

function createSmoosicPaddingRestTracker(SmoMeasure) {
  if (typeof SmoMeasure?.createRestNoteWithDuration !== 'function') {
    throw new Error('Smoosic rest factory is unavailable')
  }
  const restFactory = SmoMeasure.createRestNoteWithDuration
  let score = null
  let captured = new Map()
  let retired = new Set()
  let inImport = false
  const token = {}

  function clear() {
    for (const note of captured.keys()) {
      if (note[importMarker] === token) delete note[importMarker]
    }
    captured = new Map()
    retired = new Set()
    score = null
  }

  function voiceNotesFor(currentScore, locator) {
    const notes = currentScore?.staves?.[locator.staffIndex]
      ?.measures?.[locator.measureIndex]
      ?.voices?.[locator.voiceIndex]
      ?.notes
    if (!Array.isArray(notes)) throw new Error('Missing padding rest voice notes')
    return notes
  }

  function contextOf(note) {
    if (!note) return null
    return {
      noteType: String(note.noteType || ''),
      durationTicks: Number(note.tickCount),
      pitchSignature: pitchSignature(note),
    }
  }

  function matchesContext(note, expected, expectedDuration = expected?.durationTicks) {
    if (!expected) return note == null
    if (!note) return false
    return String(note.noteType || '') === expected.noteType
      && Number(note.tickCount) === Number(expectedDuration)
      && pitchSignature(note) === expected.pitchSignature
  }

  function refreshRecordContext(record, currentScore) {
    const notes = voiceNotesFor(currentScore, record.locator)
    record.previousContext = contextOf(notes[record.locator.noteIndex - 1])
    record.nextContext = contextOf(notes[record.locator.noteIndex + 1])
  }

  function restoreExactUndoPadding(record, notes, authorized) {
    const previous = notes[record.locator.noteIndex - 1] ?? null
    const shiftedNext = notes[record.locator.noteIndex] ?? null
    const previousIdentity = previous ? identity(previous) : ''
    const exactUndoGap = previous
      && authorized.has(previousIdentity)
      && matchesContext(previous, record.previousContext)
      && matchesContext(shiftedNext, record.nextContext)

    if (!exactUndoGap) return null

    const restored = restFactory.call(SmoMeasure, record.durationTicks)
    if (!restored || typeof restored !== 'object'
      || restored.noteType !== 'r'
      || Number(restored.tickCount) !== Number(record.durationTicks)) {
      throw new Error('Smoosic padding rest factory could not restore exact undo padding')
    }
    const restoredIdentity = identity(restored)
    if ([...captured.values()].some((value) => value.noteIdentity === restoredIdentity)) {
      throw new Error('Duplicate padding rest identity')
    }
    Object.defineProperty(restored, importMarker, { value: token, configurable: true })
    notes.splice(record.locator.noteIndex, 0, restored)
    record.note = restored
    record.noteIdentity = restoredIdentity
    captured.set(restored, record)
    retired.delete(record)
    refreshRecordContext(record, currentScore)
    return restored
  }

  function reconcileSameScore(currentScore, authorizedDurationIdentities) {
    const located = orderedNotes(currentScore)
    const entryByNote = new Map(located.map((entry) => [entry.note, entry]))
    const authorized = authorizedDurationIdentities instanceof Set
      ? authorizedDurationIdentities
      : new Set()

    for (const [note, record] of [...captured.entries()]) {
      const entry = entryByNote.get(note)
      if (entry) {
        if (record.noteIdentity !== identity(note)
          || record.durationTicks !== note.tickCount
          || Object.keys(record.locator).some((key) => record.locator[key] !== entry[key])) {
          throw new Error('Imported padding rest identity or locator changed')
        }
        continue
      }

      const notes = voiceNotesFor(currentScore, record.locator)
      const previous = notes[record.locator.noteIndex - 1] ?? null
      const shiftedNext = notes[record.locator.noteIndex] ?? null
      const previousIdentity = previous ? identity(previous) : ''
      const consumedExactly = previous
        && authorized.has(previousIdentity)
        && record.previousContext
        && matchesContext(
          previous,
          record.previousContext,
          Number(record.previousContext.durationTicks) + Number(record.durationTicks),
        )
        && matchesContext(shiftedNext, record.nextContext)

      if (note[importMarker] === token) delete note[importMarker]
      captured.delete(note)

      if (restoreExactUndoPadding(record, notes, authorized)) continue

      if (!consumedExactly) {
        throw new Error('Certified padding rest disappeared without exact authorized duration consumption')
      }

      record.note = null
      retired.add(record)
    }

    for (const record of [...retired]) {
      const notes = voiceNotesFor(currentScore, record.locator)
      const candidate = notes[record.locator.noteIndex] ?? null
      const previous = notes[record.locator.noteIndex - 1] ?? null
      const next = notes[record.locator.noteIndex + 1] ?? null
      if (!candidate || candidate.noteType !== 'r') {
        restoreExactUndoPadding(record, notes, authorized)
        continue
      }
      if (Number(candidate.tickCount) !== Number(record.durationTicks)) continue
      if (!matchesContext(previous, record.previousContext)) continue
      if (!matchesContext(next, record.nextContext)) continue
      // Exact base-duration + exact rest/neighbor topology is the undo proof.
      // The structural action set may still contain the previous note until
      // its reconciler runs immediately after padding provenance restoration.
      const restoredIdentity = identity(candidate)
      if ([...captured.values()].some((value) => value.noteIdentity === restoredIdentity)) {
        throw new Error('Duplicate padding rest identity')
      }
      Object.defineProperty(candidate, importMarker, { value: token, configurable: true })
      record.note = candidate
      record.noteIdentity = restoredIdentity
      captured.set(candidate, record)
      retired.delete(record)
      refreshRecordContext(record, currentScore)
    }

    return currentScore
  }

  function runDuringImport(convertFn) {
    if (inImport) throw new Error('Nested MusicXML import is unsupported')
    clear()
    const original = SmoMeasure.createRestNoteWithDuration
    const created = new Map()
    SmoMeasure.createRestNoteWithDuration = function (...args) {
      const note = original.apply(this, args)
      if (!note || typeof note !== 'object' || created.has(note)) {
        throw new Error('Duplicate or invalid padding rest object')
      }
      const noteIdentity = identity(note)
      Object.defineProperty(note, importMarker, { value: token, configurable: true })
      created.set(note, { note, noteIdentity, durationTicks: note.tickCount })
      return note
    }
    inImport = true
    try {
      const importedScore = convertFn()
      if (importedScore?.then) throw new Error('MusicXML import must be synchronous')
      const located = orderedNotes(importedScore)
      for (const entry of located) {
        const record = created.get(entry.note)
        if (!record) continue
        if (record.locator) throw new Error('Duplicate padding rest locator')
        record.locator = {
          staffIndex: entry.staffIndex, measureIndex: entry.measureIndex,
          voiceIndex: entry.voiceIndex, noteIndex: entry.noteIndex,
        }
      }
      for (const record of created.values()) {
        if (!record.locator) throw new Error('Missing padding rest locator')
        refreshRecordContext(record, importedScore)
      }
      captured = created
      score = importedScore
      return importedScore
    } catch (error) {
      for (const note of created.keys()) {
        if (note[importMarker] === token) delete note[importMarker]
      }
      clear()
      throw error
    } finally {
      inImport = false
      SmoMeasure.createRestNoteWithDuration = original
    }
  }

  function adoptRenderedScore(renderedScore, { allowPitchChanges = false, authorizedDurationIdentities = null } = {}) {
    if (!score) throw new Error('Imported score registry is unavailable or stale')
    if (renderedScore === score) {
      return reconcileSameScore(renderedScore, authorizedDurationIdentities)
    }
    if (retired.size) throw new Error('Retired padding rest provenance cannot cross a score clone')

    const importedNotes = orderedNotes(score)
    const renderedNotes = orderedNotes(renderedScore)
    if (renderedNotes.length !== importedNotes.length) {
      throw new Error('Rendered score clone note count changed')
    }

    const adopted = new Map()
    const renderedIds = new Set()
    importedNotes.forEach((importedEntry, ordinal) => {
      const renderedEntry = renderedNotes[ordinal]
      const importedId = identity(importedEntry.note)
      const renderedId = identity(renderedEntry.note)
      if (renderedIds.has(renderedId)) {
        throw new Error(`Rendered score clone semantics changed: duplicate identity at ordinal ${ordinal}`)
      }
      if (importedEntry.note.noteType !== renderedEntry.note.noteType) {
        throw new Error(`Rendered score clone semantics changed: note type at ordinal ${ordinal}`)
      }
      if (importedEntry.note.tickCount !== renderedEntry.note.tickCount) {
        const importedPadding = captured.has(importedEntry.note)
        const durationAuthorized = authorizedDurationIdentities instanceof Set
          && authorizedDurationIdentities.has(renderedId)
        if (importedPadding || !durationAuthorized) {
          throw new Error(`Rendered score clone semantics changed: duration at ordinal ${ordinal}`)
        }
      }
      if (!allowPitchChanges
        && pitchSignature(importedEntry.note) !== pitchSignature(renderedEntry.note)) {
        throw new Error(`Rendered score clone semantics changed: pitch at ordinal ${ordinal}`)
      }
      if (Object.keys(renderedEntry).some((key) => key !== 'note'
        && importedEntry[key] !== renderedEntry[key])) {
        throw new Error(`Rendered score clone locator changed at ordinal ${ordinal}`)
      }
      renderedIds.add(renderedId)

      const record = captured.get(importedEntry.note)
      if (!record) return
      if (record.noteIdentity !== importedId || record.durationTicks !== importedEntry.note.tickCount
        || Object.keys(record.locator).some((key) => record.locator[key] !== importedEntry[key])) {
        throw new Error('Imported padding rest identity or locator changed')
      }
      Object.defineProperty(renderedEntry.note, importMarker, { value: token, configurable: true })
      record.note = renderedEntry.note
      record.noteIdentity = renderedId
      adopted.set(renderedEntry.note, record)
    })
    if (adopted.size !== captured.size) {
      throw new Error('Rendered score clone is missing padding rest identity')
    }
    for (const note of captured.keys()) {
      if (note[importMarker] === token) delete note[importMarker]
    }
    captured = adopted
    score = renderedScore
    for (const record of captured.values()) refreshRecordContext(record, renderedScore)
    return renderedScore
  }

  function createExportManifest({ score: currentScore, rawMusicXml, sourceRevision }) {
    if (!score || currentScore !== score) throw new Error('Imported score registry is unavailable or stale')
    if (!Number.isSafeInteger(sourceRevision) || sourceRevision < 0) throw new Error('Invalid source revision')
    const ordered = orderedNotes(score)
    const raw = rawNotesFrom(rawMusicXml)
    const found = new Set()
    const ids = new Set()
    const entries = []
    let rawOrdinal = 0
    ordered.forEach(({ note, ...locator }) => {
      const isRest = note.noteType === 'r'
      const rawSpan = isRest ? 1 : Math.max(1, Array.isArray(note.pitches) ? note.pitches.length : 0)
      for (let offset = 0; offset < rawSpan; offset += 1) {
        const rawNote = raw[rawOrdinal + offset]
        const rawDuration = Number(rawNote?.querySelector('duration')?.textContent)
        const rawVoice = Number(rawNote?.querySelector('voice')?.textContent)
        if (!rawNote
          || Boolean(rawNote.querySelector('rest')) !== isRest
          || Boolean(rawNote.querySelector('chord')) !== (offset > 0)
          || !Number.isFinite(rawDuration) || rawDuration !== note.tickCount
          || rawVoice !== locator.voiceIndex + 1) {
          throw new Error('Raw/model note order, chord expansion or duration mismatch')
        }
      }
      const record = captured.get(note)
      if (record) {
        if (found.has(note) || note[importMarker] !== token
          || record.noteIdentity !== identity(note) || record.durationTicks !== note.tickCount
          || Object.keys(locator).some((key) => record.locator[key] !== locator[key])) {
          throw new Error('Padding rest identity, duration or locator changed')
        }
        if (ids.has(record.noteIdentity)) throw new Error('Duplicate padding rest identity')
        ids.add(record.noteIdentity)
        found.add(note)
        entries.push(Object.freeze({ ...record.locator, rawNoteOrdinal: rawOrdinal,
          noteIdentity: record.noteIdentity, durationTicks: record.durationTicks }))
      }
      rawOrdinal += rawSpan
    })
    if (rawOrdinal !== raw.length) throw new Error('Raw/model note count mismatch')
    if (found.size !== captured.size) throw new Error('Missing padding rest locator or identity')
    return Object.freeze({ version: 1, sourceRevision, rawNoteCount: raw.length,
      entries: Object.freeze(entries) })
  }

  function isCertifiedPaddingRest(note) {
    return Boolean(note && captured.has(note) && note[importMarker] === token)
  }

  return { runDuringImport, adoptRenderedScore, createExportManifest, clear, isCertifiedPaddingRest }
}

exports.createSmoosicPaddingRestTracker = createSmoosicPaddingRestTracker
