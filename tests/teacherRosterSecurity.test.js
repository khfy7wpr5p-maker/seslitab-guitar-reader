import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { createStudentRosterEntry } from '../src/services/studentRosterEntry.js'
import {
  createInMemoryTeacherRosterRepository,
} from '../src/services/teacherRosterRepository.js'
import { createTeacherRosterService } from '../src/services/teacherRosterService.js'

test('TD-02 roster source contains no provider, network or browser-persistence implementation', () => {
  for (const path of [
    '../src/services/teacherRosterRepository.js',
    '../src/services/teacherRosterService.js',
  ]) {
    const source = readFileSync(
      new URL(path, import.meta.url),
      'utf8',
    )

    assert.doesNotMatch(
      source,
      /firebase|adminCredential|listUsers\s*\(|fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|firestore|database|bearer|token/i,
    )
  }
})

test('TD-02 does not wire roster behavior into production UI entry points', () => {
  const main = readFileSync(
    new URL('../main.js', import.meta.url),
    'utf8',
  )

  assert.doesNotMatch(
    main,
    /teacherRosterRepository|teacherRosterService|teacherRosterUi/i,
  )
})

test('TD-02 service exposes read/preflight operations only', () => {
  const repository = createInMemoryTeacherRosterRepository([
    createStudentRosterEntry({
      studentId: 'student-a',
      displayNameOrNickname: 'Deniz',
      active: true,
    }),
  ])
  const roster = createTeacherRosterService({ repository })

  assert.deepEqual(
    Object.keys(roster).sort(),
    [
      'getStudent',
      'listStudents',
      'preflightActiveStudentIds',
      'requireActiveStudent',
    ],
  )

  for (const forbidden of [
    'createStudent',
    'updateStudent',
    'renameStudent',
    'activateStudent',
    'deactivateStudent',
    'deleteStudent',
    'save',
    'persist',
    'sync',
    'listFirebaseUsers',
  ]) {
    assert.equal(forbidden in roster, false, forbidden)
  }
})

test('TD-02 human-readable name never becomes an identity API', () => {
  const repository = createInMemoryTeacherRosterRepository([
    createStudentRosterEntry({
      studentId: 'student-a',
      displayNameOrNickname: 'Aynı Ad',
      active: true,
    }),
    createStudentRosterEntry({
      studentId: 'student-b',
      displayNameOrNickname: 'Aynı Ad',
      active: true,
    }),
  ])
  const roster = createTeacherRosterService({ repository })

  assert.equal(roster.getStudent('student-a').studentId, 'student-a')
  assert.equal(roster.getStudent('student-b').studentId, 'student-b')
  assert.equal('getStudentByDisplayName' in roster, false)
  assert.equal('resolveStudentName' in roster, false)
})
