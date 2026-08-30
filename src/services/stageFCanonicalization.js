import {
  beatsToDurationId,
  durationBeats,
  resolveCanonicalPitch,
} from '../../noteTheory.js'
import {
  GUITAR_POSITION_CANDIDATE_STATE,
  enumerateCanonicalGuitarPositionCandidates,
} from '../../guitarPositionResolver.js'
import {
  applyTeacherCorrectionWithExpectation,
  TEACHER_CONCURRENCY_STATUS,
} from './teacherRevisionConcurrency.js'
import {
  getCurrentTeacherRevision,
  isTeacherRevisionHistory,
} from './teacherRevisionHistory.js'

export const STAGE_F_CANONICALIZATION_SCHEMA_VERSION = 1
export const STAGE_F_CANONICALIZATION_STATE = 'stage_f_mechanically_canonicalized'
export const STAGE_F_CANONICALIZER_ACTOR_ID = 'system:stage-f-canonicalizer'

export const STAGE_F_CANONICALIZATION_STATUS = Object.freeze({
  APPLIED: 'applied',
  ALREADY_COHERENT: 'already_coherent',
  CONFLICT: 'conflict',
})

const TEACHER_INTENT_FIELDS = new Set(['step', 'alter', 'octave', 'durationValue'])
const MECHANICAL_FIELDS = new Set([
  'midi',
  'frequency',
  'noteName',
  'fret',
  'beats',
  'duration',
  'dotCount',
  'startBeat',
])
const IDENTITY_FIELDS = Object.freeze(['partId', 'partIndex', 'measureIndex', 'measureKey'])
const EVIDENCE_FIELDS = Object.freeze([
  'schemaVersion',
  'state',
  'actorId',
  'baseRevisionId',
  'baseContentFingerprint',
  'resultRevisionId',
  'resultContentFingerprint',
  'derivedOperationCount',
  'derivedTargets',
  'createdAt',
])
const EPSILON = 1e-9

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function requiredString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${fieldName} must be a non-empty string.`)
  }
  return value.trim()
}

function nullableString(value, fieldName) {
  if (value === null || value === undefined) return null
  return requiredString(value, fieldName)
}

function sameValue(left, right) {
  if (typeof left === 'number' && typeof right === 'number') {
    return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= EPSILON
  }
  return Object.is(left, right)
}

function assertHistoryScope(history) {
  if (!isTeacherRevisionHistory(history)) {
    throw new TypeError('history must be a valid immutable teacher revision history.')
  }
  if (history.revisions.length < 2) {
    throw new Error('Stage F canonicalization requires a corrected revision.')
  }

  const root = history.revisions[0]
  const current = getCurrentTeacherRevision(history)
  if (!Array.isArray(root.content) || !Array.isArray(current.content)) {
    throw new Error('Stage F canonicalization requires note-array revisions.')
  }
  if (root.content.length !== current.content.length) {
    throw new Error('Stage F canonicalization does not support insertion/deletion/reordering.')
  }

  for (const event of history.correctionAuditEvents) {
    const mechanical = event.actorId === STAGE_F_CANONICALIZER_ACTOR_ID
    for (const operation of event.operations) {
      if (
        !Array.isArray(operation.path) ||
        operation.path.length !== 2 ||
        !Number.isInteger(operation.path[0]) ||
        operation.path[0] < 0 ||
        typeof operation.path[1] !== 'string'
      ) {
        throw new Error('Stage F canonicalization supports only direct note-field corrections.')
      }
      const field = operation.path[1]
      const allowed = mechanical ? MECHANICAL_FIELDS.has(field) : TEACHER_INTENT_FIELDS.has(field)
      if (!allowed) {
        throw new Error(`Stage F canonicalization refuses correction field: ${field}.`)
      }
    }
  }

  return { root, current }
}

function assertIdentityStable(rootNote, currentNote, noteIndex) {
  if (!isPlainObject(rootNote) || !isPlainObject(currentNote)) {
    throw new Error(`Stage F canonicalization requires plain note objects at index ${noteIndex}.`)
  }
  for (const field of IDENTITY_FIELDS) {
    if (!sameValue(rootNote[field] ?? null, currentNote[field] ?? null)) {
      throw new Error(`Stage F canonicalization refuses identity drift at note ${noteIndex}/${field}.`)
    }
  }
  if (Boolean(rootNote.isRest) !== Boolean(currentNote.isRest)) {
    throw new Error(`Stage F canonicalization refuses rest/pitch conversion at note ${noteIndex}.`)
  }
}

function pushOperation(operations, noteIndex, field, before, after, operationIdPrefix) {
  if (sameValue(before, after)) return
  operations.push({
    operationId: `${operationIdPrefix}-${operations.length + 1}`,
    kind: 'replace_value',
    path: [noteIndex, field],
    value: after,
  })
}

function appendPitchDerivations({ operations, rootNote, note, noteIndex, operationIdPrefix }) {
  const pitchChanged =
    !sameValue(rootNote.step, note.step) ||
    !sameValue(rootNote.alter ?? 0, note.alter ?? 0) ||
    !sameValue(rootNote.octave, note.octave)
  if (!pitchChanged) return
  if (note.isRest === true) {
    throw new Error(`Pitch canonicalization cannot target rest note ${noteIndex}.`)
  }

  const resolved = resolveCanonicalPitch({
    step: note.step,
    alter: note.alter ?? 0,
    octave: note.octave,
  })
  if (!resolved.valid || !Number.isInteger(resolved.midi) || !Number.isFinite(resolved.frequency)) {
    throw new Error(`Pitch canonicalization failed at note ${noteIndex}.`)
  }
  for (const field of ['midi', 'frequency', 'noteName']) {
    if (!Object.prototype.hasOwnProperty.call(note, field)) {
      throw new Error(`Pitch canonicalization requires existing ${field} at note ${noteIndex}.`)
    }
  }

  pushOperation(operations, noteIndex, 'midi', note.midi, resolved.midi, operationIdPrefix)
  pushOperation(operations, noteIndex, 'frequency', note.frequency, resolved.frequency, operationIdPrefix)
  pushOperation(operations, noteIndex, 'noteName', note.noteName, resolved.noteName, operationIdPrefix)

  if (
    typeof note.stringLetter === 'string' &&
    note.stringLetter !== '' &&
    Number.isInteger(note.fret)
  ) {
    const candidates = enumerateCanonicalGuitarPositionCandidates({
      ...note,
      midi: resolved.midi,
      frequency: resolved.frequency,
      noteName: resolved.noteName,
    })
    if (candidates.state !== GUITAR_POSITION_CANDIDATE_STATE.CANDIDATES) {
      throw new Error(`Guitar-position canonicalization failed at note ${noteIndex}.`)
    }
    const sameString = candidates.candidates.find(
      (candidate) => candidate.stringLetter === note.stringLetter,
    )
    if (!sameString) {
      throw new Error(`Pitch edit is not playable on the preserved string at note ${noteIndex}.`)
    }
    pushOperation(operations, noteIndex, 'fret', note.fret, sameString.fret, operationIdPrefix)
  }
}

function canonicalBeats(note, noteIndex) {
  if (!Number.isInteger(note.durationValue) || note.durationValue <= 0) {
    throw new Error(`Duration canonicalization requires a positive durationValue at note ${noteIndex}.`)
  }
  if (typeof note.divisions !== 'number' || !Number.isFinite(note.divisions) || note.divisions <= 0) {
    throw new Error(`Duration canonicalization requires existing divisions at note ${noteIndex}.`)
  }
  return note.durationValue / note.divisions
}

function appendDurationDerivations({ operations, rootNote, note, noteIndex, operationIdPrefix }) {
  if (sameValue(rootNote.durationValue, note.durationValue)) return
  if (note.isGrace === true) {
    throw new Error(`Duration canonicalization refuses grace note ${noteIndex}.`)
  }
  for (const field of ['beats', 'duration', 'dotCount']) {
    if (!Object.prototype.hasOwnProperty.call(note, field)) {
      throw new Error(`Duration canonicalization requires existing ${field} at note ${noteIndex}.`)
    }
  }

  const beats = canonicalBeats(note, noteIndex)
  const duration = beatsToDurationId(beats)
  if (Math.abs(durationBeats(duration) - beats) > EPSILON) {
    throw new Error(`Duration canonicalization refuses non-canonical beat value at note ${noteIndex}.`)
  }
  const dotCount = duration.startsWith('dotted-') ? 1 : 0

  pushOperation(operations, noteIndex, 'beats', note.beats, beats, operationIdPrefix)
  pushOperation(operations, noteIndex, 'duration', note.duration, duration, operationIdPrefix)
  pushOperation(operations, noteIndex, 'dotCount', note.dotCount, dotCount, operationIdPrefix)
}

function timelineGroupKey(note) {
  return `${note.partId ?? ''}:${note.measureIndex ?? ''}:${note.voice ?? ''}:${note.staff ?? ''}`
}

function appendTimelineDerivations({ operations, root, current, operationIdPrefix }) {
  const affectedGroups = new Set()
  for (let index = 0; index < current.content.length; index++) {
    if (!sameValue(root.content[index].durationValue, current.content[index].durationValue)) {
      affectedGroups.add(timelineGroupKey(current.content[index]))
    }
  }
  if (affectedGroups.size === 0) return

  for (const groupKey of affectedGroups) {
    const indexes = []
    for (let index = 0; index < current.content.length; index++) {
      if (timelineGroupKey(current.content[index]) === groupKey) indexes.push(index)
    }
    indexes.sort((left, right) => {
      const beatDelta = Number(root.content[left].startBeat) - Number(root.content[right].startBeat)
      return Math.abs(beatDelta) > EPSILON ? beatDelta : left - right
    })
    if (indexes.length === 0) continue

    for (const index of indexes) {
      const rootNote = root.content[index]
      const note = current.content[index]
      if (rootNote.isGrace || note.isGrace || rootNote.isChordNote || note.isChordNote) {
        throw new Error(`Timeline canonicalization refuses grace/chord group ${groupKey}.`)
      }
      if (!Number.isFinite(Number(rootNote.startBeat)) || !Number.isFinite(Number(note.startBeat))) {
        throw new Error(`Timeline canonicalization requires existing startBeat in group ${groupKey}.`)
      }
      if (!Number.isFinite(Number(rootNote.beats)) || Number(rootNote.beats) <= 0) {
        throw new Error(`Timeline canonicalization requires source beats in group ${groupKey}.`)
      }
    }

    let expectedRootBeat = Number(root.content[indexes[0]].startBeat)
    let expectedCurrentBeat = expectedRootBeat
    for (const index of indexes) {
      const rootNote = root.content[index]
      const note = current.content[index]
      if (!sameValue(Number(rootNote.startBeat), expectedRootBeat)) {
        throw new Error(`Timeline canonicalization refuses non-sequential source group ${groupKey}.`)
      }
      pushOperation(operations, index, 'startBeat', note.startBeat, expectedCurrentBeat, operationIdPrefix)
      expectedRootBeat += Number(rootNote.beats)
      expectedCurrentBeat += canonicalBeats(note, index)
    }
  }
}

function buildEvidence({ baseRevision, resultRevision, derivedTargets, createdAt }) {
  return Object.freeze({
    schemaVersion: STAGE_F_CANONICALIZATION_SCHEMA_VERSION,
    state: STAGE_F_CANONICALIZATION_STATE,
    actorId: STAGE_F_CANONICALIZER_ACTOR_ID,
    baseRevisionId: baseRevision.revisionId,
    baseContentFingerprint: baseRevision.contentFingerprint,
    resultRevisionId: resultRevision.revisionId,
    resultContentFingerprint: resultRevision.contentFingerprint,
    derivedOperationCount: derivedTargets.length,
    derivedTargets: Object.freeze([...derivedTargets]),
    createdAt: nullableString(createdAt, 'createdAt'),
  })
}

export function isStageFCanonicalizationEvidence(value) {
  try {
    if (!isPlainObject(value) || !Object.isFrozen(value)) return false
    const keys = Reflect.ownKeys(value)
    if (keys.length !== EVIDENCE_FIELDS.length || keys.some((key) => !EVIDENCE_FIELDS.includes(key))) {
      return false
    }
    if (value.schemaVersion !== STAGE_F_CANONICALIZATION_SCHEMA_VERSION) return false
    if (value.state !== STAGE_F_CANONICALIZATION_STATE) return false
    if (value.actorId !== STAGE_F_CANONICALIZER_ACTOR_ID) return false
    for (const field of [
      'baseRevisionId',
      'baseContentFingerprint',
      'resultRevisionId',
      'resultContentFingerprint',
    ]) {
      if (requiredString(value[field], field) !== value[field]) return false
    }
    if (!Number.isInteger(value.derivedOperationCount) || value.derivedOperationCount < 0) return false
    if (!Array.isArray(value.derivedTargets) || !Object.isFrozen(value.derivedTargets)) return false
    if (value.derivedTargets.length !== value.derivedOperationCount) return false
    if (nullableString(value.createdAt, 'createdAt') !== value.createdAt) return false
    return value.derivedTargets.every(
      (target) => typeof target === 'string' && target.trim() === target && target !== '',
    )
  } catch {
    return false
  }
}

export function canonicalizeStageFRevision({
  history,
  expectation,
  revisionId,
  eventId,
  operationIdPrefix,
  createdAt = null,
} = {}) {
  const { root, current } = assertHistoryScope(history)
  const normalizedOperationIdPrefix = requiredString(operationIdPrefix, 'operationIdPrefix')
  const operations = []

  for (let noteIndex = 0; noteIndex < current.content.length; noteIndex++) {
    const rootNote = root.content[noteIndex]
    const note = current.content[noteIndex]
    assertIdentityStable(rootNote, note, noteIndex)
    appendPitchDerivations({ operations, rootNote, note, noteIndex, operationIdPrefix: normalizedOperationIdPrefix })
    appendDurationDerivations({ operations, rootNote, note, noteIndex, operationIdPrefix: normalizedOperationIdPrefix })
  }
  appendTimelineDerivations({ operations, root, current, operationIdPrefix: normalizedOperationIdPrefix })

  if (operations.length === 0) {
    const evidence = buildEvidence({
      baseRevision: current,
      resultRevision: current,
      derivedTargets: [],
      createdAt,
    })
    return Object.freeze({
      status: STAGE_F_CANONICALIZATION_STATUS.ALREADY_COHERENT,
      conflictReason: null,
      history,
      revision: current,
      auditEvent: null,
      evidence,
    })
  }

  const result = applyTeacherCorrectionWithExpectation({
    history,
    expectation,
    eventId: requiredString(eventId, 'eventId'),
    actorId: STAGE_F_CANONICALIZER_ACTOR_ID,
    revisionId: requiredString(revisionId, 'revisionId'),
    operations,
    createdAt: nullableString(createdAt, 'createdAt'),
  })

  if (result.status === TEACHER_CONCURRENCY_STATUS.CONFLICT) {
    return Object.freeze({
      status: STAGE_F_CANONICALIZATION_STATUS.CONFLICT,
      conflictReason: result.conflictReason,
      history: result.history,
      revision: null,
      auditEvent: null,
      evidence: null,
    })
  }

  const derivedTargets = result.auditEvent.operations.map(
    (operation) => `${operation.path[0]}/${operation.path[1]}`,
  )
  const evidence = buildEvidence({
    baseRevision: current,
    resultRevision: result.revision,
    derivedTargets,
    createdAt,
  })

  return Object.freeze({
    status: STAGE_F_CANONICALIZATION_STATUS.APPLIED,
    conflictReason: null,
    history: result.history,
    revision: result.revision,
    auditEvent: result.auditEvent,
    evidence,
  })
}
