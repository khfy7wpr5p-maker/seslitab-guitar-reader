import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'

import {
  createStudentWorkRequestRouter,
} from '../backend/delivery/http/studentWorkRequestRouter.js'

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

test('student work request endpoint authenticates and returns bounded public DTO', async () => {
  const calls = []
  const router = createStudentWorkRequestRouter({
    tokenVerifier: {
      async verifyIdToken(token) {
        assert.equal(token, 'student-token')
        return { uid: 'uid-student-a' }
      },
    },
    service: {
      async requestWork(input) {
        calls.push(input)
        return Object.freeze({
          title: 'Sor Etüdü No. 13',
          state: 'PENDING',
          requestedAt: '2026-10-04T08:00:00Z',
          updatedAt: '2026-10-04T08:00:00Z',
          targetState: null,
        })
      },
    },
    config: {
      enabled: true,
      writesEnabled: true,
    },
  })

  const response = await request(
    appFor(router),
    '/secure-delivery/student/work-requests',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer student-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Sor Etüdü No. 13' }),
    },
  )
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.success, true)
  assert.deepEqual(calls, [{
    providerSubject: 'uid-student-a',
    title: 'Sor Etüdü No. 13',
  }])
  assert.equal(Object.hasOwn(payload.data, 'requestId'), false)
  assert.equal(Object.hasOwn(payload.data, 'studentId'), false)
  assert.equal(Object.hasOwn(payload.data, 'teacherId'), false)
})

test('student work request endpoint fails closed without bearer authentication', async () => {
  let called = false
  const router = createStudentWorkRequestRouter({
    tokenVerifier: {
      async verifyIdToken() {
        called = true
        return { uid: 'unexpected' }
      },
    },
    service: {
      async requestWork() {
        called = true
        return null
      },
    },
    config: {
      enabled: true,
      writesEnabled: true,
    },
  })

  const response = await request(
    appFor(router),
    '/secure-delivery/student/work-requests',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Etüt' }),
    },
  )

  assert.equal(response.status, 401)
  assert.equal(called, false)
})

test('student work request endpoint honors global secure-delivery write gate', async () => {
  let called = false
  const router = createStudentWorkRequestRouter({
    tokenVerifier: {
      async verifyIdToken() {
        called = true
        return { uid: 'unexpected' }
      },
    },
    service: {
      async requestWork() {
        called = true
        return null
      },
    },
    config: {
      enabled: true,
      writesEnabled: false,
    },
  })

  const response = await request(
    appFor(router),
    '/secure-delivery/student/work-requests',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Etüt' }),
    },
  )

  assert.equal(response.status, 503)
  assert.equal(called, false)
})

test('student work request endpoint emits only privacy-safe upstream failure classes', async () => {
  const cases = [
    {
      code: 14,
      failureClass: 'UPSTREAM_UNAVAILABLE',
    },
    {
      code: 'resource-exhausted',
      failureClass: 'UPSTREAM_RESOURCE_EXHAUSTED',
    },
  ]

  for (const item of cases) {
    const events = []
    const router = createStudentWorkRequestRouter({
      tokenVerifier: {
        async verifyIdToken(token) {
          assert.equal(token, 'student-token')
          return { uid: 'uid-student-a' }
        },
      },
      service: {
        async requestWork() {
          const error = new Error(
            'projects/secret/databases/private',
          )
          error.code = item.code
          throw error
        },
      },
      config: {
        enabled: true,
        writesEnabled: true,
      },
      observeRequest(event) {
        events.push(event)
      },
    })

    const response = await request(
      appFor(router),
      '/secure-delivery/student/work-requests',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer student-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 'Etüt' }),
      },
    )

    assert.equal(response.status, 503)
    assert.deepEqual(
      await response.json(),
      {
        success: false,
        error: {
          code: 'SECURE_DELIVERY_UNAVAILABLE',
          message: 'Güvenli teslimat şu anda kullanılamıyor.',
        },
      },
    )
    assert.deepEqual(events, [
      {
        event: 'secure_delivery_request',
        operation: 'student_work_request_create',
        outcome: 'unavailable',
        status: 503,
        failureClass: item.failureClass,
      },
    ])

    const serialized = JSON.stringify(events)
    assert.equal(serialized.includes('projects/secret'), false)
    assert.equal(serialized.includes('private'), false)
    assert.equal(serialized.includes('uid-student-a'), false)
    assert.equal(serialized.includes('student-token'), false)
  }
})


