import { isDeepStrictEqual } from 'node:util'

import {
  createStudentWorkRequest,
  isStudentWorkRequest,
  assertStudentWorkRequestTransition,
  STUDENT_WORK_REQUEST_STATE,
} from '../../../src/services/studentWorkRequest.js'
import {
  createTeacherStudentGrant,
} from '../../../src/services/teacherStudentGrant.js'
import {
  createPieceAssignment,
} from '../../../src/services/pieceAssignment.js'
import {
  createInitialPieceLifecycleRecord,
  isPieceAssignmentLifecycleRecord,
} from '../../../src/services/pieceAssignmentLifecycleRecord.js'
import {
  normalizeRequiredId,
} from '../../../src/services/teacherDeliveryContractValidation.js'

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

function same(left, right) {
  return isDeepStrictEqual(plain(left), plain(right))
}

function documentId(value) {
  return Buffer.from(
    normalizeRequiredId(value, 'documentId'),
    'utf8',
  ).toString('base64url')
}

function restoreRequest(raw) {
  const restored = createStudentWorkRequest({
    requestId: raw.requestId,
    teacherId: raw.teacherId,
    studentId: raw.studentId,
    title: raw.title,
    state: raw.state,
    requestedAt: raw.requestedAt,
    updatedAt: raw.updatedAt,
    pieceAssignmentId: raw.pieceAssignmentId,
    targetState: raw.targetState,
    revokedAt: raw.revokedAt,
  })
  if (!same(restored, raw)) {
    throw new TypeError('invalid StudentWorkRequest persistence snapshot.')
  }
  return restored
}

function restoreGrant(raw) {
  return createTeacherStudentGrant({
    teacherId: raw.teacherId,
    studentId: raw.studentId,
    active: raw.active,
    createdAt: raw.createdAt,
    revokedAt: raw.revokedAt,
  })
}

function restorePiece(raw) {
  return createPieceAssignment({
    pieceAssignmentId: raw.pieceAssignmentId,
    pieceId: raw.pieceId,
    arrangementId: raw.arrangementId,
    studentId: raw.studentId,
    title: raw.title,
    teacherNote: raw.teacherNote,
    assignedAt: raw.assignedAt,
    contentRefs: raw.contentRefs,
  })
}

function restorePieceLifecycle(raw, piece) {
  const restored = Object.freeze({
    schemaVersion: raw.schemaVersion,
    piece,
    state: raw.state,
    stateChangedAt: raw.stateChangedAt,
    revokedAt: raw.revokedAt,
  })
  if (!isPieceAssignmentLifecycleRecord(restored) || !same(restored, raw)) {
    throw new TypeError('invalid Piece lifecycle persistence snapshot.')
  }
  return restored
}

function assertFirestore(firestore) {
  if (
    !firestore ||
    typeof firestore.collection !== 'function' ||
    typeof firestore.runTransaction !== 'function'
  ) {
    throw new TypeError('firestore must provide collection() and runTransaction().')
  }
  return firestore
}

function assertConversionEvidence(next, piece, lifecycle) {
  if (
    next.state !== STUDENT_WORK_REQUEST_STATE.CONVERTED ||
    piece === null ||
    lifecycle === null ||
    piece.studentId !== next.studentId ||
    lifecycle.piece.pieceAssignmentId !== next.pieceAssignmentId ||
    lifecycle.revokedAt !== null ||
    lifecycle.state !== next.targetState
  ) {
    throw new Error('work-request-piece-evidence-mismatch')
  }
}

export function createFirestoreStudentWorkRequestStore({ firestore } = {}) {
  const db = assertFirestore(firestore)
  const requests = db.collection('studentWorkRequests')
  const grants = db.collection('teacherStudentGrants')
  const pieces = db.collection('pieceAssignments')
  const pieceLifecycles = db.collection('pieceAssignmentLifecycle')

  async function readPieceEvidence(pieceAssignmentId, reader) {
    const id = normalizeRequiredId(pieceAssignmentId, 'pieceAssignmentId')
    const pieceRef = pieces.doc(documentId(id))
    const lifecycleRef = pieceLifecycles.doc(documentId(id))
    const pieceSnap = await reader(pieceRef)
    if (!pieceSnap.exists) return null
    const lifecycleSnap = await reader(lifecycleRef)
    const piece = restorePiece(pieceSnap.data())
    const lifecycle = lifecycleSnap.exists
      ? restorePieceLifecycle(lifecycleSnap.data(), piece)
      : createInitialPieceLifecycleRecord(piece)
    return Object.freeze({ piece, lifecycle })
  }

  return Object.freeze({
    async getWorkRequest(requestId) {
      const id = normalizeRequiredId(requestId, 'requestId')
      const snap = await requests.doc(documentId(id)).get()
      return snap.exists ? restoreRequest(snap.data()) : null
    },

    async putWorkRequest(request) {
      if (!isStudentWorkRequest(request)) {
        throw new TypeError('work request must be valid.')
      }
      const ref = requests.doc(documentId(request.requestId))
      return db.runTransaction(async (transaction) => {
        const snap = await transaction.get(ref)
        if (snap.exists) {
          const existing = restoreRequest(snap.data())
          if (!same(existing, request)) {
            throw new Error('work request immutable create conflict.')
          }
          return existing
        }
        transaction.create(ref, plain(request))
        return request
      })
    },

    async listWorkRequestsForTeacher(teacherId) {
      const id = normalizeRequiredId(teacherId, 'teacherId')
      const snapshot = await requests.where('teacherId', '==', id).get()
      return Object.freeze(
        snapshot.docs
          .map((doc) => restoreRequest(doc.data()))
          .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt)),
      )
    },

    async listActiveTeacherGrantsForStudent(studentId) {
      const id = normalizeRequiredId(studentId, 'studentId')
      const snapshot = await grants.where('studentId', '==', id).get()
      return Object.freeze(
        snapshot.docs
          .map((doc) => restoreGrant(doc.data()))
          .filter((grant) => grant.active === true && grant.revokedAt === null),
      )
    },

    async getPieceEvidence(pieceAssignmentId) {
      return readPieceEvidence(
        pieceAssignmentId,
        (ref) => ref.get(),
      )
    },

    async commitWorkRequestTransition(current, next) {
      assertStudentWorkRequestTransition(current, next)
      const requestRef = requests.doc(documentId(current.requestId))
      return db.runTransaction(async (transaction) => {
        const snap = await transaction.get(requestRef)
        if (!snap.exists) throw new Error('work-request-not-found')
        const stored = restoreRequest(snap.data())
        if (!same(stored, current)) {
          if (same(stored, next)) return stored
          throw new Error('work request current-state conflict.')
        }
        if (same(stored, next)) return stored

        if (next.state === STUDENT_WORK_REQUEST_STATE.CONVERTED) {
          const evidence = await readPieceEvidence(
            next.pieceAssignmentId,
            (ref) => transaction.get(ref),
          )
          assertConversionEvidence(
            next,
            evidence?.piece ?? null,
            evidence?.lifecycle ?? null,
          )
        }

        transaction.set(requestRef, plain(next))
        return next
      })
    },
  })
}
