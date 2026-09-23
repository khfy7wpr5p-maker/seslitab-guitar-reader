import assert from 'node:assert/strict'
import test from 'node:test'

async function load(path, label) {
  try {
    return await import(path)
  } catch {
    assert.fail(label + ' module must exist')
  }
}

function immutableAssignment() {
  const sourceRef = Object.freeze({
    schemaVersion: 1,
    sourceKind: 'score_exact_revision',
    studentId: 'student-a',
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
  })
  return Object.freeze({
    schemaVersion: 1,
    assignmentId: 'assignment-a',
    studentId: 'student-a',
    practiceType: 'SCORE',
    teacherNote: 'Tekrar',
    state: 'ACTIVE',
    assignedAt: '2026-09-23T08:01:00Z',
    revokedAt: null,
    sourceRef,
  })
}

test('identity mapping resolves stable domain identity while principal drops provider subject', async () => {
  const {
    createSecureDeliveryIdentityMapping,
    createSecureDeliveryPrincipal,
  } = await load(
    '../src/services/secureDeliveryIdentity.js',
    'secureDeliveryIdentity',
  )

  const mapping = createSecureDeliveryIdentityMapping({
    providerSubject: 'firebase-uid-a',
    role: 'STUDENT',
    teacherId: null,
    studentId: 'student-a',
    active: true,
    createdAt: '2026-09-23T08:00:00Z',
    disabledAt: null,
  })
  const principal = createSecureDeliveryPrincipal(mapping)

  assert.deepEqual(principal, Object.freeze({
    role: 'STUDENT',
    teacherId: null,
    studentId: 'student-a',
  }))
  assert.equal('providerSubject' in principal, false)
  assert.equal(Object.isFrozen(mapping), true)
  assert.equal(Object.isFrozen(principal), true)
})

test('identity mapping rejects role ambiguity and inactive principal creation', async () => {
  const {
    createSecureDeliveryIdentityMapping,
    createSecureDeliveryPrincipal,
  } = await load(
    '../src/services/secureDeliveryIdentity.js',
    'secureDeliveryIdentity',
  )

  assert.throws(
    () => createSecureDeliveryIdentityMapping({
      providerSubject: 'uid-a',
      role: 'STUDENT',
      teacherId: 'teacher-a',
      studentId: 'student-a',
      active: true,
      createdAt: '2026-09-23T08:00:00Z',
      disabledAt: null,
    }),
    /teacherId|role/i,
  )

  const disabled = createSecureDeliveryIdentityMapping({
    providerSubject: 'uid-a',
    role: 'STUDENT',
    teacherId: null,
    studentId: 'student-a',
    active: false,
    createdAt: '2026-09-23T08:00:00Z',
    disabledAt: '2026-09-23T08:05:00Z',
  })
  assert.throws(
    () => createSecureDeliveryPrincipal(disabled),
    /inactive|disabled/i,
  )
})

test('teacher-student grant is immutable and requires stable IDs', async () => {
  const { createTeacherStudentGrant } = await load(
    '../src/services/teacherStudentGrant.js',
    'teacherStudentGrant',
  )
  const grant = createTeacherStudentGrant({
    teacherId: 'teacher-a',
    studentId: 'student-a',
    active: true,
    createdAt: '2026-09-23T08:00:00Z',
    revokedAt: null,
  })
  assert.equal(Object.isFrozen(grant), true)
  assert.equal(grant.teacherId, 'teacher-a')
  assert.equal(grant.studentId, 'student-a')
})

test('PreparedAssignmentRecord preserves exact immutable assignment authority', async () => {
  const { createPreparedAssignmentRecord } = await load(
    '../src/services/preparedAssignmentRecord.js',
    'preparedAssignmentRecord',
  )
  const assignment = immutableAssignment()
  const row = createPreparedAssignmentRecord({
    teacherId: 'teacher-a',
    assignment,
    packageId: 'package-a',
    packageFingerprint: 'a'.repeat(64),
    preparedAt: '2026-09-23T08:02:00Z',
  })

  assert.equal(Object.isFrozen(row), true)
  assert.equal(row.assignment, assignment)
  assert.equal(row.assignment.assignmentId, 'assignment-a')
})

test('DeliveryRecord v1 uses assignmentId as deliveryId and revoke is one-way/idempotent', async () => {
  const {
    createDeliveryRecord,
    revokeDeliveryRecord,
  } = await load(
    '../src/services/deliveryRecord.js',
    'deliveryRecord',
  )
  const row = createDeliveryRecord({
    assignmentId: 'assignment-a',
    packageId: 'package-a',
    teacherId: 'teacher-a',
    studentId: 'student-a',
    deliveredAt: '2026-09-23T08:03:00Z',
  })

  assert.equal(row.deliveryId, 'assignment-a')
  assert.equal(row.revokedAt, null)
  assert.equal(Object.isFrozen(row), true)

  const revoked = revokeDeliveryRecord(row, '2026-09-23T08:04:00Z')
  assert.equal(revoked.revokedAt, '2026-09-23T08:04:00Z')
  assert.equal(
    revokeDeliveryRecord(revoked, '2026-09-23T09:00:00Z'),
    revoked,
  )
})
