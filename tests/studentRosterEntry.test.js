import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STUDENT_ROSTER_ENTRY_SCHEMA_VERSION,
  createStudentRosterEntry,
  isStudentRosterEntry,
} from '../src/services/studentRosterEntry.js'

test('TD-01 StudentRosterEntry is strict immutable stable-id data', () => {
  const entry = createStudentRosterEntry({
    studentId: ' student-1 ',
    displayNameOrNickname: ' Deniz ',
    active: true,
  })

  assert.equal(STUDENT_ROSTER_ENTRY_SCHEMA_VERSION, 1)
  assert.equal(Object.isFrozen(entry), true)
  assert.equal(entry.studentId, 'student-1')
  assert.equal(entry.displayNameOrNickname, 'Deniz')
  assert.equal(entry.active, true)
  assert.equal(isStudentRosterEntry(entry), true)
})

test('TD-01 display name never replaces stable authorization identity', () => {
  const a = createStudentRosterEntry({
    studentId: 'student-a',
    displayNameOrNickname: 'Deniz',
    active: true,
  })
  const b = createStudentRosterEntry({
    studentId: 'student-b',
    displayNameOrNickname: 'Deniz',
    active: true,
  })

  assert.equal(a.displayNameOrNickname, b.displayNameOrNickname)
  assert.notEqual(a.studentId, b.studentId)
})

test('TD-01 rejects malformed, control-character and oversized roster identity', () => {
  assert.throws(
    () => createStudentRosterEntry({
      studentId: '',
      displayNameOrNickname: 'Deniz',
      active: true,
    }),
    /studentId/,
  )

  assert.throws(
    () => createStudentRosterEntry({
      studentId: 'student\u0000x',
      displayNameOrNickname: 'Deniz',
      active: true,
    }),
    /studentId/,
  )

  assert.throws(
    () => createStudentRosterEntry({
      studentId: 's'.repeat(257),
      displayNameOrNickname: 'Deniz',
      active: true,
    }),
    /studentId/,
  )
})

test('TD-01 rejects unsupported roster input fields and forged records', () => {
  assert.throws(
    () => createStudentRosterEntry({
      studentId: 'student-1',
      displayNameOrNickname: 'Deniz',
      active: true,
      authorizationRole: 'admin',
    }),
    /unsupported field/,
  )

  const valid = createStudentRosterEntry({
    studentId: 'student-1',
    displayNameOrNickname: 'Deniz',
    active: false,
  })
  assert.equal(isStudentRosterEntry(structuredClone(valid)), false)
  assert.equal(
    isStudentRosterEntry(Object.freeze({ ...valid, authorizationRole: 'admin' })),
    false,
  )
})

test('TD-01 active must be an explicit boolean', () => {
  for (const active of [undefined, null, 1, 'true']) {
    assert.throws(
      () => createStudentRosterEntry({
        studentId: 'student-1',
        displayNameOrNickname: 'Deniz',
        active,
      }),
      /active/,
    )
  }
})
