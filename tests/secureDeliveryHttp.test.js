import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'

async function loadHttp() {
  try {
    const [config, bearer, router] = await Promise.all([
      import('../backend/delivery/config.js'),
      import('../backend/delivery/http/bearerToken.js'),
      import('../backend/delivery/http/router.js'),
    ])
    return { ...config, ...bearer, ...router }
  } catch {
    assert.fail('secure delivery HTTP modules must exist')
  }
}

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

function fakeDeps(config) {
  const calls = []
  const preparedService = {
    async prepareBatch(input) {
      calls.push(['prepare', input])
      return [{ prepared: true }]
    },
  }
  const teacherService = {
    async deliverBatch(input) {
      calls.push(['deliver', input])
      return [{ delivered: true }]
    },
    async listDeliveries(input) {
      calls.push(['teacher-list', input])
      return []
    },
    async applyAssignmentAction(input) {
      calls.push(['action', input])
      return { lifecycle: { state: input.action }, delivery: null }
    },
  }
  const teacherPieceService = {
    async createPiece(input) {
      calls.push(['piece-create', input])
      return {
        pieceAssignmentId:
          input.input?.pieceAssignmentId,
      }
    },
    async applyPieceAction(input) {
      calls.push(['piece-action', input])
      return {
        state: input.action,
      }
    },
  }
  const studentService = {
    async listPieces(input) {
      calls.push(['student-piece-list', input])
      return []
    },
    async getPiece(input) {
      calls.push(['student-piece-get', input])
      return {
        pieceAssignmentId:
          input.pieceAssignmentId,
      }
    },
    async listPoolItems(input) {
      calls.push(['student-pool', input])
      return []
    },
    async listAssignments(input) {
      calls.push(['student-list', input])
      return []
    },
    async getAssignment(input) {
      calls.push(['student-get', input])
      return { deliveryId: input.deliveryId }
    },
  }
  const tokenVerifier = {
    async verifyIdToken(token) {
      calls.push(['verify', token])
      if (token === 'bad') throw new Error('invalid provider token')
      return { uid: 'uid-from-token', extra: 'drop-me' }
    },
  }
  return {
    calls,
    preparedService,
    teacherService,
    teacherPieceService,
    studentService,
    tokenVerifier,
    config,
  }
}

function appFor(router) {
  const app = express()
  app.use(express.json())
  app.use('/api/secure-delivery/v1', router)
  return app
}

test('secure delivery feature flags default closed', async () => {
  const { createSecureDeliveryConfig } = await loadHttp()
  assert.deepEqual(
    createSecureDeliveryConfig({}),
    Object.freeze({
      enabled: false,
      writesEnabled: false,
      studentReadsEnabled: false,
    }),
  )
})

test('Bearer parser accepts one bounded token and rejects malformed/oversized credentials', async () => {
  const { parseBearerToken } = await loadHttp()
  assert.equal(parseBearerToken('Bearer abc.def'), 'abc.def')
  for (const value of [null, '', 'Basic abc', 'Bearer ', 'Bearer a b']) {
    assert.throws(() => parseBearerToken(value), /authorization|bearer|token/i)
  }
  assert.throws(
    () => parseBearerToken('Bearer ' + 'x'.repeat(8193)),
    /token|8192|long/i,
  )
})

