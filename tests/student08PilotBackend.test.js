import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createStudent08PilotApp,
  createStudent08PilotStore,
} from '../backend/delivery/pilot/student08Pilot.js'

async function request(app, path, init = {}) {
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const { port } = server.address()
    return await fetch('http://127.0.0.1:' + port + path, init)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

const allowedOrigin =
  'https://st-student-s08-3-pilot.onrender.com'

const tokenVerifier = {
  async verifyIdToken(token) {
    assert.equal(token, 'pilot-token')
    return { uid: 'firebase-uid-a' }
  },
}

test('pilot store maps Firebase subject to opaque stable student identity', async () => {
  const store = createStudent08PilotStore()

  const mapping =
    await store.getIdentityMapping('firebase-uid-a')

  assert.equal(mapping.role, 'STUDENT')
  assert.equal(mapping.active, true)
  assert.notEqual(mapping.studentId, 'firebase-uid-a')
  assert.doesNotMatch(
    mapping.studentId,
    /firebase-uid-a/,
  )

  const repeat =
    await store.getIdentityMapping('firebase-uid-a')
  assert.equal(repeat.studentId, mapping.studentId)
})

test('pilot app exposes authenticated sanitized Pool and SCORE reads only', async () => {
  const app = createStudent08PilotApp({
    tokenVerifier,
    allowedOrigin,
  })

  const pool = await request(
    app,
    '/api/secure-delivery/v1/student/pool',
    {
      headers: {
        Authorization: 'Bearer pilot-token',
        Origin: allowedOrigin,
      },
    },
  )

  assert.equal(pool.status, 200)
  assert.equal(
    pool.headers.get('access-control-allow-origin'),
    allowedOrigin,
  )
  const poolBody = await pool.json()
  assert.equal(poolBody.success, true)
  assert.equal(poolBody.data.length, 2)
  assert.equal(
    JSON.stringify(poolBody).includes(
      'recipientStudentIds',
    ),
    false,
  )

  const list = await request(
    app,
    '/api/secure-delivery/v1/student/assignments',
    {
      headers: {
        Authorization: 'Bearer pilot-token',
        Origin: allowedOrigin,
      },
    },
  )
  assert.equal(list.status, 200)
  const listBody = await list.json()
  assert.equal(listBody.data.length, 1)
  const row = listBody.data[0]
  assert.equal(row.practiceType, 'SCORE')
  assert.equal(row.state, 'ACTIVE')
  assert.equal(
    row.package.publication.scope,
    'student_private',
  )
  assert.notEqual(
    row.package.publication.recipientStudentId,
    'firebase-uid-a',
  )

  const exact = await request(
    app,
    '/api/secure-delivery/v1/student/assignments/' +
      encodeURIComponent(row.deliveryId),
    {
      headers: {
        Authorization: 'Bearer pilot-token',
        Origin: allowedOrigin,
      },
    },
  )
  assert.equal(exact.status, 200)
  const exactBody = await exact.json()
  assert.equal(
    exactBody.data.deliveryId,
    row.deliveryId,
  )
})

test('pilot CORS preflight permits Authorization only for exact preview origin', async () => {
  const app = createStudent08PilotApp({
    tokenVerifier,
    allowedOrigin,
  })

  const allowed = await request(
    app,
    '/api/secure-delivery/v1/student/pool',
    {
      method: 'OPTIONS',
      headers: {
        Origin: allowedOrigin,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers':
          'authorization',
      },
    },
  )

  assert.equal(allowed.status, 204)
  assert.equal(
    allowed.headers.get(
      'access-control-allow-origin',
    ),
    allowedOrigin,
  )
  assert.match(
    allowed.headers.get(
      'access-control-allow-headers',
    ) ?? '',
    /authorization/i,
  )

  const denied = await request(
    app,
    '/api/secure-delivery/v1/student/pool',
    {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers':
          'authorization',
      },
    },
  )
  assert.equal(
    denied.headers.get(
      'access-control-allow-origin',
    ),
    null,
  )
})

test('pilot teacher writes remain closed and health reveals no provider identity', async () => {
  const app = createStudent08PilotApp({
    tokenVerifier,
    allowedOrigin,
  })

  const write = await request(
    app,
    '/api/secure-delivery/v1/teacher/deliveries',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer pilot-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assignmentIds: ['pilot'],
      }),
    },
  )
  assert.equal(write.status, 503)

  const health = await request(
    app,
    '/health',
  )
  assert.equal(health.status, 200)
  const healthBody = await health.json()
  assert.deepEqual(healthBody, {
    success: true,
    data: {
      status: 'ok',
      mode: 'student08-pilot',
      studentReadsEnabled: true,
      writesEnabled: false,
    },
  })
  assert.equal(
    JSON.stringify(healthBody).includes(
      'firebase-uid-a',
    ),
    false,
  )
})
