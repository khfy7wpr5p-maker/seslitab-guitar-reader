import assert from 'node:assert/strict'
import test from 'node:test'

import {
  POOL_AUDIENCE_MODE,
  POOL_ITEM_SCHEMA_VERSION,
  createPoolItem,
  isPoolItem,
} from '../src/services/poolItem.js'

test('TD-01 PoolItem defaults to ALL and contains no score/practice payload', () => {
  const item = createPoolItem({
    poolItemId: 'pool-1',
    title: 'Yeni repertuar',
    shortDescription: 'Bu hafta çalışılacak eserler',
    detailText: 'Ayrıntılı öğretmen duyurusu.',
    publishedAt: '2026-09-22T16:00:00Z',
  })

  assert.equal(POOL_ITEM_SCHEMA_VERSION, 1)
  assert.equal(item.audienceMode, POOL_AUDIENCE_MODE.ALL)
  assert.deepEqual(item.recipientStudentIds, [])
  assert.equal(item.revokedAt, null)
  assert.equal(Object.isFrozen(item), true)
  assert.equal(Object.isFrozen(item.recipientStudentIds), true)
  assert.equal(isPoolItem(item), true)

  for (const forbidden of [
    'musicXml',
    'practicePackage',
    'notation',
    'playbackPlan',
    'revisionId',
    'provider',
  ]) {
    assert.equal(Object.hasOwn(item, forbidden), false)
  }
})

test('TD-01 SELECTED normalizes and deduplicates stable student IDs', () => {
  const item = createPoolItem({
    poolItemId: 'pool-2',
    title: 'Seçili öğrenciler',
    shortDescription: 'Duyuru',
    detailText: '',
    publishedAt: '2026-09-22T16:01:00Z',
    audienceMode: POOL_AUDIENCE_MODE.SELECTED,
    recipientStudentIds: [' student-1 ', 'student-2', 'student-1'],
  })

  assert.deepEqual(item.recipientStudentIds, ['student-1', 'student-2'])
})

test('TD-01 ALL forbids recipients and SELECTED requires recipients', () => {
  assert.throws(
    () => createPoolItem({
      poolItemId: 'pool-all-bad',
      title: 'Duyuru',
      shortDescription: 'Kısa',
      detailText: '',
      publishedAt: '2026-09-22T16:02:00Z',
      audienceMode: POOL_AUDIENCE_MODE.ALL,
      recipientStudentIds: ['student-1'],
    }),
    /ALL.*recipient/i,
  )

  assert.throws(
    () => createPoolItem({
      poolItemId: 'pool-selected-bad',
      title: 'Duyuru',
      shortDescription: 'Kısa',
      detailText: '',
      publishedAt: '2026-09-22T16:02:00Z',
      audienceMode: POOL_AUDIENCE_MODE.SELECTED,
      recipientStudentIds: [],
    }),
    /SELECTED.*recipient/i,
  )
})

test('TD-01 PoolItem rejects malformed recipients and unsupported payload fields', () => {
  assert.throws(
    () => createPoolItem({
      poolItemId: 'pool-3',
      title: 'Duyuru',
      shortDescription: 'Kısa',
      detailText: '',
      publishedAt: '2026-09-22T16:03:00Z',
      audienceMode: POOL_AUDIENCE_MODE.SELECTED,
      recipientStudentIds: ['student\u0000x'],
    }),
    /recipientStudentIds/,
  )

  assert.throws(
    () => createPoolItem({
      poolItemId: 'pool-4',
      title: 'Duyuru',
      shortDescription: 'Kısa',
      detailText: '',
      publishedAt: '2026-09-22T16:03:00Z',
      musicXml: '<score-partwise/>',
    }),
    /unsupported field/,
  )
})

test('TD-01 PoolItem validator rejects mutable and extra-field records', () => {
  const valid = createPoolItem({
    poolItemId: 'pool-5',
    title: 'Duyuru',
    shortDescription: 'Kısa',
    detailText: '',
    publishedAt: '2026-09-22T16:04:00Z',
  })

  assert.equal(isPoolItem(structuredClone(valid)), false)
  assert.equal(isPoolItem(Object.freeze({ ...valid, safeToShare: true })), false)
})
