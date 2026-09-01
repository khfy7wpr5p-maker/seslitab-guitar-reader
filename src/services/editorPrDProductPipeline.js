// STI-11/12 — Editor result -> SesliTab product revalidation/audit boundary.
//
// Editor Core remains the only keypad mutation authority. This module accepts
// an already-committed local Editor snapshot, reparses the exact materialized
// MusicXML through SesliTab, runs the existing structural validator, and then
// records one immutable Package 8 product revision with the SAME revision id.
// It never transfers old quality/approval evidence to the new revision.

import { parseMusicXmlWithStructure } from '../../musicXmlParser.js'
import { parseMusicXmlToNotes } from './musicEngine.js'
import { extractMusicXmlStructuralEvidence } from './musicXmlStructuralEvidence.js'
import { attachStructuralEvidence } from './musicXmlStructuralValidation.js'
import { validateStructuralRhythm } from './structuralRhythmValidator.js'
import {
  applyTeacherCorrectionWithExpectation,
  TEACHER_CONCURRENCY_STATUS,
  undoTeacherRevisionHistoryWithExpectation,
} from './teacherRevisionConcurrency.js'
import { getCurrentTeacherRevision } from './teacherRevisionHistory.js'
import {
  registerMusicXmlSourceForNotes,
  resolveMusicXmlSourceForNotes,
} from './musicXmlSourceRegistry.js'
import { extractPrDProductNotationByIndex } from './editorPrDNotationBridge.js'

