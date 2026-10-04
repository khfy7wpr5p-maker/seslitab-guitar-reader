import {
  assertStrictInputObject,
  isStrictFrozenRecord,
  normalizeNullableTimestamp,
  normalizeRequiredId,
  normalizeRequiredText,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

export const STUDENT_WORK_REQUEST_SCHEMA_VERSION = 1
export const STUDENT_WORK_REQUEST_STATE = Object.freeze({
  PENDING: 'PENDING',
  CONVERTED: 'CONVERTED',
  REVOKED: 'REVOKED',
})
export const STUDENT_WORK_REQUEST_TARGET = Object.freeze({
  ACTIVE: 'ACTIVE',
  REPERTOIRE: 'REPERTOIRE',
})
export const STUDENT_WORK_REQUEST_MAX_TITLE_LENGTH = 200

const INPUT_FIELDS = Object.freeze([
  'requestId',
  'teacherId',
  'studentId',
  'title',
  'state',
  'requestedAt',
  'updatedAt',
  'pieceAssignmentId',
  'targetState',
  'revokedAt',
])
const RECORD_FIELDS = Object.freeze([
  'schemaVersion',
  ...INPUT_FIELDS,
])

function normalizeNullableId(value, fieldName) {
  return value === null || value === undefined
    ? null
    : normalizeRequiredId(value, fieldName)
}

function normalizeState(value) {
  if (!Object.values(STUDENT_WORK_REQUEST_STATE).includes(value)) {
    throw new TypeError('state is unsupported.')
  }
  return value
}

function normalizeTarget(value) {
  if (value === null || value === undefined) return null
  if (!Object.values(STUDENT_WORK_REQUEST_TARGET).includes(value)) {
    throw new TypeError('targetState is unsupported.')
  }
  return value
}

function transitionInput(current, overrides) {
  return {
    requestId: current.requestId,
    teacherId: current.teacherId,
    studentId: current.studentId,
    title: current.title,
    state: current.state,
    requestedAt: current.requestedAt,
    updatedAt: current.updatedAt,
    pieceAssignmentId: current.pieceAssignmentId,
    targetState: current.targetState,
    revokedAt: current.revokedAt,
    ...overrides,
  }
}

export function createStudentWorkRequest(input = {}) {
  assertStrictInputObject(input, INPUT_FIELDS, 'StudentWorkRequest')
  const state = normalizeState(input.state)
  const pieceAssignmentId = normalizeNullableId(
    input.pieceAssignmentId,
    'pieceAssignmentId',
  )
  const targetState = normalizeTarget(input.targetState)
  const revokedAt = normalizeNullableTimestamp(input.revokedAt, 'revokedAt')

  if (
    state === STUDENT_WORK_REQUEST_STATE.PENDING &&
    (pieceAssignmentId !== null || targetState !== null || revokedAt !== null)
  ) {
    throw new Error('PENDING work request cannot contain terminal fields.')
  }
  if (
    state === STUDENT_WORK_REQUEST_STATE.CONVERTED &&
    (pieceAssignmentId === null || targetState === null || revokedAt !== null)
  ) {
    throw new Error('CONVERTED work request requires Piece evidence and no revoke.')
  }
  if (
    state === STUDENT_WORK_REQUEST_STATE.REVOKED &&
    (pieceAssignmentId !== null || targetState !== null || revokedAt === null)
  ) {
    throw new Error('REVOKED work request requires revokedAt only.')
  }

  return Object.freeze({
    schemaVersion: STUDENT_WORK_REQUEST_SCHEMA_VERSION,
    requestId: normalizeRequiredId(input.requestId, 'requestId'),
    teacherId: normalizeRequiredId(input.teacherId, 'teacherId'),
    studentId: normalizeRequiredId(input.studentId, 'studentId'),
    title: normalizeRequiredText(
      input.title,
      'title',
      STUDENT_WORK_REQUEST_MAX_TITLE_LENGTH,
    ),
    state,
    requestedAt: normalizeRequiredTimestamp(input.requestedAt, 'requestedAt'),
    updatedAt: normalizeRequiredTimestamp(input.updatedAt, 'updatedAt'),
    pieceAssignmentId,
    targetState,
    revokedAt,
  })
}

export function createPendingStudentWorkRequest({
  requestId,
  teacherId,
  studentId,
  title,
  requestedAt,
}) {
  return createStudentWorkRequest({
    requestId,
    teacherId,
    studentId,
    title,
    state: STUDENT_WORK_REQUEST_STATE.PENDING,
    requestedAt,
    updatedAt: requestedAt,
    pieceAssignmentId: null,
    targetState: null,
    revokedAt: null,
  })
}

export function convertStudentWorkRequest(
  current,
  { pieceAssignmentId, targetState, changedAt },
) {
  if (!isStudentWorkRequest(current)) {
    throw new TypeError('current work request must be valid.')
  }
  const normalizedPieceId = normalizeRequiredId(
    pieceAssignmentId,
    'pieceAssignmentId',
  )
  const normalizedTarget = normalizeTarget(targetState)
  if (normalizedTarget === null) {
    throw new TypeError('targetState is required for conversion.')
  }
  if (current.state === STUDENT_WORK_REQUEST_STATE.CONVERTED) {
    if (
      current.pieceAssignmentId === normalizedPieceId &&
      current.targetState === normalizedTarget
    ) {
      return current
    }
    throw new Error('work request terminal transition conflict.')
  }
  if (current.state !== STUDENT_WORK_REQUEST_STATE.PENDING) {
    throw new Error('work request cannot be converted from its current state.')
  }
  return createStudentWorkRequest(transitionInput(current, {
    state: STUDENT_WORK_REQUEST_STATE.CONVERTED,
    updatedAt: changedAt,
    pieceAssignmentId: normalizedPieceId,
    targetState: normalizedTarget,
    revokedAt: null,
  }))
}

export function revokeStudentWorkRequest(current, { changedAt }) {
  if (!isStudentWorkRequest(current)) {
    throw new TypeError('current work request must be valid.')
  }
  if (current.state === STUDENT_WORK_REQUEST_STATE.REVOKED) return current
  if (current.state !== STUDENT_WORK_REQUEST_STATE.PENDING) {
    throw new Error('work request cannot be revoked from its current state.')
  }
  const normalizedChangedAt = normalizeRequiredTimestamp(changedAt, 'changedAt')
  return createStudentWorkRequest(transitionInput(current, {
    state: STUDENT_WORK_REQUEST_STATE.REVOKED,
    updatedAt: normalizedChangedAt,
    pieceAssignmentId: null,
    targetState: null,
    revokedAt: normalizedChangedAt,
  }))
}

export function isStudentWorkRequest(value) {
  try {
    return (
      value?.schemaVersion === STUDENT_WORK_REQUEST_SCHEMA_VERSION &&
      isStrictFrozenRecord(value, RECORD_FIELDS) &&
      createStudentWorkRequest({
        requestId: value.requestId,
        teacherId: value.teacherId,
        studentId: value.studentId,
        title: value.title,
        state: value.state,
        requestedAt: value.requestedAt,
        updatedAt: value.updatedAt,
        pieceAssignmentId: value.pieceAssignmentId,
        targetState: value.targetState,
        revokedAt: value.revokedAt,
      }).requestId === value.requestId
    )
  } catch {
    return false
  }
}

// Store boundaries must validate the relationship between valid rows, not just
// their individual shapes. Every terminal replay is the exact same snapshot.
export function assertStudentWorkRequestTransition(current, next) {
  if (!isStudentWorkRequest(current) || !isStudentWorkRequest(next)) {
    throw new TypeError('work request transition rows must be valid.')
  }
  const immutableFields = [
    'schemaVersion', 'requestId', 'teacherId', 'studentId', 'title', 'requestedAt',
  ]
  if (immutableFields.some((field) => current[field] !== next[field])) {
    throw new Error('work request immutable authority transition conflict.')
  }
  if (RECORD_FIELDS.every((field) => current[field] === next[field])) return
  if (current.state !== STUDENT_WORK_REQUEST_STATE.PENDING) {
    throw new Error('work request terminal transition conflict.')
  }
  let expected = current
  if (next.state === STUDENT_WORK_REQUEST_STATE.CONVERTED) {
    expected = convertStudentWorkRequest(current, {
      pieceAssignmentId: next.pieceAssignmentId,
      targetState: next.targetState,
      changedAt: next.updatedAt,
    })
  } else if (next.state === STUDENT_WORK_REQUEST_STATE.REVOKED) {
    expected = revokeStudentWorkRequest(current, { changedAt: next.updatedAt })
  }
  if (!RECORD_FIELDS.every((field) => expected[field] === next[field])) {
    throw new Error('work request transition snapshot conflict.')
  }
}