const pendingPath = '/secure-delivery/student/work-requests/pending'

function pendingRouter({ verifier, list, config = {}, observeRequest } = {}) {
  return createStudentWorkRequestRouter({
    tokenVerifier: { verifyIdToken: verifier ?? (async () => ({ uid: ' uid-student-a ' })) },
    service: {
      async requestWork() { throw new Error('GET must not write') },
      listSharedPendingForStudent: list ?? (async () => []),
    },
    config: { enabled: true, studentReadsEnabled: true, writesEnabled: false, ...config },
    observeRequest,
  })
}

test('pending GET authenticates, ignores caller authority, and works with writes disabled', async () => {
  const calls = []
  const events = []
  const rows = [{ title: 'Etüt', displayNameOrNickname: 'Ada' }]
  const response = await request(appFor(pendingRouter({
    async verifier(token) {
      assert.equal(token, 'student-token')
      return { uid: ' uid-student-a ' }
    },
    async list(input) { calls.push(input); return rows },
    observeRequest(event) { events.push(event) },
  })), `${pendingPath}?teacherId=other&studentId=other`, {
    headers: { Authorization: 'Bearer student-token' },
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { success: true, data: rows })
  assert.deepEqual(calls, [{ providerSubject: 'uid-student-a' }])
  assert.deepEqual(events, [{
    event: 'secure_delivery_request', operation: 'student_work_request_list_pending',
    outcome: 'authorized', status: 200,
  }])
})

test('pending GET rejects absent, malformed, rejected and invalid-uid tokens before listing', async () => {
  for (const scenario of [
    { authorization: undefined },
    { authorization: 'Basic secret' },
    { authorization: 'Bearer token', verifier: async () => { throw new Error('secret') } },
    ...[null, {}, { uid: '' }, { uid: '   ' }, { uid: 123 }].map(decoded => ({
      authorization: 'Bearer token', verifier: async () => decoded,
    })),
  ]) {
    let called = false
    const response = await request(appFor(pendingRouter({
      verifier: scenario.verifier,
      async list() { called = true; return [] },
    })), pendingPath, { headers: scenario.authorization ? { Authorization: scenario.authorization } : {} })
    assert.equal(response.status, 401)
    assert.equal((await response.json()).error.code, 'UNAUTHENTICATED')
    assert.equal(called, false)
  }
})

test('pending GET honors feature and student-read gates before authentication or listing', async () => {
  for (const config of [{ enabled: false }, { studentReadsEnabled: false }, { studentReadsEnabled: undefined }]) {
    let called = false
    const response = await request(appFor(pendingRouter({
      config,
      async verifier() { called = true; return { uid: 'uid-student-a' } },
      async list() { called = true; return [] },
    })), pendingPath, { headers: { Authorization: 'Bearer token' } })
    assert.equal(response.status, 503)
    assert.equal(called, false)
  }
})

test('pending GET preserves sanitized authorization and upstream errors', async () => {
  for (const scenario of [
    { error: new Error('secure-delivery-wrong-role'), status: 403 },
    { error: Object.assign(new Error('private database student-id'), { code: 14 }), status: 503 },
  ]) {
    const events = []
    const response = await request(appFor(pendingRouter({
      async list() { throw scenario.error },
      observeRequest(event) { events.push(event) },
    })), pendingPath, { headers: { Authorization: 'Bearer token' } })
    assert.equal(response.status, scenario.status)
    const serialized = JSON.stringify({ payload: await response.json(), events })
    assert.equal(serialized.includes(scenario.error.message), false)
    assert.equal(serialized.includes('uid-student-a'), false)
    assert.equal(events[0].operation, 'student_work_request_list_pending')
  }
})

test('pending GET returns an empty list even when its observer fails', async () => {
  for (const observeRequest of [() => { throw new Error('observer failed') }, async () => { throw new Error('observer failed') }]) {
    const response = await request(appFor(pendingRouter({ observeRequest })), pendingPath, {
      headers: { Authorization: 'Bearer token' },
    })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { success: true, data: [] })
  }
})
