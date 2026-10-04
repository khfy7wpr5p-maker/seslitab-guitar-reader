import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createPendingStudentWorkRequest,
  convertStudentWorkRequest,
  revokeStudentWorkRequest,
  STUDENT_WORK_REQUEST_STATE,
} from '../src/services/studentWorkRequest.js'
import {
  createStudentWorkRequestService,
} from '../backend/delivery/services/studentWorkRequestService.js'

function pending() {
  return createPendingStudentWorkRequest({
    requestId: 'request-a',
    teacherId: 'teacher-a',
    studentId: 'student-a',
    title: 'Sor Etüdü No. 13',
    requestedAt: '2026-10-04T08:00:00Z',
  })
}

function makeHarness({ grants, request = null, evidence = null } = {}) {
  let stored = request
  const authorization = {
    async resolvePrincipal(subject, role) {
      if (role === 'STUDENT' && subject === 'uid-student') {
        return { role, studentId: 'student-a' }
      }
      if (role === 'TEACHER' && subject === 'uid-teacher') {
        return { role, teacherId: 'teacher-a' }
      }
      if (role === 'TEACHER' && subject === 'uid-other-teacher') {
        return { role, teacherId: 'teacher-b' }
      }
      throw new Error('unauthorized')
    },
  }
  const store = {
    async getWorkRequest() { return stored },
    async putWorkRequest(next) {
      if (stored !== null && JSON.stringify(stored) !== JSON.stringify(next)) {
        throw new Error('create conflict')
      }
      stored = stored ?? next
      return stored
    },
    async listWorkRequestsForTeacher(teacherId) {
      return stored !== null && stored.teacherId === teacherId ? [stored] : []
    },
    async listActiveTeacherGrantsForStudent() { return grants ?? [] },
    async getPieceEvidence() { return evidence },
    async commitWorkRequestTransition(current, next) {
      if (stored !== current) throw new Error('current-state conflict')
      stored = next
      return stored
    },
  }
  const times = [
    '2026-10-04T08:01:00Z',
    '2026-10-04T08:02:00Z',
    '2026-10-04T08:03:00Z',
  ]
  const service = createStudentWorkRequestService({
    authorization,
    store,
    now: () => times.shift() ?? '2026-10-04T08:04:00Z',
    createRequestId: () => 'request-a',
  })
  return { service, getStored: () => stored }
}

test('domain conversion is idempotent for the same Piece and target', () => {
  const converted = convertStudentWorkRequest(pending(), {
    pieceAssignmentId: 'piece-a',
    targetState: 'ACTIVE',
    changedAt: '2026-10-04T08:01:00Z',
  })
  assert.equal(converted.state, STUDENT_WORK_REQUEST_STATE.CONVERTED)
  assert.equal(
    convertStudentWorkRequest(converted, {
      pieceAssignmentId: 'piece-a',
      targetState: 'ACTIVE',
      changedAt: '2026-10-04T08:02:00Z',
    }),
    converted,
  )
  assert.throws(
    () => convertStudentWorkRequest(converted, {
      pieceAssignmentId: 'piece-b',
      targetState: 'ACTIVE',
      changedAt: '2026-10-04T08:02:00Z',
    }),
    /terminal transition conflict/,
  )
})

test('revocation is one-way and cannot be converted', () => {
  const revoked = revokeStudentWorkRequest(pending(), {
    changedAt: '2026-10-04T08:01:00Z',
  })
  assert.equal(revoked.state, STUDENT_WORK_REQUEST_STATE.REVOKED)
  assert.equal(
    revokeStudentWorkRequest(revoked, { changedAt: '2026-10-04T08:02:00Z' }),
    revoked,
  )
  assert.throws(
    () => convertStudentWorkRequest(revoked, {
      pieceAssignmentId: 'piece-a',
      targetState: 'ACTIVE',
      changedAt: '2026-10-04T08:02:00Z',
    }),
    /cannot be converted/,
  )
})

test('student request creates only PENDING request under exactly one active teacher grant', async () => {
  const h = makeHarness({
    grants: [{
      teacherId: 'teacher-a',
      studentId: 'student-a',
      active: true,
      revokedAt: null,
    }],
  })
  const dto = await h.service.requestWork({
    providerSubject: 'uid-student',
    title: 'Sor Etüdü No. 13',
  })
  assert.equal(dto.state, 'PENDING')
  assert.equal(h.getStored().pieceAssignmentId, null)
  assert.equal(h.getStored().teacherId, 'teacher-a')
  assert.equal(Object.hasOwn(dto, 'teacherId'), false)
  assert.equal(Object.hasOwn(dto, 'studentId'), false)
})

test('student request fails closed when teacher authority is missing or ambiguous', async () => {
  for (const grants of [[], [
    { teacherId: 'teacher-a', studentId: 'student-a', active: true, revokedAt: null },
    { teacherId: 'teacher-b', studentId: 'student-a', active: true, revokedAt: null },
  ]]) {
    const h = makeHarness({ grants })
    await assert.rejects(
      h.service.requestWork({
        providerSubject: 'uid-student',
        title: 'Etüt',
      }),
      /teacher-authority-ambiguous/,
    )
  }
})

test('teacher conversion fails closed without matching same-student Piece evidence', async () => {
  const base = pending()
  for (const evidence of [
    null,
    {
      piece: { pieceAssignmentId: 'piece-a', studentId: 'student-b' },
      lifecycle: {
        piece: { pieceAssignmentId: 'piece-a' },
        state: 'ACTIVE',
        revokedAt: null,
      },
    },
    {
      piece: { pieceAssignmentId: 'piece-a', studentId: 'student-a' },
      lifecycle: {
        piece: { pieceAssignmentId: 'piece-a' },
        state: 'REPERTOIRE',
        revokedAt: null,
      },
    },
  ]) {
    const h = makeHarness({ request: base, evidence })
    await assert.rejects(
      h.service.acknowledgeConversion({
        providerSubject: 'uid-teacher',
        requestId: 'request-a',
        pieceAssignmentId: 'piece-a',
        targetState: 'ACTIVE',
      }),
      /piece-evidence/,
    )
  }
})

test('teacher conversion accepts exact Piece evidence and repeated acknowledgement is idempotent', async () => {
  const evidence = {
    piece: { pieceAssignmentId: 'piece-a', studentId: 'student-a' },
    lifecycle: {
      piece: { pieceAssignmentId: 'piece-a' },
      state: 'ACTIVE',
      revokedAt: null,
    },
  }
  const h = makeHarness({ request: pending(), evidence })
  const first = await h.service.acknowledgeConversion({
    providerSubject: 'uid-teacher',
    requestId: 'request-a',
    pieceAssignmentId: 'piece-a',
    targetState: 'ACTIVE',
  })
  const second = await h.service.acknowledgeConversion({
    providerSubject: 'uid-teacher',
    requestId: 'request-a',
    pieceAssignmentId: 'piece-a',
    targetState: 'ACTIVE',
  })
  assert.equal(first.state, 'CONVERTED')
  assert.deepEqual(second, first)
})

test('a different teacher cannot revoke another teacher pending request', async () => {
  const h = makeHarness({ request: pending() })
  await assert.rejects(
    h.service.revokePending({
      providerSubject: 'uid-other-teacher',
      requestId: 'request-a',
    }),
    /work-request-forbidden/,
  )
  assert.equal(h.getStored().state, 'PENDING')
})