export const SESLITAB_EDITOR_PRD_PRODUCT_PIPELINE_VERSION = '1.0.0'
export const PRD_PRODUCT_ACTOR_PREFIX = 'editor-keypad:'

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

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function stableSerialize(value) {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Product content contains a non-finite number.')
    return JSON.stringify(Object.is(value, -0) ? 0 : value)
  }
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (!isPlainObject(value)) throw new TypeError('Product content must contain only plain data.')
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`
}

function dataEqual(left, right) {
  return stableSerialize(left) === stableSerialize(right)
}

function finiteSame(left, right) {
  if (typeof left === 'number' || typeof right === 'number') {
    return typeof left === 'number' && typeof right === 'number' && Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= 1e-9
  }
  return Object.is(left ?? null, right ?? null)
}

function stableLocatorsMatch(current, parsed, index) {
  if (!isPlainObject(current) || !isPlainObject(parsed)) throw new Error(`Product note ${index} is not plain data.`)
  for (const field of STABLE_LOCATOR_FIELDS) {
    if (!finiteSame(current[field], parsed[field])) throw new Error(`Editor materialization changed stable product locator ${index}/${field}.`)
  }
}

function scoreEntityMaps(score) {
  const events = new Map()
  const notes = new Map()
  for (const part of score.parts ?? []) for (const staff of part.staves ?? []) for (const measure of staff.measures ?? []) for (const voice of measure.voices ?? []) for (const event of voice.events ?? []) {
    events.set(event.id, event)
    if (event.kind === 'note') notes.set(event.note.id, event.note)
    if (event.kind === 'chord') for (const note of event.notes) notes.set(note.id, note)
  }
  return { events, notes }
}

function notationMaps(notation) {
  return {
    events: new Map((notation?.events ?? []).map((entry) => [entry.target.eventId, entry.notation])),
    notes: new Map((notation?.notes ?? []).map((entry) => [entry.target.noteId, entry.notation])),
  }
}

function eventNotation(value, eventId) {
  return value.get(eventId) ?? Object.freeze({ dots: 0, beams: Object.freeze([]), tuplet: null })
}

function noteNotation(value, noteId) {
  return value.get(noteId) ?? Object.freeze({ accidental: null, ties: Object.freeze([]), slurs: Object.freeze([]) })
}

export function changedPrDProductIndexes({ baseSession, nextSession, mapping } = {}) {
  const base = baseSession?.history?.present
  const next = nextSession?.history?.present
  if (!base?.score || !base?.notation || !next?.score || !next?.notation || !mapping) throw new Error('Two exact Editor snapshots and mapping are required.')
  const baseEntities = scoreEntityMaps(base.score)
  const nextEntities = scoreEntityMaps(next.score)
  const baseNotation = notationMaps(base.notation)
  const nextNotation = notationMaps(next.notation)
  const changed = []

  for (let index = 0; index < mapping.eventIds.length; index++) {
    const eventId = mapping.eventIds[index]
    const noteId = mapping.noteIds[index]
    const eventChanged = !dataEqual(baseEntities.events.get(eventId) ?? null, nextEntities.events.get(eventId) ?? null)
      || !dataEqual(eventNotation(baseNotation.events, eventId), eventNotation(nextNotation.events, eventId))
    const noteChanged = typeof noteId === 'string' && (
      !dataEqual(baseEntities.notes.get(noteId) ?? null, nextEntities.notes.get(noteId) ?? null)
      || !dataEqual(noteNotation(baseNotation.notes, noteId), noteNotation(nextNotation.notes, noteId))
    )
    if (eventChanged || noteChanged) changed.push(index)
  }
  return Object.freeze([...new Set(changed)])
}

function structuralRevalidation(musicXml) {
  const parsed = parseMusicXmlWithStructure(musicXml)
  if (parsed?.error) throw new Error('Editor materialized MusicXML failed SesliTab structural parsing.')
  const evidence = extractMusicXmlStructuralEvidence(musicXml)
  if (!evidence?.ok) throw new Error('Editor materialized MusicXML failed structural evidence extraction.')
  let score
  try {
    score = attachStructuralEvidence(parsed, evidence)
  } catch {
    throw new Error('Editor materialized MusicXML structural evidence could not be attached.')
  }
  const validation = validateStructuralRhythm(score)
  if (
    validation?.valid !== true ||
    validation.summary?.totalFindings !== 0 ||
    validation.summary?.errors !== 0 ||
    validation.summary?.warnings !== 0
  ) {
    throw new Error('Editor materialized MusicXML failed SesliTab structural/rhythmic revalidation.')
  }
  return Object.freeze({ evidence, validation })
}

function candidateContent({ musicXml, currentRevision, changedIndexes, DOMParserCtor }) {
  const semantic = parseMusicXmlToNotes(musicXml)
  if (semantic?.error || !Array.isArray(semantic?.notes)) throw new Error(`Editor materialized MusicXML semantic parse failed: ${semantic?.error ?? 'unknown'}.`)
  if (semantic.notes.length !== currentRevision.content.length) throw new Error('Editor materialized MusicXML changed product note cardinality.')
  for (let index = 0; index < semantic.notes.length; index++) stableLocatorsMatch(currentRevision.content[index], semantic.notes[index], index)
  const notation = extractPrDProductNotationByIndex(musicXml, { content: semantic.notes }, { DOMParserCtor })
  const changed = new Set(changedIndexes)
  const next = currentRevision.content.map((current, index) => {
    if (!changed.has(index)) return current
    const parsed = semantic.notes[index]
    return Object.freeze({
      ...parsed,
      editorNotation: notation[index],
    })
  })
  return Object.freeze(next)
}

export function revalidatePrDEditorMusicXml({
  musicXml,
  currentRevision,
  changedIndexes,
  DOMParserCtor = globalThis.DOMParser,
} = {}) {
  if (!currentRevision || !Array.isArray(currentRevision.content) || !Array.isArray(changedIndexes) || changedIndexes.length === 0) {
    throw new Error('Current product revision and a non-empty exact change set are required.')
  }
  const structural = structuralRevalidation(musicXml)
  const content = candidateContent({ musicXml, currentRevision, changedIndexes, DOMParserCtor })
  if (dataEqual(content, currentRevision.content)) throw new Error('Editor action produced no product-semantic change after revalidation.')
  return Object.freeze({
    version: SESLITAB_EDITOR_PRD_PRODUCT_PIPELINE_VERSION,
    musicXml,
    content,
    changedIndexes: Object.freeze([...changedIndexes]),
    structural,
  })
}

function requiredId(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required.`)
  return value.trim()
}

