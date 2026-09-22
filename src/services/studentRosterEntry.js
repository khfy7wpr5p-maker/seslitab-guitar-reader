import {
  DELIVERY_MAX_DISPLAY_NAME_LENGTH,
  assertStrictInputObject,
  isStrictFrozenRecord,
  normalizeRequiredId,
  normalizeRequiredText,
} from './teacherDeliveryContractValidation.js'

export const STUDENT_ROSTER_ENTRY_SCHEMA_VERSION = 1

const INPUT_FIELDS = Object.freeze([
  'studentId',
  'displayNameOrNickname',
  'active',
])

const RECORD_FIELDS = Object.freeze([
  'schemaVersion',
  'studentId',
  'displayNameOrNickname',
  'active',
])

export function createStudentRosterEntry(input = {}) {
  assertStrictInputObject(input, INPUT_FIELDS, 'StudentRosterEntry')

  const studentId = normalizeRequiredId(input.studentId, 'studentId')
  const displayNameOrNickname = normalizeRequiredText(
    input.displayNameOrNickname,
    'displayNameOrNickname',
    DELIVERY_MAX_DISPLAY_NAME_LENGTH,
  )
  if (typeof input.active !== 'boolean') {
    throw new TypeError('active must be a boolean.')
  }

  return Object.freeze({
    schemaVersion: STUDENT_ROSTER_ENTRY_SCHEMA_VERSION,
    studentId,
    displayNameOrNickname,
    active: input.active,
  })
}

export function isStudentRosterEntry(value) {
  try {
    return (
      value?.schemaVersion === STUDENT_ROSTER_ENTRY_SCHEMA_VERSION &&
      isStrictFrozenRecord(value, RECORD_FIELDS) &&
      normalizeRequiredId(value.studentId, 'studentId') === value.studentId &&
      normalizeRequiredText(
        value.displayNameOrNickname,
        'displayNameOrNickname',
        DELIVERY_MAX_DISPLAY_NAME_LENGTH,
      ) === value.displayNameOrNickname &&
      typeof value.active === 'boolean'
    )
  } catch {
    return false
  }
}
