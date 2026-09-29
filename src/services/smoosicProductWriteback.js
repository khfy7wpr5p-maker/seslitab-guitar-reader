import { MAX_MUSIC_XML_FILE_SIZE } from './musicXmlFile.js'
import { inspectMusicXml } from '../../musicXmlSecurity.js'
import { normalizeSmoosicPaddingRests } from './smoosicPaddingRestNormalization.js'
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

function stableLocatorsExceptVoiceMatch(current, candidate) {
  for (const field of STABLE_LOCATOR_FIELDS) {
    if (field === 'voice') continue
    if (!sameValue(current?.[field], candidate?.[field])) return false
  }
  return true
}

function normalizedVoiceNumber(value) {
  const voice = Number(value)
  return Number.isSafeInteger(voice) && voice > 0 ? voice : null
}

function smoosicVoiceGroupKey(note) {
  return JSON.stringify([
    note?.partId ?? null,
    note?.partIndex ?? null,
    note?.measureIndex ?? null,
    note?.measureKey ?? null,
    note?.staff ?? null,
  ])
}

function normalizeSmoosicVoiceIdentity(musicXml, currentRevision) {
  const currentNotes = currentRevision?.content
  const parsed = parseMusicXmlToNotes(musicXml)
  if (
    parsed?.error
    || !Array.isArray(parsed?.notes)
    || !Array.isArray(currentNotes)
    || parsed.notes.length !== currentNotes.length
  ) {
    return musicXml
  }

  const groups = new Map()
  for (let index = 0; index < parsed.notes.length; index += 1) {
    const current = currentNotes[index]
    const candidate = parsed.notes[index]
    if (!stableLocatorsExceptVoiceMatch(current, candidate)) return musicXml

    const currentVoice = normalizedVoiceNumber(current?.voice)
    const candidateVoice = normalizedVoiceNumber(candidate?.voice)
    if (currentVoice === null || candidateVoice === null) return musicXml

    const key = smoosicVoiceGroupKey(current)
    if (!groups.has(key)) {
      groups.set(key, {
        indexes: [],
        currentVoices: new Set(),
        candidateVoices: new Set(),
      })
    }
    const group = groups.get(key)
    group.indexes.push(index)
    group.currentVoices.add(currentVoice)
    group.candidateVoices.add(candidateVoice)
  }

  const targetVoiceByIndex = new Array(parsed.notes.length)
  let changed = false

  for (const group of groups.values()) {
    const currentVoices = [...group.currentVoices].sort((left, right) => left - right)
    const candidateVoices = [...group.candidateVoices].sort((left, right) => left - right)

    if (currentVoices.length !== candidateVoices.length) return musicXml
    if (candidateVoices.some((voice, index) => voice !== index + 1)) return musicXml

    const voiceMap = new Map(
      candidateVoices.map((voice, index) => [voice, currentVoices[index]]),
    )

    for (const index of group.indexes) {
      const candidateVoice = normalizedVoiceNumber(parsed.notes[index]?.voice)
      const targetVoice = voiceMap.get(candidateVoice)
      if (targetVoice === undefined) return musicXml
      targetVoiceByIndex[index] = targetVoice
      if (targetVoice !== candidateVoice) changed = true
    }
  }

  if (!changed) return musicXml

  const notePattern = /<note\b[^>]*>[\s\S]*?<\/note>/gi
  const noteBlocks = musicXml.match(notePattern)
  if (!noteBlocks || noteBlocks.length !== parsed.notes.length) return musicXml

  let noteIndex = 0
  let failed = false
  const normalized = musicXml.replace(notePattern, (block) => {
    const targetVoice = targetVoiceByIndex[noteIndex]
    noteIndex += 1
    if (targetVoice === undefined) {
      failed = true
      return block
    }

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

function normalizeSinglePartIdentity(musicXml, currentRevision) {
  const parsed = parseMusicXmlToNotes(musicXml)
  if (parsed?.error || !Array.isArray(parsed?.notes)) return musicXml
  if (parsed.notes.length !== currentRevision.content.length) return musicXml

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

function positiveIntegerText(value) {
  const text = String(value).trim()
  const number = Number(text)
  return /^[1-9]\d*$/.test(text) && Number.isSafeInteger(number) ? number : null
}

function divisionsDeclaration(measureXml) {
  const matches = [...measureXml.matchAll(/<divisions\b[^>]*>([\s\S]*?)<\/divisions>/gi)]
  if (matches.length > 1) return Object.freeze({ ambiguous: true, value: null })
  if (matches.length === 0) return Object.freeze({ ambiguous: false, value: null })
  return Object.freeze({
    ambiguous: false,
    value: positiveIntegerText(matches[0][1]),
  })
}

function projectMeasureDurations(measureXml, sourceDivisions, candidateDivisions) {
  if (sourceDivisions === candidateDivisions) return measureXml
  let invalid = false
  const projected = measureXml.replace(
    /(<duration\b[^>]*>)([\s\S]*?)(<\/duration>)/gi,
    (_match, opening, rawValue, closing) => {
      const value = positiveIntegerText(rawValue)
      if (value === null) {
        invalid = true
        return _match
      }
      const sourceValue = Math.round((value * sourceDivisions) / candidateDivisions)
      const timingError = Math.abs(
        (value / candidateDivisions) - (sourceValue / sourceDivisions),
      )
      // Smoosic uses an integer 4096-tick grid. Tuplets can therefore be at
      // most one candidate tick away from the exact source rational.
      if (
        !Number.isSafeInteger(sourceValue)
        || sourceValue <= 0
        || timingError > (1 / candidateDivisions) + Number.EPSILON
      ) {
        invalid = true
        return _match
      }
      return `${opening}${sourceValue}${closing}`
    },
  )
  return invalid ? null : projected
}

function projectPartDivisions(partXml, sourcePartXml) {
  const candidateMeasures = [...partXml.matchAll(/<measure\b[^>]*>[\s\S]*?<\/measure>/gi)]
  const sourceMeasures = [...sourcePartXml.matchAll(/<measure\b[^>]*>[\s\S]*?<\/measure>/gi)]
  if (candidateMeasures.length !== sourceMeasures.length) return null

  let sourceDivisions = null
  let candidateDivisions = null
  let measureIndex = 0
  let failed = false
  const projected = partXml.replace(/<measure\b[^>]*>[\s\S]*?<\/measure>/gi, (measureXml) => {
    const sourceMeasure = sourceMeasures[measureIndex]?.[0]
    measureIndex += 1
    const sourceDeclaration = divisionsDeclaration(sourceMeasure)
    const candidateDeclaration = divisionsDeclaration(measureXml)
    if (
      sourceDeclaration.ambiguous
      || candidateDeclaration.ambiguous
      || (sourceDeclaration.value === null && /<divisions\b/i.test(sourceMeasure))
      || (candidateDeclaration.value === null && /<divisions\b/i.test(measureXml))
    ) {
      failed = true
      return measureXml
    }
    if (sourceDeclaration.value !== null) sourceDivisions = sourceDeclaration.value
    if (candidateDeclaration.value !== null) candidateDivisions = candidateDeclaration.value
    if (sourceDivisions === null || candidateDivisions === null) {
      failed = true
      return measureXml
    }
    if (sourceDeclaration.value !== null && candidateDeclaration.value === null) {
      failed = true
      return measureXml
    }

    const durations = projectMeasureDurations(
      measureXml,
      sourceDivisions,
      candidateDivisions,
    )
    if (durations === null) {
      failed = true
      return measureXml
    }
    if (candidateDeclaration.value === null || sourceDeclaration.value === null) return durations
    return durations.replace(
      /(<divisions\b[^>]*>)[\s\S]*?(<\/divisions>)/i,
      `$1${sourceDeclaration.value}$2`,
    )
  })
  return failed || measureIndex !== candidateMeasures.length ? null : projected
}

function normalizeSmoosicDivisionsIdentity(musicXml, currentMusicXml) {
  const candidateParts = [...musicXml.matchAll(/<part\b[^>]*>[\s\S]*?<\/part>/gi)]
  const sourceParts = [...currentMusicXml.matchAll(/<part\b[^>]*>[\s\S]*?<\/part>/gi)]
  if (candidateParts.length === 0 || candidateParts.length !== sourceParts.length) return musicXml
  let partIndex = 0
  let failed = false
  const projected = musicXml.replace(/<part\b[^>]*>[\s\S]*?<\/part>/gi, (partXml) => {
    const value = projectPartDivisions(partXml, sourceParts[partIndex]?.[0])
    partIndex += 1
    if (value === null) {
      failed = true
      return partXml
    }
    return value
  })
  return failed || partIndex !== candidateParts.length ? musicXml : projected
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

    // Proof can remove editor padding, but cannot change source rest topology.
    // Compare canonical positions after normalization; do not infer provenance
    // from a rest's duration, voice, or visual shape.
    if (
      (current.notes[index]?.isRest === true || candidate.notes[index]?.isRest === true)
      && (semanticChanged || notationChanged)
    ) {
      return Object.freeze({
        supported: false,
        changedIndexes: Object.freeze([]),
      })
    }

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
  paddingRestProvenance,
  sourceRevision,
  revisionId,
  eventId,
  operationIdPrefix,
  createdAt = null,
  DOMParserCtor = globalThis.DOMParser,
} = {}) {
  if (!authority?.workspace) {
    throw new TypeError('Smoosic product authority is required.')
  }
  if (!validMusicXml(musicXml) || !inspectMusicXml(musicXml).ok) {
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

  let paddingNormalizedMusicXml
  try {
    paddingNormalizedMusicXml = normalizeSmoosicPaddingRests({
      musicXml,
      provenance: paddingRestProvenance,
      sourceRevision,
    }).musicXml
  } catch {
    return Object.freeze({
      status: SMOOSIC_WRITEBACK_STATUS.UNSUPPORTED_STRUCTURE,
      authority,
    })
  }

  const partNormalizedMusicXml = normalizeSinglePartIdentity(paddingNormalizedMusicXml, currentRevision)
  const divisionsNormalizedMusicXml = normalizeSmoosicDivisionsIdentity(
    partNormalizedMusicXml,
    currentRecord.musicXml,
  )
  const normalizedMusicXml = normalizeSmoosicVoiceIdentity(
    divisionsNormalizedMusicXml,
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
