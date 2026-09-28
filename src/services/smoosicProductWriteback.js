import { MAX_MUSIC_XML_FILE_SIZE } from './musicXmlFile.js'
import { parseMusicXmlToNotes } from './musicEngine.js'
import { extractPrDProductNotationByIndex } from './editorPrDNotationBridge.js'
import {
  commitPrDProductRevision,
  revalidatePrDEditorMusicXml,
} from './editorPrDProductPipeline.js'
import {
  registerPrDProductMusicXml,
  resolvePrDProductMusicXml,
} from './editorPrDRevisionMusicXmlRegistry.js'
import {
  createTeacherWorkspace,
  getTeacherWorkspaceCurrentRevision,
  refreshTeacherWorkspace,
  withTeacherWorkspaceAuthoritativeHistory,
} from './teacherWorkspaceModel.js'

export const SMOOSIC_WRITEBACK_STATUS = Object.freeze({
  APPLIED: 'APPLIED',
  NO_CHANGE: 'NO_CHANGE',
  UNSUPPORTED_STRUCTURE: 'UNSUPPORTED_STRUCTURE',
  INVALID_XML: 'INVALID_XML',
  CONFLICT: 'CONFLICT',
  STALE_SOURCE: 'STALE_SOURCE',
  PUBLISH_FAILED: 'PUBLISH_FAILED',
})

export function createSmoosicWritebackOutcome(status, {
  revision = null,
  musicXml = null,
  retriedPublication = false,
} = {}) {
  if (status === SMOOSIC_WRITEBACK_STATUS.PUBLISH_FAILED) {
    return Object.freeze({ status, revision, musicXml })
  }
  if (status === SMOOSIC_WRITEBACK_STATUS.APPLIED && retriedPublication) {
    return Object.freeze({ status, revision, musicXml, retriedPublication })
  }
  return Object.freeze({ status })
}

const STABLE_LOCATOR_FIELDS = Object.freeze([
  'partId',
  'partIndex',
  'measureIndex',
  'measureKey',
  'voice',
  'staff',
  'isGrace',
  'isChordNote',
])

const SEMANTIC_FIELDS = Object.freeze([
  'partId',
  'partIndex',
  'measureIndex',
  'measureKey',
  'voice',
  'staff',
  'isRest',
  'isGrace',
  'isChordNote',
  'startBeat',
  'durationValue',
  'duration',
  'beats',
  'dotCount',
  'tieStart',
  'tieStop',
  'tieContinue',
  'step',
  'alter',
  'octave',
  'midi',
  'frequency',
  'noteName',
  'string',
  'stringLetter',
  'stringNumber',
  'fret',
])

function musicXmlByteLength(value) {
  return new TextEncoder().encode(value).byteLength
}

function validMusicXml(value) {
  return typeof value === 'string'
    && value.trim() !== ''
    && value.includes('<score-')
    && musicXmlByteLength(value) <= MAX_MUSIC_XML_FILE_SIZE
}

function sameValue(left, right) {
  if (typeof left === 'number' || typeof right === 'number') {
    return typeof left === 'number'
      && typeof right === 'number'
      && Number.isFinite(left)
      && Number.isFinite(right)
      && Math.abs(left - right) <= 1e-9
  }
  return Object.is(left ?? null, right ?? null)
}

function uniqueValues(items, field) {
  return [...new Set(
    items
      .map((item) => item?.[field])
      .filter((value) => value !== null && value !== undefined && value !== ''),
  )]
}

function escapeRegExp(value) {
  return String(value).replace(/[|\\{}()[\]^$+*?.-]/g, (match) => `\\${match}`)
}

function replaceElementId(musicXml, tagName, fromId, toId) {
  const pattern = new RegExp(
    `(<${tagName}\\b[^>]*\\bid\\s*=\\s*["'])${escapeRegExp(fromId)}(["'])`,
    'g',
  )
  return musicXml.replace(pattern, (_match, prefix, suffix) => `${prefix}${toId}${suffix}`)
}

function normalizedVoiceNumber(value) {
  const voice = Number(value)
  return Number.isSafeInteger(voice) && voice > 0 ? voice : null
}

