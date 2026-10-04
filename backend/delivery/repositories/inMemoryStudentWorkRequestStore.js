import {
  isStudentWorkRequest,
} from '../../../src/services/studentWorkRequest.js'
import {
  isTeacherStudentGrant,
} from '../../../src/services/teacherStudentGrant.js'
import {
  isPieceAssignment,
} from '../../../src/services/pieceAssignment.js'
import {
  isPieceAssignmentLifecycleRecord,
} from '../../../src/services/pieceAssignmentLifecycleRecord.js'
import {
  normalizeRequiredId,
} from '../../../src/services/teacherDeliveryContractValidation.js'

function exactJson(value) {
  return JSON.stringify(value)
}

function sameRecord(left, right) {
  return left === right || exactJson(left) === exactJson(right)
}

export function createInMemoryStudentWorkRequestStore({
  requests = [],
  grants = [],
  pieces = [],
  pieceLifecycles = [],
} = {}) {
  let requestById = new Map()
  const grantRows = []
  const pieceById = new Map()
  const pieceLifecycleById = new Map()

  for (const request of requests) {
    if (!isStudentWorkRequest(request)) {
      throw new TypeError('initial work request must be valid.')
    }
    if (requestById.has(request.requestId)) {
      throw new Error('duplicate work request.')
    }
    requestById.set(request.requestId, request)
  }

  for (const grant of grants) {
    if (!isTeacherStudentGrant(grant)) {
      throw new TypeError('initial teacher student grant must be valid.')
    }
    grantRows.push(grant)
  }

  for (const piece of pieces) {
    if (!isPieceAssignment(piece)) {
      throw new TypeError('initial Piece must be valid.')
    }
    pieceById.set(piece.pieceAssignmentId, piece)
  }

  for (const lifecycle of pieceLifecycles) {
    if (!isPieceAssignmentLifecycleRecord(lifecycle)) {
      throw new TypeError('initial Piece lifecycle must be valid.')
    }
    pieceLifecycleById.set(
      lifecycle.piece.pieceAssignmentId,
      lifecycle,
    )
  }

  return Object.freeze({
    async getWorkRequest(requestId) {
      return requestById.get(
        normalizeRequiredId(requestId, 'requestId'),
      ) ?? null
    },

    async putWorkRequest(request) {
      if (!isStudentWorkRequest(request)) {
        throw new TypeError('work request must be valid.')
      }
      const existing = requestById.get(request.requestId) ?? null
      if (existing !== null) {
        if (!sameRecord(existing, request)) {
          throw new Error('work request immutable create conflict.')
        }
        return existing
      }
      const next = new Map(requestById)
      next.set(request.requestId, request)
      requestById = next
      return request
    },

    async listWorkRequestsForTeacher(teacherId) {
      const id = normalizeRequiredId(teacherId, 'teacherId')
      return Object.freeze(
        [...requestById.values()].filter(
          (request) => request.teacherId === id,
        ),
      )
    },

    async listActiveTeacherGrantsForStudent(studentId) {
      const id = normalizeRequiredId(studentId, 'studentId')
      return Object.freeze(
        grantRows.filter(
          (grant) =>
            grant.studentId === id &&
            grant.active === true &&
            grant.revokedAt === null,
        ),
      )
    },

    async getPieceEvidence(pieceAssignmentId) {
      const id = normalizeRequiredId(
        pieceAssignmentId,
        'pieceAssignmentId',
      )
      const piece = pieceById.get(id) ?? null
      const lifecycle = pieceLifecycleById.get(id) ?? null
      if (piece === null || lifecycle === null) return null
      return Object.freeze({ piece, lifecycle })
    },

    async commitWorkRequestTransition(current, next) {
      if (!isStudentWorkRequest(current) || !isStudentWorkRequest(next)) {
        throw new TypeError('work request transition rows must be valid.')
      }
      if (current.requestId !== next.requestId) {
        throw new Error('work request transition identity mismatch.')
      }
      const stored = requestById.get(current.requestId) ?? null
      if (stored === null || !sameRecord(stored, current)) {
        throw new Error('work request current-state conflict.')
      }
      if (sameRecord(stored, next)) return stored
      const updated = new Map(requestById)
      updated.set(next.requestId, next)
      requestById = updated
      return next
    },
  })
}
