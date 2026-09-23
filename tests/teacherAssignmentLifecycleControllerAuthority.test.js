import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createTeacherAssignmentLifecycleController,
} from '../src/services/teacherAssignmentLifecycleController.js'

function controllerFor(errorMessage) {
  return createTeacherAssignmentLifecycleController({
    lifecycleService: {
      listAssignments() {
        return Object.freeze([])
      },
      markCompleted() {
        throw new Error(errorMessage)
      },
      moveToRepertoire() {
        throw new Error(errorMessage)
      },
      revokeAssignment() {
        throw new Error(errorMessage)
      },
    },
    rosterService: {
      listStudents() {
        return Object.freeze([])
      },
    },
  })
}

test('TD-05 controller maps hyphenated assignment lookup mismatch to verification copy', () => {
  const result = controllerFor(
    'teacher-assignment-lookup-mismatch:assignment-a',
  ).markCompleted('assignment-a')

  assert.equal(result.ok, false)
  assert.equal(result.record, null)
  assert.equal(
    result.message,
    'Ödev işlemi doğrulanamadı.',
  )
})

test('TD-05 controller maps lifecycle assignment substitution mismatch to verification copy', () => {
  const result = controllerFor(
    'teacher assignment lifecycle assignment mismatch: assignment-a',
  ).markCompleted('assignment-a')

  assert.equal(result.ok, false)
  assert.equal(result.record, null)
  assert.equal(
    result.message,
    'Ödev işlemi doğrulanamadı.',
  )
})
