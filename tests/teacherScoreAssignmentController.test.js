import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createTeacherScoreAssignmentController,
} from '../src/services/teacherScoreAssignmentController.js'

function controller({
  students = Object.freeze([
    Object.freeze({
      studentId: 'student-a',
      displayNameOrNickname: 'Ada',
    }),
    Object.freeze({
      studentId: 'student-b',
      displayNameOrNickname: 'Bora',
    }),
  ]),
  result = Object.freeze([
    Object.freeze({
      assignmentId: 'assignment-a',
      studentId: 'student-a',
    }),
  ]),
  error = null,
} = {}) {
  return createTeacherScoreAssignmentController({
    rosterService: {
      listStudents({ includeInactive }) {
        assert.equal(includeInactive, false)
        return students
      },
    },
    assignmentService: {
      prepareScoreAssignments(input) {
        if (error) throw error
        assert.ok(input)
        return result
      },
    },
  })
}

test('TD-04 controller exposes only active roster presentation identity', () => {
  const view = controller().getViewModel()

  assert.equal(Object.isFrozen(view), true)
  assert.equal(
    Object.isFrozen(view.students),
    true,
  )
  assert.deepEqual(view.students, [
    {
      studentId: 'student-a',
      displayNameOrNickname: 'Ada',
    },
    {
      studentId: 'student-b',
      displayNameOrNickname: 'Bora',
    },
  ])
})

test('TD-04 controller reports acknowledged assignment count as prepared not delivered', () => {
  const assignments = Object.freeze([
    Object.freeze({
      assignmentId: 'assignment-a',
      studentId: 'student-a',
    }),
    Object.freeze({
      assignmentId: 'assignment-b',
      studentId: 'student-b',
    }),
    Object.freeze({
      assignmentId: 'assignment-c',
      studentId: 'student-c',
    }),
  ])

  const result = controller({
    result: assignments,
  }).prepare({
    workspace: Object.freeze({}),
  })

  assert.equal(result.ok, true)
  assert.equal(
    result.message,
    '3 ödev hazırlandı.',
  )
  assert.equal(
    result.assignments,
    assignments,
  )
  assert.doesNotMatch(
    result.message,
    /gönder|teslim/i,
  )
})

test('TD-04 controller maps inactive and missing roster failures', () => {
  const inactive = controller({
    error: new Error(
      'teacher-roster-student-inactive:student-x',
    ),
  }).prepare({})

  assert.deepEqual(inactive, {
    ok: false,
    assignments: Object.freeze([]),
    message:
      'Seçilen öğrencilerden biri aktif değil.',
  })

  const missing = controller({
    error: new Error(
      'teacher-roster-student-not-found:student-x',
    ),
  }).prepare({})

  assert.deepEqual(missing, {
    ok: false,
    assignments: Object.freeze([]),
    message:
      'Seçilen öğrencilerden biri bulunamadı.',
  })
})

test('TD-04 controller maps readiness duplicate and acknowledgement failures to bounded copy', () => {
  const cases = [
    [
      'score-assignment-readiness-not-eligible:source_quality_not_eligible:none',
      'Eser bu öğrenci için ödeve hazır değil.',
    ],
    [
      'teacher-score-assignment-already-prepared:student-a',
      'Bu öğrenci için aynı ödev zaten hazırlanmış.',
    ],
    [
      'teacher SCORE assignment repository acknowledgement mismatch token=secret',
      'Ödev işlemi doğrulanamadı.',
    ],
  ]

  for (const [error, message] of cases) {
    const result = controller({
      error: new Error(error),
    }).prepare({})

    assert.equal(result.ok, false)
    assert.deepEqual(
      result.assignments,
      [],
    )
    assert.equal(result.message, message)
    assert.equal(
      JSON.stringify(result).includes(
        'secret',
      ),
      false,
    )
  }
})

test('TD-04 controller fallback does not leak raw technical errors', () => {
  const result = controller({
    error: new Error(
      'firebase bearer=secret revisionId=internal',
    ),
  }).prepare({})

  assert.equal(result.ok, false)
  assert.deepEqual(
    result.assignments,
    [],
  )
  assert.equal(
    result.message,
    'Ödevler hazırlanamadı.',
  )
  assert.equal(
    JSON.stringify(result).includes(
      'secret',
    ),
    false,
  )
})
