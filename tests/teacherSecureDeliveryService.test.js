import assert from 'node:assert/strict'
import test from 'node:test'

import { restorePrivateAssignmentV1 } from '../src/services/teacherDeliveryWireCodec.js'
import { createStudentPrivatePracticePackageV1 } from '../src/services/studentPracticePackageV1.js'
import { fingerprintPracticePackage } from '../backend/delivery/integrity/packageFingerprint.js'
import { createPreparedAssignmentRecord } from '../src/services/preparedAssignmentRecord.js'
import { createSecureDeliveryIdentityMapping } from '../src/services/secureDeliveryIdentity.js'
import { createTeacherStudentGrant } from '../src/services/teacherStudentGrant.js'
import { createSecureDeliveryAuthorization } from '../backend/delivery/authorization/secureDeliveryAuthorization.js'
import { createInMemorySecureDeliveryStore } from '../backend/delivery/repositories/inMemorySecureDeliveryStore.js'

async function loadService() {
  try {
    return await import('../backend/delivery/services/teacherDeliveryService.js')
  } catch {
    assert.fail('teacherDeliveryService module must exist')
  }
}

function prepared(assignmentId, studentId, revisionId, packageId) {
  const assignment = restorePrivateAssignmentV1({
    schemaVersion: 1,
    assignmentId,
    studentId,
    practiceType: 'SCORE',
    teacherNote: 'Çalış',
    state: 'ACTIVE',
    assignedAt: '2026-09-23T08:01:00Z',
    revokedAt: null,
    sourceRef: {
      schemaVersion: 1,
      sourceKind: 'score_exact_revision',
      studentId,
      sourceId: 'source-' + assignmentId,
      sourceRevisionId: 'root-' + assignmentId,
      revisionId,
      revisionKind: 'automatic',
      contentFingerprint: 'content-' + revisionId,
      lineageFingerprint: 'lineage-' + revisionId,
      approvalId: 'approval-' + revisionId,
      authorizationId: 'authorization-' + revisionId,
      qualityEvidenceId: 'quality-' + revisionId,
      revalidationEvidenceId: 'revalidation-' + revisionId,
      readinessRoute: 'package12',
      package12Status: 'PASS',
      boundAt: '2026-09-23T08:00:00Z',
    },
  })
  const pkg = createStudentPrivatePracticePackageV1({
    packageId,
    workId: 'work-' + packageId,
    title: 'Etüt',
    revisionId,
    approvedAt: '2026-09-23T08:00:00Z',
    studentId,
    musicXml: '<score-partwise version="4.0"></score-partwise>',
    canonicalEvents: [],
    practice: { tempoBpm: 80 },
  })
  return {
    record: createPreparedAssignmentRecord({
      teacherId: 'teacher-a',
      assignment,
      packageId,
      packageFingerprint: fingerprintPracticePackage(pkg),
      preparedAt: '2026-09-23T08:02:00Z',
    }),
    package: pkg,
  }
}

function harness({ rows, grants } = {}) {
  const actualRows = rows ?? [prepared('assignment-a', 'student-a', 'revision-a', 'package-a')]
  const mapping = createSecureDeliveryIdentityMapping({
    providerSubject: 'uid-teacher',
    role: 'TEACHER',
    teacherId: 'teacher-a',
    studentId: null,
    active: true,
    createdAt: '2026-09-23T08:00:00Z',
    disabledAt: null,
  })
  const grantRows = (grants ?? ['student-a']).map((studentId) =>
    createTeacherStudentGrant({
      teacherId: 'teacher-a',
      studentId,
      active: true,
      createdAt: '2026-09-23T08:00:00Z',
      revokedAt: null,
    }),
  )
  const store = createInMemorySecureDeliveryStore({
    identityMappings: [mapping],
    grants: grantRows,
    preparedAssignments: actualRows.map((row) => row.record),
    practicePackages: actualRows.map((row) => row.package),
  })
  let nowCalls = 0
  let eventCalls = 0
  return {
    store,
    authorization: createSecureDeliveryAuthorization({ store }),
    now() {
      nowCalls += 1
      return '2026-09-23T08:' + String(2 + nowCalls).padStart(2, '0') + ':00Z'
    },
    createHistoryEventId() {
      eventCalls += 1
      return 'history-' + eventCalls
    },
    nowCalls: () => nowCalls,
    eventCalls: () => eventCalls,
  }
}