function voiceGroupKey(note) {
  return JSON.stringify([
    note?.partIndex ?? null,
    note?.measureIndex ?? null,
    note?.staff ?? null,
  ])
}

function voiceSetsByGroup(notes) {
  const groups = new Map()
  for (const note of notes) {
    const voice = normalizedVoiceNumber(note?.voice)
    if (voice === null) return null
    const key = voiceGroupKey(note)
    if (!groups.has(key)) groups.set(key, new Set())
    groups.get(key).add(voice)
  }
  return groups
}

function normalizeSmoosicVoiceIdentity(musicXml, currentRevision) {
  const currentNotes = currentRevision?.content
  const parsed = parseMusicXmlToNotes(musicXml)
  if (
    parsed?.error
    || !Array.isArray(parsed?.notes)
    || !Array.isArray(currentNotes)
  ) {
    return musicXml
  }

  const currentGroups = voiceSetsByGroup(currentNotes)
  const candidateGroups = voiceSetsByGroup(parsed.notes)
  if (!currentGroups || !candidateGroups || currentGroups.size !== candidateGroups.size) {
    return musicXml
  }

  const voiceMapByGroup = new Map()
  let changed = false
  for (const [key, currentSet] of currentGroups) {
    const candidateSet = candidateGroups.get(key)
    if (!candidateSet) return musicXml

    const currentVoices = [...currentSet].sort((left, right) => left - right)
    const candidateVoices = [...candidateSet].sort((left, right) => left - right)
    if (currentVoices.length !== candidateVoices.length) return musicXml
    if (candidateVoices.some((voice, index) => voice !== index + 1)) return musicXml

    const voiceMap = new Map(
      candidateVoices.map((voice, index) => [voice, currentVoices[index]]),
    )
    voiceMapByGroup.set(key, voiceMap)
    for (const [candidateVoice, currentVoice] of voiceMap) {
      if (candidateVoice !== currentVoice) changed = true
    }
  }

  if (!changed) return musicXml

  const targetVoiceByIndex = parsed.notes.map((note) => {
    const voiceMap = voiceMapByGroup.get(voiceGroupKey(note))
    return voiceMap?.get(normalizedVoiceNumber(note?.voice)) ?? null
  })
  if (targetVoiceByIndex.some((voice) => voice === null)) return musicXml

  const notePattern = /<note\b[^>]*>[\s\S]*?<\/note>/gi
  const noteBlocks = musicXml.match(notePattern)
  if (!noteBlocks || noteBlocks.length !== parsed.notes.length) return musicXml

  let noteIndex = 0
  let failed = false
  const normalized = musicXml.replace(notePattern, (block) => {
    const targetVoice = targetVoiceByIndex[noteIndex]
    noteIndex += 1
    const voicePattern = /<voice\b([^>]*)>[\s\S]*?<\/voice>/i
    if (!voicePattern.test(block)) {
      failed = true
      return block
    }
    return block.replace(
      voicePattern,
      (_match, attributes) => `<voice${attributes}>${targetVoice}</voice>`,
    )
  })

  return failed || noteIndex !== parsed.notes.length ? musicXml : normalized
}

const PADDING_EPSILON = 1e-9

function finiteInterval(note) {
  const start = Number(note?.startBeat)
  const beats = Number(note?.beats)
  if (!Number.isFinite(start) || !Number.isFinite(beats) || beats < 0) return null
  return Object.freeze({ start, end: start + beats })
}

function paddingGroupKey(note) {
  return JSON.stringify([
    note?.partId ?? null,
    note?.partIndex ?? null,
    note?.measureIndex ?? null,
    note?.measureKey ?? null,
    note?.voice ?? null,
    note?.staff ?? null,
  ])
}

function measureStaffKey(note) {
  return JSON.stringify([
    note?.partId ?? null,
    note?.partIndex ?? null,
    note?.measureIndex ?? null,
    note?.measureKey ?? null,
    note?.staff ?? null,
  ])
}

function sourceStructuralKey(note) {
  return JSON.stringify([
    paddingGroupKey(note),
    Number(note?.startBeat),
    Number(note?.beats),
    Boolean(note?.isRest),
    Boolean(note?.isGrace),
    Boolean(note?.isChordNote),
  ])
}

