import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const td05Sources = [
  '../src/services/assignmentLifecycleRecord.js',
  '../src/services/teacherAssignmentLifecycleRepository.js',
  '../src/services/teacherAssignmentLifecycleService.js',
  '../src/services/teacherAssignmentLifecycleController.js',
  '../src/teacherAssignmentLifecycleUi.js',
]

test('TD-05 contains no provider network browser persistence or Student App implementation', () => {
  for (const path of td05Sources) {
    const source = readFileSync(
      new URL(path, import.meta.url),
      'utf8',
    )

    assert.doesNotMatch(
      source,
      /firebase|firestore|adminCredential|listUsers\s*\(|fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|bearer|token|student-app|st-student-app/i,
      path,
    )
  }
})

test('TD-05 does not production-mount lifecycle UI', () => {
  for (const path of [
    '../main.js',
    '../src/app.js',
    '../src/appShell.js',
  ]) {
    const source = readFileSync(
      new URL(path, import.meta.url),
      'utf8',
    )

    assert.doesNotMatch(
      source,
      /teacherAssignmentLifecycleUi|mountTeacherAssignmentLifecycleUi|teacher-assignment-lifecycle/i,
      path,
    )
  }
})

test('TD-05 preserves initial PrivateAssignment validator boundary', () => {
  const source = readFileSync(
    new URL(
      '../src/services/privateAssignment.js',
      import.meta.url,
    ),
    'utf8',
  )

  assert.match(
    source,
    /value\.state\s*!==\s*PRIVATE_ASSIGNMENT_STATE\.ACTIVE/,
  )
  assert.match(
    source,
    /value\.revokedAt\s*!==\s*null/,
  )
  assert.match(
    source,
    /value\.practiceType\s*!==\s*PRIVATE_ASSIGNMENT_PRACTICE_TYPE\.SCORE/,
  )
})

test('TD-05 teacher UI copy never claims student delivery', () => {
  const source = readFileSync(
    new URL(
      '../src/teacherAssignmentLifecycleUi.js',
      import.meta.url,
    ),
    'utf8',
  )

  assert.match(source, /Ödev Yönetimi/)
  assert.doesNotMatch(
    source,
    /Gönderildi|Teslim edildi|Öğrenciye gönder|Öğrenci aldı/i,
  )
})

test('TD-05 does not change Stage L delivery boundary', () => {
  const source = readFileSync(
    new URL(
      '../src/services/stageLShareReadiness.js',
      import.meta.url,
    ),
    'utf8',
  )

  assert.match(
    source,
    /STAGE_L_DELIVERY_STATE = 'not_implemented'/,
  )
  assert.match(
    source,
    /deliveryAllowed:\s*false/,
  )
})

test('TD-05 introduces no Chord Board producer or lifecycle student authority', () => {
  const combined = td05Sources
    .map((path) =>
      readFileSync(
        new URL(path, import.meta.url),
        'utf8',
      ),
    )
    .join('\n')

  assert.doesNotMatch(
    combined,
    /CHORD_BOARD|chord-board|studentCompleted|studentReady|studentMutation/i,
  )
})

test('TD-05 leaves TD-04 SCORE producer free of lifecycle mutation surface', () => {
  const source = readFileSync(
    new URL(
      '../src/services/teacherScoreAssignmentService.js',
      import.meta.url,
    ),
    'utf8',
  )

  assert.doesNotMatch(
    source,
    /teacherAssignmentLifecycle|transitionAssignment|revokeAssignment|moveToRepertoire/i,
  )
})
