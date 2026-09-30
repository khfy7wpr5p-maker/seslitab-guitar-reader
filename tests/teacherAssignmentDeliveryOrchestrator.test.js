import assert from 'node:assert/strict'
import test from 'node:test'

import { getChordBoardVoicings } from '../src/services/chordBoardCatalog.js'
import {
  createChordBoardAssignmentSourceBinding,
} from '../src/services/chordBoardAssignmentSourceBinding.js'
import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  createPrivateAssignment,
} from '../src/services/privateAssignment.js'
import {
  createStudentPrivateChordBoardPackageV1,
} from '../src/services/studentChordBoardPackageV1.js'
import {
  createStudentPrivatePracticePackageV1,
} from '../src/services/studentPracticePackageV1.js'
import {
  TEACHER_ASSIGNMENT_DELIVERY_PHASE,
  createTeacherAssignmentDeliveryOrchestrator,
} from '../src/services/teacherAssignmentDeliveryOrchestrator.js'

function scorePair({
  assignmentId = 'assignment-score-a',
  studentId = 'student-a',
  packageId = 'package-score-a',
} = {}) {
  const assignment = createPrivateAssignment({
    assignmentId,
    studentId,
    practiceType:
      PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE,
    teacherNote: 'Ölçüleri yavaş çalış.',
    assignedAt: '2026-09-30T12:00:00Z',
    sourceRef: Object.freeze({
      schemaVersion: 1,
      sourceKind: 'score_exact_revision',
      studentId,
      sourceId: 'score-source-a',
      sourceRevisionId: 'score-root-a',
      revisionId: 'score-revision-a',
      revisionKind: 'teacher_corrected',
      contentFingerprint: 'content-score-a',
      lineageFingerprint: 'lineage-score-a',
      approvalId: 'approval-score-a',
      authorizationId: 'authorization-score-a',
      qualityEvidenceId: 'quality-score-a',
      revalidationEvidenceId: 'revalidation-score-a',
      readinessRoute: 'package12_t2',
      package12Status: 'eligible_exact_revision',
      boundAt: '2026-09-30T12:00:00Z',
    }),
  })
  const pkg =
    createStudentPrivatePracticePackageV1({
      packageId,
      workId: 'score-source-a',
      title: 'Final Etüt',
      revisionId: 'score-revision-a',
      approvedAt: '2026-09-30T11:59:00Z',
      studentId,
      musicXml:
        '<score-partwise version="4.0"><part-list></part-list></score-partwise>',
      canonicalEvents: [],
      practice: {},
    })
  return Object.freeze({
    assignment,
    package: pkg,
  })
}

function chordPair({
  assignmentId = 'assignment-chord-a',
  studentId = 'student-b',
} = {}) {
  const snapshot =
    getChordBoardVoicings('Am')[0]
  const assignedAt =
    '2026-09-30T12:00:00Z'
  const assignment =
    createPrivateAssignment({
      assignmentId,
      studentId,
      practiceType:
        PRIVATE_ASSIGNMENT_PRACTICE_TYPE
          .CHORD_BOARD,
      teacherNote: 'Akoru temiz çalış.',
      assignedAt,
      sourceRef:
        createChordBoardAssignmentSourceBinding({
          studentId,
          snapshot,
          boundAt: assignedAt,
        }),
    })
  return Object.freeze({
    assignment,
    package:
      createStudentPrivateChordBoardPackageV1({
        assignment,
        practice: {},
      }),
  })
}

function preparedAck(pair) {
  return Object.freeze({
    schemaVersion: 1,
    teacherId: 'teacher-a',
    assignment:
      structuredClone(pair.assignment),
    packageId: pair.package.packageId,
    packageFingerprint: 'a'.repeat(64),
    preparedAt: '2026-09-30T12:01:00Z',
  })
}

function deliveryAck(pair) {
  return Object.freeze({
    schemaVersion: 1,
    deliveryId: pair.assignment.assignmentId,
    assignmentId:
      pair.assignment.assignmentId,
    packageId: pair.package.packageId,
    teacherId: 'teacher-a',
    studentId: pair.assignment.studentId,
    deliveredAt: '2026-09-30T12:02:00Z',
    revokedAt: null,
  })
}

function harness({
  prepareError = null,
  deliveryError = null,
  preparedTransform = (rows) => rows,
  deliveryTransform = (rows) => rows,
} = {}) {
  const calls = {
    prepare: [],
    deliver: [],
  }
  const secureDeliveryClient = {
    async prepareAssignments(items) {
      calls.prepare.push(items)
      if (prepareError) throw prepareError
      return preparedTransform(
        items.map(preparedAck),
      )
    },
    async deliverAssignments(ids) {
      calls.deliver.push(ids)
      if (deliveryError) throw deliveryError
      const source = calls.prepare.at(-1) ?? []
      const byId = new Map(
        source.map((pair) => [
          pair.assignment.assignmentId,
          pair,
        ]),
      )
      return deliveryTransform(
        ids.map((id) =>
          deliveryAck(byId.get(id)),
        ),
      )
    },
  }
  return {
    calls,
    orchestrator:
      createTeacherAssignmentDeliveryOrchestrator({
        secureDeliveryClient,
      }),
  }
}