function sourceSilentIntervals(notes) {
  const maxEndByMeasureStaff = new Map()
  const occupiedByVoice = new Map()

  for (const note of notes) {
    if (note?.isGrace || note?.isChordNote) continue
    const interval = finiteInterval(note)
    if (!interval) return null

    const measureKey = measureStaffKey(note)
    maxEndByMeasureStaff.set(
      measureKey,
      Math.max(maxEndByMeasureStaff.get(measureKey) ?? 0, interval.end),
    )

    const key = paddingGroupKey(note)
    if (!occupiedByVoice.has(key)) occupiedByVoice.set(key, [])
    occupiedByVoice.get(key).push(interval)
  }

  const gapsByVoice = new Map()
  for (const [key, intervals] of occupiedByVoice) {
    const sample = notes.find((note) => paddingGroupKey(note) === key)
    if (!sample) return null
    const measureEnd = maxEndByMeasureStaff.get(measureStaffKey(sample))
    if (!Number.isFinite(measureEnd)) return null

    const sorted = [...intervals].sort((left, right) =>
      left.start - right.start || left.end - right.end
    )
    const gaps = []
    let cursor = 0
    for (const interval of sorted) {
      if (interval.start > cursor + PADDING_EPSILON) {
        gaps.push(Object.freeze({ start: cursor, end: interval.start }))
      }
      cursor = Math.max(cursor, interval.end)
    }
    if (measureEnd > cursor + PADDING_EPSILON) {
      gaps.push(Object.freeze({ start: cursor, end: measureEnd }))
    }
    gapsByVoice.set(key, Object.freeze(gaps))
  }

  return gapsByVoice
}

function intervalInsideGap(interval, gaps) {
  if (!interval || !Array.isArray(gaps)) return false
  return gaps.some((gap) =>
    interval.start >= gap.start - PADDING_EPSILON
    && interval.end <= gap.end + PADDING_EPSILON
    && interval.end > interval.start + PADDING_EPSILON
  )
}

function noteBlockToForward(block) {
  const duration = block.match(/<duration\b[^>]*>[\s\S]*?<\/duration>/i)?.[0]
  if (!duration) return null
  const voice = block.match(/<voice\b[^>]*>[\s\S]*?<\/voice>/i)?.[0] ?? ''
  const staff = block.match(/<staff\b[^>]*>[\s\S]*?<\/staff>/i)?.[0] ?? ''
  return `<forward>${duration}${voice}${staff}</forward>`
}

function normalizeSmoosicPaddingRests(musicXml, currentRevision) {
  const currentNotes = currentRevision?.content
  const parsed = parseMusicXmlToNotes(musicXml)
  if (
    parsed?.error
    || !Array.isArray(parsed?.notes)
    || !Array.isArray(currentNotes)
    || parsed.notes.length <= currentNotes.length
  ) {
    return musicXml
  }

  const remainingSource = new Map()
  for (const note of currentNotes) {
    const key = sourceStructuralKey(note)
    remainingSource.set(key, (remainingSource.get(key) ?? 0) + 1)
  }

  const silentIntervals = sourceSilentIntervals(currentNotes)
  if (!silentIntervals) return musicXml

  const syntheticIndexes = new Set()
  for (let index = 0; index < parsed.notes.length; index += 1) {
    const candidate = parsed.notes[index]
    const key = sourceStructuralKey(candidate)
    const remaining = remainingSource.get(key) ?? 0
    if (remaining > 0) {
      remainingSource.set(key, remaining - 1)
      continue
    }

    if (
      !candidate?.isRest
      || candidate?.isGrace
      || candidate?.isChordNote
      || !intervalInsideGap(
        finiteInterval(candidate),
        silentIntervals.get(paddingGroupKey(candidate)),
      )
    ) {
      return musicXml
    }
    syntheticIndexes.add(index)
  }

  if ([...remainingSource.values()].some((count) => count !== 0)) return musicXml
  if (syntheticIndexes.size !== parsed.notes.length - currentNotes.length) return musicXml

  const notePattern = /<note\b[^>]*>[\s\S]*?<\/note>/gi
  const noteBlocks = musicXml.match(notePattern)
  if (!noteBlocks || noteBlocks.length !== parsed.notes.length) return musicXml

  let noteIndex = 0
  let failed = false
  const normalized = musicXml.replace(notePattern, (block) => {
    const index = noteIndex
    noteIndex += 1
    if (!syntheticIndexes.has(index)) return block
    const forward = noteBlockToForward(block)
    if (!forward) {
      failed = true
      return block
    }
    return forward
  })
  if (failed || noteIndex !== parsed.notes.length) return musicXml

  const reparsed = parseMusicXmlToNotes(normalized)
  if (
    reparsed?.error
    || !Array.isArray(reparsed?.notes)
    || reparsed.notes.length !== currentNotes.length
  ) {
    return musicXml
  }
  return normalized
}

