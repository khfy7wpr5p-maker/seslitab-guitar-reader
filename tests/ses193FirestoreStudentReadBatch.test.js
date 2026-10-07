import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createFirestoreSecureDeliveryStore,
} from '../backend/delivery/firebase/firestoreSecureDeliveryStore.js'
import {
  fingerprintPracticePackage,
} from '../backend/delivery/integrity/packageFingerprint.js'
import {
  createInitialAssignmentLifecycleRecord,
} from '../src/services/assignmentLifecycleRecord.js'
import {
  createDeliveryRecord,
} from '../src/services/deliveryRecord.js'
import {
  createPreparedAssignmentRecord,
} from '../src/services/preparedAssignmentRecord.js'
import {
  createPieceAssignment,
} from '../src/services/pieceAssignment.js'
import {
  createInitialPieceLifecycleRecord,
} from '../src/services/pieceAssignmentLifecycleRecord.js'
import {
  createStudentPrivatePracticePackageV1,
} from '../src/services/studentPracticePackageV1.js'
import {
  restorePrivateAssignmentV1,
} from '../src/services/teacherDeliveryWireCodec.js'

function documentId(value) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

function assignmentFixture() {
  const assignment = restorePrivateAssignmentV1({
    schemaVersion: 1,
    assignmentId: 'assignment-a',
    studentId: 'student-a',
    practiceType: 'SCORE',
    teacherNote: 'Ölçü 8 tekrar',
    state: 'ACTIVE',
    assignedAt: '2026-09-23T08:01:00Z',
    revokedAt: null,
    sourceRef: {
      schemaVersion: 1,
      sourceKind: 'score_exact_revision',
      studentId: 'student-a',
      sourceId: 'source-a',
      sourceRevisionId: 'root-a',
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
    },
  })
  const practicePackage = createStudentPrivatePracticePackageV1({
    packageId: 'package-a',
    workId: 'work-a',
    title: 'Etüt',
    revisionId: 'revision-a',
    approvedAt: '2026-09-23T08:00:00Z',
    studentId: 'student-a',
    musicXml: '<score-partwise version="4.0"></score-partwise>',
    canonicalEvents: [],
    practice: { tempoBpm: 80 },
  })
  const prepared = createPreparedAssignmentRecord({
    teacherId: 'teacher-a',
    assignment,
    packageId: practicePackage.packageId,
    packageFingerprint: fingerprintPracticePackage(practicePackage),
    preparedAt: '2026-09-23T08:02:00Z',
  })
  const delivery = createDeliveryRecord({
    assignmentId: assignment.assignmentId,
    packageId: practicePackage.packageId,
    teacherId: 'teacher-a',
    studentId: assignment.studentId,
    deliveredAt: '2026-09-23T08:03:00Z',
  })
  const lifecycle = createInitialAssignmentLifecycleRecord(assignment)

  return { delivery, prepared, lifecycle, practicePackage }
}

function fakeFirestore({
  queryCollections,
  documents,
  transformGetAll = (snapshots) => snapshots,
}) {
  const getAllCalls = []

  function snapshot(ref, value) {
    return {
      exists: value !== undefined,
      ref,
      data() {
        return value
      },
    }
  }

  function query(collectionName, filters = []) {
    return {
      where(field, operator, value) {
        return query(collectionName, [
          ...filters,
          { field, operator, value },
        ])
      },
      async get() {
        const rows = (queryCollections[collectionName] ?? []).filter((row) =>
          filters.every(({ field, operator, value }) => {
            assert.equal(operator, '==')
            return row[field] === value
          }),
        )
        return {
          docs: rows.map((row) => {
            const rowId = row.assignmentId ?? row.pieceAssignmentId
            const ref = {
              path: `${collectionName}/${documentId(rowId)}`,
            }
            return snapshot(ref, row)
          }),
        }
      },
    }
  }

  const firestore = {
    collection(name) {
      return {
        doc(id) {
          return {
            path: `${name}/${id}`,
          }
        },
        where(field, operator, value) {
          return query(name).where(field, operator, value)
        },
      }
    },
    async getAll(...refs) {
      getAllCalls.push(refs.map((ref) => ref.path))
      return transformGetAll(
        refs.map((ref) =>
          snapshot(ref, documents.get(ref.path)),
        ),
      )
    },
    async runTransaction() {
      throw new Error('not used')
    },
    batch() {
      throw new Error('not used')
    },
  }

  return { firestore, getAllCalls }
}