test('disabled/write-disabled/read-disabled routes fail closed without invoking services', async () => {
  const { createSecureDeliveryRouter } = await loadHttp()

  for (const [config, path, init] of [
    [{ enabled: false, writesEnabled: false, studentReadsEnabled: false }, '/teacher/deliveries', { method: 'GET' }],
    [{ enabled: true, writesEnabled: false, studentReadsEnabled: true }, '/teacher/deliveries', { method: 'POST', headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' }, body: JSON.stringify({ assignmentIds: ['a'] }) }],
    [{ enabled: true, writesEnabled: true, studentReadsEnabled: false }, '/student/assignments', { method: 'GET', headers: { Authorization: 'Bearer token' } }],
  ]) {
    const deps = fakeDeps(config)
    const response = await request(
      appFor(createSecureDeliveryRouter(deps)),
      '/api/secure-delivery/v1' + path,
      init,
    )
    assert.equal(response.status, 503)
    assert.equal(deps.calls.length, 0)
  }
})

test('teacher prepared route derives authority only from verified token and ignores forged IDs', async () => {
  const { createSecureDeliveryRouter } = await loadHttp()
  const deps = fakeDeps({
    enabled: true,
    writesEnabled: true,
    studentReadsEnabled: true,
  })
  const response = await request(
    appFor(createSecureDeliveryRouter(deps)),
    '/api/secure-delivery/v1/teacher/prepared-assignments',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer teacher-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        teacherId: 'forged-teacher',
        studentId: 'forged-student',
        items: [{ assignment: {}, package: {} }],
      }),
    },
  )
  assert.equal(response.status, 200)
  assert.deepEqual(deps.calls, [
    ['verify', 'teacher-token'],
    ['prepare', {
      providerSubject: 'uid-from-token',
      items: [{ assignment: {}, package: {} }],
    }],
  ])
})

test('router exposes approved teacher/student endpoints with providerSubject only', async () => {
  const { createSecureDeliveryRouter } = await loadHttp()
  const deps = fakeDeps({
    enabled: true,
    writesEnabled: true,
    studentReadsEnabled: true,
  })
  const app = appFor(createSecureDeliveryRouter(deps))
  const auth = { Authorization: 'Bearer token', 'Content-Type': 'application/json' }

  for (const [path, init, expectedStatus] of [
    ['/api/secure-delivery/v1/teacher/deliveries', { method: 'POST', headers: auth, body: JSON.stringify({ assignmentIds: ['assignment-a'] }) }, 200],
    ['/api/secure-delivery/v1/teacher/deliveries', { method: 'GET', headers: auth }, 200],
    ['/api/secure-delivery/v1/teacher/assignments/assignment-a/actions', { method: 'POST', headers: auth, body: JSON.stringify({ action: 'REVOKE' }) }, 200],
    ['/api/secure-delivery/v1/student/assignments', { method: 'GET', headers: auth }, 200],
    ['/api/secure-delivery/v1/student/assignments/assignment-a', { method: 'GET', headers: auth }, 200],
    ['/api/secure-delivery/v1/student/pieces', { method: 'GET', headers: auth }, 200],
    ['/api/secure-delivery/v1/student/pieces/piece-a', { method: 'GET', headers: auth }, 200],
    ['/api/secure-delivery/v1/teacher/pieces', { method: 'POST', headers: auth, body: JSON.stringify({
      pieceAssignmentId: 'piece-a',
      pieceId: 'work-a',
      arrangementId: 'arr-a',
      studentId: 'student-a',
      title: 'Cambaz',
      teacherNote: '',
      scoreAssignmentId: 'assignment-a',
      chordAssignmentIds: [],
    }) }, 200],
    ['/api/secure-delivery/v1/teacher/pieces/piece-a/actions', { method: 'POST', headers: auth, body: JSON.stringify({ action: 'COMPLETE' }) }, 200],
  ]) {
    const response = await request(app, path, init)
    assert.equal(response.status, expectedStatus, path)
  }

  const serialized = JSON.stringify(deps.calls)
  assert.equal(serialized.includes('forged-teacher'), false)
  assert.equal(serialized.includes('forged-student'), false)
})

test('missing/invalid auth returns bounded error and never echoes raw token', async () => {
  const { createSecureDeliveryRouter } = await loadHttp()
  const deps = fakeDeps({
    enabled: true,
    writesEnabled: true,
    studentReadsEnabled: true,
  })
  const app = appFor(createSecureDeliveryRouter(deps))

  const missing = await request(
    app,
    '/api/secure-delivery/v1/teacher/deliveries',
    { method: 'GET' },
  )
  assert.equal(missing.status, 401)

  const invalid = await request(
    app,
    '/api/secure-delivery/v1/teacher/deliveries',
    { method: 'GET', headers: { Authorization: 'Bearer bad' } },
  )
  assert.equal(invalid.status, 401)
  assert.equal((await invalid.text()).includes('bad'), false)
  assert.equal((await missing.text()).includes('stack'), false)
})


