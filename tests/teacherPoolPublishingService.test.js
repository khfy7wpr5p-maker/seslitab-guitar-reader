import assert from 'node:assert/strict'
import test from 'node:test'

import { POOL_AUDIENCE_MODE } from '../src/services/poolItem.js'
import { createStudentRosterEntry } from '../src/services/studentRosterEntry.js'
import { createTeacherRosterService } from '../src/services/teacherRosterService.js'
import { createInMemoryTeacherRosterRepository } from '../src/services/teacherRosterRepository.js'
import { createInMemoryTeacherPoolRepository } from '../src/services/teacherPoolRepository.js'
import { createTeacherPoolPublishingService } from '../src/services/teacherPoolPublishingService.js'

function rosterService() {
  return createTeacherRosterService({
    repository: createInMemoryTeacherRosterRepository([
      createStudentRosterEntry({
        studentId: 'student-a',
        displayNameOrNickname: 'Deniz',
        active: true,
      }),
      createStudentRosterEntry({
        studentId: 'student-b',
        displayNameOrNickname: 'Ece',
        active: false,
      }),
      createStudentRosterEntry({
        studentId: 'student-c',
        displayNameOrNickname: 'Ada',
        active: true,
      }),
    ]),
  })
}

function service({
  repository = createInMemoryTeacherPoolRepository(),
  roster = rosterService(),
  id = 'pool-1',
  times = [
    '2026-09-22T18:00:00Z',
    '2026-09-22T19:00:00Z',
  ],
} = {}) {
  let index = 0
  return createTeacherPoolPublishingService({
    repository,
    rosterService: roster,
    createPoolItemId() {
      return id
    },
    now() {
      return times[index++] ?? times.at(-1)
    },
  })
}

test('TD-03 ALL publishes with empty recipients and skips roster preflight', () => {
  let preflightCalls = 0
  const fakeRoster = {
    preflightActiveStudentIds() {
      preflightCalls += 1
      throw new Error('must not be called for ALL')
    },
  }
  const publishing = service({ roster: fakeRoster })

  const record = publishing.publishPoolItem({
    title: 'Yeni repertuar',
    shortDescription: 'Bu hafta',
    detailText: '',
    audienceMode: POOL_AUDIENCE_MODE.ALL,
    selectedStudentIds: [],
  })

  assert.equal(preflightCalls, 0)
  assert.equal(record.item.audienceMode, 'ALL')
  assert.deepEqual(record.item.recipientStudentIds, [])
})

test('TD-03 SELECTED uses active TD-02 preflight result as exact recipients', () => {
  const publishing = service()

  const record = publishing.publishPoolItem({
    title: 'Seçili öğrenciler',
    shortDescription: 'Duyuru',
    detailText: '',
    audienceMode: POOL_AUDIENCE_MODE.SELECTED,
    selectedStudentIds: [
      ' student-c ',
      'student-a',
      'student-c',
    ],
  })

  assert.deepEqual(
    record.item.recipientStudentIds,
    ['student-c', 'student-a'],
  )
})

test('TD-03 SELECTED fails before publish for unknown or inactive student', () => {
  let publishCalls = 0
  const base = createInMemoryTeacherPoolRepository()
  const repository = {
    ...base,
    publish(record) {
      publishCalls += 1
      return base.publish(record)
    },
  }
  const publishing = service({ repository })

  assert.throws(
    () =>
      publishing.publishPoolItem({
        title: 'Duyuru',
        shortDescription: 'Kısa',
        detailText: '',
        audienceMode: 'SELECTED',
        selectedStudentIds: ['student-b'],
      }),
    /student-inactive/i,
  )

  assert.throws(
    () =>
      publishing.publishPoolItem({
        title: 'Duyuru',
        shortDescription: 'Kısa',
        detailText: '',
        audienceMode: 'SELECTED',
        selectedStudentIds: ['student-missing'],
      }),
    /student-not-found/i,
  )

  assert.equal(publishCalls, 0)
})

test('TD-03 rejects ALL recipients and empty SELECTED', () => {
  const publishing = service()

  assert.throws(
    () =>
      publishing.publishPoolItem({
        title: 'Duyuru',
        shortDescription: 'Kısa',
        detailText: '',
        audienceMode: 'ALL',
        selectedStudentIds: ['student-a'],
      }),
    /ALL.*selected/i,
  )

  assert.throws(
    () =>
      publishing.publishPoolItem({
        title: 'Duyuru',
        shortDescription: 'Kısa',
        detailText: '',
        audienceMode: 'SELECTED',
        selectedStudentIds: [],
      }),
    /SELECTED.*student/i,
  )
})

test('TD-03 publish fails closed on malformed acknowledgement', () => {
  const base = createInMemoryTeacherPoolRepository()
  const publishing = service({
    repository: {
      ...base,
      publish(record) {
        base.publish(record)
        return structuredClone(record)
      },
    },
  })

  assert.throws(
    () =>
      publishing.publishPoolItem({
        title: 'Duyuru',
        shortDescription: 'Kısa',
        detailText: '',
        audienceMode: 'ALL',
        selectedStudentIds: [],
      }),
    /acknowledgement/i,
  )
})

