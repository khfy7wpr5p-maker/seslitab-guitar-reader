import {
  assertStrictInputObject,
  isStrictFrozenRecord,
  normalizeNullableTimestamp,
  normalizeRequiredId,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

export const SECURE_DELIVERY_IDENTITY_SCHEMA_VERSION = 1
export const SECURE_DELIVERY_ROLE = Object.freeze({
  TEACHER: 'TEACHER',
  STUDENT: 'STUDENT',
})

const INPUT_FIELDS = Object.freeze([
  'providerSubject',
  'role',
  'teacherId',
  'studentId',
  'active',
  'createdAt',
  'disabledAt',
])

const RECORD_FIELDS = Object.freeze([
  'schemaVersion',
  ...INPUT_FIELDS,
])

function nullableId(value, fieldName) {
  if (value === null) return null
  return normalizeRequiredId(value, fieldName)
}

export function createSecureDeliveryIdentityMapping(input = {}) {
  assertStrictInputObject(input, INPUT_FIELDS, 'SecureDeliveryIdentityMapping')

  if (!Object.values(SECURE_DELIVERY_ROLE).includes(input.role)) {
    throw new TypeError('role must be TEACHER or STUDENT.')
  }
  if (typeof input.active !== 'boolean') {
    throw new TypeError('active must be a boolean.')
  }

  const teacherId = nullableId(input.teacherId, 'teacherId')
  const studentId = nullableId(input.studentId, 'studentId')
  if (
    (input.role === SECURE_DELIVERY_ROLE.TEACHER &&
      (teacherId === null || studentId !== null)) ||
    (input.role === SECURE_DELIVERY_ROLE.STUDENT &&
      (studentId === null || teacherId !== null))
  ) {
    throw new Error('role identity fields are inconsistent.')
  }

  const disabledAt = normalizeNullableTimestamp(input.disabledAt, 'disabledAt')
  if ((input.active && disabledAt !== null) || (!input.active && disabledAt === null)) {
    throw new Error('active and disabledAt are inconsistent.')
  }

  return Object.freeze({
    schemaVersion: SECURE_DELIVERY_IDENTITY_SCHEMA_VERSION,
    providerSubject: normalizeRequiredId(input.providerSubject, 'providerSubject'),
    role: input.role,
    teacherId,
    studentId,
    active: input.active,
    createdAt: normalizeRequiredTimestamp(input.createdAt, 'createdAt'),
    disabledAt,
  })
}

export function isSecureDeliveryIdentityMapping(value) {
  try {
    return (
      value?.schemaVersion === SECURE_DELIVERY_IDENTITY_SCHEMA_VERSION &&
      isStrictFrozenRecord(value, RECORD_FIELDS) &&
      createSecureDeliveryIdentityMapping({
        providerSubject: value.providerSubject,
        role: value.role,
        teacherId: value.teacherId,
        studentId: value.studentId,
        active: value.active,
        createdAt: value.createdAt,
        disabledAt: value.disabledAt,
      }).providerSubject === value.providerSubject
    )
  } catch {
    return false
  }
}

export function createSecureDeliveryPrincipal(mapping) {
  if (!isSecureDeliveryIdentityMapping(mapping)) {
    throw new TypeError('mapping must be a valid immutable identity mapping.')
  }
  if (!mapping.active || mapping.disabledAt !== null) {
    throw new Error('identity mapping is inactive or disabled.')
  }
  return Object.freeze({
    role: mapping.role,
    teacherId: mapping.teacherId,
    studentId: mapping.studentId,
  })
}
