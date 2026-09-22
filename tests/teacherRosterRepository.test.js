import assert from 'node:assert/strict'
import test from 'node:test'

import { createStudentRosterEntry } from '../src/services/studentRosterEntry.js'
import {
  assertTeacherRosterRepository,
  createInMemoryTeacherRosterRepository,
} from '../src/services/teacherRosterRepository.js'

function entry(studentId, displayNameOrNickname, active = true) {
  return createStudentRosterEntry({
    studentId,
    displayNameOrNickname,
    active,
  })
}

test('TD-02 repository preserves immutable roster order and exact stable-id lookup', () => {
  const a = entry('student-a', 'Deniz')
  const b = entry('student-b', 'Ece', false)

  const repository = createInMemoryTeacherRosterRepository([a, b])
  const listed = repository.list()

  assert.equal(Object.isFrozen(repository), true)
  assert.equal(Object.isFrozen(listed), true)
  assert.deepEqual(listed, [a, b])
  assert.equal(repository.getByStudentId('student-a'), a)
  assert.equal(repository.getByStudentId(' student-b '), b)
  assert.equal(repository.getByStudentId('student-missing'), null)
  assert.equal(assertTeacherRosterRepository(repository), repository)
})

test('TD-02 repository rejects duplicate stable IDs even when display names differ', () => {
  assert.throws(
    () =>
      createInMemoryTeacherRosterRepository([
        entry('student-a', 'Deniz'),
        entry('student-a', 'Başka Ad'),
      ]),
    /duplicate.*studentId/i,
  )
})

test('TD-02 repository allows duplicate display names because names do not authorize', () => {
  const repository = createInMemoryTeacherRosterRepository([
    entry('student-a', 'Aynı Ad'),
    entry('student-b', 'Aynı Ad'),
  ])

  assert.deepEqual(
    repository.list().map((row) => row.studentId),
    ['student-a', 'student-b'],
  )
})

test('TD-02 repository rejects non-array, mutable and forged roster inputs', () => {
  assert.throws(
    () => createInMemoryTeacherRosterRepository({}),
    /array/i,
  )

  const valid = entry('student-a', 'Deniz')

  assert.throws(
    () => createInMemoryTeacherRosterRepository([structuredClone(valid)]),
    /StudentRosterEntry/i,
  )

  assert.throws(
    () =>
      createInMemoryTeacherRosterRepository([
        Object.freeze({ ...valid, providerRole: 'admin' }),
      ]),
    /StudentRosterEntry/i,
  )
})

test('TD-02 repository exposes no mutation surface', () => {
  const repository = createInMemoryTeacherRosterRepository([
    entry('student-a', 'Deniz'),
  ])

  for (const method of [
    'add',
    'create',
    'update',
    'rename',
    'activate',
    'deactivate',
    'delete',
    'save',
    'persist',
    'sync',
  ]) {
    assert.equal(method in repository, false, method)
  }
})
