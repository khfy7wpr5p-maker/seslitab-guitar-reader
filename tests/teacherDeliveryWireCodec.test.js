import assert from 'node:assert/strict'
import test from 'node:test'

import { getChordBoardVoicings } from '../src/services/chordBoardCatalog.js'

async function loadCodec() {
  try {
    return await import('../src/services/teacherDeliveryWireCodec.js')
  } catch {
    assert.fail('teacherDeliveryWireCodec module must exist')
  }
}

function rawSource(studentId = 'student-a') {
  return {
    schemaVersion: 1,
    sourceKind: 'score_exact_revision',
    studentId,
    sourceId: 'source-a',
    sourceRevisionId: 'source-revision-a',
    revisionId: 'revision-a',
    revisionKind: 'automatic',
    contentFingerprint: 'content-a',
    lineageFingerprint: 'lineage-a',
    approvalId: 'approval-a',
    authorizationId: 'authorization-a',
    qualityEvidenceId: 'quality-a',
    revalidationEvidenceId: 'revalidation-a',
    readinessRoute: 'package12',
    package12Status: 'PASS',
    boundAt: '2026-09-23T08:00:00Z',
  }
}


function rawChordAssignment(studentId = 'student-a') {
  const snapshot = structuredClone(
    getChordBoardVoicings('Am')[0],
  )
  return {
    schemaVersion: 1,
    assignmentId: 'assignment-chord-a',
    studentId,
    practiceType: 'CHORD_BOARD',
    teacherNote: 'Am akoru',
    state: 'ACTIVE',
    assignedAt: '2026-09-23T12:01:00Z',
    revokedAt: null,
    sourceRef: {
      schemaVersion: 1,
      sourceKind: 'chord_board_exact_voicing',
      studentId,
      snapshot,
      voicingFingerprint:
        snapshot.voicingFingerprint,
      boundAt: '2026-09-23T12:00:00Z',
    },
  }
}

function rawAssignment(studentId = 'student-a') {
  return {
    schemaVersion: 1,
    assignmentId: 'assignment-a',
    studentId,
    practiceType: 'SCORE',
    teacherNote: 'Ölçü 8 tekrar',
    state: 'ACTIVE',
    assignedAt: '2026-09-23T08:01:00Z',
    revokedAt: null,
    sourceRef: rawSource(studentId),
  }
}

test('TD-06 restores mutable PrivateAssignment JSON into exact immutable v1 shape', async () => {
  const { restorePrivateAssignmentV1 } = await loadCodec()
  const raw = structuredClone(rawAssignment())
  const restored = restorePrivateAssignmentV1(raw)

  assert.equal(Object.isFrozen(restored), true)
  assert.equal(Object.isFrozen(restored.sourceRef), true)
  assert.equal(restored.assignmentId, raw.assignmentId)
  assert.equal(restored.studentId, raw.studentId)
  assert.equal(restored.sourceRef.revisionId, raw.sourceRef.revisionId)
  assert.notEqual(restored, raw)
  assert.notEqual(restored.sourceRef, raw.sourceRef)
})

test('TD-06 wire codec rejects unknown fields and cross-student source substitution', async () => {
  const { restorePrivateAssignmentV1 } = await loadCodec()

  assert.throws(
    () => restorePrivateAssignmentV1({
      ...structuredClone(rawAssignment()),
      firebaseUid: 'uid-a',
    }),
    /field|unsupported|PrivateAssignment/i,
  )

  const mismatch = structuredClone(rawAssignment())
  mismatch.sourceRef.studentId = 'student-b'
  assert.throws(
    () => restorePrivateAssignmentV1(mismatch),
    /student/i,
  )
})

