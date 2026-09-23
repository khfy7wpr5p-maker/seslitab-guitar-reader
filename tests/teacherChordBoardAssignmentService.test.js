import assert from 'node:assert/strict'
import test from 'node:test'

import { getChordBoardVoicings } from '../src/services/chordBoardCatalog.js'
import { createStudentRosterEntry } from '../src/services/studentRosterEntry.js'
import { createInMemoryTeacherRosterRepository } from '../src/services/teacherRosterRepository.js'
import { createTeacherRosterService } from '../src/services/teacherRosterService.js'

let repositoryApi = null
let serviceApi = null
try {
  repositoryApi = await import(
    '../src/services/teacherChordBoardAssignmentRepository.js'
  )
} catch {}
try {
  serviceApi = await import(
    '../src/services/teacherChordBoardAssignmentService.js'
  )
} catch {}

function requireApis() {
  assert.ok(
    repositoryApi,
    'TD-07 teacher CHORD_BOARD assignment repository module must exist',
  )
  assert.ok(
    serviceApi,
    'TD-07 teacher CHORD_BOARD assignment service module must exist',
  )
  return {
    ...repositoryApi,
    ...serviceApi,
  }
}

function roster() {
  const entries = [
    createStudentRosterEntry({
      studentId: 'student-a',
      displayNameOrNickname: 'A',
      active: true,
    }),
    createStudentRosterEntry({
      studentId: 'student-b',
      displayNameOrNickname: 'B',
      active: true,
    }),
    createStudentRosterEntry({
      studentId: 'student-off',
      displayNameOrNickname: 'Off',
      active: false,
    }),
  ]
  return createTeacherRosterService({
    repository:
      createInMemoryTeacherRosterRepository(entries),
  })
}

function harness({
  repository,
  assignmentIds = [],
  now = '2026-09-23T13:00:00Z',
} = {}) {
  const {
    createInMemoryTeacherChordBoardAssignmentRepository,
    createTeacherChordBoardAssignmentService,
  } = requireApis()
  const assignmentCalls = []
  const queue = [...assignmentIds]
  const trustedRepository =
    repository ??
    createInMemoryTeacherChordBoardAssignmentRepository()

  const service =
    createTeacherChordBoardAssignmentService({
      repository: trustedRepository,
      rosterService: roster(),
      createAssignmentId(input) {
        assignmentCalls.push(input)
        return (
          queue.shift() ??
          `assignment-${input.studentId}-${input.index}`
        )
      },
      now() {
        return now
      },
    })

  return {
    service,
    repository: trustedRepository,
    assignmentCalls,
  }
}

function prepare(
  service,
  overrides = {},
) {
  return service.prepareChordBoardAssignments({
    snapshot: getChordBoardVoicings('Am')[0],
    studentIds: ['student-a'],
    commonTeacherNote: '',
    teacherNoteOverrides: [],
    ...overrides,
  })
}

test('TD-07 teacher service fans one exact pinned voicing to recipient-bound assignments', () => {
  const { service } = harness({
    assignmentIds: [
      'assignment-a',
      'assignment-b',
    ],
  })

  const rows = prepare(service, {
    studentIds: ['student-a', 'student-b'],
    commonTeacherNote: '60 BPM ile çalış.',
    teacherNoteOverrides: [{
      studentId: 'student-b',
      teacherNote: 'Önce yavaş çalış.',
    }],
  })

  assert.equal(rows.length, 2)
  assert.deepEqual(
    rows.map((row) => row.studentId),
    ['student-a', 'student-b'],
  )
  assert.deepEqual(
    rows.map((row) => row.teacherNote),
    ['60 BPM ile çalış.', 'Önce yavaş çalış.'],
  )
  assert.equal(
    rows[0].sourceRef.snapshot,
    rows[1].sourceRef.snapshot,
  )
  assert.equal(
    rows[0].sourceRef.voicingFingerprint,
    rows[1].sourceRef.voicingFingerprint,
  )
  assert.notEqual(rows[0].assignmentId, rows[1].assignmentId)
})

