import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'

import {
  createPieceAssignment,
} from '../src/services/pieceAssignment.js'
import {
  createInitialPieceLifecycleRecord,
} from '../src/services/pieceAssignmentLifecycleRecord.js'
import {
  createSecureDeliveryApiClient,
} from '../src/services/secureDeliveryApiClient.js'

async function loadManagementService() {
  try {
    return await import('../backend/delivery/services/teacherPieceManagementService.js')
  } catch {
    assert.fail('teacherPieceManagementService module must exist')
  }
}

async function loadManagementRouter() {
  try {
    return await import('../backend/delivery/http/teacherPieceManagementRouter.js')
  } catch {
    assert.fail('teacherPieceManagementRouter module must exist')
  }
}

function activePiece() {
  return createPieceAssignment({
    pieceAssignmentId: 'piece-a',
    pieceId: 'work-a',
    arrangementId: 'arrangement-a',
    studentId: 'student-a',
    title: 'Sor Etüdü No. 13',
    teacherNote: '',
    assignedAt: '2026-10-04T08:00:00Z',
    contentRefs: {
      scoreAssignmentId: 'score-a',
      chordAssignmentIds: ['chord-a'],
    },
  })
}

function roster() {
  return Object.freeze([
    Object.freeze({
      schemaVersion: 1,
      studentId: 'student-a',
      displayNameOrNickname: 'Ada',
      active: true,
    }),
  ])
}

function pendingRequest() {
  return Object.freeze({
    requestId: 'request-a',
    studentId: 'student-a',
    title: 'Sor Etüdü No. 13',
    state: 'PENDING',
    requestedAt: '2026-10-04T07:30:00Z',
    updatedAt: '2026-10-04T07:30:00Z',
    targetState: null,
  })
}

async function managementHarness(overrides = {}) {
  const { createTeacherPieceManagementService } =
    await loadManagementService()
  const piece = activePiece()
  const lifecycle = createInitialPieceLifecycleRecord(piece)
  const calls = []

  const rosterService = overrides.rosterService ?? {
    async listRoster() {
      return roster()
    },
  }
  const store = overrides.store ?? {
    async listPieceAssignmentsForStudent(studentId) {
      assert.equal(studentId, 'student-a')
      return Object.freeze([piece])
    },
  }
  const pieceService = overrides.pieceService ?? {
    async getPieceForTeacher(input) {
      calls.push(['getPieceForTeacher', input])
      return Object.freeze({ piece, lifecycle })
    },
    async createPiece(input) {
      calls.push(['createPiece', input])
      return piece
    },
    async applyPieceAction(input) {
      calls.push(['applyPieceAction', input])
      return Object.freeze({
        ...lifecycle,
        state: 'REPERTOIRE',
        stateChangedAt: '2026-10-04T09:00:00Z',
      })
    },
  }
  const workRequestService = overrides.workRequestService ?? {
    async listPendingForTeacher(input) {
      calls.push(['listPendingForTeacher', input])
      return Object.freeze([pendingRequest()])
    },
    async revokePending(input) {
      calls.push(['revokePending', input])
      return Object.freeze({
        ...pendingRequest(),
        state: 'REVOKED',
        updatedAt: '2026-10-04T09:00:00Z',
        revokedAt: '2026-10-04T09:00:00Z',
      })
    },
    async acknowledgeConversion(input) {
      calls.push(['acknowledgeConversion', input])
      return Object.freeze({
        ...pendingRequest(),
        state: 'CONVERTED',
        updatedAt: '2026-10-04T09:00:00Z',
        targetState: input.targetState,
        pieceAssignmentId: input.pieceAssignmentId,
      })
    },
  }

  return {
    service: createTeacherPieceManagementService({
      rosterService,
      store,
      pieceService,
      workRequestService,
    }),
    calls,
    piece,
  }
}

test('SES-155 Piece read model exposes bounded teacher rows without stable student or Piece ids', async () => {
  const { service } = await managementHarness()

  const rows = await service.listPieces({
    providerSubject: 'uid-teacher-a',
  })

  assert.deepEqual(rows, [
    {
      actionKey: 'piece-a',
      title: 'Sor Etüdü No. 13',
      displayNameOrNickname: 'Ada',
      state: 'ACTIVE',
      revoked: false,
      assignedAt: '2026-10-04T08:00:00Z',
      contentSummary: {
        score: true,
        chordCount: 1,
      },
    },
  ])
  assert.equal(Object.isFrozen(rows), true)
  assert.equal(Object.isFrozen(rows[0]), true)
  assert.equal(Object.hasOwn(rows[0], 'studentId'), false)
  assert.equal(Object.hasOwn(rows[0], 'pieceAssignmentId'), false)
  assert.equal(Object.hasOwn(rows[0], 'teacherId'), false)
})

test('SES-155 pending Havuz read model joins only the current teacher roster and hides request/student ids', async () => {
  const { service } = await managementHarness()

  const rows = await service.listPendingRequests({
    providerSubject: 'uid-teacher-a',
  })

  assert.deepEqual(rows, [
    {
      actionKey: 'request-a',
      title: 'Sor Etüdü No. 13',
      displayNameOrNickname: 'Ada',
      state: 'PENDING',
      revoked: false,
      requestedAt: '2026-10-04T07:30:00Z',
      contentSummary: null,
    },
  ])
  assert.equal(Object.hasOwn(rows[0], 'requestId'), false)
  assert.equal(Object.hasOwn(rows[0], 'studentId'), false)
})

