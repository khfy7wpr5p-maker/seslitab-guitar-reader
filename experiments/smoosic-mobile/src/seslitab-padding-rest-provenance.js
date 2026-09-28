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
  let score = null
  let captured = new Map()
  let inImport = false
  const token = {}

  function clear() {
    for (const note of captured.keys()) {
      if (note[importMarker] === token) delete note[importMarker]
    }
    captured = new Map()
    score = null
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
      created.set(note, { noteIdentity, durationTicks: note.tickCount })
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

  function adoptRenderedScore(renderedScore) {
    if (!score) throw new Error('Imported score registry is unavailable or stale')
    if (renderedScore === score) return renderedScore

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
      if (renderedIds.has(renderedId)
        || importedEntry.note.noteType !== renderedEntry.note.noteType
        || importedEntry.note.tickCount !== renderedEntry.note.tickCount
        || pitchSignature(importedEntry.note) !== pitchSignature(renderedEntry.note)
        || Object.keys(renderedEntry).some((key) => key !== 'note'
          && importedEntry[key] !== renderedEntry[key])) {
        throw new Error('Rendered score clone semantics or locator changed')
      }
      renderedIds.add(renderedId)

      const record = captured.get(importedEntry.note)
      if (!record) return
      if (record.noteIdentity !== importedId || record.durationTicks !== importedEntry.note.tickCount
        || Object.keys(record.locator).some((key) => record.locator[key] !== importedEntry[key])) {
        throw new Error('Imported padding rest identity or locator changed')
      }
      Object.defineProperty(renderedEntry.note, importMarker, { value: token, configurable: true })
      adopted.set(renderedEntry.note, {
        noteIdentity: renderedId,
        durationTicks: record.durationTicks,
        locator: record.locator,
      })
    })
    if (adopted.size !== captured.size) {
      throw new Error('Rendered score clone is missing padding rest identity')
    }
    for (const note of captured.keys()) {
      if (note[importMarker] === token) delete note[importMarker]
    }
    captured = adopted
    score = renderedScore
    return renderedScore
  }

  function createExportManifest({ score: currentScore, rawMusicXml, sourceRevision }) {
    if (!score || currentScore !== score) throw new Error('Imported score registry is unavailable or stale')
    if (!Number.isSafeInteger(sourceRevision) || sourceRevision < 0) throw new Error('Invalid source revision')
    const ordered = orderedNotes(score)
    const raw = rawNotesFrom(rawMusicXml)
    if (raw.length !== ordered.length) throw new Error('Raw/model note count mismatch')
    const found = new Set()
    const ids = new Set()
    const entries = []
    ordered.forEach(({ note, ...locator }, ordinal) => {
      const rawNote = raw[ordinal]
      const rawDuration = Number(rawNote.querySelector('duration')?.textContent)
      const rawVoice = Number(rawNote.querySelector('voice')?.textContent)
      if (Boolean(rawNote.querySelector('rest')) !== (note.noteType === 'r')
        || !Number.isFinite(rawDuration) || rawDuration !== note.tickCount
        || rawVoice !== locator.voiceIndex + 1) {
        throw new Error('Raw/model note order or duration mismatch')
      }
      const record = captured.get(note)
      if (!record) return
      if (found.has(note) || note[importMarker] !== token
        || record.noteIdentity !== identity(note) || record.durationTicks !== note.tickCount
        || Object.keys(locator).some((key) => record.locator[key] !== locator[key])) {
        throw new Error('Padding rest identity, duration or locator changed')
      }
      if (ids.has(record.noteIdentity)) throw new Error('Duplicate padding rest identity')
      ids.add(record.noteIdentity)
      found.add(note)
      entries.push(Object.freeze({ ...record.locator, rawNoteOrdinal: ordinal,
        noteIdentity: record.noteIdentity, durationTicks: record.durationTicks }))
    })
    if (found.size !== captured.size) throw new Error('Missing padding rest locator or identity')
    return Object.freeze({ version: 1, sourceRevision, rawNoteCount: raw.length,
      entries: Object.freeze(entries) })
  }

  return { runDuringImport, adoptRenderedScore, createExportManifest, clear }
}

exports.createSmoosicPaddingRestTracker = createSmoosicPaddingRestTracker
