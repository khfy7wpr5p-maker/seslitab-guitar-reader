import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PRIVATE_ASSIGNMENT_STATE,
} from '../src/services/privateAssignment.js'
import {
  createTeacherAssignmentLifecycleController,
} from '../src/services/teacherAssignmentLifecycleController.js'

function lifecycleRecord({
  assignmentId = 'assignment-a',
  studentId = 'student-a',
  teacherNote = 'Yavaş çalış.',
  state = PRIVATE_ASSIGNMENT_STATE.ACTIVE,
  revokedAt = null,
} = {}) {
  return Object.freeze({
    assignment: Object.freeze({
      assignmentId,
      studentId,
      teacherNote,
      sourceRef: Object.freeze({
        revisionId: 'internal-revision',
        authorizationId: 'internal-auth',
      }),
    }),
    state,
    revokedAt,
  })
}

function controllerFixture({
  rows = Object.freeze([
    lifecycleRecord(),
  ]),
  rosterStudents = Object.freeze([
    Object.freeze({
      studentId: 'student-a',
      displayNameOrNickname: 'Ada',
    }),
  ]),
  errors = {},
} = {}) {
  const calls = []

  const lifecycleService = {
    listAssignments() {
      return rows
    },
    markCompleted(assignmentId) {
      calls.push(['complete', assignmentId])
      if (errors.complete) throw errors.complete
      return rows[0]
    },
    moveToRepertoire(assignmentId) {
      calls.push(['repertoire', assignmentId])
      if (errors.repertoire) throw errors.repertoire
      return rows[0]
    },
    revokeAssignment(assignmentId) {
      calls.push(['revoke', assignmentId])
      if (errors.revoke) throw errors.revoke
      return rows[0]
    },
  }

  const rosterService = {
    listStudents({ includeInactive }) {
      assert.equal(includeInactive, true)
      return rosterStudents
    },
  }

  return {
    calls,
    controller:
      createTeacherAssignmentLifecycleController({
        lifecycleService,
        rosterService,
      }),
  }
}

test('TD-05 controller exposes lifecycle presentation without source diagnostics', () => {
  const { controller } = controllerFixture()
  const view = controller.getViewModel()
  const row = view.assignments[0]

  assert.equal(Object.isFrozen(view), true)
  assert.equal(
    Object.isFrozen(view.assignments),
    true,
  )
  assert.equal(
    row.displayNameOrNickname,
    'Ada',
  )
  assert.equal(
    row.state,
    PRIVATE_ASSIGNMENT_STATE.ACTIVE,
  )
  assert.equal(row.revoked, false)
  assert.equal(row.teacherNote, 'Yavaş çalış.')
  assert.equal(row.assignmentId, 'assignment-a')
  assert.equal(
    Object.hasOwn(row, 'studentId'),
    false,
  )
  assert.equal(
    Object.hasOwn(row, 'sourceRef'),
    false,
  )
  assert.equal(
    Object.hasOwn(row, 'revisionId'),
    false,
  )
  assert.equal(
    Object.hasOwn(row, 'authorizationId'),
    false,
  )
})

test('TD-05 controller keeps assignment manageable when roster presentation is missing', () => {
  const { controller } = controllerFixture({
    rosterStudents: Object.freeze([]),
  })

  const view = controller.getViewModel()

  assert.equal(view.assignments.length, 1)
  assert.equal(
    view.assignments[0].displayNameOrNickname,
    'Öğrenci',
  )
  assert.equal(
    view.assignments[0].assignmentId,
    'assignment-a',
  )
  assert.notEqual(
    view.assignments[0].displayNameOrNickname,
    'student-a',
  )
})

test('TD-05 controller maps lifecycle action success to bounded teacher copy', () => {
  const { controller, calls } =
    controllerFixture()

  const completed =
    controller.markCompleted('assignment-a')
  const repertoire =
    controller.moveToRepertoire('assignment-a')
  const revoked =
    controller.revoke('assignment-a')

  assert.deepEqual(
    calls,
    [
      ['complete', 'assignment-a'],
      ['repertoire', 'assignment-a'],
      ['revoke', 'assignment-a'],
    ],
  )
  assert.equal(
    completed.message,
    'Ödev tamamlandı.',
  )
  assert.equal(
    repertoire.message,
    'Ödev repertuara eklendi.',
  )
  assert.equal(
    revoked.message,
    'Ödev geri çekildi.',
  )
  assert.equal(completed.ok, true)
  assert.equal(repertoire.ok, true)
  assert.equal(revoked.ok, true)
})

test('TD-05 controller maps domain failures to bounded copy', () => {
  const cases = [
    [
      'teacher-assignment-not-found:assignment-x',
      'Ödev bulunamadı.',
    ],
    [
      'teacher-assignment-transition-not-allowed:ACTIVE:REPERTOIRE',
      'Bu işlem mevcut ödev durumunda yapılamaz.',
    ],
    [
      'teacher-assignment-lifecycle-revoked:assignment-a',
      'Geri çekilmiş ödev değiştirilemez.',
    ],
    [
      'teacher assignment lifecycle repository acknowledgement mismatch secret=hidden',
      'Ödev işlemi doğrulanamadı.',
    ],
    [
      'teacher assignment lifecycle lookup mismatch internal-token',
      'Ödev işlemi doğrulanamadı.',
    ],
  ]

  for (const [message, expected] of cases) {
    const { controller } = controllerFixture({
      errors: {
        complete: new Error(message),
      },
    })

    const result =
      controller.markCompleted('assignment-a')

    assert.equal(result.ok, false)
    assert.equal(result.record, null)
    assert.equal(result.message, expected)
    assert.equal(
      JSON.stringify(result).includes('hidden'),
      false,
    )
    assert.equal(
      JSON.stringify(result).includes('internal-token'),
      false,
    )
  }
})

test('TD-05 controller fallback never leaks raw technical error', () => {
  const { controller } = controllerFixture({
    errors: {
      revoke: new Error(
        'firebase bearer=secret revisionId=internal',
      ),
    },
  })

  const result =
    controller.revoke('assignment-a')

  assert.equal(result.ok, false)
  assert.equal(result.record, null)
  assert.equal(
    result.message,
    'Ödev güncellenemedi.',
  )
  assert.equal(
    JSON.stringify(result).includes('secret'),
    false,
  )
  assert.equal(
    JSON.stringify(result).includes('revisionId'),
    false,
  )
})

test('TD-05 controller preserves inactive roster presentation when available', () => {
  const { controller } = controllerFixture({
    rosterStudents: Object.freeze([
      Object.freeze({
        studentId: 'student-a',
        displayNameOrNickname: 'Ada Eski',
        active: false,
      }),
    ]),
  })

  assert.equal(
    controller.getViewModel()
      .assignments[0]
      .displayNameOrNickname,
    'Ada Eski',
  )
})

test('TD-05 controller validates required service surfaces', () => {
  assert.throws(
    () =>
      createTeacherAssignmentLifecycleController({
        lifecycleService: {},
        rosterService: {
          listStudents() {
            return []
          },
        },
      }),
    /lifecycleService/i,
  )

  assert.throws(
    () =>
      createTeacherAssignmentLifecycleController({
        lifecycleService: {
          listAssignments() {
            return []
          },
          markCompleted() {},
          moveToRepertoire() {},
          revokeAssignment() {},
        },
        rosterService: {},
      }),
    /rosterService/i,
  )
})
