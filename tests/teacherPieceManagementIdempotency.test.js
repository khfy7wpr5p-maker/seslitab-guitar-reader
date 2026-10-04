import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createTeacherPieceManagementService,
} from '../backend/delivery/services/teacherPieceManagementService.js'

function baseDependencies({ request }) {
  const calls = []
  return {
    calls,
    service: createTeacherPieceManagementService({
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
          return Object.freeze([])
        },
        async getPieceLifecycle() {
          return null
        },
      },
      pieceService: {
        async createPiece(input) {
          calls.push(['createPiece', input])
          throw new Error('createPiece must not run for a completed retry')
        },
        async applyPieceAction(input) {
          calls.push(['applyPieceAction', input])
          throw new Error('applyPieceAction must not run for a completed retry')
        },
      },
      workRequestService: {
        async listPendingForTeacher() {
          return Object.freeze([])
        },
        async getForTeacher(input) {
          calls.push(['getForTeacher', input])
          return request
        },
        async revokePending(input) {
          calls.push(['revokePending', input])
          return request
        },
        async acknowledgeConversion(input) {
          calls.push(['acknowledgeConversion', input])
          return request
        },
      },
    }),
  }
}

test('SES-155 converted request retry is idempotent and does not recreate or retrigger Piece lifecycle', async () => {
  const request = Object.freeze({
    requestId: 'request-a',
    studentId: 'student-a',
    title: 'Sor Etüdü No. 13',
    state: 'CONVERTED',
    requestedAt: '2026-10-04T07:30:00Z',
    updatedAt: '2026-10-04T09:00:00Z',
    targetState: 'REPERTOIRE',
    pieceAssignmentId: 'piece-a',
  })
  const { service, calls } = baseDependencies({ request })

  const result = await service.applyPendingRequestAction({
    providerSubject: 'uid-teacher-a',
    actionKey: 'request-a',
    action: 'PLACE_IN_REPERTOIRE',
    piece: {
      pieceAssignmentId: 'piece-a',
      pieceId: 'work-a',
      arrangementId: 'arrangement-a',
      teacherNote: '',
      scoreAssignmentId: 'score-a',
      chordAssignmentIds: [],
    },
  })

  assert.deepEqual(result, {
    title: 'Sor Etüdü No. 13',
    displayNameOrNickname: 'Ada',
    state: 'CONVERTED',
    revoked: false,
    targetState: 'REPERTOIRE',
    updatedAt: '2026-10-04T09:00:00Z',
  })
  assert.deepEqual(calls, [
    [
      'getForTeacher',
      {
        providerSubject: 'uid-teacher-a',
        requestId: 'request-a',
      },
    ],
    [
      'acknowledgeConversion',
      {
        providerSubject: 'uid-teacher-a',
        requestId: 'request-a',
        pieceAssignmentId: 'piece-a',
        targetState: 'REPERTOIRE',
      },
    ],
  ])
})

test('SES-155 rejected request retry is idempotent and does not create a Piece', async () => {
  const request = Object.freeze({
    requestId: 'request-a',
    studentId: 'student-a',
    title: 'Sor Etüdü No. 13',
    state: 'REVOKED',
    requestedAt: '2026-10-04T07:30:00Z',
    updatedAt: '2026-10-04T09:00:00Z',
    targetState: null,
    pieceAssignmentId: null,
  })
  const { service, calls } = baseDependencies({ request })

  const result = await service.applyPendingRequestAction({
    providerSubject: 'uid-teacher-a',
    actionKey: 'request-a',
    action: 'REJECT',
  })

  assert.equal(result.state, 'REVOKED')
  assert.equal(result.revoked, true)
  assert.deepEqual(calls, [
    [
      'getForTeacher',
      {
        providerSubject: 'uid-teacher-a',
        requestId: 'request-a',
      },
    ],
  ])
})
