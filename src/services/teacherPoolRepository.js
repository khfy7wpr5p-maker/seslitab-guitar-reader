import {
  isPoolPublicationRecord,
  revokePoolPublicationRecord,
} from './poolPublicationRecord.js'
import {
  normalizeRequiredId,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

export function assertTeacherPoolRepository(repository) {
  if (
    repository === null ||
    typeof repository !== 'object' ||
    typeof repository.list !== 'function' ||
    typeof repository.getByPoolItemId !== 'function' ||
    typeof repository.publish !== 'function' ||
    typeof repository.revoke !== 'function'
  ) {
    throw new TypeError(
      'teacher Pool repository must provide list(), getByPoolItemId(), publish() and revoke().',
    )
  }

  return repository
}

export function createInMemoryTeacherPoolRepository(
  initialRecords = [],
) {
  if (!Array.isArray(initialRecords)) {
    throw new TypeError(
      'initial Pool publication snapshot must be an array.',
    )
  }

  const order = []
  const byId = new Map()

  for (const record of initialRecords) {
    if (!isPoolPublicationRecord(record)) {
      throw new TypeError(
        'initial Pool publication records must be valid immutable PoolPublicationRecord values.',
      )
    }

    const id = record.item.poolItemId
    if (byId.has(id)) {
      throw new Error(
        `duplicate poolItemId in Pool publication snapshot: ${id}`,
      )
    }

    order.push(id)
    byId.set(id, record)
  }

  function list() {
    return Object.freeze(
      order.map((id) => byId.get(id)),
    )
  }

  return Object.freeze({
    list,

    getByPoolItemId(poolItemId) {
      const id = normalizeRequiredId(
        poolItemId,
        'poolItemId',
      )
      return byId.get(id) ?? null
    },

    publish(record) {
      if (!isPoolPublicationRecord(record)) {
        throw new TypeError(
          'record must be a valid immutable PoolPublicationRecord.',
        )
      }
      if (record.revokedAt !== null) {
        throw new Error(
          'New Pool publication must be active.',
        )
      }

      const id = record.item.poolItemId
      if (byId.has(id)) {
        throw new Error(
          `duplicate poolItemId in Pool repository: ${id}`,
        )
      }

      order.push(id)
      byId.set(id, record)
      return record
    },

    revoke({ poolItemId, revokedAt } = {}) {
      const id = normalizeRequiredId(
        poolItemId,
        'poolItemId',
      )
      const timestamp = normalizeRequiredTimestamp(
        revokedAt,
        'revokedAt',
      )
      const current = byId.get(id) ?? null

      if (current === null) {
        throw new Error(
          `teacher-pool-publication-not-found:${id}`,
        )
      }

      const revoked = revokePoolPublicationRecord(
        current,
        timestamp,
      )
      byId.set(id, revoked)
      return revoked
    },
  })
}
