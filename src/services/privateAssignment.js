import { isScoreAssignmentSourceBinding } from './scoreAssignmentSourceBinding.js'
import {
  assertStrictInputObject,
  isStrictFrozenRecord,
  normalizeOptionalText,
  normalizeRequiredId,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

export const PRIVATE_ASSIGNMENT_SCHEMA_VERSION = 1
export const PRIVATE_ASSIGNMENT_MAX_TEACHER_NOTE_LENGTH = 2000

export const PRIVATE_ASSIGNMENT_PRACTICE_TYPE = Object.freeze({
  SCORE: 'SCORE',
  CHORD_BOARD: 'CHORD_BOARD',
})

export const PRIVATE_ASSIGNMENT_STATE = Object.freeze({
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  REPERTOIRE: 'REPERTOIRE',
})

const INPUT_FIELDS = Object.freeze([
  'assignmentId',
  'studentId',
  'practiceType',
  'teacherNote',
  'assignedAt',
  'sourceRef',
])

const RECORD_FIELDS = Object.freeze([
  'schemaVersion',
  'assignmentId',
  'studentId',
  'practiceType',
  'teacherNote',
  'state',
  'assignedAt',
  'revokedAt',
  'sourceRef',
])

const ALLOWED_TRANSITIONS = Object.freeze({
  [PRIVATE_ASSIGNMENT_STATE.ACTIVE]: Object.freeze([
    PRIVATE_ASSIGNMENT_STATE.COMPLETED,
  ]),
  [PRIVATE_ASSIGNMENT_STATE.COMPLETED]: Object.freeze([
    PRIVATE_ASSIGNMENT_STATE.REPERTOIRE,
  ]),
  [PRIVATE_ASSIGNMENT_STATE.REPERTOIRE]: Object.freeze([]),
})

export function isAllowedTeacherAssignmentTransition(fromState, toState) {
  return Boolean(ALLOWED_TRANSITIONS[fromState]?.includes(toState))
}

export function createPrivateAssignment(input = {}) {
  assertStrictInputObject(input, INPUT_FIELDS, 'PrivateAssignment')

  const assignmentId = normalizeRequiredId(input.assignmentId, 'assignmentId')
  const studentId = normalizeRequiredId(input.studentId, 'studentId')

  if (!Object.values(PRIVATE_ASSIGNMENT_PRACTICE_TYPE).includes(input.practiceType)) {
    throw new TypeError('practiceType must be SCORE or CHORD_BOARD.')
  }

  if (input.practiceType === PRIVATE_ASSIGNMENT_PRACTICE_TYPE.CHORD_BOARD) {
    throw new Error('chord-board-source-contract-deferred-to-td-07')
  }

  if (!isScoreAssignmentSourceBinding(input.sourceRef)) {
    throw new TypeError('sourceRef must be a valid immutable SCORE assignment source binding.')
  }
  if (input.sourceRef.studentId !== studentId) {
    throw new Error('PrivateAssignment studentId must match sourceRef studentId.')
  }

  return Object.freeze({
    schemaVersion: PRIVATE_ASSIGNMENT_SCHEMA_VERSION,
    assignmentId,
    studentId,
    practiceType: input.practiceType,
    teacherNote: normalizeOptionalText(
      input.teacherNote,
      'teacherNote',
      PRIVATE_ASSIGNMENT_MAX_TEACHER_NOTE_LENGTH,
    ),
    state: PRIVATE_ASSIGNMENT_STATE.ACTIVE,
    assignedAt: normalizeRequiredTimestamp(input.assignedAt, 'assignedAt'),
    revokedAt: null,
    sourceRef: input.sourceRef,
  })
}

export function isPrivateAssignment(value) {
  try {
    if (
      value?.schemaVersion !== PRIVATE_ASSIGNMENT_SCHEMA_VERSION ||
      !isStrictFrozenRecord(value, RECORD_FIELDS) ||
      value.practiceType !== PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE ||
      value.state !== PRIVATE_ASSIGNMENT_STATE.ACTIVE ||
      value.revokedAt !== null ||
      !isScoreAssignmentSourceBinding(value.sourceRef)
    ) {
      return false
    }

    if (normalizeRequiredId(value.assignmentId, 'assignmentId') !== value.assignmentId) {
      return false
    }
    if (normalizeRequiredId(value.studentId, 'studentId') !== value.studentId) {
      return false
    }
    if (
      normalizeOptionalText(
        value.teacherNote,
        'teacherNote',
        PRIVATE_ASSIGNMENT_MAX_TEACHER_NOTE_LENGTH,
      ) !== value.teacherNote
    ) {
      return false
    }
    if (
      normalizeRequiredTimestamp(value.assignedAt, 'assignedAt') !==
      value.assignedAt
    ) {
      return false
    }
    if (value.sourceRef.studentId !== value.studentId) return false

    return true
  } catch {
    return false
  }
}