test('SES-118 uses one exact batch prepare and one exact batch delivery for SCORE + CHORD_BOARD', async () => {
  const score = scorePair()
  const chord = chordPair()
  const { orchestrator, calls } = harness()

  const result = await orchestrator.deliver([
    score,
    chord,
  ])

  assert.equal(result.ok, true)
  assert.equal(
    result.phase,
    TEACHER_ASSIGNMENT_DELIVERY_PHASE
      .DELIVERED_TO_STUDENT,
  )
  assert.deepEqual(
    result.assignments,
    [score.assignment, chord.assignment],
  )
  assert.equal(Object.isFrozen(result), true)
  assert.equal(
    Object.isFrozen(result.assignments),
    true,
  )
  assert.equal(calls.prepare.length, 1)
  assert.equal(calls.deliver.length, 1)
  assert.equal(calls.prepare[0].length, 2)
  assert.deepEqual(
    calls.deliver[0],
    [
      score.assignment.assignmentId,
      chord.assignment.assignmentId,
    ],
  )
})

test('SES-118 preflights every pair before any network write', async () => {
  const score = scorePair()
  const wrongPackage =
    structuredClone(score.package)
  wrongPackage.publication.recipientStudentId =
    'student-other'
  const { orchestrator, calls } = harness()

  const result = await orchestrator.deliver([
    score,
    Object.freeze({
      assignment: chordPair().assignment,
      package: wrongPackage,
    }),
  ])

  assert.equal(result.ok, false)
  assert.equal(
    result.phase,
    TEACHER_ASSIGNMENT_DELIVERY_PHASE
      .LOCAL_ASSIGNMENT_ONLY,
  )
  assert.deepEqual(result.assignments, [])
  assert.equal(calls.prepare.length, 0)
  assert.equal(calls.deliver.length, 0)
})

test('SES-118 prepare rejection or substituted prepare acknowledgement never starts delivery', async () => {
  for (const options of [
    {
      prepareError:
        new Error('provider unavailable'),
    },
    {
      preparedTransform(rows) {
        return rows.map((row, index) =>
          index === 0
            ? {
                ...row,
                packageId: 'forged-package',
              }
            : row,
        )
      },
    },
  ]) {
    const score = scorePair()
    const chord = chordPair()
    const { orchestrator, calls } =
      harness(options)

    const result =
      await orchestrator.deliver([
        score,
        chord,
      ])

    assert.equal(result.ok, false)
    assert.equal(
      result.phase,
      TEACHER_ASSIGNMENT_DELIVERY_PHASE
        .LOCAL_ASSIGNMENT_ONLY,
    )
    assert.equal(calls.prepare.length, 1)
    assert.equal(calls.deliver.length, 0)
  }
})

test('SES-118 delivery rejection or substituted delivery acknowledgement preserves DURABLY_PREPARED', async () => {
  for (const options of [
    {
      deliveryError:
        new Error('delivery unavailable'),
    },
    {
      deliveryTransform(rows) {
        return rows.map((row, index) =>
          index === 0
            ? {
                ...row,
                studentId: 'student-forged',
              }
            : row,
        )
      },
    },
  ]) {
    const score = scorePair()
    const chord = chordPair()
    const { orchestrator, calls } =
      harness(options)

    const result =
      await orchestrator.deliver([
        score,
        chord,
      ])

    assert.equal(result.ok, false)
    assert.equal(
      result.phase,
      TEACHER_ASSIGNMENT_DELIVERY_PHASE
        .DURABLY_PREPARED,
    )
    assert.deepEqual(
      result.assignments,
      [score.assignment, chord.assignment],
    )
    assert.equal(calls.prepare.length, 1)
    assert.equal(calls.deliver.length, 1)
  }
})

test('SES-118 exact replay stays successful while duplicate ids inside one request fail closed before prepare', async () => {
  const score = scorePair()
  const { orchestrator, calls } = harness()

  const first =
    await orchestrator.deliver([score])
  const second =
    await orchestrator.deliver([score])

  assert.equal(
    first.phase,
    TEACHER_ASSIGNMENT_DELIVERY_PHASE
      .DELIVERED_TO_STUDENT,
  )
  assert.equal(
    second.phase,
    TEACHER_ASSIGNMENT_DELIVERY_PHASE
      .DELIVERED_TO_STUDENT,
  )
  assert.equal(calls.prepare.length, 2)
  assert.equal(calls.deliver.length, 2)

  const duplicate =
    await orchestrator.deliver([
      score,
      score,
    ])
  assert.equal(
    duplicate.phase,
    TEACHER_ASSIGNMENT_DELIVERY_PHASE
      .LOCAL_ASSIGNMENT_ONLY,
  )
  assert.equal(calls.prepare.length, 2)
  assert.equal(calls.deliver.length, 2)
})

test('SES-118 enforces the existing 40-assignment batch boundary before prepare', async () => {
  const pairs = Array.from(
    { length: 41 },
    (_, index) =>
      scorePair({
        assignmentId:
          'assignment-score-' + index,
        studentId: 'student-' + index,
        packageId:
          'package-score-' + index,
      }),
  )
  const { orchestrator, calls } = harness()

  const result =
    await orchestrator.deliver(pairs)

  assert.equal(
    result.phase,
    TEACHER_ASSIGNMENT_DELIVERY_PHASE
      .LOCAL_ASSIGNMENT_ONLY,
  )
  assert.equal(calls.prepare.length, 0)
  assert.equal(calls.deliver.length, 0)
})
