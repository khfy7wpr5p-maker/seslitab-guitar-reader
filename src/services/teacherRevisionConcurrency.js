// Package 8-T5 — optimistic concurrency / stale-history protection.
//
// Pure domain layer only. A caller captures an immutable expectation from one
// exact T4 history snapshot and must present it when attempting a correction,
// approval append, or undo. Any intervening valid history change produces an
// explicit conflict instead of a silent overwrite. No automatic merge is
// attempted and no persistence, UI, OMR/Audiveris, or deployment behavior is
// introduced here.

import { applyTeacherCorrectionBatch } from './teacherCorrectionOperations.js'
import {
  appendTeacherApprovalToHistory,
  appendTeacherCorrectionToHistory,
  getCurrentTeacherRevision,
  isTeacherRevisionHistory,
  undoTeacherRevisionHistory,
} from './teacherRevisionHistory.js'

export const TEACHER_CONCURRENCY_SCHEMA_VERSION = 1

export const TEACHER_CONCURRENCY_STATUS = Object.freeze({
  CURRENT: 'current',
  APPLIED: 'applied',
  CONFLICT: 'conflict',
})

export const TEACHER_CONCURRENCY_CONFLICT = Object.freeze({
  HISTORY_MISMATCH: 'history_mismatch',
  SOURCE_MISMATCH: 'source_mismatch',
  STALE_HISTORY: 'stale_history',
})

const EXPECTATION_FIELDS = Object.freeze([
  'schemaVersion',
  'historyId',
  'sourceId',
  'sourceRevisionId',
  'historyStateFingerprint',
  'currentRevisionId',
  'currentContentFingerprint',
  'currentLineageFingerprint',
  'revisionCount',
  'correctionEventCount',
  'undoEventCount',
  'approvalCount',
])

