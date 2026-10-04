import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createStudentWorkRequestService,
} from '../backend/delivery/services/studentWorkRequestService.js'
import {
  convertStudentWorkRequest,
  createPendingStudentWorkRequest,
} from '../src/services/studentWorkRequest.js'

function convertedRequest() {
  return convertStudentWorkRequest(
    createPendingStudentWorkRequest({
      requestId: 'request-a',
      teacherId: 'teacher-a',
      studentId: 'student-a',
      title: 'Sor Etüdü No. 13',
      requestedAt: '2026-10-04T07:30:00Z',
    }),
    {
      pieceAssignmentId: 'piece-a',
      targetState: 'REPERTOIRE',
      changedAt: '2026-10-04T09:00:00Z',
    },
  )
}

function createService({ teacherId = 'teacher-a' } = {}) {
  const request = convertedRequest()
  return createStudentWorkRequestService({
    authorization: {
      async resolvePrincipal(providerSubject, role) {
        assert.equal(providerSubject, 'uid-teacher-a')
        assert.equal(role, 'TEACHER')
        return { teacherId }
      },
    },
    store: {
      async getWorkRequest(requestId) {
        assert.equal(requestId, 'request-a')
        return request
      },
      async putWorkRequest() {
        throw new Error('not used')
      },
      async listWorkRequestsForTeacher() {
        throw new Error('not used')
      },
      async listActiveTeacherGrantsForStudent() {
        throw new Error('not used')
      },
      async getPieceEvidence() {
        throw new Error('not used')
      },
      async commitWorkRequestTransition() {
        throw new Error('not used')
      },
    },
    now: () => '2026-10-04T10:00:00Z',
    createRequestId: () => 'request-new',
  })
}

test('SES-155 teacher internal lookup returns exact owned terminal request with conversion evidence', async () => {
  const service = createService()

  const result = await service.getForTeacher({
    providerSubject: 'uid-teacher-a',
    requestId: 'request-a',
  })

  assert.deepEqual(result, {
    requestId: 'request-a',
    studentId: 'student-a',
    title: 'Sor Etüdü No. 13',
    state: 'CONVERTED',
    requestedAt: '2026-10-04T07:30:00Z',
    updatedAt: '2026-10-04T09:00:00Z',
    targetState: 'REPERTOIRE',
    pieceAssignmentId: 'piece-a',
  })
  assert.equal(Object.isFrozen(result), true)
})

test('SES-155 teacher internal lookup rejects a request owned by another teacher', async () => {
  const service = createService({ teacherId: 'teacher-b' })

  await assert.rejects(
    () => service.getForTeacher({
      providerSubject: 'uid-teacher-a',
      requestId: 'request-a',
    }),
    /work-request-forbidden/,
  )
})
