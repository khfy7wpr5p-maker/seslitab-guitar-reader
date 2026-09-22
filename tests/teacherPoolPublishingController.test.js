import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createTeacherPoolPublishingController,
} from '../src/services/teacherPoolPublishingController.js'

function student(studentId, displayNameOrNickname) {
  return Object.freeze({
    schemaVersion: 1,
    studentId,
    displayNameOrNickname,
    active: true,
  })
}

function record(id, revokedAt = null) {
  return Object.freeze({
    schemaVersion: 1,
    item: Object.freeze({
      schemaVersion: 1,
      poolItemId: id,
      title: `Duyuru ${id}`,
      shortDescription: 'Kısa',
      detailText: '',
      publishedAt: '2026-09-22T18:00:00Z',
      audienceMode: 'ALL',
      recipientStudentIds: Object.freeze([]),
      revokedAt: null,
    }),
    revokedAt,
  })
}

function controller({
  students = [
    student('student-a', 'Deniz'),
    student('student-c', 'Ada'),
  ],
  publications = [record('pool-a')],
  publishResult = record('pool-new'),
  publishError = null,
  revokeResult = record(
    'pool-a',
    '2026-09-22T19:00:00Z',
  ),
  revokeError = null,
} = {}) {
  return createTeacherPoolPublishingController({
    rosterService: {
      listStudents({ includeInactive }) {
        assert.equal(includeInactive, false)
        return Object.freeze(students)
      },
    },
    publishingService: {
      listPoolPublications() {
        return Object.freeze(publications)
      },
      publishPoolItem() {
        if (publishError) throw publishError
        return publishResult
      },
      revokePoolPublication() {
        if (revokeError) throw revokeError
        return revokeResult
      },
    },
  })
}

test('TD-03 controller view model lists active roster presentation rows and Pool history', () => {
  const value = controller().getViewModel()

  assert.deepEqual(
    value.students.map((row) => [
      row.studentId,
      row.displayNameOrNickname,
    ]),
    [
      ['student-a', 'Deniz'],
      ['student-c', 'Ada'],
    ],
  )
  assert.equal(Object.isFrozen(value), true)
  assert.equal(Object.isFrozen(value.students), true)
  assert.equal(Object.isFrozen(value.publications), true)
})

test('TD-03 duplicate display names remain separate stable identities', () => {
  const value = controller({
    students: [
      student('student-a', 'Aynı Ad'),
      student('student-b', 'Aynı Ad'),
    ],
  }).getViewModel()

  assert.deepEqual(
    value.students.map((row) => row.studentId),
    ['student-a', 'student-b'],
  )
})

test('TD-03 controller reports publish success only after service success', () => {
  const result = controller().publish({
    title: 'Duyuru',
    shortDescription: 'Kısa',
    detailText: '',
    audienceMode: 'ALL',
    selectedStudentIds: [],
  })

  assert.equal(result.ok, true)
  assert.equal(result.message, 'Havuza gönderildi.')
  assert.equal(result.record.item.poolItemId, 'pool-new')
})

test('TD-03 controller maps service failure to bounded teacher message', () => {
  const result = controller({
    publishError: new Error(
      'teacher Pool repository acknowledgement mismatch token=secret',
    ),
  }).publish({
    title: 'Duyuru',
    shortDescription: 'Kısa',
    detailText: '',
    audienceMode: 'ALL',
    selectedStudentIds: [],
  })

  assert.deepEqual(result, {
    ok: false,
    record: null,
    message: 'Havuz işlemi doğrulanamadı.',
  })
  assert.equal(
    JSON.stringify(result).includes('secret'),
    false,
  )
})

test('TD-03 controller maps roster targeting errors to bounded teacher messages', () => {
  const inactive = controller({
    publishError: new Error(
      'teacher-roster-student-inactive:student-b',
    ),
  }).publish({})
  assert.equal(
    inactive.message,
    'Seçilen öğrencilerden biri aktif değil.',
  )

  const missing = controller({
    publishError: new Error(
      'teacher-roster-student-not-found:student-x',
    ),
  }).publish({})
  assert.equal(
    missing.message,
    'Seçilen öğrencilerden biri bulunamadı.',
  )
})

test('TD-03 controller maps revoke success and already-revoked failure', () => {
  const success = controller().revoke('pool-a')
  assert.equal(success.ok, true)
  assert.equal(
    success.message,
    'Havuz yayını geri çekildi.',
  )

  const failure = controller({
    revokeError: new Error(
      'teacher-pool-publication-already-revoked:pool-a',
    ),
  }).revoke('pool-a')

  assert.deepEqual(failure, {
    ok: false,
    record: null,
    message: 'Bu Havuz yayını zaten geri çekilmiş.',
  })
})