test('TD-06 restores lifecycle against the exact durable assignment authority', async () => {
  const {
    restorePrivateAssignmentV1,
    restoreAssignmentLifecycleRecordV1,
  } = await loadCodec()
  const assignment = restorePrivateAssignmentV1(rawAssignment())

  const lifecycle = restoreAssignmentLifecycleRecordV1({
    schemaVersion: 1,
    assignment: structuredClone(rawAssignment()),
    state: 'COMPLETED',
    stateChangedAt: '2026-09-23T08:10:00Z',
    revokedAt: null,
  }, assignment)

  assert.equal(Object.isFrozen(lifecycle), true)
  assert.equal(lifecycle.assignment, assignment)
  assert.equal(lifecycle.state, 'COMPLETED')

  const mismatch = {
    schemaVersion: 1,
    assignment: structuredClone(rawAssignment('student-b')),
    state: 'COMPLETED',
    stateChangedAt: '2026-09-23T08:10:00Z',
    revokedAt: null,
  }
  assert.throws(
    () => restoreAssignmentLifecycleRecordV1(mismatch, assignment),
    /assignment|student|mismatch/i,
  )
})

test('TD-06 restores roster and Pool publication while preserving strict audience rules', async () => {
  const {
    restoreStudentRosterEntryV1,
    restorePoolPublicationRecordV1,
  } = await loadCodec()

  const roster = restoreStudentRosterEntryV1({
    schemaVersion: 1,
    studentId: 'student-a',
    displayNameOrNickname: 'Deniz',
    active: true,
  })
  assert.equal(Object.isFrozen(roster), true)
  assert.equal(roster.studentId, 'student-a')

  const pool = restorePoolPublicationRecordV1({
    schemaVersion: 1,
    item: {
      schemaVersion: 1,
      poolItemId: 'pool-a',
      title: 'Etüt',
      shortDescription: 'Kısa açıklama',
      detailText: '',
      publishedAt: '2026-09-23T08:00:00Z',
      audienceMode: 'SELECTED',
      recipientStudentIds: ['student-a'],
      revokedAt: null,
    },
    revokedAt: null,
  })
  assert.equal(Object.isFrozen(pool), true)
  assert.equal(Object.isFrozen(pool.item), true)
  assert.equal(Object.isFrozen(pool.item.recipientStudentIds), true)

  const invalid = structuredClone({
    schemaVersion: 1,
    item: {
      schemaVersion: 1,
      poolItemId: 'pool-b',
      title: 'Etüt',
      shortDescription: 'Kısa açıklama',
      detailText: '',
      publishedAt: '2026-09-23T08:00:00Z',
      audienceMode: 'ALL',
      recipientStudentIds: ['student-a'],
      revokedAt: null,
    },
    revokedAt: null,
  })
  assert.throws(
    () => restorePoolPublicationRecordV1(invalid),
    /ALL|recipient/i,
  )
})


test('TD-07 wire codec restores mutable CHORD_BOARD JSON into exact immutable authority', async () => {
  const { restorePrivateAssignmentV1 } = await loadCodec()
  const raw = rawChordAssignment()
  const restored = restorePrivateAssignmentV1(
    structuredClone(raw),
  )

  assert.equal(restored.practiceType, 'CHORD_BOARD')
  assert.equal(Object.isFrozen(restored), true)
  assert.equal(Object.isFrozen(restored.sourceRef), true)
  assert.equal(
    Object.isFrozen(restored.sourceRef.snapshot),
    true,
  )
  assert.deepEqual(
    restored.sourceRef.snapshot.voicing.frets,
    [-1, 0, 2, 2, 1, 0],
  )
  assert.equal(
    restored.sourceRef.voicingFingerprint,
    raw.sourceRef.voicingFingerprint,
  )
})

test('TD-07 wire codec rejects mixed source variants and malformed chord source fields', async () => {
  const { restorePrivateAssignmentV1 } = await loadCodec()

  const scoreWithChord = rawAssignment()
  scoreWithChord.sourceRef =
    rawChordAssignment().sourceRef
  assert.throws(
    () => restorePrivateAssignmentV1(scoreWithChord),
    /source|SCORE|score/i,
  )

  const chordWithScore = rawChordAssignment()
  chordWithScore.sourceRef = rawSource()
  assert.throws(
    () => restorePrivateAssignmentV1(chordWithScore),
    /source|CHORD|chord/i,
  )

  const malformed = rawChordAssignment()
  malformed.sourceRef.firebaseUid = 'uid-leak'
  assert.throws(
    () => restorePrivateAssignmentV1(malformed),
    /field|unsupported|source/i,
  )
})