const FNV_1A_64_OFFSET = 0xcbf29ce484222325n
const FNV_1A_64_PRIME = 0x100000001b3n
const UINT64_MASK = 0xffffffffffffffffn

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function requiredId(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${fieldName} must be a non-empty string.`)
  }
  return value.trim()
}

function assertExactFrozenRecord(value, fields, label) {
  if (!isPlainObject(value) || !Object.isFrozen(value)) {
    throw new TypeError(`${label} must be an immutable plain object.`)
  }

  const keys = Reflect.ownKeys(value)
  if (
    keys.length !== fields.length ||
    keys.some((key) => typeof key !== 'string' || !fields.includes(key))
  ) {
    throw new TypeError(`${label} has an unsupported field set.`)
  }

  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const field of fields) {
    const descriptor = descriptors[field]
    if (
      !descriptor ||
      descriptor.enumerable !== true ||
      descriptor.configurable !== false ||
      descriptor.writable !== false ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      throw new TypeError(`${label}.${field} must be an immutable data property.`)
    }
  }
}

function stableSerialize(value) {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('History state contains a non-finite number.')
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`
  }

  if (!isPlainObject(value)) {
    throw new TypeError('History state must contain only plain data.')
  }

  const keys = Object.keys(value).sort()
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
    .join(',')}}`
}

function fnv1a64(text) {
  let hash = FNV_1A_64_OFFSET
  const bytes = new TextEncoder().encode(text)
  for (const byte of bytes) {
    hash ^= BigInt(byte)
    hash = (hash * FNV_1A_64_PRIME) & UINT64_MASK
  }
  return hash.toString(16).padStart(16, '0')
}

function fingerprintHistory(history) {
  const serialized = stableSerialize(history)
  return `teacher-history-fnv1a64-v1:${fnv1a64(serialized)}:${serialized.length}`
}

function validateExpectation(value) {
  assertExactFrozenRecord(value, EXPECTATION_FIELDS, 'teacher history expectation')
  if (value.schemaVersion !== TEACHER_CONCURRENCY_SCHEMA_VERSION) return false

  for (const field of [
    'historyId',
    'sourceId',
    'sourceRevisionId',
    'historyStateFingerprint',
    'currentRevisionId',
    'currentContentFingerprint',
    'currentLineageFingerprint',
  ]) {
    if (requiredId(value[field], field) !== value[field]) return false
  }

  if (!value.historyStateFingerprint.startsWith('teacher-history-fnv1a64-v1:')) {
    return false
  }

  for (const field of [
    'revisionCount',
    'correctionEventCount',
    'undoEventCount',
    'approvalCount',
  ]) {
    if (!Number.isSafeInteger(value[field]) || value[field] < 0) return false
  }
  if (value.revisionCount < 1) return false

  return true
}

export function isTeacherHistoryExpectation(value) {
  try {
    return validateExpectation(value)
  } catch {
    return false
  }
}

export function createTeacherHistoryExpectation(history) {
  if (!isTeacherRevisionHistory(history)) {
    throw new TypeError('history must be a valid immutable teacher revision history.')
  }

  const currentRevision = getCurrentTeacherRevision(history)
  return Object.freeze({
    schemaVersion: TEACHER_CONCURRENCY_SCHEMA_VERSION,
    historyId: history.historyId,
    sourceId: history.sourceId,
    sourceRevisionId: history.sourceRevisionId,
    historyStateFingerprint: fingerprintHistory(history),
    currentRevisionId: currentRevision.revisionId,
    currentContentFingerprint: currentRevision.contentFingerprint,
    currentLineageFingerprint: currentRevision.lineageFingerprint,
    revisionCount: history.revisions.length,
    correctionEventCount: history.correctionAuditEvents.length,
    undoEventCount: history.undoAuditEvents.length,
    approvalCount: history.approvalRecords.length,
  })
}

function sameExpectation(left, right) {
  return EXPECTATION_FIELDS.every((field) => left[field] === right[field])
}

export function evaluateTeacherHistoryExpectation({ history, expectation } = {}) {
  if (!isTeacherRevisionHistory(history)) {
    throw new TypeError('history must be a valid immutable teacher revision history.')
  }
  if (!isTeacherHistoryExpectation(expectation)) {
    throw new TypeError('expectation must be a valid immutable teacher history expectation.')
  }

  const currentExpectation = createTeacherHistoryExpectation(history)
  let conflictReason = null

  if (expectation.historyId !== history.historyId) {
    conflictReason = TEACHER_CONCURRENCY_CONFLICT.HISTORY_MISMATCH
  } else if (
    expectation.sourceId !== history.sourceId ||
    expectation.sourceRevisionId !== history.sourceRevisionId
  ) {
    conflictReason = TEACHER_CONCURRENCY_CONFLICT.SOURCE_MISMATCH
  } else if (!sameExpectation(expectation, currentExpectation)) {
    conflictReason = TEACHER_CONCURRENCY_CONFLICT.STALE_HISTORY
  }

  return Object.freeze({
    status: conflictReason
      ? TEACHER_CONCURRENCY_STATUS.CONFLICT
      : TEACHER_CONCURRENCY_STATUS.CURRENT,
    conflictReason,
    currentExpectation,
  })
}

function buildResult({
  status,
  conflictReason,
  history,
  revision = null,
  auditEvent = null,
  approval = null,
}) {
  return Object.freeze({
    status,
    conflictReason,
    history,
    expectation: createTeacherHistoryExpectation(history),
    revision,
    auditEvent,
    approval,
  })
}

function conflictResult(history, evaluation) {
  return buildResult({
    status: TEACHER_CONCURRENCY_STATUS.CONFLICT,
    conflictReason: evaluation.conflictReason,
    history,
  })
}

export function applyTeacherCorrectionWithExpectation({
  history,
  expectation,
  eventId,
  actorId,
  revisionId,
  operations,
  createdAt = null,
} = {}) {
  const evaluation = evaluateTeacherHistoryExpectation({ history, expectation })
  if (evaluation.status === TEACHER_CONCURRENCY_STATUS.CONFLICT) {
    return conflictResult(history, evaluation)
  }

  const parentRevision = getCurrentTeacherRevision(history)
  const correction = applyTeacherCorrectionBatch({
    eventId,
    actorId,
    revisionId,
    parentRevision,
    operations,
    createdAt,
  })
  const nextHistory = appendTeacherCorrectionToHistory({
    history,
    revision: correction.revision,
    auditEvent: correction.auditEvent,
  })

  return buildResult({
    status: TEACHER_CONCURRENCY_STATUS.APPLIED,
    conflictReason: null,
    history: nextHistory,
    revision: correction.revision,
    auditEvent: correction.auditEvent,
  })
}

export function appendTeacherApprovalWithExpectation({
  history,
  expectation,
  approval,
} = {}) {
  const evaluation = evaluateTeacherHistoryExpectation({ history, expectation })
  if (evaluation.status === TEACHER_CONCURRENCY_STATUS.CONFLICT) {
    return conflictResult(history, evaluation)
  }

  const nextHistory = appendTeacherApprovalToHistory({ history, approval })
  return buildResult({
    status: TEACHER_CONCURRENCY_STATUS.APPLIED,
    conflictReason: null,
    history: nextHistory,
    approval,
  })
}

export function undoTeacherRevisionHistoryWithExpectation({
  history,
  expectation,
  targetRevisionId,
  revisionId,
  eventId,
  actorId,
  createdAt = null,
} = {}) {
  const evaluation = evaluateTeacherHistoryExpectation({ history, expectation })
  if (evaluation.status === TEACHER_CONCURRENCY_STATUS.CONFLICT) {
    return conflictResult(history, evaluation)
  }

  const undo = undoTeacherRevisionHistory({
    history,
    targetRevisionId,
    revisionId,
    eventId,
    actorId,
    createdAt,
  })

  return buildResult({
    status: TEACHER_CONCURRENCY_STATUS.APPLIED,
    conflictReason: null,
    history: undo.history,
    revision: undo.revision,
    auditEvent: undo.auditEvent,
  })
}
