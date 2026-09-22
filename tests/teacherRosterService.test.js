import assert from 'node:assert/strict'
import test from 'node:test'

import { createStudentRosterEntry } from '../src/services/studentRosterEntry.js'
import {
  createInMemoryTeacherRosterRepository,
} from '../src/services/teacherRosterRepository.js'
import { createTeacherRosterService } from '../src/services/teacherRosterService.js'

function entry(studentId, displayNameOrNickname, active = true) {
  return createStudentRosterEntry({
    studentId,
    displayNameOrNickname,
    active,
  })
}

function service(entries) {
  return createTeacherRosterService({
    repository: createInMemoryTeacherRosterRepository(entries),
  })
}

test('TD-02 lists teacher-safe roster rows and filters inactive entries explicitly', () => {
  const roster = service([
    entry('student-a', 'Deniz'),
    entry('student-b', 'Ece', false),
  ])

  assert.deepEqual(
    roster.listStudents().map((row) => [row.studentId, row.active]),
    [
      ['student-a', true],
      ['student-b', false],
    ],
  )

  assert.deepEqual(
    roster
      .listStudents({ includeInactive: false })
      .map((row) => row.studentId),
    ['student-a'],
  )

  assert.throws(
    () => roster.listStudents({ includeInactive: 'false' }),
    /includeInactive.*boolean/i,
  )
})

test('TD-02 lookup uses exact stable studentId and never display name', () => {
  const roster = service([
    entry('student-a', 'Aynı Ad'),
    entry('student-b', 'Aynı Ad'),
  ])

  assert.equal(roster.getStudent('student-a').studentId, 'student-a')
  assert.equal(roster.getStudent(' student-b ').studentId, 'student-b')
  assert.equal(roster.getStudent('student-missing'), null)

  assert.equal('getStudentByDisplayName' in roster, false)
  assert.equal('getStudentByEmail' in roster, false)
})

test('TD-02 requireActiveStudent fails closed for unknown and inactive targets', () => {
  const roster = service([
    entry('student-a', 'Deniz'),
    entry('student-b', 'Ece', false),
  ])

  assert.equal(
    roster.requireActiveStudent('student-a').studentId,
    'student-a',
  )

  assert.throws(
    () => roster.requireActiveStudent('student-missing'),
    /student-not-found.*student-missing/i,
  )

  assert.throws(
    () => roster.requireActiveStudent('student-b'),
    /student-inactive.*student-b/i,
  )
})

test('TD-02 multi-target preflight deduplicates in first-selection order', () => {
  const roster = service([
    entry('student-a', 'Deniz'),
    entry('student-b', 'Ece'),
    entry('student-c', 'Ada'),
  ])

  const result = roster.preflightActiveStudentIds([
    ' student-b ',
    'student-a',
    'student-b',
    'student-c',
  ])

  assert.equal(Object.isFrozen(result), true)
  assert.deepEqual(
    result.map((row) => row.studentId),
    ['student-b', 'student-a', 'student-c'],
  )
})

test('TD-02 multi-target preflight is all-or-nothing for empty, unknown or inactive input', () => {
  const roster = service([
    entry('student-a', 'Deniz'),
    entry('student-b', 'Ece', false),
  ])

  assert.throws(
    () => roster.preflightActiveStudentIds([]),
    /at least one studentId/i,
  )

  assert.throws(
    () =>
      roster.preflightActiveStudentIds([
        'student-a',
        'student-missing',
      ]),
    /student-not-found.*student-missing/i,
  )

  assert.throws(
    () =>
      roster.preflightActiveStudentIds([
        'student-a',
        'student-b',
      ]),
    /student-inactive.*student-b/i,
  )

  assert.throws(
    () =>
      roster.preflightActiveStudentIds([
        'student-a',
        'student\u0000x',
      ]),
    /studentId/i,
  )
})

test('TD-02 service revalidates custom adapter rows and exact lookup identity', () => {
  const a = entry('student-a', 'Deniz')
  const b = entry('student-b', 'Ece')

  const forgedListService = createTeacherRosterService({
    repository: {
      list() {
        return [structuredClone(a)]
      },
      getByStudentId() {
        return a
      },
    },
  })

  assert.throws(
    () => forgedListService.listStudents(),
    /invalid.*StudentRosterEntry/i,
  )

  const mismatchedLookupService = createTeacherRosterService({
    repository: {
      list() {
        return [a, b]
      },
      getByStudentId() {
        return b
      },
    },
  })

  assert.throws(
    () => mismatchedLookupService.getStudent('student-a'),
    /identity-mismatch/i,
  )
})

test('TD-02 service rejects duplicate stable IDs returned by a custom adapter', () => {
  const a = entry('student-a', 'Deniz')

  const roster = createTeacherRosterService({
    repository: {
      list() {
        return [a, a]
      },
      getByStudentId() {
        return a
      },
    },
  })

  assert.throws(
    () => roster.listStudents(),
    /duplicate.*studentId/i,
  )
})


test('TD-02 target preflight rejects duplicate authority returned by a custom adapter', () => {
  const active = entry('student-a', 'Deniz', true)
  const inactive = entry('student-a', 'Deniz Eski', false)

  const roster = createTeacherRosterService({
    repository: {
      list() {
        return [active, inactive]
      },
      getByStudentId() {
        return active
      },
    },
  })

  assert.throws(
    () => roster.requireActiveStudent('student-a'),
    /duplicate.*studentId/i,
  )

  assert.throws(
    () => roster.preflightActiveStudentIds(['student-a']),
    /duplicate.*studentId/i,
  )
})


test('TD-02 getStudent rejects duplicate roster authority before returning a lookup result', () => {
  const a = entry('student-a', 'Deniz')
  const duplicate = entry('student-a', 'Deniz Eski')

  const roster = createTeacherRosterService({
    repository: {
      list() {
        return [a, duplicate]
      },
      getByStudentId() {
        return a
      },
    },
  })

  assert.throws(
    () => roster.getStudent('student-a'),
    /duplicate.*studentId/i,
  )
})

test('TD-02 multi-target preflight validates one coherent roster snapshot', () => {
  const a = entry('student-a', 'Deniz')
  const b = entry('student-b', 'Ece')
  const inactiveB = entry('student-b', 'Ece', false)
  let listCalls = 0

  const roster = createTeacherRosterService({
    repository: {
      list() {
        listCalls += 1
        return listCalls === 1
          ? [a, b]
          : [a, inactiveB]
      },
      getByStudentId(studentId) {
        return studentId === 'student-a' ? a : b
      },
    },
  })

  const result = roster.preflightActiveStudentIds([
    'student-a',
    'student-b',
  ])

  assert.equal(listCalls, 1)
  assert.deepEqual(
    result.map((row) => row.studentId),
    ['student-a', 'student-b'],
  )
})
