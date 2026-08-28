// Package 8-T4 — lossless immutable revision history and undo domain.
//
// Pure domain layer only. This module preserves T1 revisions, T2 correction
// evidence, T3 approval evidence, and explicit T4 undo evidence. It does not
// persist data, resolve concurrent writes, render UI, authorize sharing, or
// modify OMR/Audiveris/deployment boundaries.

import {
  TEACHER_REVISION_KIND,
  createTeacherCorrectedRevision,
  isTeacherRevision,
} from './teacherRevisionModel.js'
import {
  applyTeacherCorrectionBatch,
  isTeacherCorrectionAuditEvent,
} from './teacherCorrectionOperations.js'
import {
  TEACHER_APPROVAL_APPLICABILITY,
  evaluateTeacherApprovalForRevision,
  isTeacherApprovalRecord,
} from './teacherApprovalModel.js'

export const TEACHER_HISTORY_SCHEMA_VERSION = 1
export const TEACHER_UNDO_SCHEMA_VERSION = 1
export const TEACHER_UNDO_AUDIT_EVENT_TYPE = 'teacher_undo'

const HISTORY_FIELDS = Object.freeze([
  'schemaVersion',
  'historyId',
  'sourceId',
  'sourceRevisionId',
  'createdAt',
  'revisions',
  'correctionAuditEvents',
  'undoAuditEvents',
  'approvalRecords',
])

const UNDO_FIELDS = Object.freeze([
  'schemaVersion',
  'eventType',
  'eventId',
  'actorId',
  'sourceId',
  'sourceRevisionId',
  'parentRevisionId',
  'parentContentFingerprint',
  'parentLineageFingerprint',
  'targetRevisionId',
  'targetContentFingerprint',
  'targetLineageFingerprint',
  'resultRevisionId',
  'resultContentFingerprint',
  'resultLineageFingerprint',
  'createdAt',
])

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

