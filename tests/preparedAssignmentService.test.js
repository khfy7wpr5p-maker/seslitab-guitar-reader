import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createSecureDeliveryIdentityMapping,
} from '../src/services/secureDeliveryIdentity.js'
import {
  createTeacherStudentGrant,
} from '../src/services/teacherStudentGrant.js'
import {
  createSecureDeliveryAuthorization,
} from '../backend/delivery/authorization/secureDeliveryAuthorization.js'
import {
  createInMemorySecureDeliveryStore,
} from '../backend/delivery/repositories/inMemorySecureDeliveryStore.js'

async function loadService() {
  try {
    return await import('../backend/delivery/services/preparedAssignmentService.js')
  } catch {
    assert.fail('preparedAssignmentService module must exist')
  }
}

function teacherMapping() {
  return createSecureDeliveryIdentityMapping({
    providerSubject: 'uid-teacher',
    role: 'TEACHER',
    teacherId: 'teacher-a',
    studentId: null,
    active: true,
    createdAt: '2026-09-23T08:00:00Z',
    disabledAt: null,
  })
}

function grant(studentId = 'student-a') {
  return createTeacherStudentGrant({
    teacherId: 'teacher-a',
    studentId,
    active: true,
    createdAt: '2026-09-23T08:00:00Z',
    revokedAt: null,
  })
}

