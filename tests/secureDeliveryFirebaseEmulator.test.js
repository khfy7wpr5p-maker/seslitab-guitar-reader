import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import {
  createInitialAssignmentLifecycleRecord,
  revokeAssignmentLifecycleRecord,
  transitionAssignmentLifecycleRecord,
} from '../src/services/assignmentLifecycleRecord.js'
import {
  createDeliveryRecord,
  revokeDeliveryRecord,
} from '../src/services/deliveryRecord.js'
import {
  createPoolItem,
  POOL_AUDIENCE_MODE,
} from '../src/services/poolItem.js'
import {
  createActivePoolPublicationRecord,
  revokePoolPublicationRecord,
} from '../src/services/poolPublicationRecord.js'
import {
  createPreparedAssignmentRecord,
} from '../src/services/preparedAssignmentRecord.js'
import {
  createSecureDeliveryIdentityMapping,
} from '../src/services/secureDeliveryIdentity.js'
import {
  createStudentPrivatePracticePackageV1,
} from '../src/services/studentPracticePackageV1.js'
import {
  createStudentPrivateChordBoardPackageV1,
} from '../src/services/studentChordBoardPackageV1.js'
import {
  getChordBoardVoicings,
} from '../src/services/chordBoardCatalog.js'
import {
  createChordBoardAssignmentSourceBinding,
} from '../src/services/chordBoardAssignmentSourceBinding.js'
import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  createPrivateAssignment,
} from '../src/services/privateAssignment.js'
import {
  createStudentRosterEntry,
} from '../src/services/studentRosterEntry.js'
import {
  createPieceAssignment,
} from '../src/services/pieceAssignment.js'
import {
  createInitialPieceLifecycleRecord,
  transitionPieceLifecycleRecord,
} from '../src/services/pieceAssignmentLifecycleRecord.js'
import {
  createTeacherStudentGrant,
} from '../src/services/teacherStudentGrant.js'
import {
  restorePrivateAssignmentV1,
} from '../src/services/teacherDeliveryWireCodec.js'
import {
  fingerprintPracticePackage,
  fingerprintSecureDeliveryPackage,
} from '../backend/delivery/integrity/packageFingerprint.js'
import {
  createSecureDeliveryAuthorization,
} from '../backend/delivery/authorization/secureDeliveryAuthorization.js'
import {
  createPreparedAssignmentService,
} from '../backend/delivery/services/preparedAssignmentService.js'
import {
  createTeacherSecureDeliveryService,
} from '../backend/delivery/services/teacherDeliveryService.js'
import {
  createStudentDeliveryReadService,
} from '../backend/delivery/services/studentDeliveryReadService.js'

const PROJECT_ID = 'demo-seslitab-td06'
const EMULATOR_AVAILABLE = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST &&
  process.env.FIREBASE_AUTH_EMULATOR_HOST,
)
let admin
let db
let createFirestoreSecureDeliveryStore
let createFirebaseTokenVerifier

function id(value) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

function assignment(assignmentId, studentId, revisionId) {
  return restorePrivateAssignmentV1({
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
      sourceRevisionId: 'root-' + assignmentId,
      revisionId,
      revisionKind: 'automatic',
      contentFingerprint: 'content-' + revisionId,
      lineageFingerprint: 'lineage-' + revisionId,
      approvalId: 'approval-' + revisionId,
      authorizationId: 'authorization-' + revisionId,
      qualityEvidenceId: 'quality-' + revisionId,
      revalidationEvidenceId: null,
      readinessRoute: 'package12',
      package12Status: 'PASS',
      boundAt: '2026-09-23T08:00:00Z',
    },
  })
}