function normalizeSinglePartIdentity(musicXml, currentRevision) {
  const parsed = parseMusicXmlToNotes(musicXml)
  if (parsed?.error || !Array.isArray(parsed?.notes)) return musicXml

  const currentPartIds = uniqueValues(currentRevision.content, 'partId')
  const candidatePartIds = uniqueValues(parsed.notes, 'partId')
  const currentPartIndexes = uniqueValues(currentRevision.content, 'partIndex')
  const candidatePartIndexes = uniqueValues(parsed.notes, 'partIndex')

  if (
    currentPartIds.length !== 1
    || candidatePartIds.length !== 1
    || currentPartIndexes.length !== 1
    || candidatePartIndexes.length !== 1
    || !sameValue(currentPartIndexes[0], candidatePartIndexes[0])
  ) {
    return musicXml
  }

  const currentPartId = currentPartIds[0]
  const candidatePartId = candidatePartIds[0]
  if (currentPartId === candidatePartId) return musicXml

  const normalizedScorePart = replaceElementId(
    musicXml,
    'score-part',
    candidatePartId,
    currentPartId,
  )
  const normalizedPart = replaceElementId(
    normalizedScorePart,
    'part',
    candidatePartId,
    currentPartId,
  )

  return normalizedScorePart !== musicXml && normalizedPart !== normalizedScorePart
    ? normalizedPart
    : musicXml
}

function parseCandidate(musicXml, DOMParserCtor) {
  const parsed = parseMusicXmlToNotes(musicXml)
  if (parsed?.error || !Array.isArray(parsed?.notes) || parsed.notes.length === 0) {
    throw new Error(parsed?.error || 'MusicXML semantic parse failed.')
  }
  const notation = extractPrDProductNotationByIndex(
    musicXml,
    { content: parsed.notes },
    { DOMParserCtor },
  )
  return Object.freeze({
    notes: parsed.notes,
    notation,
  })
}

function stableLocatorsMatch(currentRevision, candidateNotes) {
  if (currentRevision.content.length !== candidateNotes.length) return false
  for (let index = 0; index < candidateNotes.length; index += 1) {
    const current = currentRevision.content[index]
    const candidate = candidateNotes[index]
    for (const field of STABLE_LOCATOR_FIELDS) {
      if (!sameValue(current?.[field], candidate?.[field])) return false
    }
  }
  return true
}

function changedIndexesFor({
  currentRevision,
  currentMusicXml,
  candidateMusicXml,
  DOMParserCtor,
}) {
  const current = parseCandidate(currentMusicXml, DOMParserCtor)
  const candidate = parseCandidate(candidateMusicXml, DOMParserCtor)

  if (!stableLocatorsMatch(currentRevision, candidate.notes)) {
    return Object.freeze({
      supported: false,
      changedIndexes: Object.freeze([]),
    })
  }

  const changedIndexes = []
  for (let index = 0; index < candidate.notes.length; index += 1) {
    const semanticChanged = SEMANTIC_FIELDS.some(
      (field) => !sameValue(current.notes[index]?.[field], candidate.notes[index]?.[field]),
    )
    const notationChanged =
      JSON.stringify(current.notation[index] ?? null)
      !== JSON.stringify(candidate.notation[index] ?? null)

    if (semanticChanged || notationChanged) changedIndexes.push(index)
  }

  return Object.freeze({
    supported: true,
    changedIndexes: Object.freeze(changedIndexes),
  })
}

