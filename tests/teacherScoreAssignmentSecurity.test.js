import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const td04Sources = [
  '../src/services/teacherScoreAssignmentRepository.js',
  '../src/services/teacherScoreAssignmentService.js',
  '../src/services/teacherScoreAssignmentController.js',
  '../src/teacherScoreAssignmentUi.js',
]

test('TD-04 contains no provider network browser persistence or Student App implementation', () => {
  for (const path of td04Sources) {
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

test('TD-04 does not production-mount SCORE assignment UI', () => {
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
      /teacherScoreAssignmentUi|mountTeacherScoreAssignmentUi|teacher-score-assignment/i,
      path,
    )
  }
})

test('TD-04 source exposes no assignment lifecycle revoke or Chord Board producer surface', () => {
  const combined = td04Sources
    .map((path) =>
      readFileSync(
        new URL(path, import.meta.url),
        'utf8',
      ),
    )
    .join('\n')

  assert.doesNotMatch(
    combined,
    /transitionAssignment|completeAssignment|promoteToRepertoire|revokeAssignment|CHORD_BOARD|chord-board/i,
  )
})

test('TD-04 UI copy prepares assignments and never claims delivery', () => {
  const source = readFileSync(
    new URL(
      '../src/teacherScoreAssignmentUi.js',
      import.meta.url,
    ),
    'utf8',
  )

  assert.match(source, /Ödevi Hazırla/)
  assert.doesNotMatch(
    source,
    /Gönderildi|Teslim edildi|Öğrenciye gönder/i,
  )
})

test('TD-04 does not change Stage L delivery boundary', () => {
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