export function commitPrDProductRevision({
  workspace,
  revalidated,
  revisionId,
  eventId,
  operationIdPrefix,
  createdAt = null,
} = {}) {
  if (!workspace?.history || !workspace?.expectation || !Array.isArray(revalidated?.content)) throw new Error('Current Package 8 workspace and revalidated Editor content are required.')
  const current = getCurrentTeacherRevision(workspace.history)
  if (current.content.length !== revalidated.content.length) throw new Error('Revalidated product cardinality changed before immutable commit.')
  const operations = []
  for (const index of revalidated.changedIndexes) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= current.content.length) throw new Error('Revalidated product index is invalid.')
    if (dataEqual(current.content[index], revalidated.content[index])) continue
    operations.push(Object.freeze({
      operationId: `${requiredId(operationIdPrefix, 'operationIdPrefix')}-${index + 1}`,
      kind: 'replace_value',
      path: Object.freeze([index]),
      value: revalidated.content[index],
    }))
  }
  if (operations.length === 0) throw new Error('No immutable Package 8 product operation remains after exact comparison.')

  const result = applyTeacherCorrectionWithExpectation({
    history: workspace.history,
    expectation: workspace.expectation,
    eventId: requiredId(eventId, 'eventId'),
    actorId: workspace.actorId,
    revisionId: requiredId(revisionId, 'revisionId'),
    operations,
    createdAt,
  })
  if (result.status === TEACHER_CONCURRENCY_STATUS.CONFLICT) return Object.freeze({ ok: false, reason: result.conflictReason, result })
  if (result.revision?.revisionId !== revisionId) throw new Error('Package 8 product revision id diverged from Editor Core atomic revision id.')
  registerMusicXmlSourceForNotes(result.revision.content, revalidated.musicXml)
  return Object.freeze({ ok: true, result, revision: result.revision, musicXml: revalidated.musicXml })
}

function semanticFieldsMatch(revision, parsedNotes, notation) {
  if (!revision || !Array.isArray(revision.content) || revision.content.length !== parsedNotes.length) return false
  const fields = [
    'partId','partIndex','measureIndex','measureKey','isRest','isGrace','isChordNote','voice','staff',
    'startBeat','durationValue','duration','beats','dotCount','tieStart','tieStop','tieContinue',
    'step','alter','octave','midi','frequency','noteName','string','fret',
  ]
  for (let index = 0; index < parsedNotes.length; index++) {
    const expected = revision.content[index]
    const parsed = parsedNotes[index]
    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(expected, field) && !finiteSame(expected[field], parsed[field])) return false
    }
    if (Object.prototype.hasOwnProperty.call(expected, 'editorNotation') && !dataEqual(expected.editorNotation, notation[index])) return false
  }
  return true
}

export function validatePrDRestoredRevisionMusicXml({ revision, musicXml, DOMParserCtor = globalThis.DOMParser } = {}) {
  if (!revision || !Array.isArray(revision.content) || typeof musicXml !== 'string') throw new Error('Restored revision and exact MusicXML are required.')
  structuralRevalidation(musicXml)
  const semantic = parseMusicXmlToNotes(musicXml)
  if (semantic?.error || !Array.isArray(semantic.notes)) throw new Error('Restored MusicXML semantic parse failed.')
  const notation = extractPrDProductNotationByIndex(musicXml, { content: semantic.notes }, { DOMParserCtor })
  if (!semanticFieldsMatch(revision, semantic.notes, notation)) throw new Error('Restored MusicXML does not represent the exact immutable target revision.')
  return true
}

export function restorePrDProductRevision({
  workspace,
  targetRevisionId,
  revisionId,
  eventId,
  createdAt = null,
  DOMParserCtor = globalThis.DOMParser,
} = {}) {
  if (!workspace?.history || !workspace?.expectation) throw new Error('Current Package 8 workspace is required for immutable restore.')
  const target = workspace.history.revisions.find((item) => item.revisionId === targetRevisionId)
  if (!target) throw new Error('Immutable restore target revision is not preserved in Package 8 history.')
  const source = resolveMusicXmlSourceForNotes(target.content)
  if (!source?.musicXml) throw new Error('Exact MusicXML for the immutable restore target is unavailable; no guessed reconstruction is allowed.')
  validatePrDRestoredRevisionMusicXml({ revision: target, musicXml: source.musicXml, DOMParserCtor })

  const result = undoTeacherRevisionHistoryWithExpectation({
    history: workspace.history,
    expectation: workspace.expectation,
    targetRevisionId,
    revisionId: requiredId(revisionId, 'revisionId'),
    eventId: requiredId(eventId, 'eventId'),
    actorId: workspace.actorId,
    createdAt,
  })
  if (result.status === TEACHER_CONCURRENCY_STATUS.CONFLICT) return Object.freeze({ ok: false, reason: result.conflictReason, result })
  if (result.revision?.revisionId !== revisionId) throw new Error('Immutable restore revision identity diverged from requested product revision id.')
  registerMusicXmlSourceForNotes(result.revision.content, source.musicXml)
  return Object.freeze({ ok: true, result, revision: result.revision, musicXml: source.musicXml, targetRevision: target })
}

export function currentPrDRevisionMusicXml(revision) {
  const source = revision?.content ? resolveMusicXmlSourceForNotes(revision.content) : null
  return source?.musicXml ?? null
}