export function createSmoosicProductAuthority({
  notes,
  musicXml,
  sourceId,
  automaticRevisionId,
  historyId,
  actorId = 'smoosic-local-editor',
  createdAt = null,
} = {}) {
  if (!Array.isArray(notes) || notes.length === 0) {
    throw new TypeError('Smoosic product authority requires non-empty current notes.')
  }
  if (!validMusicXml(musicXml)) {
    throw new TypeError('Smoosic product authority requires bounded MusicXML.')
  }

  const workspace = createTeacherWorkspace({
    content: notes,
    actorId,
    sourceId,
    automaticRevisionId,
    historyId,
    createdAt,
  })
  const revision = getTeacherWorkspaceCurrentRevision(workspace)
  registerPrDProductMusicXml(revision, musicXml, {
    evidence: 'smoosic-accepted-source',
  })

  return Object.freeze({ workspace })
}

export function applySmoosicProductWriteback({
  authority,
  musicXml,
  revisionId,
  eventId,
  operationIdPrefix,
  createdAt = null,
  DOMParserCtor = globalThis.DOMParser,
} = {}) {
  if (!authority?.workspace) {
    throw new TypeError('Smoosic product authority is required.')
  }
  if (!validMusicXml(musicXml)) {
    return Object.freeze({
      status: SMOOSIC_WRITEBACK_STATUS.INVALID_XML,
      authority,
    })
  }

  const currentRevision = getTeacherWorkspaceCurrentRevision(authority.workspace)
  const currentRecord = resolvePrDProductMusicXml(currentRevision)
  if (!currentRecord?.musicXml) {
    return Object.freeze({
      status: SMOOSIC_WRITEBACK_STATUS.CONFLICT,
      authority,
    })
  }

  const partNormalizedMusicXml = normalizeSinglePartIdentity(musicXml, currentRevision)
  const voiceNormalizedMusicXml = normalizeSmoosicVoiceIdentity(
    partNormalizedMusicXml,
    currentRevision,
  )
  const normalizedMusicXml = normalizeSmoosicPaddingRests(
    voiceNormalizedMusicXml,
    currentRevision,
  )

  let changeSet
  try {
    changeSet = changedIndexesFor({
      currentRevision,
      currentMusicXml: currentRecord.musicXml,
      candidateMusicXml: normalizedMusicXml,
      DOMParserCtor,
    })
  } catch {
    return Object.freeze({
      status: SMOOSIC_WRITEBACK_STATUS.INVALID_XML,
      authority,
    })
  }

  if (!changeSet.supported) {
    return Object.freeze({
      status: SMOOSIC_WRITEBACK_STATUS.UNSUPPORTED_STRUCTURE,
      authority,
    })
  }
  if (changeSet.changedIndexes.length === 0) {
    return Object.freeze({
      status: SMOOSIC_WRITEBACK_STATUS.NO_CHANGE,
      authority,
      changedIndexes: changeSet.changedIndexes,
    })
  }

  let revalidated
  try {
    revalidated = revalidatePrDEditorMusicXml({
      musicXml: normalizedMusicXml,
      currentRevision,
      changedIndexes: changeSet.changedIndexes,
      DOMParserCtor,
    })
  } catch {
    return Object.freeze({
      status: SMOOSIC_WRITEBACK_STATUS.INVALID_XML,
      authority,
      changedIndexes: changeSet.changedIndexes,
    })
  }

  const committed = commitPrDProductRevision({
    workspace: authority.workspace,
    revalidated,
    revisionId,
    eventId,
    operationIdPrefix,
    createdAt,
  })

  if (!committed.ok) {
    return Object.freeze({
      status: SMOOSIC_WRITEBACK_STATUS.CONFLICT,
      authority,
      changedIndexes: changeSet.changedIndexes,
    })
  }

  const nextWorkspace = refreshTeacherWorkspace(
    withTeacherWorkspaceAuthoritativeHistory({
      workspace: authority.workspace,
      history: committed.result.history,
    }),
  )
  const nextAuthority = Object.freeze({ workspace: nextWorkspace })

  return Object.freeze({
    status: SMOOSIC_WRITEBACK_STATUS.APPLIED,
    authority: nextAuthority,
    revision: committed.revision,
    musicXml: committed.musicXml,
    changedIndexes: changeSet.changedIndexes,
  })
}