function normalizedTime(value, fieldName = 'createdAt') {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${fieldName} must be null or a non-empty string.`)
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

function assertDenseFrozenArray(value, label) {
  if (!Array.isArray(value) || !Object.isFrozen(value)) {
    throw new TypeError(`${label} must be an immutable array.`)
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError(`${label} must not contain symbol properties.`)
  }

  for (let index = 0; index < value.length; index++) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      throw new TypeError(`${label} must not be sparse.`)
    }
  }

  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (key === 'length') continue
    const index = Number(key)
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= value.length ||
      String(index) !== key ||
      descriptor.enumerable !== true ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      throw new TypeError(`${label} contains an unsupported array property.`)
    }
  }
}

function samePlainData(left, right) {
  if (Object.is(left, right)) return true
  if (typeof left !== typeof right || left === null || right === null) return false

  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => samePlainData(entry, right[index]))
    )
  }

  if (typeof left === 'object') {
    if (!isPlainObject(left) || !isPlainObject(right)) return false
    const leftKeys = Object.keys(left).sort()
    const rightKeys = Object.keys(right).sort()
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key, index) =>
          key === rightKeys[index] && samePlainData(left[key], right[key]),
      )
    )
  }

  return false
}

function freezeArray(entries) {
  return Object.freeze([...entries])
}

function buildHistory({
  historyId,
  sourceId,
  sourceRevisionId,
  createdAt,
  revisions,
  correctionAuditEvents,
  undoAuditEvents,
  approvalRecords,
}) {
  return Object.freeze({
    schemaVersion: TEACHER_HISTORY_SCHEMA_VERSION,
    historyId,
    sourceId,
    sourceRevisionId,
    createdAt,
    revisions: freezeArray(revisions),
    correctionAuditEvents: freezeArray(correctionAuditEvents),
    undoAuditEvents: freezeArray(undoAuditEvents),
    approvalRecords: freezeArray(approvalRecords),
  })
}

function assertSameHistorySource(history, revision) {
  if (
    revision.sourceId !== history.sourceId ||
    revision.sourceRevisionId !== history.sourceRevisionId
  ) {
    throw new Error('Revision belongs to a different teacher history source.')
  }
}

function assertUniqueRevisionIdentity(history, revision) {
  if (history.revisions.some((item) => item.revisionId === revision.revisionId)) {
    throw new Error(`Duplicate revisionId in history: ${revision.revisionId}.`)
  }
  if (
    history.revisions.some(
      (item) => item.lineageFingerprint === revision.lineageFingerprint,
    )
  ) {
    throw new Error('Duplicate revision lineageFingerprint in history.')
  }
}

function assertLinearChild(history, revision) {
  if (!isTeacherRevision(revision)) {
    throw new TypeError('revision must be a valid immutable teacher revision.')
  }
  if (revision.revisionKind !== TEACHER_REVISION_KIND.TEACHER_CORRECTED) {
    throw new TypeError('Only teacher-corrected revisions may follow the automatic root.')
  }

  assertSameHistorySource(history, revision)
  assertUniqueRevisionIdentity(history, revision)

  const parent = history.revisions.at(-1)
  if (
    revision.parentRevisionId !== parent.revisionId ||
    revision.parentLineageFingerprint !== parent.lineageFingerprint
  ) {
    throw new Error('Revision must extend the exact current history revision.')
  }

  return parent
}

function allEventIds(history) {
  return new Set([
    ...history.correctionAuditEvents.map((event) => event.eventId),
    ...history.undoAuditEvents.map((event) => event.eventId),
  ])
}

function assertNewEventId(history, eventId) {
  if (allEventIds(history).has(eventId)) {
    throw new Error(`Duplicate teacher history eventId: ${eventId}.`)
  }
}

function validateCorrectionBinding(parent, revision, auditEvent) {
  if (!isTeacherCorrectionAuditEvent(auditEvent)) {
    throw new TypeError('auditEvent must be a valid immutable teacher correction audit event.')
  }

  if (
    auditEvent.sourceId !== revision.sourceId ||
    auditEvent.sourceRevisionId !== revision.sourceRevisionId ||
    auditEvent.parentRevisionId !== parent.revisionId ||
    auditEvent.parentContentFingerprint !== parent.contentFingerprint ||
    auditEvent.resultRevisionId !== revision.revisionId ||
    auditEvent.resultContentFingerprint !== revision.contentFingerprint
  ) {
    throw new Error('Correction audit event does not bind the exact history transition.')
  }

  const replay = applyTeacherCorrectionBatch({
    eventId: auditEvent.eventId,
    actorId: auditEvent.actorId,
    revisionId: auditEvent.resultRevisionId,
    parentRevision: parent,
    createdAt: auditEvent.createdAt,
    operations: auditEvent.operations.map((operation) => ({
      operationId: operation.operationId,
      kind: operation.kind,
      path: [...operation.path],
      value: operation.after,
    })),
  })

  if (
    replay.revision.createdAt !== revision.createdAt ||
    replay.revision.lineageFingerprint !== revision.lineageFingerprint ||
    !samePlainData(replay.auditEvent.operations, auditEvent.operations)
  ) {
    throw new Error('Correction audit operations do not reproduce the exact history transition.')
  }
}

function validateUndoBinding(parent, revision, auditEvent, revisions) {
  if (!isTeacherUndoAuditEvent(auditEvent)) {
    throw new TypeError('auditEvent must be a valid immutable teacher undo audit event.')
  }

  const target = revisions.find(
    (item) => item.revisionId === auditEvent.targetRevisionId,
  )
  if (!target) {
    throw new Error('Undo target revision is not preserved in this history.')
  }
  if (target.revisionId === parent.revisionId) {
    throw new Error('Undo target must be an earlier preserved revision, not the current parent.')
  }
  if (target.contentFingerprint === parent.contentFingerprint) {
    throw new Error('Undo target must not reproduce the current parent content.')
  }

  if (
    auditEvent.sourceId !== revision.sourceId ||
    auditEvent.sourceRevisionId !== revision.sourceRevisionId ||
    auditEvent.parentRevisionId !== parent.revisionId ||
    auditEvent.parentContentFingerprint !== parent.contentFingerprint ||
    auditEvent.parentLineageFingerprint !== parent.lineageFingerprint ||
    auditEvent.targetContentFingerprint !== target.contentFingerprint ||
    auditEvent.targetLineageFingerprint !== target.lineageFingerprint ||
    auditEvent.resultRevisionId !== revision.revisionId ||
    auditEvent.resultContentFingerprint !== revision.contentFingerprint ||
    auditEvent.resultLineageFingerprint !== revision.lineageFingerprint ||
    revision.contentFingerprint !== target.contentFingerprint
  ) {
    throw new Error('Undo audit event does not bind the exact lossless history transition.')
  }
}

function validateHistory(value) {
  assertExactFrozenRecord(value, HISTORY_FIELDS, 'teacher history')
  if (value.schemaVersion !== TEACHER_HISTORY_SCHEMA_VERSION) return false

  const historyId = requiredId(value.historyId, 'historyId')
  const sourceId = requiredId(value.sourceId, 'sourceId')
  const sourceRevisionId = requiredId(value.sourceRevisionId, 'sourceRevisionId')
  const createdAt = normalizedTime(value.createdAt)
  if (
    historyId !== value.historyId ||
    sourceId !== value.sourceId ||
    sourceRevisionId !== value.sourceRevisionId ||
    createdAt !== value.createdAt
  ) {
    return false
  }

  assertDenseFrozenArray(value.revisions, 'history revisions')
  assertDenseFrozenArray(value.correctionAuditEvents, 'correction audit events')
  assertDenseFrozenArray(value.undoAuditEvents, 'undo audit events')
  assertDenseFrozenArray(value.approvalRecords, 'approval records')
  if (value.revisions.length === 0) return false

  const root = value.revisions[0]
  if (
    !isTeacherRevision(root) ||
    root.revisionKind !== TEACHER_REVISION_KIND.AUTOMATIC ||
    root.sourceId !== sourceId ||
    root.sourceRevisionId !== sourceRevisionId ||
    root.revisionId !== sourceRevisionId
  ) {
    return false
  }

  const revisionIds = new Set()
  const lineageIds = new Set()
  for (let index = 0; index < value.revisions.length; index++) {
    const revision = value.revisions[index]
    if (!isTeacherRevision(revision)) return false
    if (
      revision.sourceId !== sourceId ||
      revision.sourceRevisionId !== sourceRevisionId ||
      revisionIds.has(revision.revisionId) ||
      lineageIds.has(revision.lineageFingerprint)
    ) {
      return false
    }
    revisionIds.add(revision.revisionId)
    lineageIds.add(revision.lineageFingerprint)

    if (index > 0) {
      const parent = value.revisions[index - 1]
      if (
        revision.revisionKind !== TEACHER_REVISION_KIND.TEACHER_CORRECTED ||
        revision.parentRevisionId !== parent.revisionId ||
        revision.parentLineageFingerprint !== parent.lineageFingerprint
      ) {
        return false
      }
    }
  }

  const resultEvents = new Map()
  const eventIds = new Set()

  for (const event of value.correctionAuditEvents) {
    if (!isTeacherCorrectionAuditEvent(event)) return false
    if (eventIds.has(event.eventId)) return false
    eventIds.add(event.eventId)
    if (
      event.sourceId !== sourceId ||
      event.sourceRevisionId !== sourceRevisionId ||
      resultEvents.has(event.resultRevisionId)
    ) {
      return false
    }
    resultEvents.set(event.resultRevisionId, { kind: 'correction', event })
  }

  for (const event of value.undoAuditEvents) {
    if (!isTeacherUndoAuditEvent(event)) return false
    if (eventIds.has(event.eventId)) return false
    eventIds.add(event.eventId)
    if (
      event.sourceId !== sourceId ||
      event.sourceRevisionId !== sourceRevisionId ||
      resultEvents.has(event.resultRevisionId)
    ) {
      return false
    }
    resultEvents.set(event.resultRevisionId, { kind: 'undo', event })
  }

  if (resultEvents.size !== value.revisions.length - 1) return false

  for (let index = 1; index < value.revisions.length; index++) {
    const parent = value.revisions[index - 1]
    const revision = value.revisions[index]
    const result = resultEvents.get(revision.revisionId)
    if (!result) return false

    try {
      if (result.kind === 'correction') {
        validateCorrectionBinding(parent, revision, result.event)
      } else {
        validateUndoBinding(parent, revision, result.event, value.revisions.slice(0, index))
      }
    } catch {
      return false
    }
  }

  const approvalIds = new Set()
  for (const approval of value.approvalRecords) {
    if (!isTeacherApprovalRecord(approval) || approvalIds.has(approval.approvalId)) {
      return false
    }
    approvalIds.add(approval.approvalId)
    if (
      approval.sourceId !== sourceId ||
      approval.sourceRevisionId !== sourceRevisionId
    ) {
      return false
    }
    const approvedRevision = value.revisions.find(
      (revision) => revision.revisionId === approval.approvedRevisionId,
    )
    if (!approvedRevision) return false
    try {
      if (
        evaluateTeacherApprovalForRevision({ approval, revision: approvedRevision }) !==
        TEACHER_APPROVAL_APPLICABILITY.APPROVED_EXACT_REVISION
      ) {
        return false
      }
    } catch {
      return false
    }
  }

  return true
}

export function isTeacherRevisionHistory(value) {
  try {
    return validateHistory(value)
  } catch {
    return false
  }
}

export function createTeacherRevisionHistory({
  historyId,
  automaticRevision,
  createdAt = null,
} = {}) {
  const normalizedHistoryId = requiredId(historyId, 'historyId')
  const normalizedCreatedAt = normalizedTime(createdAt)

  if (
    !isTeacherRevision(automaticRevision) ||
    automaticRevision.revisionKind !== TEACHER_REVISION_KIND.AUTOMATIC
  ) {
    throw new TypeError('automaticRevision must be a valid immutable automatic revision.')
  }

  return buildHistory({
    historyId: normalizedHistoryId,
    sourceId: automaticRevision.sourceId,
    sourceRevisionId: automaticRevision.sourceRevisionId,
    createdAt: normalizedCreatedAt,
    revisions: [automaticRevision],
    correctionAuditEvents: [],
    undoAuditEvents: [],
    approvalRecords: [],
  })
}

export function getCurrentTeacherRevision(history) {
  if (!isTeacherRevisionHistory(history)) {
    throw new TypeError('history must be a valid immutable teacher revision history.')
  }
  return history.revisions.at(-1)
}

export function getTeacherRevisionFromHistory({ history, revisionId } = {}) {
  if (!isTeacherRevisionHistory(history)) {
    throw new TypeError('history must be a valid immutable teacher revision history.')
  }
  const normalizedRevisionId = requiredId(revisionId, 'revisionId')
  return history.revisions.find((revision) => revision.revisionId === normalizedRevisionId) ?? null
}

export function appendTeacherCorrectionToHistory({
  history,
  revision,
  auditEvent,
} = {}) {
  if (!isTeacherRevisionHistory(history)) {
    throw new TypeError('history must be a valid immutable teacher revision history.')
  }

  const parent = assertLinearChild(history, revision)
  validateCorrectionBinding(parent, revision, auditEvent)
  assertNewEventId(history, auditEvent.eventId)

  return buildHistory({
    ...history,
    revisions: [...history.revisions, revision],
    correctionAuditEvents: [...history.correctionAuditEvents, auditEvent],
  })
}

export function appendTeacherApprovalToHistory({ history, approval } = {}) {
  if (!isTeacherRevisionHistory(history)) {
    throw new TypeError('history must be a valid immutable teacher revision history.')
  }
  if (!isTeacherApprovalRecord(approval)) {
    throw new TypeError('approval must be a valid immutable teacher approval record.')
  }
  if (history.approvalRecords.some((item) => item.approvalId === approval.approvalId)) {
    throw new Error(`Duplicate approvalId in history: ${approval.approvalId}.`)
  }
  if (
    approval.sourceId !== history.sourceId ||
    approval.sourceRevisionId !== history.sourceRevisionId
  ) {
    throw new Error('Approval belongs to a different teacher history source.')
  }

  const revision = history.revisions.find(
    (item) => item.revisionId === approval.approvedRevisionId,
  )
  if (!revision) {
    throw new Error('Approved revision is not preserved in this history.')
  }
  if (
    evaluateTeacherApprovalForRevision({ approval, revision }) !==
    TEACHER_APPROVAL_APPLICABILITY.APPROVED_EXACT_REVISION
  ) {
    throw new Error('Approval does not bind the exact preserved history revision.')
  }

  return buildHistory({
    ...history,
    approvalRecords: [...history.approvalRecords, approval],
  })
}

export function isTeacherUndoAuditEvent(value) {
  try {
    assertExactFrozenRecord(value, UNDO_FIELDS, 'undo audit event')
    if (value.schemaVersion !== TEACHER_UNDO_SCHEMA_VERSION) return false
    if (value.eventType !== TEACHER_UNDO_AUDIT_EVENT_TYPE) return false

    for (const field of [
      'eventId',
      'actorId',
      'sourceId',
      'sourceRevisionId',
      'parentRevisionId',
      'parentContentFingerprint',
      'parentLineageFingerprint',
      'targetRevisionId',
      'targetContentFingerprint',
      'targetLineageFingerprint',
      'resultRevisionId',
      'resultContentFingerprint',
      'resultLineageFingerprint',
    ]) {
      if (requiredId(value[field], field) !== value[field]) return false
    }

    if (normalizedTime(value.createdAt) !== value.createdAt) return false
    if (value.parentRevisionId === value.resultRevisionId) return false
    if (value.targetRevisionId === value.resultRevisionId) return false
    return true
  } catch {
    return false
  }
}

export function undoTeacherRevisionHistory({
  history,
  targetRevisionId,
  revisionId,
  eventId,
  actorId,
  createdAt = null,
} = {}) {
  if (!isTeacherRevisionHistory(history)) {
    throw new TypeError('history must be a valid immutable teacher revision history.')
  }

  const normalizedTargetRevisionId = requiredId(targetRevisionId, 'targetRevisionId')
  const normalizedEventId = requiredId(eventId, 'eventId')
  const normalizedActorId = requiredId(actorId, 'actorId')
  const normalizedCreatedAt = normalizedTime(createdAt)
  assertNewEventId(history, normalizedEventId)

  const parent = history.revisions.at(-1)
  const targetIndex = history.revisions.findIndex(
    (revision) => revision.revisionId === normalizedTargetRevisionId,
  )
  if (targetIndex < 0) {
    throw new Error('Undo target revision is not preserved in this history.')
  }
  if (targetIndex === history.revisions.length - 1) {
    throw new Error('Undo target must be an earlier preserved revision.')
  }

  const target = history.revisions[targetIndex]
  if (target.contentFingerprint === parent.contentFingerprint) {
    throw new Error('Undo target has the same content as the current revision.')
  }

  const revision = createTeacherCorrectedRevision({
    revisionId,
    parentRevision: parent,
    content: target.content,
    createdAt: normalizedCreatedAt,
  })
  assertUniqueRevisionIdentity(history, revision)

  const auditEvent = Object.freeze({
    schemaVersion: TEACHER_UNDO_SCHEMA_VERSION,
    eventType: TEACHER_UNDO_AUDIT_EVENT_TYPE,
    eventId: normalizedEventId,
    actorId: normalizedActorId,
    sourceId: history.sourceId,
    sourceRevisionId: history.sourceRevisionId,
    parentRevisionId: parent.revisionId,
    parentContentFingerprint: parent.contentFingerprint,
    parentLineageFingerprint: parent.lineageFingerprint,
    targetRevisionId: target.revisionId,
    targetContentFingerprint: target.contentFingerprint,
    targetLineageFingerprint: target.lineageFingerprint,
    resultRevisionId: revision.revisionId,
    resultContentFingerprint: revision.contentFingerprint,
    resultLineageFingerprint: revision.lineageFingerprint,
    createdAt: normalizedCreatedAt,
  })

  validateUndoBinding(parent, revision, auditEvent, history.revisions)

  const nextHistory = buildHistory({
    ...history,
    revisions: [...history.revisions, revision],
    undoAuditEvents: [...history.undoAuditEvents, auditEvent],
  })

  return Object.freeze({
    history: nextHistory,
    revision,
    auditEvent,
  })
}
