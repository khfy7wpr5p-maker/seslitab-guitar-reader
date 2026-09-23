import {
  assertStrictInputObject,
  isStrictFrozenRecord,
  normalizeNullableTimestamp,
  normalizeRequiredId,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

export const TEACHER_STUDENT_GRANT_SCHEMA_VERSION = 1

const INPUT_FIELDS = Object.freeze([
  'teacherId',
  'studentId',
  'active',
  'createdAt',
  'revokedAt',
])

const RECORD_FIELDS = Object.freeze([
  'schemaVersion',
  ...INPUT_FIELDS,
])

export function createTeacherStudentGrant(input = {}) {
  assertStrictInputObject(input, INPUT_FIELDS, 'TeacherStudentGrant')
  if (typeof input.active !== 'boolean') {
    throw new TypeError('active must be a boolean.')
  }
  const revokedAt = normalizeNullableTimestamp(input.revokedAt, 'revokedAt')
  if ((input.active && revokedAt !== null) || (!input.active && revokedAt === null)) {
    throw new Error('active and revokedAt are inconsistent.')
  }

  return Object.freeze({
    schemaVersion: TEACHER_STUDENT_GRANT_SCHEMA_VERSION,
    teacherId: normalizeRequiredId(input.teacherId, 'teacherId'),
    studentId: normalizeRequiredId(input.studentId, 'studentId'),
    active: input.active,
    createdAt: normalizeRequiredTimestamp(input.createdAt, 'createdAt'),
    revokedAt,
  })
}

export function isTeacherStudentGrant(value) {
  try {
    return (
      value?.schemaVersion === TEACHER_STUDENT_GRANT_SCHEMA_VERSION &&
      isStrictFrozenRecord(value, RECORD_FIELDS) &&
      createTeacherStudentGrant({
        teacherId: value.teacherId,
        studentId: value.studentId,
        active: value.active,
        createdAt: value.createdAt,
        revokedAt: value.revokedAt,
      }).teacherId === value.teacherId
    )
  } catch {
    return false
  }
}
