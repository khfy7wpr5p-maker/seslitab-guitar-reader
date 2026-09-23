import {
  assertStrictInputObject,
  isStrictFrozenRecord,
  normalizeRequiredId,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

export const DELIVERY_RECORD_SCHEMA_VERSION = 1

const INPUT_FIELDS = Object.freeze([
  'assignmentId',
  'packageId',
  'teacherId',
  'studentId',
  'deliveredAt',
])

const RECORD_FIELDS = Object.freeze([
  'schemaVersion',
  'deliveryId',
  'assignmentId',
  'packageId',
  'teacherId',
  'studentId',
  'deliveredAt',
  'revokedAt',
])

export function createDeliveryRecord(input = {}) {
  assertStrictInputObject(input, INPUT_FIELDS, 'DeliveryRecord')
  const assignmentId = normalizeRequiredId(input.assignmentId, 'assignmentId')
  return Object.freeze({
    schemaVersion: DELIVERY_RECORD_SCHEMA_VERSION,
    deliveryId: assignmentId,
    assignmentId,
    packageId: normalizeRequiredId(input.packageId, 'packageId'),
    teacherId: normalizeRequiredId(input.teacherId, 'teacherId'),
    studentId: normalizeRequiredId(input.studentId, 'studentId'),
    deliveredAt: normalizeRequiredTimestamp(input.deliveredAt, 'deliveredAt'),
    revokedAt: null,
  })
}

export function isDeliveryRecord(value) {
  try {
    if (
      value?.schemaVersion !== DELIVERY_RECORD_SCHEMA_VERSION ||
      !isStrictFrozenRecord(value, RECORD_FIELDS) ||
      value.deliveryId !== value.assignmentId
    ) {
      return false
    }
    normalizeRequiredId(value.assignmentId, 'assignmentId')
    normalizeRequiredId(value.packageId, 'packageId')
    normalizeRequiredId(value.teacherId, 'teacherId')
    normalizeRequiredId(value.studentId, 'studentId')
    normalizeRequiredTimestamp(value.deliveredAt, 'deliveredAt')
    if (value.revokedAt !== null) {
      normalizeRequiredTimestamp(value.revokedAt, 'revokedAt')
    }
    return true
  } catch {
    return false
  }
}

export function revokeDeliveryRecord(record, revokedAt) {
  if (!isDeliveryRecord(record)) {
    throw new TypeError('record must be a valid immutable DeliveryRecord.')
  }
  if (record.revokedAt !== null) return record

  return Object.freeze({
    ...record,
    revokedAt: normalizeRequiredTimestamp(revokedAt, 'revokedAt'),
  })
}
