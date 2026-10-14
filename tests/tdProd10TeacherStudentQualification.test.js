import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  buildTdProd10QualificationFixture,
} from '../scripts/tdProd10TeacherStudentFixture.js'

const STUDENT_APP_SHA =
  'b084b691820e8a10e2c141857951ce3aa8fc57e6'

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

test('SES-224 qualifies C-sharp notation, exact TAB fingering, playback pitch, and score-only compatibility', async () => {
  const fixture =
    await buildTdProd10QualificationFixture()
  const scoreXml =
    fixture.score.package.content.score.data
  const tabXml =
    fixture.score.package.content.guitarTab.data

  assert.match(
    scoreXml,
    /<software>Smoosic<\/software>/,
  )
  assert.match(
    scoreXml,
    /<clef-octave-change>-1<\/clef-octave-change>/,
  )
  assert.match(
    scoreXml,
    /<pitch>\s*<step>C<\/step>\s*<alter>1<\/alter>\s*<octave>4<\/octave>\s*<\/pitch>/,
  )
  assert.match(
    tabXml,
    /<pitch>\s*<step>C<\/step>\s*<alter>1<\/alter>\s*<octave>4<\/octave>\s*<\/pitch>[\s\S]*?<technical>\s*<string>2<\/string>\s*<fret>2<\/fret>/,
  )
  assert.deepEqual(
    fixture.qualification,
    {
      expectedFirstPitch: {
        step: 'C',
        alter: 1,
        octave: 4,
        midi: 61,
      },
      rejectedFirstMidi: [49, 73],
      expectedFirstTabPosition: {
        string: 2,
        fret: 2,
      },
    },
  )
  assert.equal(
    fixture.scoreOnly.package.content
      .guitarTab,
    null,
  )
  assert.equal(
    fixture.scoreOnly.package.content
      .score.data,
    scoreXml,
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

test('SES-224 opens the score-only assignment through the current Student work-title control', async () => {
  const browserSpec = await readFile(
    new URL(
      '../qualification/td-prod-10/student-app-e2e.spec.mjs',
      import.meta.url,
    ),
    'utf8',
  )

  assert.doesNotMatch(
    browserSpec,
    /article\.assignment-card-score|name:\s*["']Çalışmayı Aç["']/,
  )
  assert.match(
    browserSpec,
    /name:\s*TD_PROD_10_FIXTURE\s*\.scoreOnly\.package\.title/,
  )
})
