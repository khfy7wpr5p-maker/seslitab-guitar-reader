import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createDeliveryRecord,
} from '../src/services/deliveryRecord.js'
import {
  createPreparedAssignmentRecord,
} from '../src/services/preparedAssignmentRecord.js'
import {
  createSecureDeliveryIdentityMapping,
} from '../src/services/secureDeliveryIdentity.js'
import {
  createTeacherStudentGrant,
} from '../src/services/teacherStudentGrant.js'
import {
  restorePrivateAssignmentV1,
} from '../src/services/teacherDeliveryWireCodec.js'
import {
  createSecureDeliveryAuthorization,
} from '../backend/delivery/authorization/secureDeliveryAuthorization.js'
import {
  createInMemorySecureDeliveryStore,
} from '../backend/delivery/repositories/inMemorySecureDeliveryStore.js'
import {
  createTeacherPieceService,
} from '../backend/delivery/services/teacherPieceService.js'

function scoreAssignment() {
  return restorePrivateAssignmentV1({
    schemaVersion: 1,
    assignmentId: 'ses154-direct-score-a',
    studentId: 'ses154-direct-student-a',
    practiceType: 'SCORE',
    teacherNote: 'Direct repertoire regression.',
    state: 'ACTIVE',
    assignedAt: '2026-10-03T08:00:00Z',
    revokedAt: null,
    sourceRef: {
      schemaVersion: 1,
      sourceKind: 'score_exact_revision',
      studentId: 'ses154-direct-student-a',
      sourceId: 'ses154-direct-source-a',
      sourceRevisionId:
        'ses154-direct-source-revision-a',
      revisionId: 'ses154-direct-revision-a',
      revisionKind: 'automatic',
      contentFingerprint:
        'ses154-direct-content-a',
      lineageFingerprint:
        'ses154-direct-lineage-a',
      approvalId: 'ses154-direct-approval-a',
      authorizationId:
        'ses154-direct-authorization-a',
      qualityEvidenceId:
        'ses154-direct-quality-a',
      revalidationEvidenceId: null,
      readinessRoute: 'package12',
      package12Status: 'PASS',
      boundAt: '2026-10-03T07:59:00Z',
    },
  })
}

function harness() {
  const assignment = scoreAssignment()
  const prepared = createPreparedAssignmentRecord({
    teacherId: 'ses154-direct-teacher-a',
    assignment,
    packageId: 'ses154-direct-package-a',
    packageFingerprint: 'a'.repeat(64),
    preparedAt: '2026-10-03T08:01:00Z',
  })
  const delivery = createDeliveryRecord({
    assignmentId: assignment.assignmentId,
    packageId: prepared.packageId,
    teacherId: prepared.teacherId,
    studentId: assignment.studentId,
    deliveredAt: '2026-10-03T08:02:00Z',
  })
  const teacher = createSecureDeliveryIdentityMapping({
    providerSubject: 'uid-ses154-direct-teacher-a',
    role: 'TEACHER',
    teacherId: prepared.teacherId,
    studentId: null,
    active: true,
    createdAt: '2026-10-03T07:00:00Z',
    disabledAt: null,
  })
  const grant = createTeacherStudentGrant({
    teacherId: prepared.teacherId,
    studentId: assignment.studentId,
    active: true,
    createdAt: '2026-10-03T07:00:00Z',
    revokedAt: null,
  })
  const store = createInMemorySecureDeliveryStore({
    identityMappings: [teacher],
    grants: [grant],
    preparedAssignments: [prepared],
    deliveries: [delivery],
  })
  const authorization =
    createSecureDeliveryAuthorization({ store })
  const timestamps = [
    '2026-10-03T08:10:00Z',
    '2026-10-03T09:00:00Z',
    '2026-10-03T10:00:00Z',
  ]
  let index = 0
  const service = createTeacherPieceService({
    authorization,
    store,
    now: () =>
      timestamps[
        Math.min(index++, timestamps.length - 1)
      ],
  })

  return {
    assignment,
    service,
    store,
  }
}

test('SES-154 teacher can place ACTIVE Piece directly in REPERTOIRE atomically without exposing COMPLETED', async () => {
  const {
    assignment,
    service,
    store,
  } = harness()

  const piece = await service.createPiece({
    providerSubject:
      'uid-ses154-direct-teacher-a',
    input: {
      pieceAssignmentId:
        'ses154-direct-piece-a',
      pieceId: 'ses154-direct-work-a',
      arrangementId:
        'ses154-direct-arrangement-a',
      studentId: assignment.studentId,
      title: 'Direct repertoire work',
      teacherNote: '',
      scoreAssignmentId:
        assignment.assignmentId,
      chordAssignmentIds: [],
    },
  })

  const repertoire =
    await service.applyPieceAction({
      providerSubject:
        'uid-ses154-direct-teacher-a',
      pieceAssignmentId:
        piece.pieceAssignmentId,
      action: 'PLACE_IN_REPERTOIRE',
    })

  assert.equal(repertoire.state, 'REPERTOIRE')
  assert.equal(
    repertoire.stateChangedAt,
    '2026-10-03T09:00:00Z',
  )
  assert.equal(
    (await store.getLifecycle(
      assignment.assignmentId,
    )).state,
    'REPERTOIRE',
  )
  assert.equal(
    (await store.getDelivery(
      assignment.assignmentId,
    )).revokedAt,
    null,
  )

  const retry = await service.applyPieceAction({
    providerSubject:
      'uid-ses154-direct-teacher-a',
    pieceAssignmentId:
      piece.pieceAssignmentId,
    action: 'PLACE_IN_REPERTOIRE',
  })
  assert.deepEqual(retry, repertoire)

  const revoked = await service.applyPieceAction({
    providerSubject:
      'uid-ses154-direct-teacher-a',
    pieceAssignmentId:
      piece.pieceAssignmentId,
    action: 'REVOKE',
  })
  assert.equal(
    revoked.revokedAt,
    '2026-10-03T10:00:00Z',
  )
  assert.equal(
    (await store.getLifecycle(
      assignment.assignmentId,
    )).revokedAt,
    '2026-10-03T10:00:00Z',
  )
  assert.equal(
    (await store.getDelivery(
      assignment.assignmentId,
    )).revokedAt,
    '2026-10-03T10:00:00Z',
  )
})
