import { isPrivateAssignment } from './privateAssignment.js'
import {
  assertStrictInputObject,
  isStrictFrozenRecord,
  normalizeRequiredId,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

export const PREPARED_ASSIGNMENT_SCHEMA_VERSION = 1

const INPUT_FIELDS = Object.freeze([
  'teacherId',
  'assignment',
  'packageId',
  'packageFingerprint',
  'preparedAt',
])

const RECORD_FIELDS = Object.freeze([
  'schemaVersion',
  ...INPUT_FIELDS,
])

function normalizeFingerprint(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new TypeError('packageFingerprint must be lowercase SHA-256 hex.')
  }
  return value
}

export function createPreparedAssignmentRecord(input = {}) {
  assertStrictInputObject(input, INPUT_FIELDS, 'PreparedAssignmentRecord')
  if (!isPrivateAssignment(input.assignment)) {
    throw new TypeError('assignment must be a valid immutable PrivateAssignment.')
  }

  return Object.freeze({
    schemaVersion: PREPARED_ASSIGNMENT_SCHEMA_VERSION,
    teacherId: normalizeRequiredId(input.teacherId, 'teacherId'),
    assignment: input.assignment,
    packageId: normalizeRequiredId(input.packageId, 'packageId'),
    packageFingerprint: normalizeFingerprint(input.packageFingerprint),
    preparedAt: normalizeRequiredTimestamp(input.preparedAt, 'preparedAt'),
  })
}

export function isPreparedAssignmentRecord(value) {
  try {
    return (
      value?.schemaVersion === PREPARED_ASSIGNMENT_SCHEMA_VERSION &&
      isStrictFrozenRecord(value, RECORD_FIELDS) &&
      createPreparedAssignmentRecord({
        teacherId: value.teacherId,
        assignment: value.assignment,
        packageId: value.packageId,
        packageFingerprint: value.packageFingerprint,
        preparedAt: value.preparedAt,
      }).teacherId === value.teacherId
    )
  } catch {
    return false
  }
}