test('SES-193 Firestore student read batches current delivery, prepared, lifecycle and package documents in one RPC', async () => {
  const fixture = assignmentFixture()
  const assignmentKey = documentId('assignment-a')
  const packageKey = documentId('package-a')
  const documents = new Map([
    [`deliveries/${assignmentKey}`, plain(fixture.delivery)],
    [`privateAssignments/${assignmentKey}`, plain(fixture.prepared)],
    [`assignmentLifecycle/${assignmentKey}`, plain(fixture.lifecycle)],
    [`practicePackages/${packageKey}`, plain(fixture.practicePackage)],
  ])
  const { firestore, getAllCalls } = fakeFirestore({
    queryCollections: {
      deliveries: [plain(fixture.delivery)],
    },
    documents,
  })
  const store = createFirestoreSecureDeliveryStore({ firestore })

  const contexts =
    await store.listActiveAssignmentContextsForStudent('student-a')

  assert.equal(getAllCalls.length, 1)
  assert.equal(getAllCalls[0].length, documents.size)
  assert.deepEqual(
    new Set(getAllCalls[0]),
    new Set(documents.keys()),
  )
  assert.deepEqual(contexts, Object.freeze([
    Object.freeze({
      delivery: fixture.delivery,
      prepared: fixture.prepared,
      lifecycle: fixture.lifecycle,
      package: fixture.practicePackage,
    }),
  ]))
})

test('SES-193 Firestore Piece read batches current manifest and lifecycle documents in one RPC', async () => {
  const piece = createPieceAssignment({
    pieceAssignmentId: 'piece-a',
    pieceId: 'work-a',
    arrangementId: 'arrangement-a',
    studentId: 'student-a',
    title: 'Toplu Okuma Etüdü',
    teacherNote: '',
    assignedAt: '2026-10-07T07:40:00Z',
    contentRefs: {
      scoreAssignmentId: 'assignment-a',
      chordAssignmentIds: [],
    },
  })
  const lifecycle = createInitialPieceLifecycleRecord(piece)
  const pieceKey = documentId(piece.pieceAssignmentId)
  const documents = new Map([
    [`pieceAssignments/${pieceKey}`, plain(piece)],
    [`pieceAssignmentLifecycle/${pieceKey}`, plain(lifecycle)],
  ])
  const { firestore, getAllCalls } = fakeFirestore({
    queryCollections: {
      pieceAssignments: [plain(piece)],
    },
    documents,
  })
  const store = createFirestoreSecureDeliveryStore({ firestore })

  const contexts =
    await store.listActivePieceContextsForStudent('student-a')

  assert.equal(getAllCalls.length, 1)
  assert.equal(getAllCalls[0].length, documents.size)
  assert.deepEqual(
    new Set(getAllCalls[0]),
    new Set(documents.keys()),
  )
  assert.deepEqual(contexts, Object.freeze([
    Object.freeze({ piece, lifecycle }),
  ]))
})

