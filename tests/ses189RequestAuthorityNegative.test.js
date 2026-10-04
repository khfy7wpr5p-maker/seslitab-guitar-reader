import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createRequestBoundAssignmentComposerService,
} from '../backend/delivery/services/requestBoundAssignmentComposerService.js'

function serviceWith(getForTeacher, calls) {
  return createRequestBoundAssignmentComposerService({
    authorization: {
      async resolvePrincipal() {
        return Object.freeze({ teacherId: 'teacher-a' })
      },
    },
    rosterService: {
      async listRoster() {
        calls.push('roster')
        return Object.freeze([])
      },
    },
    preparedService: {
      async prepareBatch() {
        calls.push('prepare')
        return Object.freeze([])
      },
    },
    teacherDeliveryService: {
      async deliverBatch() {
        calls.push('deliver')
        return Object.freeze([])
      },
    },
    pieceService: {
      async createPiece() { calls.push('piece'); return null },
      async getPieceForTeacher() { calls.push('piece-read'); return null },
      async applyPieceAction() { calls.push('lifecycle'); return null },
    },
    workRequestService: {
      getForTeacher,
      async acknowledgeConversion() {
        calls.push('ack')
        return null
      },
    },
    createComposerService() {
      calls.push('composer')
      return Object.freeze({ async send() { return null } })
    },
    now: () => '2026-10-04T08:00:00Z',
  })
}

const input = Object.freeze({
  providerSubject: 'uid-teacher-a',
  requestId: 'request-a',
  targetState: 'ACTIVE',
  composerDraft: Object.freeze({
    teacherNote: '',
    scoreUpload: null,
    guitarTabUpload: null,
    chordSnapshots: Object.freeze([]),
  }),
})

test('SES-189 wrong-teacher request rejection stops before roster, Composer, or delivery', async () => {
  const calls = []
  const service = serviceWith(async () => {
    throw new Error('work-request-forbidden')
  }, calls)

  await assert.rejects(
    () => service.convert(input),
    /work-request-forbidden/,
  )
  assert.deepEqual(calls, [])
})

test('SES-189 exact request-id mismatch stops before roster, Composer, or delivery', async () => {
  const calls = []
  const service = serviceWith(async () => Object.freeze({
    requestId: 'request-other',
    studentId: 'student-a',
    title: 'Etüt',
    state: 'PENDING',
    targetState: null,
    pieceAssignmentId: null,
  }), calls)

  await assert.rejects(
    () => service.convert(input),
    /work-request-authority-invalid/,
  )
  assert.deepEqual(calls, [])
})