function rawAssignment({
  assignmentId = 'assignment-a',
  studentId = 'student-a',
  revisionId = 'revision-a',
} = {}) {
  return {
    schemaVersion: 1,
    assignmentId,
    studentId,
    practiceType: 'SCORE',
    teacherNote: 'Ölçü 8 tekrar',
    state: 'ACTIVE',
    assignedAt: '2026-09-23T08:01:00Z',
    revokedAt: null,
    sourceRef: {
      schemaVersion: 1,
      sourceKind: 'score_exact_revision',
      studentId,
      sourceId: 'source-' + assignmentId,
      sourceRevisionId: 'source-revision-' + assignmentId,
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
  }
}

function rawPackage({
  packageId = 'package-a',
  studentId = 'student-a',
  revisionId = 'revision-a',
  state = 'teacher_approved',
} = {}) {
  return {
    schemaVersion: '1.0.0',
    packageId,
    workId: 'work-' + packageId,
    title: 'Etüt',
    approvedRevision: {
      revisionId,
      state,
      approvedAt: '2026-09-23T08:00:00Z',
    },
    publication: {
      scope: 'student_private',
      recipientStudentId: studentId,
    },
    content: {
      score: {
        format: 'musicxml',
        data: '<score-partwise version="4.0"><part/></score-partwise>',
      },
      canonicalEvents: [],
    },
    practice: {
      tempoBpm: 80,
    },
  }
}

function item(options = {}) {
  const assignmentId = options.assignmentId ?? 'assignment-a'
  const studentId = options.studentId ?? 'student-a'
  const revisionId = options.revisionId ?? 'revision-a'
  const packageId = options.packageId ?? 'package-a'
  return {
    assignment: rawAssignment({
      assignmentId,
      studentId,
      revisionId,
    }),
    package: rawPackage({
      packageId,
      studentId: options.packageStudentId ?? studentId,
      revisionId: options.packageRevisionId ?? revisionId,
      state: options.packageState ?? 'teacher_approved',
    }),
  }
}

function harness({
  students = ['student-a'],
  storeOverride,
  now,
} = {}) {
  const store = storeOverride ?? createInMemorySecureDeliveryStore({
    identityMappings: [teacherMapping()],
    grants: students.map((studentId) => grant(studentId)),
  })
  const authorization = createSecureDeliveryAuthorization({ store })
  let nowCalls = 0
  const clock = now ?? (() => {
    nowCalls += 1
    return '2026-09-23T08:02:00Z'
  })
  return {
    store,
    authorization,
    now: clock,
    nowCalls: () => nowCalls,
  }
}

test('authorized teacher durably prepares exact assignment/package without delivering it', async () => {
  const { createPreparedAssignmentService } = await loadService()
  const h = harness()
  const service = createPreparedAssignmentService({
    authorization: h.authorization,
    store: h.store,
    now: h.now,
  })

  const result = await service.prepareBatch({
    providerSubject: 'uid-teacher',
    items: [item()],
  })

  assert.equal(result.length, 1)
  assert.equal(result[0].assignment.assignmentId, 'assignment-a')
  assert.equal(result[0].assignment.studentId, 'student-a')
  assert.equal(result[0].packageId, 'package-a')
  assert.equal(Object.isFrozen(result[0]), true)
  assert.equal(Object.isFrozen(result[0].assignment), true)
  assert.equal(await h.store.getDelivery('assignment-a'), null)

  const storedPackage = await h.store.getPracticePackage('package-a')
  assert.equal(Object.isFrozen(storedPackage), true)
  assert.equal(storedPackage.publication.recipientStudentId, 'student-a')
  assert.equal(storedPackage.approvedRevision.revisionId, 'revision-a')
})

test('prepared handoff rejects recipient, revision and approval mismatches before any write', async () => {
  const { createPreparedAssignmentService } = await loadService()

  for (const [candidate, pattern] of [
    [item({ packageStudentId: 'student-b' }), /recipient|student/i],
    [item({ packageRevisionId: 'revision-b' }), /revision/i],
    [item({ packageState: 'teacher_corrected' }), /teacher_approved|approved/i],
  ]) {
    const h = harness()
    const service = createPreparedAssignmentService({
      authorization: h.authorization,
      store: h.store,
      now: h.now,
    })
    await assert.rejects(
      () => service.prepareBatch({
        providerSubject: 'uid-teacher',
        items: [candidate],
      }),
      pattern,
    )
    assert.equal(await h.store.getPreparedAssignment('assignment-a'), null)
  }
})

test('prepared handoff rejects missing grant, unknown wire fields and source student substitution', async () => {
  const { createPreparedAssignmentService } = await loadService()

  {
    const h = harness({ students: [] })
    const service = createPreparedAssignmentService({
      authorization: h.authorization,
      store: h.store,
      now: h.now,
    })
    await assert.rejects(
      () => service.prepareBatch({
        providerSubject: 'uid-teacher',
        items: [item()],
      }),
      /grant/i,
    )
  }

  {
    const h = harness()
    const service = createPreparedAssignmentService({
      authorization: h.authorization,
      store: h.store,
      now: h.now,
    })
    const bad = item()
    bad.assignment.firebaseUid = 'uid-forged'
    await assert.rejects(
      () => service.prepareBatch({
        providerSubject: 'uid-teacher',
        items: [bad],
      }),
      /unsupported|field|PrivateAssignment/i,
    )
  }

  {
    const h = harness()
    const service = createPreparedAssignmentService({
      authorization: h.authorization,
      store: h.store,
      now: h.now,
    })
    const bad = item()
    bad.assignment.sourceRef.studentId = 'student-b'
    await assert.rejects(
      () => service.prepareBatch({
        providerSubject: 'uid-teacher',
        items: [bad],
      }),
      /student/i,
    )
  }
})

test('prepared handoff enforces 40-item maximum and rejects conflicting duplicate IDs before write', async () => {
  const { createPreparedAssignmentService } = await loadService()
  const students = Array.from({ length: 41 }, (_, index) => 'student-' + index)
  const h = harness({ students: [...students, 'student-a'] })
  const service = createPreparedAssignmentService({
    authorization: h.authorization,
    store: h.store,
    now: h.now,
  })

  const overLimit = students.map((studentId, index) => item({
    assignmentId: 'assignment-' + index,
    studentId,
    revisionId: 'revision-' + index,
    packageId: 'package-' + index,
  }))
  await assert.rejects(
    () => service.prepareBatch({
      providerSubject: 'uid-teacher',
      items: overLimit,
    }),
    /40|maximum|batch/i,
  )

  const conflict = [
    item(),
    item({ packageId: 'package-other' }),
  ]
  await assert.rejects(
    () => service.prepareBatch({
      providerSubject: 'uid-teacher',
      items: conflict,
    }),
    /duplicate|conflict|assignmentId/i,
  )
  assert.equal(await h.store.getPreparedAssignment('assignment-a'), null)
})

test('exact prepared replay is idempotent and preserves original preparedAt without calling now again', async () => {
  const { createPreparedAssignmentService } = await loadService()
  const h = harness()
  const service = createPreparedAssignmentService({
    authorization: h.authorization,
    store: h.store,
    now: h.now,
  })

  const first = await service.prepareBatch({
    providerSubject: 'uid-teacher',
    items: [item()],
  })
  assert.equal(h.nowCalls(), 1)

  const second = await service.prepareBatch({
    providerSubject: 'uid-teacher',
    items: [item()],
  })
  assert.equal(h.nowCalls(), 1)
  assert.equal(second[0], first[0])
  assert.equal(second[0].preparedAt, first[0].preparedAt)
})

test('prepared handoff denies success when durable reread acknowledgement is substituted', async () => {
  const { createPreparedAssignmentService } = await loadService()
  const base = createInMemorySecureDeliveryStore({
    identityMappings: [teacherMapping()],
    grants: [grant()],
  })
  const poisoned = {
    ...base,
    async getPreparedAssignment(assignmentId) {
      const row = await base.getPreparedAssignment(assignmentId)
      if (!row) return null
      return Object.freeze({
        ...row,
        packageFingerprint: 'f'.repeat(64),
      })
    },
  }
  const authorization = createSecureDeliveryAuthorization({ store: poisoned })
  const service = createPreparedAssignmentService({
    authorization,
    store: poisoned,
    now: () => '2026-09-23T08:02:00Z',
  })

  await assert.rejects(
    () => service.prepareBatch({
      providerSubject: 'uid-teacher',
      items: [item()],
    }),
    /acknowledgement|mismatch/i,
  )
})