test('TD-07 teacher service normalizes duplicate students and rejects inactive or missing targets before write', () => {
  const { service, repository } = harness()

  const rows = prepare(service, {
    studentIds: ['student-a', 'student-a'],
  })
  assert.equal(rows.length, 1)
  assert.equal(repository.list().length, 1)

  const next = harness()
  assert.throws(
    () => prepare(next.service, {
      studentIds: ['student-a', 'student-off'],
    }),
    /student-inactive/i,
  )
  assert.deepEqual(next.repository.list(), [])

  assert.throws(
    () => prepare(next.service, {
      studentIds: ['student-missing'],
    }),
    /student-not-found/i,
  )
  assert.deepEqual(next.repository.list(), [])
})

test('TD-07 teacher service rejects unpinned structurally valid voicing before ID allocation', () => {
  const { service, assignmentCalls, repository } =
    harness()
  const pinned = getChordBoardVoicings('Am')[0]
  const forged = Object.freeze({
    ...pinned,
    voicing: Object.freeze({
      ...pinned.voicing,
      frets: Object.freeze([-1, 0, 2, 2, 1, 3]),
      fingers: Object.freeze([-1, 0, 2, 3, 1, 4]),
    }),
  })

  assert.throws(
    () => prepare(service, { snapshot: forged }),
    /pinned|catalog|voicing/i,
  )
  assert.deepEqual(assignmentCalls, [])
  assert.deepEqual(repository.list(), [])
})

test('TD-07 teacher service enforces maximum 40 recipients and all-or-nothing preflight', () => {
  const entries = Array.from(
    { length: 41 },
    (_, index) =>
      createStudentRosterEntry({
        studentId: `student-${index + 1}`,
        displayNameOrNickname: `S${index + 1}`,
        active: true,
      }),
  )
  const rosterService = createTeacherRosterService({
    repository:
      createInMemoryTeacherRosterRepository(entries),
  })
  const {
    createInMemoryTeacherChordBoardAssignmentRepository,
    createTeacherChordBoardAssignmentService,
  } = requireApis()
  const repository =
    createInMemoryTeacherChordBoardAssignmentRepository()
  let idCalls = 0
  const service =
    createTeacherChordBoardAssignmentService({
      repository,
      rosterService,
      createAssignmentId({ studentId }) {
        idCalls += 1
        return `assignment-${studentId}`
      },
      now() {
        return '2026-09-23T13:00:00Z'
      },
    })

  assert.throws(
    () =>
      service.prepareChordBoardAssignments({
        snapshot: getChordBoardVoicings('Am')[0],
        studentIds: entries.map((row) => row.studentId),
        commonTeacherNote: '',
        teacherNoteOverrides: [],
      }),
    /40|batch|maximum/i,
  )
  assert.equal(idCalls, 0)
  assert.deepEqual(repository.list(), [])
})

test('TD-07 teacher service exact retry is idempotent but changed teacher note conflicts', () => {
  const firstHarness = harness({
    assignmentIds: ['assignment-a'],
  })
  const first = prepare(firstHarness.service, {
    commonTeacherNote: 'A',
  })

  const retryHarness = harness({
    repository: firstHarness.repository,
    assignmentIds: ['must-not-be-used'],
    now: '2026-09-23T14:00:00Z',
  })
  const retried = prepare(retryHarness.service, {
    commonTeacherNote: 'A',
  })

  assert.equal(retried.length, 1)
  assert.equal(retried[0], first[0])
  assert.deepEqual(retryHarness.assignmentCalls, [])

  assert.throws(
    () => prepare(retryHarness.service, {
      commonTeacherNote: 'B',
    }),
    /conflict|already|note/i,
  )
  assert.equal(
    firstHarness.repository.list().length,
    1,
  )
})

test('TD-07 teacher service rejects invalid override batch before repository mutation', () => {
  const { service, repository, assignmentCalls } =
    harness()

  for (const teacherNoteOverrides of [
    [
      { studentId: 'student-a', teacherNote: 'A' },
      { studentId: 'student-a', teacherNote: 'B' },
    ],
    [
      { studentId: 'student-b', teacherNote: 'B' },
    ],
  ]) {
    assert.throws(
      () => prepare(service, {
        teacherNoteOverrides,
      }),
      /override/i,
    )
  }

  assert.deepEqual(repository.list(), [])
  assert.deepEqual(assignmentCalls, [])
})