test('TD-03 publish rejects a valid acknowledgement for a different Pool item', () => {
  const base = createInMemoryTeacherPoolRepository()
  const otherService = service({
    repository: base,
    id: 'pool-other',
  })
  const other = otherService.publishPoolItem({
    title: 'Başka duyuru',
    shortDescription: 'Başka',
    detailText: '',
    audienceMode: 'ALL',
    selectedStudentIds: [],
  })

  const publishing = service({
    id: 'pool-expected',
    repository: {
      ...base,
      publish(record) {
        base.publish(record)
        return other
      },
    },
  })

  assert.throws(
    () =>
      publishing.publishPoolItem({
        title: 'Duyuru',
        shortDescription: 'Kısa',
        detailText: '',
        audienceMode: 'ALL',
        selectedStudentIds: [],
      }),
    /acknowledgement.*mismatch/i,
  )
})

test('TD-03 list revalidates repository rows instead of trusting adapter shape', () => {
  const publishing = service({
    repository: {
      list() {
        return [Object.freeze({ forged: true })]
      },
      getByPoolItemId() {
        return null
      },
      publish(record) {
        return record
      },
      revoke() {
        throw new Error('unused')
      },
    },
  })

  assert.throws(
    () => publishing.listPoolPublications(),
    /PoolPublicationRecord/i,
  )
})

test('TD-03 list rejects duplicate Pool identity returned by custom adapter', () => {
  const repository = createInMemoryTeacherPoolRepository()
  const publishing = service({ repository })
  const record = publishing.publishPoolItem({
    title: 'Duyuru',
    shortDescription: 'Kısa',
    detailText: '',
    audienceMode: 'ALL',
    selectedStudentIds: [],
  })

  const duplicateList = service({
    repository: {
      ...repository,
      list() {
        return [record, record]
      },
    },
  })

  assert.throws(
    () => duplicateList.listPoolPublications(),
    /duplicate.*poolItemId/i,
  )
})

test('TD-03 revoke requires exact acknowledgement and preserves item identity', () => {
  const repository = createInMemoryTeacherPoolRepository()
  const publishing = service({ repository })

  const active = publishing.publishPoolItem({
    title: 'Duyuru',
    shortDescription: 'Kısa',
    detailText: '',
    audienceMode: 'ALL',
    selectedStudentIds: [],
  })

  const revoked = publishing.revokePoolPublication(
    active.item.poolItemId,
  )

  assert.equal(revoked.item, active.item)
  assert.equal(revoked.revokedAt, '2026-09-22T19:00:00Z')
})

test('TD-03 revoke fails closed on malformed acknowledgement', () => {
  const base = createInMemoryTeacherPoolRepository()
  const publishing = service({
    repository: {
      ...base,
      revoke(input) {
        return structuredClone(base.revoke(input))
      },
    },
  })

  const active = publishing.publishPoolItem({
    title: 'Duyuru',
    shortDescription: 'Kısa',
    detailText: '',
    audienceMode: 'ALL',
    selectedStudentIds: [],
  })

  assert.throws(
    () => publishing.revokePoolPublication(active.item.poolItemId),
    /acknowledgement/i,
  )
})

test('TD-03 validates injected producer ID/time exactly once per action', () => {
  let idCalls = 0
  let timeCalls = 0
  const publishing = createTeacherPoolPublishingService({
    repository: createInMemoryTeacherPoolRepository(),
    rosterService: rosterService(),
    createPoolItemId() {
      idCalls += 1
      return 'pool-once'
    },
    now() {
      timeCalls += 1
      return '2026-09-22T18:00:00Z'
    },
  })

  publishing.publishPoolItem({
    title: 'Duyuru',
    shortDescription: 'Kısa',
    detailText: '',
    audienceMode: 'ALL',
    selectedStudentIds: [],
  })

  assert.equal(idCalls, 1)
  assert.equal(timeCalls, 1)
})

test('TD-03 malformed injected ID/time fails without retrying generators', () => {
  let idCalls = 0
  let timeCalls = 0
  const badId = createTeacherPoolPublishingService({
    repository: createInMemoryTeacherPoolRepository(),
    rosterService: rosterService(),
    createPoolItemId() {
      idCalls += 1
      return ''
    },
    now() {
      throw new Error('must not reach time after invalid ID')
    },
  })

  assert.throws(
    () =>
      badId.publishPoolItem({
        title: 'Duyuru',
        shortDescription: 'Kısa',
        detailText: '',
        audienceMode: 'ALL',
        selectedStudentIds: [],
      }),
    /poolItemId/i,
  )
  assert.equal(idCalls, 1)

  const badTime = createTeacherPoolPublishingService({
    repository: createInMemoryTeacherPoolRepository(),
    rosterService: rosterService(),
    createPoolItemId() {
      return 'pool-bad-time'
    },
    now() {
      timeCalls += 1
      return ''
    },
  })

  assert.throws(
    () =>
      badTime.publishPoolItem({
        title: 'Duyuru',
        shortDescription: 'Kısa',
        detailText: '',
        audienceMode: 'ALL',
        selectedStudentIds: [],
      }),
    /publishedAt/i,
  )
  assert.equal(timeCalls, 1)
})