test('student assignment HTTP response preserves bounded assignment metadata only', async () => {
  const { createSecureDeliveryRouter } = await loadHttp()
  const deps = fakeDeps({
    enabled: true,
    writesEnabled: false,
    studentReadsEnabled: true,
  })

  deps.studentService.listAssignments = async (input) => {
    deps.calls.push(['student-list', input])
    return [{
      deliveryId: 'assignment-a',
      assignmentId: 'assignment-a',
      packageId: 'package-a',
      practiceType: 'SCORE',
      teacherNote: 'Ölçü 8 tekrar',
      state: 'COMPLETED',
      assignedAt: '2026-09-23T08:01:00Z',
      deliveredAt: '2026-09-23T08:03:00Z',
      package: { safe: true },
    }]
  }

  const response = await request(
    appFor(createSecureDeliveryRouter(deps)),
    '/api/secure-delivery/v1/student/assignments',
    {
      method: 'GET',
      headers: { Authorization: 'Bearer token' },
    },
  )

  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.data[0].state, 'COMPLETED')
  assert.equal(body.data[0].assignmentId, 'assignment-a')
  assert.equal(body.data[0].practiceType, 'SCORE')
  assert.equal(JSON.stringify(body).includes('teacherId'), false)
})


test('teacher Piece HTTP route derives teacher authority from verified token and forwards only Piece input', async () => {
  const { createSecureDeliveryRouter } = await loadHttp()
  const deps = fakeDeps({
    enabled: true,
    writesEnabled: true,
    studentReadsEnabled: true,
  })
  const input = {
    pieceAssignmentId: 'piece-http-a',
    pieceId: 'work-http-a',
    arrangementId: 'arr-http-a',
    studentId: 'student-a',
    title: 'Cambaz',
    teacherNote: '',
    scoreAssignmentId: 'assignment-a',
    chordAssignmentIds: ['chord-a'],
  }

  const response = await request(
    appFor(createSecureDeliveryRouter(deps)),
    '/api/secure-delivery/v1/teacher/pieces',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  )

  assert.equal(response.status, 200)
  assert.deepEqual(
    deps.calls.filter(([name]) => name === 'piece-create'),
    [[
      'piece-create',
      {
        providerSubject: 'uid-from-token',
        input,
      },
    ]],
  )
})

test('student Piece HTTP response stays bounded and excludes recipient/provider internals', async () => {
  const { createSecureDeliveryRouter } = await loadHttp()
  const deps = fakeDeps({
    enabled: true,
    writesEnabled: false,
    studentReadsEnabled: true,
  })

  deps.studentService.listPieces = async (input) => {
    deps.calls.push(['student-piece-list', input])
    return [{
      schemaVersion: '1.0.0',
      pieceAssignmentId: 'piece-a',
      pieceId: 'work-a',
      arrangementId: 'arr-a',
      title: 'Cambaz',
      teacherNote: '',
      state: 'ACTIVE',
      assignedAt: '2026-09-24T08:00:00Z',
      contentRefs: {
        scoreAssignmentId: 'assignment-a',
        chordAssignmentIds: ['chord-a'],
      },
    }]
  }

  const response = await request(
    appFor(createSecureDeliveryRouter(deps)),
    '/api/secure-delivery/v1/student/pieces',
    {
      method: 'GET',
      headers: {
        Authorization: 'Bearer token',
      },
    },
  )

  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.data[0].pieceId, 'work-a')
  const serialized = JSON.stringify(body)
  assert.equal(serialized.includes('studentId'), false)
  assert.equal(serialized.includes('teacherId'), false)
  assert.equal(serialized.includes('providerSubject'), false)
  assert.equal(serialized.includes('package'), false)
})
