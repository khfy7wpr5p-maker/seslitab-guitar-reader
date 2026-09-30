import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  buildTdProd10QualificationFixture,
} from '../scripts/tdProd10TeacherStudentFixture.js'

const STUDENT_APP_SHA =
  'b59bcb6dc5525f035515ab358734ebbe5a277fbb'

test('SES-122 builds exact delivered SCORE + CHORD_BOARD output for one authorized student', async () => {
  const fixture =
    await buildTdProd10QualificationFixture()

  assert.equal(
    fixture.schemaVersion,
    1,
  )
  assert.equal(
    fixture.studentAppSourceRevision,
    STUDENT_APP_SHA,
  )
  assert.equal(
    fixture.student.studentId,
    'td-prod-10-student-a',
  )
  assert.equal(
    fixture.score.practiceType,
    'SCORE',
  )
  assert.equal(
    fixture.score.package.publication
      .recipientStudentId,
    fixture.student.studentId,
  )
  assert.equal(
    fixture.chord.practiceType,
    'CHORD_BOARD',
  )
  assert.equal(
    fixture.chord.package.packageType,
    'CHORD_BOARD',
  )
  assert.equal(
    fixture.chord.package.publication
      .recipientStudentId,
    fixture.student.studentId,
  )
  assert.equal(
    fixture.piece.contentRefs.scoreAssignmentId,
    fixture.score.assignmentId,
  )
  assert.deepEqual(
    fixture.piece.contentRefs.chordAssignmentIds,
    [fixture.chord.assignmentId],
  )
})

test('SES-122 qualification proves fail-closed negative and retry invariants without production mutation', async () => {
  const fixture =
    await buildTdProd10QualificationFixture()

  assert.deepEqual(
    fixture.evidence,
    {
      wrongStudentRejected: true,
      missingGrantRejected: true,
      staleScoreAuthorityRejected: true,
      tamperedChordFingerprintRejected: true,
      oversizedPrepareRejectedBeforeNetwork: true,
      exactReplayIdempotent: true,
      durablePrepareRetainedAfterDeliveryFailure: true,
      retryReachedDelivered: true,
    },
  )
})

test('SES-122 CI pins exact Student App revision and qualifies Chromium + WebKit without production deploy', async () => {
  const workflow = await readFile(
    new URL(
      '../.github/workflows/ci.yml',
      import.meta.url,
    ),
    'utf8',
  )

  assert.match(
    workflow,
    new RegExp(
      `STUDENT_APP_SHA:\\s*${STUDENT_APP_SHA}`,
    ),
  )
  assert.match(
    workflow,
    /browser:\s*\[chromium, webkit\]/,
  )
  assert.match(
    workflow,
    /td-prod-10-teacher-student-e2e/,
  )
  assert.match(
    workflow,
    /writeTdProd10StudentFixture\.js/,
  )
  assert.match(
    workflow,
    /td-prod-10-teacher-delivery\.spec\.mjs/,
  )
  assert.doesNotMatch(
    workflow,
    /render\.com|SECURE_DELIVERY_TEACHER_WRITES_ACTIVATION:\s*true/,
  )
})