function packageFor(packageId, studentId, revisionId) {
  return createStudentPrivatePracticePackageV1({
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
}

function preparedRow(suffix, overrides = {}) {
  const assignmentId = overrides.assignmentId ?? 'assignment-' + suffix
  const studentId = overrides.studentId ?? 'student-' + suffix
  const revisionId = overrides.revisionId ?? 'revision-' + suffix
  const packageId = overrides.packageId ?? 'package-' + suffix
  const a = assignment(assignmentId, studentId, revisionId)
  const pkg = packageFor(packageId, studentId, revisionId)
  return Object.freeze({
    prepared: createPreparedAssignmentRecord({
      teacherId: overrides.teacherId ?? 'teacher-a',
      assignment: a,
      packageId,
      packageFingerprint: fingerprintPracticePackage(pkg),
      preparedAt: '2026-09-23T08:02:00Z',
    }),
    package: pkg,
  })
}


function chordAssignment({
  assignmentId,
  studentId,
  symbol = 'Am',
  teacherNote = '60 BPM ile çalış.',
  assignedAt = '2026-09-23T09:01:00Z',
} = {}) {
  const snapshot =
    getChordBoardVoicings(symbol)[0]
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

function chordPreparedRow(
  suffix,
  overrides = {},
) {
  const assignmentId =
    overrides.assignmentId ??
    'assignment-chord-' + suffix
  const studentId =
    overrides.studentId ??
    'student-chord-' + suffix
  const a = chordAssignment({
    assignmentId,
    studentId,
    symbol: overrides.symbol ?? 'Am',
    teacherNote:
      overrides.teacherNote ??
      '60 BPM ile çalış.',
  })
  const pkg =
    createStudentPrivateChordBoardPackageV1({
      assignment: a,
      practice: {
        repeatCount:
          overrides.repeatCount ?? 4,
      },
    })

  return Object.freeze({
    prepared:
      createPreparedAssignmentRecord({
        teacherId:
          overrides.teacherId ??
          'teacher-a',
        assignment: a,
        packageId: pkg.packageId,
        packageFingerprint:
          fingerprintSecureDeliveryPackage(
            pkg,
          ),
        preparedAt:
          '2026-09-23T09:02:00Z',
      }),
    package: pkg,
  })
}

async function seedIdentityAndGrant(studentId = 'student-a') {
  const teacher = createSecureDeliveryIdentityMapping({
    providerSubject: 'uid-teacher',
    role: 'TEACHER',
    teacherId: 'teacher-a',
    studentId: null,
    active: true,
    createdAt: '2026-09-23T08:00:00Z',
    disabledAt: null,
  })
  const student = createSecureDeliveryIdentityMapping({
    providerSubject: 'uid-' + studentId,
    role: 'STUDENT',
    teacherId: null,
    studentId,
    active: true,
    createdAt: '2026-09-23T08:00:00Z',
    disabledAt: null,
  })
  const grant = createTeacherStudentGrant({
    teacherId: 'teacher-a',
    studentId,
    active: true,
    createdAt: '2026-09-23T08:00:00Z',
    revokedAt: null,
  })
  await Promise.all([
    db.collection('identityMappings').doc(id(teacher.providerSubject)).set(plain(teacher)),
    db.collection('identityMappings').doc(id(student.providerSubject)).set(plain(student)),
    db.collection('teacherStudentGrants').doc(id(JSON.stringify(['teacher-a', studentId]))).set(plain(grant)),
  ])
}

before(async () => {
  if (!EMULATOR_AVAILABLE) return
  const adminModule = await import('../backend/delivery/firebase/firebaseAdmin.js')
  const tokenModule = await import('../backend/delivery/firebase/firebaseTokenVerifier.js')
  const storeModule = await import('../backend/delivery/firebase/firestoreSecureDeliveryStore.js')
  admin = adminModule.createFirebaseAdminServices({
    emulator: true,
    projectId: PROJECT_ID,
    appName: 'td06-emulator-tests',
  })
  db = admin.firestore
  createFirebaseTokenVerifier = tokenModule.createFirebaseTokenVerifier
  createFirestoreSecureDeliveryStore = storeModule.createFirestoreSecureDeliveryStore
})

after(async () => {
  await admin?.delete()
})

test('Firebase token verifier passes raw token only to verifyIdToken(token, true) and returns uid only', { skip: !EMULATOR_AVAILABLE }, async () => {
  const calls = []
  const verifier = createFirebaseTokenVerifier({
    auth: {
      async verifyIdToken(token, checkRevoked) {
        calls.push([token, checkRevoked])
        return {
          uid: 'uid-teacher',
          email: 'private@example.invalid',
          role: 'ignored',
        }
      },
    },
  })

  assert.deepEqual(
    await verifier.verifyIdToken('raw-secret-token'),
    Object.freeze({ uid: 'uid-teacher' }),
  )
  assert.deepEqual(calls, [['raw-secret-token', true]])
  assert.equal('token' in verifier, false)
})

test('Firestore prepared batch is atomic, exact-replay idempotent and rereads exact links', { skip: !EMULATOR_AVAILABLE }, async () => {
  const store = createFirestoreSecureDeliveryStore({ firestore: db })
  const a = preparedRow('prep-a')
  const b = preparedRow('prep-b')

  const first = await store.commitPreparedBatch([a, b])
  assert.equal(first.length, 2)
  assert.equal((await store.getPreparedAssignment(a.prepared.assignment.assignmentId)).packageId, a.prepared.packageId)
  assert.equal((await store.getPracticePackage(a.package.packageId)).approvedRevision.revisionId, a.package.approvedRevision.revisionId)

  const replay = await store.commitPreparedBatch([a, b])
  assert.equal(replay[0].preparedAt, first[0].preparedAt)
  assert.equal(replay[1].packageFingerprint, first[1].packageFingerprint)
})

test('one prepared conflict rejects the whole transaction with zero new documents', { skip: !EMULATOR_AVAILABLE }, async () => {
  const store = createFirestoreSecureDeliveryStore({ firestore: db })
  const existing = preparedRow('conflict-existing', { packageId: 'package-conflict-shared' })
  await store.commitPreparedBatch([existing])

  const pending = preparedRow('conflict-pending')
  const conflicting = preparedRow('conflict-new', { packageId: 'package-conflict-shared' })

  await assert.rejects(
    () => store.commitPreparedBatch([pending, conflicting]),
    /conflict/i,
  )
  assert.equal(
    await store.getPreparedAssignment(pending.prepared.assignment.assignmentId),
    null,
  )
})

test('delivery transaction is atomic and exact active replay is idempotent', { skip: !EMULATOR_AVAILABLE }, async () => {
  const store = createFirestoreSecureDeliveryStore({ firestore: db })
  const a = preparedRow('delivery-a')
  const b = preparedRow('delivery-b')
  await store.commitPreparedBatch([a, b])

  const deliveryA = createDeliveryRecord({
    assignmentId: a.prepared.assignment.assignmentId,
    packageId: a.prepared.packageId,
    teacherId: a.prepared.teacherId,
    studentId: a.prepared.assignment.studentId,
    deliveredAt: '2026-09-23T08:03:00Z',
  })
  const deliveryB = createDeliveryRecord({
    assignmentId: b.prepared.assignment.assignmentId,
    packageId: b.prepared.packageId,
    teacherId: b.prepared.teacherId,
    studentId: b.prepared.assignment.studentId,
    deliveredAt: '2026-09-23T08:03:00Z',
  })

  const first = await store.commitDeliveryBatch([deliveryA, deliveryB])
  const replay = await store.commitDeliveryBatch([deliveryA, deliveryB])
  assert.deepEqual(replay, first)
  assert.deepEqual(await store.getDelivery(deliveryA.assignmentId), deliveryA)
})

test('one missing prepared delivery row rejects whole batch without silent partial success', { skip: !EMULATOR_AVAILABLE }, async () => {
  const store = createFirestoreSecureDeliveryStore({ firestore: db })
  const valid = preparedRow('delivery-atomic-valid')
  await store.commitPreparedBatch([valid])
  const validDelivery = createDeliveryRecord({
    assignmentId: valid.prepared.assignment.assignmentId,
    packageId: valid.prepared.packageId,
    teacherId: valid.prepared.teacherId,
    studentId: valid.prepared.assignment.studentId,
    deliveredAt: '2026-09-23T08:04:00Z',
  })
  const missingDelivery = createDeliveryRecord({
    assignmentId: 'assignment-not-prepared',
    packageId: 'package-not-prepared',
    teacherId: 'teacher-a',
    studentId: 'student-missing',
    deliveredAt: '2026-09-23T08:04:00Z',
  })

  await assert.rejects(
    () => store.commitDeliveryBatch([validDelivery, missingDelivery]),
    /prepared|missing/i,
  )
  assert.equal(await store.getDelivery(validDelivery.assignmentId), null)
})

test('revoked lifecycle blocks a new delivery transaction', { skip: !EMULATOR_AVAILABLE }, async () => {
  const store = createFirestoreSecureDeliveryStore({ firestore: db })
  const row = preparedRow('delivery-revoked')
  await store.commitPreparedBatch([row])
  const initial = createInitialAssignmentLifecycleRecord(row.prepared.assignment)
  const revoked = revokeAssignmentLifecycleRecord(initial, '2026-09-23T08:05:00Z')
  await store.commitLifecycleMutation({
    teacherId: row.prepared.teacherId,
    assignment: row.prepared.assignment,
    currentLifecycle: initial,
    nextLifecycle: revoked,
    deliveryBefore: null,
    deliveryAfter: null,
    historyEventId: 'history-delivery-revoked',
  })

  await assert.rejects(
    () => store.commitDeliveryBatch([
      createDeliveryRecord({
        assignmentId: row.prepared.assignment.assignmentId,
        packageId: row.prepared.packageId,
        teacherId: row.prepared.teacherId,
        studentId: row.prepared.assignment.studentId,
        deliveredAt: '2026-09-23T08:06:00Z',
      }),
    ]),
    /revoked/i,
  )
})

test('lifecycle mutation persists current state, append-only history and delivery revoke atomically', { skip: !EMULATOR_AVAILABLE }, async () => {
  const store = createFirestoreSecureDeliveryStore({ firestore: db })
  const row = preparedRow('lifecycle-a')
  await store.commitPreparedBatch([row])
  const delivery = createDeliveryRecord({
    assignmentId: row.prepared.assignment.assignmentId,
    packageId: row.prepared.packageId,
    teacherId: row.prepared.teacherId,
    studentId: row.prepared.assignment.studentId,
    deliveredAt: '2026-09-23T08:03:00Z',
  })
  await store.commitDeliveryBatch([delivery])

  const initial = createInitialAssignmentLifecycleRecord(row.prepared.assignment)
  const completed = transitionAssignmentLifecycleRecord(initial, 'COMPLETED', '2026-09-23T08:07:00Z')
  await store.commitLifecycleMutation({
    teacherId: row.prepared.teacherId,
    assignment: row.prepared.assignment,
    currentLifecycle: initial,
    nextLifecycle: completed,
    deliveryBefore: delivery,
    deliveryAfter: delivery,
    historyEventId: 'history-complete-a',
  })

  const revoked = revokeAssignmentLifecycleRecord(completed, '2026-09-23T08:08:00Z')
  const revokedDelivery = revokeDeliveryRecord(delivery, '2026-09-23T08:08:00Z')
  await store.commitLifecycleMutation({
    teacherId: row.prepared.teacherId,
    assignment: row.prepared.assignment,
    currentLifecycle: completed,
    nextLifecycle: revoked,
    deliveryBefore: delivery,
    deliveryAfter: revokedDelivery,
    historyEventId: 'history-revoke-a',
  })

  assert.equal((await store.getLifecycle(delivery.assignmentId)).revokedAt, '2026-09-23T08:08:00Z')
  assert.equal((await store.getDelivery(delivery.assignmentId)).revokedAt, '2026-09-23T08:08:00Z')

  const historyRef = db
    .collection('assignmentLifecycle')
    .doc(id(delivery.assignmentId))
    .collection('history')
  assert.equal((await historyRef.get()).size, 2)

  await store.commitLifecycleMutation({
    teacherId: row.prepared.teacherId,
    assignment: row.prepared.assignment,
    currentLifecycle: revoked,
    nextLifecycle: revoked,
    deliveryBefore: revokedDelivery,
    deliveryAfter: revokedDelivery,
    historyEventId: 'history-revoke-should-not-append',
  })
  assert.equal((await historyRef.get()).size, 2)
  assert.equal((await store.getDelivery(delivery.assignmentId)).revokedAt, '2026-09-23T08:08:00Z')
})

test('identity/grant lookup and roster/Pool provisioning round-trip through Admin-only persistence', { skip: !EMULATOR_AVAILABLE }, async () => {
  await seedIdentityAndGrant('student-provision')
  const store = createFirestoreSecureDeliveryStore({ firestore: db })

  assert.equal(
    (await store.getIdentityMapping('uid-teacher')).teacherId,
    'teacher-a',
  )
  assert.equal(
    (await store.getTeacherStudentGrant('teacher-a', 'student-provision')).active,
    true,
  )

  const roster = createStudentRosterEntry({
    studentId: 'student-provision',
    displayNameOrNickname: 'Öğrenci',
    active: true,
  })
  await store.putRosterEntriesForProvisioning([roster])
  assert.deepEqual(
    (await db.collection('studentRoster').doc(id(roster.studentId)).get()).data(),
    plain(roster),
  )

  const selectedItem = createPoolItem({
    poolItemId: 'pool-selected',
    title: 'Seçili Etüt',
    shortDescription: 'Çalışma',
    detailText: '',
    publishedAt: '2026-09-23T08:00:00Z',
    audienceMode: POOL_AUDIENCE_MODE.SELECTED,
    recipientStudentIds: ['student-provision', 'student-second', 'student-provision'],
  })
  const allItem = createPoolItem({
    poolItemId: 'pool-all',
    title: 'Genel Etüt',
    shortDescription: 'Çalışma',
    detailText: '',
    publishedAt: '2026-09-23T08:00:00Z',
    audienceMode: POOL_AUDIENCE_MODE.ALL,
    recipientStudentIds: [],
  })
  const revokedItem = createPoolItem({
    poolItemId: 'pool-revoked',
    title: 'Eski Duyuru',
    shortDescription: 'Çalışma',
    detailText: '',
    publishedAt: '2026-09-23T08:00:00Z',
    audienceMode: POOL_AUDIENCE_MODE.ALL,
    recipientStudentIds: [],
  })
  await store.putPoolPublicationsForProvisioning([
    createActivePoolPublicationRecord(selectedItem),
    createActivePoolPublicationRecord(allItem),
    revokePoolPublicationRecord(
      createActivePoolPublicationRecord(revokedItem),
      '2026-09-23T08:10:00Z',
    ),
  ])

  const selectedRecipients = await db
    .collection('poolPublications')
    .doc(id('pool-selected'))
    .collection('recipients')
    .get()
  const allRecipients = await db
    .collection('poolPublications')
    .doc(id('pool-all'))
    .collection('recipients')
    .get()
  assert.equal(selectedRecipients.size, 2)
  assert.equal(allRecipients.size, 0)

  assert.deepEqual(
    (await store.listPoolPublicationsForStudent(
      'student-provision',
    ))
      .map((record) => record.item.poolItemId)
      .sort(),
    ['pool-all', 'pool-selected'],
  )
  assert.deepEqual(
    (await store.listPoolPublicationsForStudent(
      'student-second',
    ))
      .map((record) => record.item.poolItemId)
      .sort(),
    ['pool-all', 'pool-selected'],
  )
  assert.deepEqual(
    (await store.listPoolPublicationsForStudent(
      'student-unselected',
    ))
      .map((record) => record.item.poolItemId)
      .sort(),
    ['pool-all'],
  )
})


test('TD-07 Firestore round-trips exact CHORD_BOARD source and package without SCORE coercion', { skip: !EMULATOR_AVAILABLE }, async () => {
  const store =
    createFirestoreSecureDeliveryStore({
      firestore: db,
    })
  const row =
    chordPreparedRow('roundtrip')

  const ack =
    await store.commitPreparedBatch([
      row,
    ])

  assert.equal(ack.length, 1)

  const storedPrepared =
    await store.getPreparedAssignment(
      row.prepared.assignment.assignmentId,
    )
  const storedPackage =
    await store.getPracticePackage(
      row.package.packageId,
    )

  assert.equal(
    storedPrepared.assignment.practiceType,
    'CHORD_BOARD',
  )
  assert.equal(
    storedPackage.packageType,
    'CHORD_BOARD',
  )
  assert.deepEqual(
    storedPrepared.assignment.sourceRef
      .snapshot.voicing.frets,
    row.prepared.assignment.sourceRef
      .snapshot.voicing.frets,
  )
  assert.deepEqual(
    storedPrepared.assignment.sourceRef
      .snapshot.voicing.fingers,
    row.prepared.assignment.sourceRef
      .snapshot.voicing.fingers,
  )
  assert.deepEqual(
    storedPrepared.assignment.sourceRef
      .snapshot.voicing.barres,
    row.prepared.assignment.sourceRef
      .snapshot.voicing.barres,
  )
  assert.equal(
    storedPrepared.assignment.sourceRef
      .voicingFingerprint,
    row.prepared.assignment.sourceRef
      .voicingFingerprint,
  )
  assert.equal(
    fingerprintSecureDeliveryPackage(
      storedPackage,
    ),
    row.prepared.packageFingerprint,
  )
})

test('TD-07 Firestore CHORD_BOARD prepared conflict rolls back fresh rows atomically', { skip: !EMULATOR_AVAILABLE }, async () => {
  const store =
    createFirestoreSecureDeliveryStore({
      firestore: db,
    })
  const existing =
    chordPreparedRow(
      'conflict-existing',
      {
        assignmentId:
          'assignment-chord-conflict-shared',
        studentId:
          'student-chord-conflict',
        symbol: 'Am',
      },
    )
  await store.commitPreparedBatch([
    existing,
  ])

  const pending =
    chordPreparedRow(
      'conflict-pending',
    )
  const conflicting =
    chordPreparedRow(
      'conflict-new',
      {
        assignmentId:
          'assignment-chord-conflict-shared',
        studentId:
          'student-chord-conflict',
        symbol: 'G',
      },
    )

  await assert.rejects(
    () =>
      store.commitPreparedBatch([
        pending,
        conflicting,
      ]),
    /conflict/i,
  )

  assert.equal(
    await store.getPreparedAssignment(
      pending.prepared.assignment
        .assignmentId,
    ),
    null,
  )
  assert.equal(
    await store.getPracticePackage(
      pending.package.packageId,
    ),
    null,
  )
})

test('TD-07 Firestore-backed services prepare deliver read lifecycle and revoke CHORD_BOARD exactly', { skip: !EMULATOR_AVAILABLE }, async () => {
  const studentId =
    'student-chord-service'
  await seedIdentityAndGrant(
    studentId,
  )

  const store =
    createFirestoreSecureDeliveryStore({
      firestore: db,
    })
  const authorization =
    createSecureDeliveryAuthorization({
      store,
    })
  const preparedService =
    createPreparedAssignmentService({
      authorization,
      store,
      now: () =>
        '2026-09-23T09:02:00Z',
    })
  const teacher =
    createTeacherSecureDeliveryService({
      authorization,
      store,
      now: (() => {
        const values = [
          '2026-09-23T09:03:00Z',
          '2026-09-23T09:04:00Z',
          '2026-09-23T09:05:00Z',
          '2026-09-23T09:06:00Z',
        ]
        let index = 0
        return () =>
          values[index++] ??
          values.at(-1)
      })(),
      createHistoryEventId:
        (() => {
          let index = 0
          return () =>
            'history-chord-' +
            ++index
        })(),
    })
  const student =
    createStudentDeliveryReadService({
      authorization,
      store,
    })

  const row =
    chordPreparedRow(
      'service',
      {
        studentId,
        assignmentId:
          'assignment-chord-service',
      },
    )

  await preparedService.prepareBatch({
    providerSubject: 'uid-teacher',
    items: [{
      assignment:
        plain(row.prepared.assignment),
      package:
        plain(row.package),
    }],
  })

  const delivered =
    await teacher.deliverBatch({
      providerSubject:
        'uid-teacher',
      assignmentIds: [
        row.prepared.assignment
          .assignmentId,
      ],
    })
  assert.equal(
    delivered[0].assignmentId,
    row.prepared.assignment.assignmentId,
  )

  const visible =
    await student.getAssignment({
      providerSubject:
        'uid-' + studentId,
      deliveryId:
        row.prepared.assignment.assignmentId,
    })
  assert.equal(
    visible.package.packageType,
    'CHORD_BOARD',
  )
  assert.deepEqual(
    visible.package.content.chordBoard
      .voicing.frets,
    row.package.content.chordBoard
      .voicing.frets,
  )

  const completed =
    await teacher.applyAssignmentAction({
      providerSubject:
        'uid-teacher',
      assignmentId:
        row.prepared.assignment.assignmentId,
      action: 'COMPLETE',
    })
  assert.equal(
    completed.lifecycle.state,
    'COMPLETED',
  )

  const repertoire =
    await teacher.applyAssignmentAction({
      providerSubject:
        'uid-teacher',
      assignmentId:
        row.prepared.assignment.assignmentId,
      action: 'REPERTOIRE',
    })
  assert.equal(
    repertoire.lifecycle.state,
    'REPERTOIRE',
  )

  const revoked =
    await teacher.applyAssignmentAction({
      providerSubject:
        'uid-teacher',
      assignmentId:
        row.prepared.assignment.assignmentId,
      action: 'REVOKE',
    })
  assert.notEqual(
    revoked.lifecycle.revokedAt,
    null,
  )
  assert.notEqual(
    revoked.delivery.revokedAt,
    null,
  )

  await assert.rejects(
    () =>
      student.getAssignment({
        providerSubject:
          'uid-' + studentId,
        deliveryId:
          row.prepared.assignment
            .assignmentId,
      }),
    /student-assignment-not-found/i,
  )
})


test('Firestore round-trips immutable Piece authority and lifecycle in server-owned collections', { skip: !EMULATOR_AVAILABLE }, async () => {
  const store = createFirestoreSecureDeliveryStore({ firestore: db })
  const piece = createPieceAssignment({
    pieceAssignmentId: 'piece-firestore-a',
    pieceId: 'piece-cambaz-firestore',
    arrangementId: 'arr-cambaz-firestore',
    studentId: 'student-firestore-a',
    title: 'Cambaz',
    teacherNote: '',
    assignedAt: '2026-09-24T08:00:00Z',
    contentRefs: {
      scoreAssignmentId: 'score-firestore-a',
      chordAssignmentIds: ['chord-firestore-a'],
    },
  })

  await store.putPieceAssignment(piece)
  assert.deepEqual(
    await store.getPieceAssignment(piece.pieceAssignmentId),
    piece,
  )
  assert.deepEqual(
    await store.listPieceAssignmentsForStudent(piece.studentId),
    Object.freeze([piece]),
  )
  assert.equal(
    await store.getPieceLifecycle(piece.pieceAssignmentId),
    null,
  )

  const active = createInitialPieceLifecycleRecord(piece)
  const completed = transitionPieceLifecycleRecord(
    active,
    'COMPLETED',
    '2026-09-24T09:00:00Z',
  )
  assert.deepEqual(
    await store.commitPieceLifecycleMutation({
      currentLifecycle: active,
      nextLifecycle: completed,
    }),
    completed,
  )
  assert.deepEqual(
    await store.getPieceLifecycle(piece.pieceAssignmentId),
    completed,
  )

  const conflict = createPieceAssignment({
    pieceAssignmentId: piece.pieceAssignmentId,
    pieceId: piece.pieceId,
    arrangementId: piece.arrangementId,
    studentId: piece.studentId,
    title: 'Changed title',
    teacherNote: '',
    assignedAt: piece.assignedAt,
    contentRefs: piece.contentRefs,
  })
  await assert.rejects(
    () => store.putPieceAssignment(conflict),
    /piece.*conflict|immutable/i,
  )
})