test('SES-155 direct Havuz to Repertuar uses Piece atomic PLACE_IN_REPERTOIRE before exact request acknowledgement', async () => {
  const { service, calls } = await managementHarness()

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
      chordAssignmentIds: ['chord-a'],
    },
  })

  const createCall = calls.find(([name]) => name === 'createPiece')
  assert.deepEqual(createCall, [
    'createPiece',
    {
      providerSubject: 'uid-teacher-a',
      input: {
        pieceAssignmentId: 'piece-a',
        pieceId: 'work-a',
        arrangementId: 'arrangement-a',
        studentId: 'student-a',
        title: 'Sor Etüdü No. 13',
        teacherNote: '',
        scoreAssignmentId: 'score-a',
        chordAssignmentIds: ['chord-a'],
      },
    },
  ])
  const actionCall = calls.find(([name]) => name === 'applyPieceAction')
  assert.deepEqual(actionCall, [
    'applyPieceAction',
    {
      providerSubject: 'uid-teacher-a',
      pieceAssignmentId: 'piece-a',
      action: 'PLACE_IN_REPERTOIRE',
    },
  ])
  const ackCall = calls.find(([name]) => name === 'acknowledgeConversion')
  assert.deepEqual(ackCall, [
    'acknowledgeConversion',
    {
      providerSubject: 'uid-teacher-a',
      requestId: 'request-a',
      pieceAssignmentId: 'piece-a',
      targetState: 'REPERTOIRE',
    },
  ])
  assert.deepEqual(result, {
    title: 'Sor Etüdü No. 13',
    displayNameOrNickname: 'Ada',
    state: 'CONVERTED',
    revoked: false,
    targetState: 'REPERTOIRE',
    updatedAt: '2026-10-04T09:00:00Z',
  })
})

test('SES-155 management fails closed when pending request is outside the current active roster', async () => {
  const { service } = await managementHarness({
    rosterService: {
      async listRoster() {
        return Object.freeze([])
      },
    },
  })

  await assert.rejects(
    () => service.applyPendingRequestAction({
      providerSubject: 'uid-teacher-a',
      actionKey: 'request-a',
      action: 'REJECT',
    }),
    /roster-authority-mismatch/,
  )
})

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return { success: true, data }
    },
  }
}

test('SES-155 browser client exposes bounded Piece and Havuz management endpoints', async () => {
  const calls = []
  const client = createSecureDeliveryApiClient({
    baseUrl: 'https://example.test/secure-delivery',
    getIdToken: async () => 'teacher-token',
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return jsonResponse([])
    },
  })

  await client.listTeacherPieces()
  await client.applyPieceAction('piece/a', 'REVOKE')
  await client.listTeacherWorkRequests()
  await client.applyTeacherWorkRequestAction(
    'request a',
    'REJECT',
  )

  assert.deepEqual(
    calls.map(({ url, init }) => [url, init.method, init.body ?? null]),
    [
      ['https://example.test/secure-delivery/teacher/pieces', 'GET', null],
      [
        'https://example.test/secure-delivery/teacher/pieces/piece%2Fa/actions',
        'POST',
        JSON.stringify({ action: 'REVOKE' }),
      ],
      ['https://example.test/secure-delivery/teacher/work-requests', 'GET', null],
      [
        'https://example.test/secure-delivery/teacher/work-requests/request%20a/actions',
        'POST',
        JSON.stringify({ action: 'REJECT' }),
      ],
    ],
  )
})

function appFor(router) {
  const app = express()
  app.use(express.json())
  app.use('/secure-delivery', router)
  return app
}

async function request(app, path, init = {}) {
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const { port } = server.address()
    return await fetch(`http://127.0.0.1:${port}${path}`, init)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

test('SES-155 teacher management router authenticates reads and gates mutations', async () => {
  const { createTeacherPieceManagementRouter } =
    await loadManagementRouter()
  const calls = []
  const router = createTeacherPieceManagementRouter({
    tokenVerifier: {
      async verifyIdToken(token) {
        assert.equal(token, 'teacher-token')
        return { uid: 'uid-teacher-a' }
      },
    },
    service: {
      async listPieces(input) {
        calls.push(['listPieces', input])
        return []
      },
      async listPendingRequests(input) {
        calls.push(['listPendingRequests', input])
        return []
      },
      async applyPendingRequestAction(input) {
        calls.push(['applyPendingRequestAction', input])
        return { state: 'REVOKED' }
      },
    },
    config: {
      enabled: true,
      writesEnabled: true,
    },
  })
  const headers = { Authorization: 'Bearer teacher-token' }
  const app = appFor(router)

  assert.equal(
    (await request(app, '/secure-delivery/teacher/pieces', { headers })).status,
    200,
  )
  assert.equal(
    (await request(app, '/secure-delivery/teacher/work-requests', { headers })).status,
    200,
  )
  assert.equal(
    (
      await request(
        app,
        '/secure-delivery/teacher/work-requests/request-a/actions',
        {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'REJECT' }),
        },
      )
    ).status,
    200,
  )
  assert.deepEqual(calls, [
    ['listPieces', { providerSubject: 'uid-teacher-a' }],
    ['listPendingRequests', { providerSubject: 'uid-teacher-a' }],
    [
      'applyPendingRequestAction',
      {
        providerSubject: 'uid-teacher-a',
        actionKey: 'request-a',
        action: 'REJECT',
        piece: undefined,
      },
    ],
  ])
})
