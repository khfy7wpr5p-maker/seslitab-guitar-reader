import assert from 'node:assert/strict'
import test from 'node:test'

import { createPoolItem } from '../src/services/poolItem.js'
import {
  createActivePoolPublicationRecord,
} from '../src/services/poolPublicationRecord.js'
import {
  assertTeacherPoolRepository,
  createInMemoryTeacherPoolRepository,
} from '../src/services/teacherPoolRepository.js'

function record(id, publishedAt = '2026-09-22T18:00:00Z') {
  return createActivePoolPublicationRecord(
    createPoolItem({
      poolItemId: id,
      title: `Duyuru ${id}`,
      shortDescription: 'Kısa',
      detailText: '',
      publishedAt,
      audienceMode: 'ALL',
      recipientStudentIds: [],
    }),
  )
}

test('TD-03 repository preserves publication order and exact identity lookup', () => {
  const a = record('pool-a')
  const b = record('pool-b', '2026-09-22T18:01:00Z')
  const repository = createInMemoryTeacherPoolRepository([a, b])

  assert.equal(Object.isFrozen(repository), true)
  assert.equal(Object.isFrozen(repository.list()), true)
  assert.deepEqual(repository.list(), [a, b])
  assert.equal(repository.getByPoolItemId(' pool-a '), a)
  assert.equal(repository.getByPoolItemId('missing'), null)
  assert.equal(assertTeacherPoolRepository(repository), repository)
})

test('TD-03 repository rejects duplicate publication identity', () => {
  assert.throws(
    () =>
      createInMemoryTeacherPoolRepository([
        record('pool-a'),
        record('pool-a'),
      ]),
    /duplicate.*poolItemId/i,
  )

  const repository = createInMemoryTeacherPoolRepository([
    record('pool-a'),
  ])

  assert.throws(
    () => repository.publish(record('pool-a')),
    /duplicate.*poolItemId/i,
  )
})

test('TD-03 publish acknowledges the exact stored record', () => {
  const repository = createInMemoryTeacherPoolRepository()
  const next = record('pool-a')

  const acknowledged = repository.publish(next)

  assert.equal(acknowledged, next)
  assert.equal(repository.getByPoolItemId('pool-a'), next)
})

test('TD-03 revoke replaces only lifecycle state and preserves PoolItem identity', () => {
  const original = record('pool-a')
  const repository = createInMemoryTeacherPoolRepository([
    original,
  ])

  const revoked = repository.revoke({
    poolItemId: 'pool-a',
    revokedAt: '2026-09-22T19:00:00Z',
  })

  assert.equal(revoked.item, original.item)
  assert.equal(revoked.revokedAt, '2026-09-22T19:00:00Z')
  assert.equal(
    repository.getByPoolItemId('pool-a'),
    revoked,
  )
  assert.deepEqual(repository.list(), [revoked])
})

test('TD-03 revoke fails for unknown or already-revoked publication', () => {
  const repository = createInMemoryTeacherPoolRepository([
    record('pool-a'),
  ])

  assert.throws(
    () =>
      repository.revoke({
        poolItemId: 'missing',
        revokedAt: '2026-09-22T19:00:00Z',
      }),
    /not-found/i,
  )

  repository.revoke({
    poolItemId: 'pool-a',
    revokedAt: '2026-09-22T19:00:00Z',
  })

  assert.throws(
    () =>
      repository.revoke({
        poolItemId: 'pool-a',
        revokedAt: '2026-09-22T20:00:00Z',
      }),
    /already.*revoked/i,
  )
})

test('TD-03 repository exposes no delete/restore surface', () => {
  const repository = createInMemoryTeacherPoolRepository()

  for (const forbidden of [
    'delete',
    'remove',
    'restore',
    'unrevoke',
    'save',
    'sync',
  ]) {
    assert.equal(forbidden in repository, false, forbidden)
  }
})
