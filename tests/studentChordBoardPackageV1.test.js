import assert from 'node:assert/strict'
import test from 'node:test'

import { getChordBoardVoicings } from '../src/services/chordBoardCatalog.js'
import { createChordBoardAssignmentSourceBinding } from '../src/services/chordBoardAssignmentSourceBinding.js'
import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  createPrivateAssignment,
} from '../src/services/privateAssignment.js'

let packageApi = null
try {
  packageApi = await import(
    '../src/services/studentChordBoardPackageV1.js'
  )
} catch {}

function requireApi() {
  assert.ok(
    packageApi,
    'TD-07 StudentChordBoardPackageV1 module must exist',
  )
  return packageApi
}

function assignment({
  assignmentId = 'assignment-chord-a',
  studentId = 'student-a',
  teacherNote = '60 BPM ile çalış.',
} = {}) {
  const assignedAt = '2026-09-23T13:00:00Z'
  const snapshot = getChordBoardVoicings('Am')[0]
  return createPrivateAssignment({
    assignmentId,
    studentId,
    practiceType:
      PRIVATE_ASSIGNMENT_PRACTICE_TYPE.CHORD_BOARD,
    teacherNote,
    assignedAt,
    sourceRef:
      createChordBoardAssignmentSourceBinding({
        studentId,
        snapshot,
        boundAt: assignedAt,
      }),
  })
}

test('TD-07 builds student-safe CHORD_BOARD package from exact assignment', () => {
  const {
    createStudentPrivateChordBoardPackageV1,
    validateStudentChordBoardPackageV1,
  } = requireApi()
  const row = assignment()
  const pkg =
    createStudentPrivateChordBoardPackageV1({
      assignment: row,
      practice: {
        repeatCount: 4,
      },
    })

  assert.equal(pkg.schemaVersion, '1.0.0')
  assert.equal(pkg.packageType, 'CHORD_BOARD')
  assert.equal(pkg.packageId, row.assignmentId)
  assert.equal(
    pkg.title,
    'Am akor çalışması',
  )
  assert.deepEqual(
    pkg.assignmentAuthority,
    {
      assignmentId: row.assignmentId,
      state: 'teacher_assigned',
      assignedAt: row.assignedAt,
    },
  )
  assert.equal(
    pkg.publication.scope,
    'student_private',
  )
  assert.equal(
    pkg.publication.recipientStudentId,
    row.studentId,
  )
  assert.equal(
    pkg.content.chordBoard,
    row.sourceRef.snapshot,
  )
  assert.equal(
    pkg.practice.teacherNote,
    row.teacherNote,
  )
  assert.equal(pkg.practice.repeatCount, 4)
  assert.equal(Object.isFrozen(pkg), true)
  assert.equal(Object.isFrozen(pkg.practice), true)
  assert.equal(validateStudentChordBoardPackageV1(pkg).ok, true)

  for (const forbidden of [
    'providerSubject',
    'authorizationId',
    'qualityEvidenceId',
    'revalidationEvidenceId',
  ]) {
    assert.equal(forbidden in pkg, false)
  }
})

test('TD-07 CHORD_BOARD package rejects wrong assignment kind and unsupported fields', () => {
  const {
    createStudentPrivateChordBoardPackageV1,
    validateStudentChordBoardPackageV1,
  } = requireApi()

  assert.throws(
    () =>
      createStudentPrivateChordBoardPackageV1({
        assignment: Object.freeze({
          practiceType: 'SCORE',
        }),
        practice: {},
      }),
    /CHORD_BOARD|assignment/i,
  )

  const pkg = structuredClone(
    createStudentPrivateChordBoardPackageV1({
      assignment: assignment(),
      practice: {},
    }),
  )
  pkg.providerSubject = 'provider-teacher'
  assert.equal(
    validateStudentChordBoardPackageV1(pkg).ok,
    false,
  )
  assert.match(
    validateStudentChordBoardPackageV1(pkg)
      .errors.join('\n'),
    /unsupported (?:top-level|package) field: providerSubject/i,
  )
})

test('TD-07 CHORD_BOARD package rejects assignment identity and exact snapshot mismatch', () => {
  const {
    createStudentPrivateChordBoardPackageV1,
    validateStudentChordBoardPackageV1,
  } = requireApi()

  const wrongId = structuredClone(
    createStudentPrivateChordBoardPackageV1({
      assignment: assignment(),
      practice: {},
    }),
  )
  wrongId.packageId = 'package-other'
  assert.match(
    validateStudentChordBoardPackageV1(wrongId)
      .errors.join('\n'),
    /packageId|assignmentId/i,
  )

  const malformed = structuredClone(
    createStudentPrivateChordBoardPackageV1({
      assignment: assignment(),
      practice: {},
    }),
  )
  malformed.content.chordBoard.voicing.frets =
    [-1, 0, 2]
  assert.match(
    validateStudentChordBoardPackageV1(malformed)
      .errors.join('\n'),
    /chordBoard|snapshot|voicing|frets/i,
  )
})

test('TD-07 CHORD_BOARD practice payload rejects unsupported JSON and teacherNote override', () => {
  const {
    createStudentPrivateChordBoardPackageV1,
  } = requireApi()
  const row = assignment()

  assert.throws(
    () =>
      createStudentPrivateChordBoardPackageV1({
        assignment: row,
        practice: {
          bad: undefined,
        },
      }),
    /unsupported JSON/i,
  )

  assert.throws(
    () =>
      createStudentPrivateChordBoardPackageV1({
        assignment: row,
        practice: {
          teacherNote: 'forged',
        },
      }),
    /teacherNote/i,
  )
})
