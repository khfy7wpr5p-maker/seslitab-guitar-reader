import { isPoolItem } from './poolItem.js'
import {
  isStrictFrozenRecord,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

export const POOL_PUBLICATION_RECORD_SCHEMA_VERSION = 1

const RECORD_FIELDS = Object.freeze([
  'schemaVersion',
  'item',
  'revokedAt',
])

function assertPoolItem(item) {
  if (!isPoolItem(item)) {
    throw new TypeError('item must be a valid immutable PoolItem.')
  }
  return item
}

export function createActivePoolPublicationRecord(item) {
  return Object.freeze({
    schemaVersion: POOL_PUBLICATION_RECORD_SCHEMA_VERSION,
    item: assertPoolItem(item),
    revokedAt: null,
  })
}

export function revokePoolPublicationRecord(record, revokedAt) {
  if (!isPoolPublicationRecord(record)) {
    throw new TypeError(
      'record must be a valid immutable PoolPublicationRecord.',
    )
  }
  if (record.revokedAt !== null) {
    throw new Error('Pool publication is already revoked.')
  }

  return Object.freeze({
    schemaVersion: POOL_PUBLICATION_RECORD_SCHEMA_VERSION,
    item: record.item,
    revokedAt: normalizeRequiredTimestamp(
      revokedAt,
      'revokedAt',
    ),
  })
}

export function isPoolPublicationRecord(value) {
  try {
    if (
      value?.schemaVersion !==
        POOL_PUBLICATION_RECORD_SCHEMA_VERSION ||
      !isStrictFrozenRecord(value, RECORD_FIELDS) ||
      !isPoolItem(value.item)
    ) {
      return false
    }

    if (value.revokedAt === null) return true

    return (
      normalizeRequiredTimestamp(value.revokedAt, 'revokedAt') ===
      value.revokedAt
    )
  } catch {
    return false
  }
}
