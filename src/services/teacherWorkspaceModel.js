// Package 8-T6 — accessible teacher workspace adapter over T1-T5.
//
// This module does not create a second musical truth engine. It exposes a
// bounded UI-facing model around the existing immutable revision, correction,
// approval, history/undo, and optimistic-concurrency contracts. It introduces
// no persistence, authentication, sharing, OMR/Audiveris, or deployment logic.

import { createAutomaticRevision } from './teacherRevisionModel.js'
import {
  TEACHER_APPROVAL_APPLICABILITY,
  createTeacherApprovalRecord,
  evaluateTeacherApprovalForRevision,
} from './teacherApprovalModel.js'
import {
  createTeacherRevisionHistory,
  getCurrentTeacherRevision,
  isTeacherRevisionHistory,
} from './teacherRevisionHistory.js'
import {
  TEACHER_CONCURRENCY_CONFLICT,
  TEACHER_CONCURRENCY_STATUS,
  appendTeacherApprovalWithExpectation,
  applyTeacherCorrectionWithExpectation,
  createTeacherHistoryExpectation,
  evaluateTeacherHistoryExpectation,
  isTeacherHistoryExpectation,
  undoTeacherRevisionHistoryWithExpectation,
} from './teacherRevisionConcurrency.js'

export const TEACHER_WORKSPACE_SCHEMA_VERSION = 1

export const TEACHER_WORKSPACE_STATE = Object.freeze({
  ACTIVE: 'active',
  CONFLICT: 'conflict',
})

// Direct NoteObject fields only. Source identity, confidence/verification,
// measureKey/part/measure identity, raw evidence, and arbitrary nested JSON are
// deliberately not exposed by the bounded T6 editor. T6 does not recalculate
// dependent musical fields or quality evidence; every correction remains a
// teacher revision that requires the existing validation/quality boundary
// before any later definitive consumer or sharing decision.
export const TEACHER_EDITABLE_NOTE_FIELDS = Object.freeze([
  'step',
  'alter',
  'octave',
  'string',
  'fret',
  'noteName',
  'midi',
  'frequency',
  'duration',
  'beats',
  'durationValue',
  'dotCount',
  'voice',
  'staff',
  'tieStart',
  'tieStop',
  'tieContinue',
])

const WORKSPACE_FIELDS = Object.freeze([
  'schemaVersion',
  'state',
  'actorId',
  'history',
  'expectation',
  'conflictReason',
])

const FIELD_LABELS = Object.freeze({
  step: 'Nota harfi',
  alter: 'Arıza değeri',
  octave: 'Oktav',
  string: 'Gitar teli',
  fret: 'Perde',
  noteName: 'Nota adı',
  midi: 'MIDI değeri',
  frequency: 'Frekans',
  duration: 'Süre kimliği',
  beats: 'Vuruş',
  durationValue: 'MusicXML süre değeri',
  dotCount: 'Nokta sayısı',
  voice: 'Ses',
  staff: 'Porte',
  tieStart: 'Uzatma bağı başlangıcı',
  tieStop: 'Uzatma bağı sonu',
  tieContinue: 'Uzatma bağı devamı',
})

