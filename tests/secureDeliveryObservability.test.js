import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'

import {
  createSecureDeliveryRouter,
} from '../backend/delivery/http/router.js'

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

function appFor(router) {
  const app = express()
  app.use(express.json())
  app.use('/api/secure-delivery/v1', router)
  return app
}

function deps(events) {
  return {
    observeRequest(event) {
      events.push(event)
    },
    tokenVerifier: {
      async verifyIdToken(token) {
        if (token === 'bad-token') {
          throw new Error('invalid provider token')
        }
        return {
          uid: 'provider-uid-must-never-be-observed',
        }
      },
    },
    preparedService: {
      async prepareBatch() {
        return []
      },
    },
    teacherService: {
      async deliverBatch() {
        return []
      },
      async listDeliveries() {
        return []
      },
      async applyAssignmentAction() {
        return {}
      },
    },
    teacherPieceService: {
      async createPiece() {
        return {}
      },
      async applyPieceAction() {
        return {}
      },
    },
    studentService: {
      async listAssignments() {
        return []
      },
      async getAssignment() {
        return {}
      },
      async listPieces() {
        return []
      },
      async getPiece() {
        return {}
      },
      async listPoolItems() {
        return []
      },
    },
    config: {
      enabled: true,
      writesEnabled: false,
      studentReadsEnabled: true,
    },
  }
}

test('router emits only privacy-safe authorized and unauthorized request outcomes', async () => {
  const events = []
  const d = deps(events)
  const app = appFor(createSecureDeliveryRouter(d))

  const authorized = await request(
    app,
    '/api/secure-delivery/v1/student/assignments',
    {
      headers: {
        Authorization: 'Bearer good-token',
      },
    },
  )
  assert.equal(authorized.status, 200)

  const unauthorized = await request(
    app,
    '/api/secure-delivery/v1/student/assignments',
    {
      headers: {
        Authorization: 'Bearer bad-token',
      },
    },
  )
  assert.equal(unauthorized.status, 401)

  assert.deepEqual(events, [
    {
      event: 'secure_delivery_request',
      operation: 'student_assignments_list',
      outcome: 'authorized',
      status: 200,
    },
    {
      event: 'secure_delivery_request',
      operation: 'student_assignments_list',
      outcome: 'unauthorized',
      status: 401,
    },
  ])

  const serialized = JSON.stringify(events)
  for (const forbidden of [
    'good-token',
    'bad-token',
    'provider-uid-must-never-be-observed',
    'authorization',
    'studentId',
    'teacherId',
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden)
  }
})

test('router records revoked internally while preserving the external not-found response', async () => {
  const events = []
  const d = deps(events)
  d.studentService.getAssignment = async () => {
    throw new Error(
      'student-assignment-not-found-revoked',
    )
  }
  const app = appFor(createSecureDeliveryRouter(d))

  const response = await request(
    app,
    '/api/secure-delivery/v1/student/assignments/assignment-secret',
    {
      headers: {
        Authorization: 'Bearer good-token',
      },
    },
  )

  assert.equal(response.status, 404)
  assert.deepEqual(events, [
    {
      event: 'secure_delivery_request',
      operation: 'student_assignment_get',
      outcome: 'revoked',
      status: 404,
    },
  ])
  assert.equal(
    JSON.stringify(events).includes('assignment-secret'),
    false,
  )
})

test('default structured observer serializes only allowlisted fields', async () => {
  const {
    createSecureDeliveryRequestObserver,
  } = await import(
    '../backend/delivery/observability/secureDeliveryRequestObserver.js'
  )
  const lines = []
  const observe = createSecureDeliveryRequestObserver({
    write(line) {
      lines.push(line)
    },
  })

  observe({
    event: 'secure_delivery_request',
    operation: 'student_piece_get',
    outcome: 'authorized',
    status: 200,
    providerSubject: 'raw-provider-uid',
    authorization: 'Bearer secret-token',
    studentId: 'student-secret',
  })

  assert.equal(lines.length, 1)
  assert.deepEqual(JSON.parse(lines[0]), {
    event: 'secure_delivery_request',
    operation: 'student_piece_get',
    outcome: 'authorized',
    status: 200,
  })
  assert.equal(lines[0].includes('raw-provider-uid'), false)
  assert.equal(lines[0].includes('secret-token'), false)
  assert.equal(lines[0].includes('student-secret'), false)
})


test('router consumes rejected async observer results without affecting the request', async () => {
  const d = deps([])
  let rejectionConsumed = false
  d.observeRequest = () => ({
    catch(handler) {
      rejectionConsumed = true
      handler(
        new Error(
          'synthetic-observer-sink-failure',
        ),
      )
      return this
    },
  })

  const app =
    appFor(
      createSecureDeliveryRouter(d),
    )

  const response = await request(
    app,
    '/api/secure-delivery/v1/student/assignments',
    {
      headers: {
        Authorization:
          'Bearer good-token',
      },
    },
  )

  assert.equal(response.status, 200)
  assert.equal(
    rejectionConsumed,
    true,
  )
})

test('feature gates emit privacy-safe unavailable outcomes before auth', async () => {
  const cases = [
    {
      name: 'master gate',
      configure(d) {
        d.config.enabled = false
      },
      path:
        '/api/secure-delivery/v1/student/assignments',
      init: {},
      operation:
        'student_assignments_list',
    },
    {
      name: 'student reads gate',
      configure(d) {
        d.config.studentReadsEnabled =
          false
      },
      path:
        '/api/secure-delivery/v1/student/assignments',
      init: {},
      operation:
        'student_assignments_list',
    },
    {
      name: 'writes gate',
      configure() {},
      path:
        '/api/secure-delivery/v1/teacher/prepared-assignments',
      init: {
        method: 'POST',
        headers: {
          'content-type':
            'application/json',
        },
        body: JSON.stringify({
          items: [],
        }),
      },
      operation:
        'teacher_prepared_assignments_create',
    },
  ]

  for (const item of cases) {
    const events = []
    const d = deps(events)
    item.configure(d)
    const app =
      appFor(
        createSecureDeliveryRouter(d),
      )

    const response =
      await request(
        app,
        item.path,
        item.init,
      )

    assert.equal(
      response.status,
      503,
      item.name,
    )
    assert.deepEqual(
      events,
      [
        {
          event:
            'secure_delivery_request',
          operation:
            item.operation,
          outcome:
            'unavailable',
          status: 503,
        },
      ],
      item.name,
    )
  }
})
