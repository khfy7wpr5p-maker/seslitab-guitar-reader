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