test('SES-193 Firestore Piece batch keeps a valid manifest when no lifecycle document exists yet', async () => {
  const piece = createPieceAssignment({
    pieceAssignmentId: 'piece-without-lifecycle',
    pieceId: 'work-without-lifecycle',
    arrangementId: 'arrangement-without-lifecycle',
    studentId: 'student-a',
    title: 'Yeni Etüt',
    teacherNote: '',
    assignedAt: '2026-10-07T07:41:00Z',
    contentRefs: {
      scoreAssignmentId: 'assignment-a',
      chordAssignmentIds: [],
    },
  })
  const pieceKey = documentId(piece.pieceAssignmentId)
  const documents = new Map([
    [`pieceAssignments/${pieceKey}`, plain(piece)],
  ])
  const { firestore } = fakeFirestore({
    queryCollections: {
      pieceAssignments: [plain(piece)],
    },
    documents,
  })
  const store = createFirestoreSecureDeliveryStore({ firestore })

  assert.deepEqual(
    await store.listActivePieceContextsForStudent('student-a'),
    Object.freeze([
      Object.freeze({ piece, lifecycle: null }),
    ]),
  )
})

test('SES-193 Firestore batch fails closed when getAll omits a requested snapshot', async () => {
  const fixture = assignmentFixture()
  const assignmentKey = documentId('assignment-a')
  const packageKey = documentId('package-a')
  const documents = new Map([
    [`deliveries/${assignmentKey}`, plain(fixture.delivery)],
    [`privateAssignments/${assignmentKey}`, plain(fixture.prepared)],
    [`assignmentLifecycle/${assignmentKey}`, plain(fixture.lifecycle)],
    [`practicePackages/${packageKey}`, plain(fixture.practicePackage)],
  ])
  const { firestore } = fakeFirestore({
    queryCollections: {
      deliveries: [plain(fixture.delivery)],
    },
    documents,
    transformGetAll: (snapshots) => snapshots.slice(0, -1),
  })
  const store = createFirestoreSecureDeliveryStore({ firestore })

  await assert.rejects(
    () => store.listActiveAssignmentContextsForStudent('student-a'),
    /student delivery batch read incomplete/,
  )
})

test('SES-193 Firestore batch rejects package authority drift between query and current read', async () => {
  const fixture = assignmentFixture()
  const assignmentKey = documentId('assignment-a')
  const currentDelivery = createDeliveryRecord({
    assignmentId: fixture.delivery.assignmentId,
    packageId: 'package-drifted',
    teacherId: fixture.delivery.teacherId,
    studentId: fixture.delivery.studentId,
    deliveredAt: fixture.delivery.deliveredAt,
  })
  const documents = new Map([
    [`deliveries/${assignmentKey}`, plain(currentDelivery)],
  ])
  const { firestore } = fakeFirestore({
    queryCollections: {
      deliveries: [plain(fixture.delivery)],
    },
    documents,
  })
  const store = createFirestoreSecureDeliveryStore({ firestore })

  await assert.rejects(
    () => store.listActiveAssignmentContextsForStudent('student-a'),
    /student delivery package authority mismatch/,
  )
})

test('SES-193 Firestore Piece batch rejects a changed current manifest', async () => {
  const piece = createPieceAssignment({
    pieceAssignmentId: 'piece-drifted',
    pieceId: 'work-a',
    arrangementId: 'arrangement-a',
    studentId: 'student-a',
    title: 'Original Etüt',
    teacherNote: '',
    assignedAt: '2026-10-07T07:42:00Z',
    contentRefs: {
      scoreAssignmentId: 'assignment-a',
      chordAssignmentIds: [],
    },
  })
  const changedPiece = createPieceAssignment({
    pieceAssignmentId: piece.pieceAssignmentId,
    pieceId: piece.pieceId,
    arrangementId: piece.arrangementId,
    studentId: piece.studentId,
    title: 'Changed Etüt',
    teacherNote: piece.teacherNote,
    assignedAt: piece.assignedAt,
    contentRefs: piece.contentRefs,
  })
  const pieceKey = documentId(piece.pieceAssignmentId)
  const { firestore } = fakeFirestore({
    queryCollections: {
      pieceAssignments: [plain(piece)],
    },
    documents: new Map([
      [`pieceAssignments/${pieceKey}`, plain(changedPiece)],
    ]),
  })
  const store = createFirestoreSecureDeliveryStore({ firestore })

  await assert.rejects(
    () => store.listActivePieceContextsForStudent('student-a'),
    /student Piece batch authority mismatch/,
  )
})
