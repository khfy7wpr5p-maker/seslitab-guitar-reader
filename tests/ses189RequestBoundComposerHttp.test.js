import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'

import {
  createTeacherPieceManagementRouter,
} from '../backend/delivery/http/teacherPieceManagementRouter.js'
import {
  createSecureDeliveryApiClient,
} from '../src/services/secureDeliveryApiClient.js'

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

function managementService() {
  return Object.freeze({
    async listPieces() { return [] },
    async listPendingRequests() { return [] },
    async applyPendingRequestAction() { return { state: 'REVOKED' } },
  })
}

const composerDraft = Object.freeze({
  teacherNote: 'Yavaş çalış.',
  scoreUpload: Object.freeze({
    draftId: 'browser-draft',
    musicXml: '<score-partwise/>',
    musicXmlFingerprint: 'a'.repeat(64),
  }),
  guitarTabUpload: null,
  chordSnapshots: Object.freeze([]),
})

test('SES-189 router exposes only bounded conversion output and keeps recipient identity server-side', async () => {
  const calls = []
  const router = createTeacherPieceManagementRouter({
    tokenVerifier: {
      async verifyIdToken(token) {
        assert.equal(token, 'teacher-token')
        return { uid: 'uid-teacher-a' }
      },
    },
    service: managementService(),
    requestBoundComposerService: {
      async convert(input) {
        calls.push(input)
        return Object.freeze({
          requestId: 'request a',
          studentId: 'student-secret',
          title: 'Sor Etüdü No. 13',
          state: 'CONVERTED',
          targetState: 'ACTIVE',
          pieceAssignmentId: 'piece-secret',
          updatedAt: '2026-10-04T09:00:00Z',
        })
      },
    },
    config: { enabled: true, writesEnabled: true },
  })

  const response = await request(
    appFor(router),
    '/secure-delivery/teacher/work-requests/request%20a/conversions',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer teacher-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        targetState: 'ACTIVE',
        composerDraft,
      }),
    },
  )

  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.deepEqual(calls, [{
    providerSubject: 'uid-teacher-a',
    requestId: 'request a',
    targetState: 'ACTIVE',
    composerDraft,
  }])
  assert.deepEqual(payload, {
    success: true,
    data: {
      actionKey: 'request a',
      title: 'Sor Etüdü No. 13',
      state: 'CONVERTED',
      targetState: 'ACTIVE',
      updatedAt: '2026-10-04T09:00:00Z',
    },
  })
  assert.equal(JSON.stringify(payload).includes('student-secret'), false)
  assert.equal(JSON.stringify(payload).includes('piece-secret'), false)
})

test('SES-189 router rejects browser-invented recipient authority before service execution', async () => {
  let calls = 0
  const router = createTeacherPieceManagementRouter({
    tokenVerifier: {
      async verifyIdToken() { return { uid: 'uid-teacher-a' } },
    },
    service: managementService(),
    requestBoundComposerService: {
      async convert() {
        calls += 1
        return null
      },
    },
    config: { enabled: true, writesEnabled: true },
  })

  const response = await request(
    appFor(router),
    '/secure-delivery/teacher/work-requests/request-a/conversions',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer teacher-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        targetState: 'ACTIVE',
        composerDraft,
        studentId: 'student-invented',
      }),
    },
  )

  assert.equal(response.status, 400)
  assert.equal(calls, 0)
})

test('SES-189 legacy work-request action endpoint rejects browser Piece conversion payloads', async () => {
  let calls = 0
  const router = createTeacherPieceManagementRouter({
    tokenVerifier: {
      async verifyIdToken() { return { uid: 'uid-teacher-a' } },
    },
    service: Object.freeze({
      async listPieces() { return [] },
      async listPendingRequests() { return [] },
      async applyPendingRequestAction() {
        calls += 1
        return null
      },
    }),
    requestBoundComposerService: {
      async convert() { return null },
    },
    config: { enabled: true, writesEnabled: true },
  })

  const response = await request(
    appFor(router),
    '/secure-delivery/teacher/work-requests/request-a/actions',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer teacher-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'PLACE_IN_ACTIVE',
        piece: {
          pieceAssignmentId: 'piece-invented',
          studentId: 'student-invented',
        },
      }),
    },
  )

  assert.equal(response.status, 400)
  assert.equal(calls, 0)
})

test('SES-189 browser client sends only bounded conversion fields', async () => {
  const calls = []
  const client = createSecureDeliveryApiClient({
    baseUrl: 'https://example.test/secure-delivery',
    getIdToken: async () => 'teacher-token',
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return {
        ok: true,
        status: 200,
        async json() {
          return { success: true, data: { state: 'CONVERTED' } }
        },
      }
    },
  })

  await client.convertTeacherWorkRequest(
    'request a',
    'ACTIVE',
    composerDraft,
  )

  assert.deepEqual(calls, [{
    url: 'https://example.test/secure-delivery/teacher/work-requests/request%20a/conversions',
    init: {
      method: 'POST',
      headers: {
        Authorization: 'Bearer teacher-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ targetState: 'ACTIVE', composerDraft }),
    },
  }])
})
