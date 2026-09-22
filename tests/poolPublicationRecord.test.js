import assert from 'node:assert/strict'
import test from 'node:test'

import {
  POOL_AUDIENCE_MODE,
  createPoolItem,
} from '../src/services/poolItem.js'
import {
  createActivePoolPublicationRecord,
  isPoolPublicationRecord,
  revokePoolPublicationRecord,
} from '../src/services/poolPublicationRecord.js'

function item(id = 'pool-1') {
  return createPoolItem({
    poolItemId: id,
    title: 'Yeni repertuar',
    shortDescription: 'Bu hafta çalışılacak eserler',
    detailText: 'Duyuru ayrıntısı.',
    publishedAt: '2026-09-22T18:00:00Z',
    audienceMode: POOL_AUDIENCE_MODE.ALL,
    recipientStudentIds: [],
  })
}

test('TD-03 active lifecycle record wraps the exact immutable PoolItem', () => {
  const poolItem = item()
  const record = createActivePoolPublicationRecord(poolItem)

  assert.equal(record.item, poolItem)
  assert.equal(record.revokedAt, null)
  assert.equal(Object.isFrozen(record), true)
  assert.equal(isPoolPublicationRecord(record), true)
})

test('TD-03 revocation creates a tombstone without mutating PoolItem', () => {
  const poolItem = item()
  const active = createActivePoolPublicationRecord(poolItem)
  const revoked = revokePoolPublicationRecord(
    active,
    '2026-09-22T19:00:00Z',
  )

  assert.notEqual(revoked, active)
  assert.equal(revoked.item, poolItem)
  assert.equal(active.revokedAt, null)
  assert.equal(revoked.revokedAt, '2026-09-22T19:00:00Z')
  assert.equal(isPoolPublicationRecord(revoked), true)
})

test('TD-03 lifecycle rejects forged item, malformed revoke time and double revoke', () => {
  const poolItem = item()
  const active = createActivePoolPublicationRecord(poolItem)

  assert.throws(
    () => createActivePoolPublicationRecord(structuredClone(poolItem)),
    /PoolItem/i,
  )
  assert.throws(
    () => revokePoolPublicationRecord(active, ''),
    /revokedAt/i,
  )

  const revoked = revokePoolPublicationRecord(
    active,
    '2026-09-22T19:00:00Z',
  )
  assert.throws(
    () =>
      revokePoolPublicationRecord(
        revoked,
        '2026-09-22T20:00:00Z',
      ),
    /already.*revoked/i,
  )
})

test('TD-03 lifecycle record exposes no restore/delete mutation surface', () => {
  const record = createActivePoolPublicationRecord(item())

  for (const forbidden of [
    'restore',
    'unrevoke',
    'delete',
    'remove',
    'update',
  ]) {
    assert.equal(forbidden in record, false, forbidden)
  }
})
