import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createTeacherPieceManagementService,
} from '../backend/delivery/services/teacherPieceManagementService.js'
import {
  createPieceAssignment,
} from '../src/services/pieceAssignment.js'
import {
  createInitialPieceLifecycleRecord,
} from '../src/services/pieceAssignmentLifecycleRecord.js'

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve))
}

function workRequestService() {
  return {
    async listPendingForTeacher() {
      return Object.freeze([])
    },
    async getForTeacher() {
      throw new Error('not used')
    },
    async revokePending() {
      throw new Error('not used')
    },
    async acknowledgeConversion() {
      throw new Error('not used')
    },
  }
}

function emptyPieceService() {
  return {
    async createPiece() {
      throw new Error('not used')
    },
    async applyPieceAction() {
      throw new Error('not used')
    },
  }
}

test('SES-156 starts independent per-student Piece reads without waiting for the previous student', async () => {
  let releaseFirst
  const firstRead = new Promise((resolve) => {
    releaseFirst = resolve
  })
  const calls = []

  const service = createTeacherPieceManagementService({
    rosterService: {
      async listRoster() {
        return Object.freeze([
          Object.freeze({
            studentId: 'student-a',
            displayNameOrNickname: 'Ada',
            active: true,
          }),
          Object.freeze({
            studentId: 'student-b',
            displayNameOrNickname: 'Ece',
            active: true,
          }),
        ])
      },
    },
    store: {
      async listPieceAssignmentsForStudent(studentId) {
        calls.push(studentId)
        if (studentId === 'student-a') return firstRead
        return Object.freeze([])
      },
      async getPieceLifecycle() {
        throw new Error('not used')
      },
    },
    pieceService: emptyPieceService(),
    workRequestService: workRequestService(),
  })

  const pending = service.listPieces({
    providerSubject: 'uid-teacher-a',
  })
  await nextTurn()
  const callsBeforeRelease = [...calls]
  releaseFirst(Object.freeze([]))
  await pending

  assert.deepEqual(
    callsBeforeRelease,
    ['student-a', 'student-b'],
  )
})

test('SES-156 starts independent Piece authority reads without waiting for the previous Piece', async () => {
  const pieceA = createPieceAssignment({
    pieceAssignmentId: 'piece-a',
    pieceId: 'work-a',
    arrangementId: 'arrangement-a',
    studentId: 'student-a',
    title: 'Etüt A',
    teacherNote: '',
    assignedAt: '2026-10-04T08:00:00Z',
    contentRefs: {
      scoreAssignmentId: 'score-a',
      chordAssignmentIds: [],
    },
  })
  const pieceB = createPieceAssignment({
    pieceAssignmentId: 'piece-b',
    pieceId: 'work-b',
    arrangementId: 'arrangement-b',
    studentId: 'student-a',
    title: 'Etüt B',
    teacherNote: '',
    assignedAt: '2026-10-04T07:00:00Z',
    contentRefs: {
      scoreAssignmentId: 'score-b',
      chordAssignmentIds: [],
    },
  })
  const lifecycleA = createInitialPieceLifecycleRecord(pieceA)
  const lifecycleB = createInitialPieceLifecycleRecord(pieceB)
  let releaseFirst
  const firstAuthorityRead = new Promise((resolve) => {
    releaseFirst = resolve
  })
  const authorityCalls = []

  const service = createTeacherPieceManagementService({
    rosterService: {
      async listRoster() {
        return Object.freeze([
          Object.freeze({
            studentId: 'student-a',
            displayNameOrNickname: 'Ada',
            active: true,
          }),
        ])
      },
    },
    store: {
      async listPieceAssignmentsForStudent() {
        return Object.freeze([pieceA, pieceB])
      },
    },
    pieceService: {
      async getPieceForTeacher({ pieceAssignmentId }) {
        authorityCalls.push(pieceAssignmentId)
        if (pieceAssignmentId === 'piece-a') return firstAuthorityRead
        return Object.freeze({ piece: pieceB, lifecycle: lifecycleB })
      },
      async createPiece() {
        throw new Error('not used')
      },
      async applyPieceAction() {
        throw new Error('not used')
      },
    },
    workRequestService: workRequestService(),
  })

  const pending = service.listPieces({
    providerSubject: 'uid-teacher-a',
  })
  await nextTurn()
  const callsBeforeRelease = [...authorityCalls]
  releaseFirst(Object.freeze({ piece: pieceA, lifecycle: lifecycleA }))
  await pending

  assert.deepEqual(
    callsBeforeRelease,
    ['piece-a', 'piece-b'],
  )
})