function requiredId(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${fieldName} must be a non-empty string.`)
  }
  return value.trim()
}

function normalizedTime(value) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError('createdAt must be null or a non-empty string.')
  }
  return value.trim()
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function assertWorkspaceShape(value) {
  if (!isPlainObject(value) || !Object.isFrozen(value)) return false
  const keys = Reflect.ownKeys(value)
  if (
    keys.length !== WORKSPACE_FIELDS.length ||
    keys.some((key) => typeof key !== 'string' || !WORKSPACE_FIELDS.includes(key))
  ) {
    return false
  }

  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (
    !WORKSPACE_FIELDS.every((field) => {
      const descriptor = descriptors[field]
      return Boolean(
        descriptor &&
          descriptor.enumerable &&
          descriptor.configurable === false &&
          descriptor.writable === false &&
          Object.prototype.hasOwnProperty.call(descriptor, 'value'),
      )
    })
  ) {
    return false
  }

  if (!Object.values(TEACHER_WORKSPACE_STATE).includes(value.state)) return false
  if (requiredId(value.actorId, 'actorId') !== value.actorId) return false
  if (!isTeacherRevisionHistory(value.history)) return false
  if (!isTeacherHistoryExpectation(value.expectation)) return false
  if (value.state === TEACHER_WORKSPACE_STATE.ACTIVE && value.conflictReason !== null) {
    return false
  }
  if (
    value.state === TEACHER_WORKSPACE_STATE.CONFLICT &&
    (typeof value.conflictReason !== 'string' || value.conflictReason.trim() === '')
  ) {
    return false
  }
  return true
}

function buildWorkspace({ state, actorId, history, expectation, conflictReason }) {
  return Object.freeze({
    schemaVersion: TEACHER_WORKSPACE_SCHEMA_VERSION,
    state,
    actorId,
    history,
    expectation,
    conflictReason,
  })
}

function requireWorkspace(workspace) {
  if (!isTeacherWorkspace(workspace)) {
    throw new TypeError('workspace must be a valid immutable teacher workspace.')
  }
  return workspace
}

function requireActiveWorkspace(workspace) {
  requireWorkspace(workspace)
  if (workspace.state === TEACHER_WORKSPACE_STATE.CONFLICT) {
    throw new Error('Teacher workspace conflict requires explicit refresh before another mutation.')
  }
  return workspace
}

function fieldType(value) {
  if (typeof value === 'string') return 'string'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number' && Number.isFinite(value)) return 'number'
  return null
}

function fieldKey(noteIndex, field) {
  return `${noteIndex}:${field}`
}

function conflictWorkspace(workspace, history, conflictReason) {
  return buildWorkspace({
    state: TEACHER_WORKSPACE_STATE.CONFLICT,
    actorId: workspace.actorId,
    history,
    // Keep the submitted stale expectation until the teacher explicitly
    // refreshes. This prevents a second call from silently rebasing/retrying.
    expectation: workspace.expectation,
    conflictReason,
  })
}

function appliedWorkspace(workspace, result) {
  return buildWorkspace({
    state: TEACHER_WORKSPACE_STATE.ACTIVE,
    actorId: workspace.actorId,
    history: result.history,
    expectation: result.expectation,
    conflictReason: null,
  })
}

function preflightExpectation(workspace) {
  const evaluation = evaluateTeacherHistoryExpectation({
    history: workspace.history,
    expectation: workspace.expectation,
  })
  if (evaluation.status === TEACHER_CONCURRENCY_STATUS.CONFLICT) {
    return conflictWorkspace(workspace, workspace.history, evaluation.conflictReason)
  }
  return null
}

export function isTeacherWorkspace(value) {
  try {
    return value?.schemaVersion === TEACHER_WORKSPACE_SCHEMA_VERSION && assertWorkspaceShape(value)
  } catch {
    return false
  }
}

/**
 * Start one in-memory teacher workspace from an exact source snapshot.
 * All identifiers/timestamps are supplied by the caller; the T6 model invents
 * none. `actorId` is an audit label only and is not authentication.
 */
export function createTeacherWorkspace({
  content,
  actorId,
  sourceId,
  automaticRevisionId,
  historyId,
  createdAt = null,
} = {}) {
  const normalizedActorId = requiredId(actorId, 'actorId')
  const normalizedCreatedAt = normalizedTime(createdAt)

  const automaticRevision = createAutomaticRevision({
    revisionId: automaticRevisionId,
    sourceId,
    content,
    createdAt: normalizedCreatedAt,
  })
  const history = createTeacherRevisionHistory({
    historyId,
    automaticRevision,
    createdAt: normalizedCreatedAt,
  })

  return buildWorkspace({
    state: TEACHER_WORKSPACE_STATE.ACTIVE,
    actorId: normalizedActorId,
    history,
    expectation: createTeacherHistoryExpectation(history),
    conflictReason: null,
  })
}

export function getTeacherWorkspaceCurrentRevision(workspace) {
  requireWorkspace(workspace)
  return getCurrentTeacherRevision(workspace.history)
}

export function getTeacherWorkspaceApplicableApproval(workspace) {
  requireWorkspace(workspace)
  const revision = getCurrentTeacherRevision(workspace.history)
  for (let index = workspace.history.approvalRecords.length - 1; index >= 0; index--) {
    const approval = workspace.history.approvalRecords[index]
    if (
      evaluateTeacherApprovalForRevision({ approval, revision }) ===
      TEACHER_APPROVAL_APPLICABILITY.APPROVED_EXACT_REVISION
    ) {
      return approval
    }
  }
  return null
}

/**
 * Return only direct primitive NoteObject fields approved for the bounded T6
 * editor. Identity/evidence fields and nested/raw data are never exposed.
 */
export function listTeacherEditableFields(workspace) {
  const revision = getTeacherWorkspaceCurrentRevision(workspace)
  if (!Array.isArray(revision.content)) return Object.freeze([])

  const fields = []
  for (let noteIndex = 0; noteIndex < revision.content.length; noteIndex++) {
    const note = revision.content[noteIndex]
    if (!isPlainObject(note)) continue

    for (const field of TEACHER_EDITABLE_NOTE_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(note, field)) continue
      const value = note[field]
      const valueType = fieldType(value)
      if (!valueType) continue

      fields.push(
        Object.freeze({
          key: fieldKey(noteIndex, field),
          noteIndex,
          field,
          path: Object.freeze([noteIndex, field]),
          value,
          valueType,
          label: `Nota ${noteIndex + 1} — ${FIELD_LABELS[field] ?? field}`,
        }),
      )
    }
  }

  return Object.freeze(fields)
}

export function parseTeacherEditableValue(descriptor, rawValue) {
  if (!descriptor || !TEACHER_EDITABLE_NOTE_FIELDS.includes(descriptor.field)) {
    throw new TypeError('A supported editable field descriptor is required.')
  }

  if (descriptor.valueType === 'string') {
    if (typeof rawValue !== 'string') throw new TypeError('String field requires text input.')
    return rawValue
  }

  if (descriptor.valueType === 'number') {
    if (typeof rawValue === 'string' && rawValue.trim() === '') {
      throw new TypeError('Numeric field requires a finite number.')
    }
    const value = typeof rawValue === 'number' ? rawValue : Number(String(rawValue).trim())
    if (!Number.isFinite(value)) throw new TypeError('Numeric field requires a finite number.')
    return Object.is(value, -0) ? 0 : value
  }

  if (descriptor.valueType === 'boolean') {
    if (rawValue === true || rawValue === 'true') return true
    if (rawValue === false || rawValue === 'false') return false
    throw new TypeError('Boolean field requires true or false.')
  }

  throw new TypeError('Unsupported editable field type.')
}

export function applyTeacherWorkspaceCorrection({
  workspace,
  fieldKey: selectedFieldKey,
  value,
  revisionId,
  eventId,
  operationId,
  createdAt = null,
} = {}) {
  requireActiveWorkspace(workspace)
  const descriptor = listTeacherEditableFields(workspace).find(
    (field) => field.key === selectedFieldKey,
  )
  if (!descriptor) throw new Error('Selected teacher-editable field is not available.')

  const result = applyTeacherCorrectionWithExpectation({
    history: workspace.history,
    expectation: workspace.expectation,
    eventId,
    actorId: workspace.actorId,
    revisionId,
    createdAt: normalizedTime(createdAt),
    operations: [
      {
        operationId: requiredId(operationId, 'operationId'),
        kind: 'replace_value',
        path: [...descriptor.path],
        value: parseTeacherEditableValue(descriptor, value),
      },
    ],
  })

  if (result.status === TEACHER_CONCURRENCY_STATUS.CONFLICT) {
    return conflictWorkspace(workspace, result.history, result.conflictReason)
  }
  return appliedWorkspace(workspace, result)
}

export function approveTeacherWorkspace({
  workspace,
  approvalId,
  createdAt = null,
} = {}) {
  requireActiveWorkspace(workspace)

  // T5 approval append receives an already-created T3 record. Preflight first
  // so a stale UI never even creates local approval evidence before conflict.
  const conflict = preflightExpectation(workspace)
  if (conflict) return conflict
  if (getTeacherWorkspaceApplicableApproval(workspace)) {
    throw new Error('The exact current revision is already teacher-approved in this workspace.')
  }

  const revision = getCurrentTeacherRevision(workspace.history)
  const approval = createTeacherApprovalRecord({
    approvalId,
    actorId: workspace.actorId,
    revision,
    createdAt: normalizedTime(createdAt),
  })
  const result = appendTeacherApprovalWithExpectation({
    history: workspace.history,
    expectation: workspace.expectation,
    approval,
  })

  if (result.status === TEACHER_CONCURRENCY_STATUS.CONFLICT) {
    return conflictWorkspace(workspace, result.history, result.conflictReason)
  }
  return appliedWorkspace(workspace, result)
}

export function undoTeacherWorkspace({
  workspace,
  targetRevisionId,
  revisionId,
  eventId,
  createdAt = null,
} = {}) {
  requireActiveWorkspace(workspace)
  const result = undoTeacherRevisionHistoryWithExpectation({
    history: workspace.history,
    expectation: workspace.expectation,
    targetRevisionId,
    revisionId,
    eventId,
    actorId: workspace.actorId,
    createdAt: normalizedTime(createdAt),
  })

  if (result.status === TEACHER_CONCURRENCY_STATUS.CONFLICT) {
    return conflictWorkspace(workspace, result.history, result.conflictReason)
  }
  return appliedWorkspace(workspace, result)
}

/**
 * Accept a newer authoritative history without silently refreshing the old UI
 * expectation. The next attempted mutation must conflict until the teacher
 * explicitly refreshes the workspace.
 */
export function withTeacherWorkspaceAuthoritativeHistory({ workspace, history } = {}) {
  requireWorkspace(workspace)
  if (!isTeacherRevisionHistory(history)) {
    throw new TypeError('history must be a valid immutable teacher revision history.')
  }

  return buildWorkspace({
    state: workspace.state,
    actorId: workspace.actorId,
    history,
    expectation: workspace.expectation,
    conflictReason: workspace.conflictReason,
  })
}

export function refreshTeacherWorkspace(workspace) {
  requireWorkspace(workspace)
  if (
    workspace.state === TEACHER_WORKSPACE_STATE.CONFLICT &&
    (workspace.conflictReason === TEACHER_CONCURRENCY_CONFLICT.HISTORY_MISMATCH ||
      workspace.conflictReason === TEACHER_CONCURRENCY_CONFLICT.SOURCE_MISMATCH)
  ) {
    throw new Error('Teacher workspace identity mismatch requires creating a new workspace.')
  }

  return buildWorkspace({
    state: TEACHER_WORKSPACE_STATE.ACTIVE,
    actorId: workspace.actorId,
    history: workspace.history,
    expectation: createTeacherHistoryExpectation(workspace.history),
    conflictReason: null,
  })
}
