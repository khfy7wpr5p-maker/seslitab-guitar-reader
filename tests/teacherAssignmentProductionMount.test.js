import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  mountTeacherAssignmentProduction,
} from '../src/teacherAssignmentProductionMount.js'

function readyComposition({
  teacherId = 'teacher-a',
  mountAssignmentSurface,
  ...extra
} = {}) {
  return Object.freeze({
    authenticatedTeacher: Object.freeze({
      teacherId,
    }),
    mountAssignmentSurface,
    ...extra,
  })
}

test('TD-PROD-01 mount seam contains no privileged provider browser authority or legacy assignment UI imports', () => {
  const source = readFileSync(
    new URL(
      '../src/teacherAssignmentProductionMount.js',
      import.meta.url,
    ),
    'utf8',
  )

  assert.doesNotMatch(
    source,
    /firebase-admin|from\s+['"]firebase(?:\/|['"])|firestore|localStorage|sessionStorage|indexedDB|Authorization\s*:|Bearer\s|student-app|st-student-app/i,
  )
  assert.doesNotMatch(
    source,
    /teacherScoreAssignmentUi|mountTeacherScoreAssignmentUi|teacherChordBoardAssignmentUi|mountTeacherChordBoardAssignmentUi/i,
  )
})

test('TD-PROD-01 stays unavailable when production composition is absent', () => {
  const result =
    mountTeacherAssignmentProduction({
      root: Object.freeze({ marker: 'root' }),
    })

  assert.equal(result.mounted, false)
  assert.equal(
    result.reason,
    'composition-unavailable',
  )
})

test('TD-PROD-01 stays unavailable without exact authenticated teacher identity', () => {
  let mountCalls = 0
  const result =
    mountTeacherAssignmentProduction({
      root: Object.freeze({ marker: 'root' }),
      composition: readyComposition({
        teacherId: '   ',
        mountAssignmentSurface() {
          mountCalls += 1
        },
      }),
    })

  assert.equal(result.mounted, false)
  assert.equal(
    result.reason,
    'teacher-auth-required',
  )
  assert.equal(mountCalls, 0)
})

test('TD-PROD-01 stays unavailable when authenticated composition has no assignment surface', () => {
  const result =
    mountTeacherAssignmentProduction({
      root: Object.freeze({ marker: 'root' }),
      composition: readyComposition(),
    })

  assert.equal(result.mounted, false)
  assert.equal(
    result.reason,
    'assignment-surface-unavailable',
  )
})

test('TD-PROD-01 mounts exactly the injected teacher assignment surface after auth prerequisites pass', () => {
  const root =
    Object.freeze({ marker: 'root' })
  const calls = []
  let destroyed = 0

  const result =
    mountTeacherAssignmentProduction({
      root,
      composition: readyComposition({
        idToken: 'must-not-be-forwarded',
        mountAssignmentSurface(input) {
          calls.push(input)
          return Object.freeze({
            destroy() {
              destroyed += 1
            },
          })
        },
      }),
    })

  assert.equal(result.mounted, true)
  assert.equal(result.reason, null)
  assert.deepEqual(calls, [{
    root,
    teacherId: 'teacher-a',
  }])
  assert.deepEqual(
    Object.keys(calls[0]).sort(),
    ['root', 'teacherId'],
  )

  result.destroy()
  result.destroy()
  assert.equal(destroyed, 1)
})
