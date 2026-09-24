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
})

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

  const normalizedMusicXml = normalizeSinglePartIdentity(musicXml, currentRevision)

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