test('delivery accepts only durable prepared assignment and exact replay is idempotent', async () => {
  const { createTeacherSecureDeliveryService } = await loadService()
  const h = harness()
  const service = createTeacherSecureDeliveryService(h)
  const first = await service.deliverBatch({
    providerSubject: 'uid-teacher',
    assignmentIds: ['assignment-a'],
  })
  assert.equal(first[0].deliveryId, 'assignment-a')
  assert.equal(h.nowCalls(), 1)

  const second = await service.deliverBatch({
    providerSubject: 'uid-teacher',
    assignmentIds: ['assignment-a'],
  })
  assert.equal(second[0], first[0])
  assert.equal(h.nowCalls(), 1)

  await assert.rejects(
    () => service.deliverBatch({
      providerSubject: 'uid-teacher',
      assignmentIds: ['assignment-missing'],
    }),
    /prepared|not-found/i,
  )
})

test('one unauthorized item prevents every new delivery in a batch', async () => {
  const { createTeacherSecureDeliveryService } = await loadService()
  const rows = [
    prepared('assignment-a', 'student-a', 'revision-a', 'package-a'),
    prepared('assignment-b', 'student-b', 'revision-b', 'package-b'),
  ]
  const h = harness({ rows, grants: ['student-a'] })
  const service = createTeacherSecureDeliveryService(h)

  await assert.rejects(
    () => service.deliverBatch({
      providerSubject: 'uid-teacher',
      assignmentIds: ['assignment-a', 'assignment-b'],
    }),
    /grant/i,
  )
  assert.equal(await h.store.getDelivery('assignment-a'), null)
  assert.equal(await h.store.getDelivery('assignment-b'), null)
})

test('COMPLETE then REPERTOIRE uses TD-05 forward-only lifecycle', async () => {
  const { createTeacherSecureDeliveryService } = await loadService()
  const h = harness()
  const service = createTeacherSecureDeliveryService(h)

  const completed = await service.applyAssignmentAction({
    providerSubject: 'uid-teacher',
    assignmentId: 'assignment-a',
    action: 'COMPLETE',
  })
  assert.equal(completed.lifecycle.state, 'COMPLETED')

  const repertoire = await service.applyAssignmentAction({
    providerSubject: 'uid-teacher',
    assignmentId: 'assignment-a',
    action: 'REPERTOIRE',
  })
  assert.equal(repertoire.lifecycle.state, 'REPERTOIRE')

  await assert.rejects(
    () => service.applyAssignmentAction({
      providerSubject: 'uid-teacher',
      assignmentId: 'assignment-a',
      action: 'COMPLETE',
    }),
    /transition|not-allowed/i,
  )
})

test('REVOKE atomically revokes lifecycle and delivery and retry preserves timestamp/history', async () => {
  const { createTeacherSecureDeliveryService } = await loadService()
  const h = harness()
  const service = createTeacherSecureDeliveryService(h)
  await service.deliverBatch({
    providerSubject: 'uid-teacher',
    assignmentIds: ['assignment-a'],
  })

  const first = await service.applyAssignmentAction({
    providerSubject: 'uid-teacher',
    assignmentId: 'assignment-a',
    action: 'REVOKE',
  })
  assert.notEqual(first.lifecycle.revokedAt, null)
  assert.equal(first.delivery.revokedAt, first.lifecycle.revokedAt)
  const nowCalls = h.nowCalls()
  const eventCalls = h.eventCalls()

  const second = await service.applyAssignmentAction({
    providerSubject: 'uid-teacher',
    assignmentId: 'assignment-a',
    action: 'REVOKE',
  })
  assert.equal(second.lifecycle.revokedAt, first.lifecycle.revokedAt)
  assert.equal(second.delivery.revokedAt, first.delivery.revokedAt)
  assert.equal(h.nowCalls(), nowCalls)
  assert.equal(h.eventCalls(), eventCalls)

  await assert.rejects(
    () => service.applyAssignmentAction({
      providerSubject: 'uid-teacher',
      assignmentId: 'assignment-a',
      action: 'COMPLETE',
    }),
    /revoked/i,
  )
})
