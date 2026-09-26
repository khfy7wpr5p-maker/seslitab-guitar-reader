import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

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

function subjectHash(value) {
  return crypto
    .createHash('sha256')
    .update(value, 'utf8')
    .digest('hex')
}

const allowedProviderSubjectHashes = [
  subjectHash('firebase-uid-a'),
]

const tokenVerifier = {
  async verifyIdToken(token) {
    assert.equal(token, 'pilot-token')
    return { uid: 'firebase-uid-a' }
  },
}

test('pilot store maps Firebase subject to opaque stable student identity', async () => {
  const store = createStudent08PilotStore({
    allowedProviderSubjectHashes,
  })

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

test('pilot app exposes authenticated sanitized Pool, SCORE, CHORD_BOARD and Piece reads', async () => {
  const app = createStudent08PilotApp({
    tokenVerifier,
    allowedOrigin,
    allowedProviderSubjectHashes,
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
  assert.equal(listBody.data.length, 2)
  const row = listBody.data.find(
    (item) => item.practiceType === 'SCORE',
  )
  const chord = listBody.data.find(
    (item) =>
      item.practiceType === 'CHORD_BOARD',
  )
  assert.ok(row)
  assert.ok(chord)
  assert.equal(row.practiceType, 'SCORE')
  assert.equal(
    chord.package.packageType,
    'CHORD_BOARD',
  )
  assert.equal(row.state, 'ACTIVE')
  assert.equal(
    row.package.practice.tempoBpm,
    60,
  )
  assert.equal(
    row.package.practice.allowTempoChange,
    true,
  )
  assert.equal(
    row.package.content.guitarTab.format,
    'musicxml',
  )
  assert.match(
    row.package.content.guitarTab.data,
    /<sign>TAB<\/sign>/,
  )
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

  const pieces = await request(
    app,
    '/api/secure-delivery/v1/student/pieces',
    {
      headers: {
        Authorization: 'Bearer pilot-token',
        Origin: allowedOrigin,
      },
    },
  )
  assert.equal(pieces.status, 200)
  const piecesBody = await pieces.json()
  assert.equal(piecesBody.data.length, 1)
  const piece = piecesBody.data[0]
  assert.equal(piece.state, 'ACTIVE')
  assert.equal(
    piece.contentRefs.scoreAssignmentId,
    row.assignmentId,
  )
  assert.deepEqual(
    piece.contentRefs.chordAssignmentIds,
    [chord.assignmentId],
  )

  const exactPiece = await request(
    app,
    '/api/secure-delivery/v1/student/pieces/' +
      encodeURIComponent(
        piece.pieceAssignmentId,
      ),
    {
      headers: {
        Authorization: 'Bearer pilot-token',
        Origin: allowedOrigin,
      },
    },
  )
  assert.equal(exactPiece.status, 200)
  const exactPieceBody =
    await exactPiece.json()
  assert.equal(
    exactPieceBody.data.pieceAssignmentId,
    piece.pieceAssignmentId,
  )
})

test('pilot store denies unknown and revoked provider subjects before fixture access', async () => {
  const unknownStore = createStudent08PilotStore({
    allowedProviderSubjectHashes,
  })

  assert.equal(
    await unknownStore.getIdentityMapping(
      'firebase-uid-unknown',
    ),
    null,
  )

  const revokedStore = createStudent08PilotStore({
    allowedProviderSubjectHashes,
    revokedProviderSubjectHashes: [
      subjectHash('firebase-uid-a'),
    ],
  })

  assert.equal(
    await revokedStore.getIdentityMapping(
      'firebase-uid-a',
    ),
    null,
  )
})

test('pilot app fails closed for valid tokens whose UID is not authorized or is revoked', async () => {
  const verifier = {
    async verifyIdToken(token) {
      if (token === 'unknown-token') {
        return { uid: 'firebase-uid-unknown' }
      }
      if (token === 'revoked-token') {
        return { uid: 'firebase-uid-a' }
      }
      return { uid: 'firebase-uid-a' }
    },
  }

  const unknownApp = createStudent08PilotApp({
    tokenVerifier: verifier,
    allowedOrigin,
    allowedProviderSubjectHashes,
  })
  const unknown = await request(
    unknownApp,
    '/api/secure-delivery/v1/student/pool',
    {
      headers: {
        Authorization: 'Bearer unknown-token',
        Origin: allowedOrigin,
      },
    },
  )
  assert.equal(unknown.status, 401)
  assert.equal(
    JSON.stringify(await unknown.json()).includes(
      'firebase-uid-unknown',
    ),
    false,
  )

  const revokedApp = createStudent08PilotApp({
    tokenVerifier: verifier,
    allowedOrigin,
    allowedProviderSubjectHashes,
    revokedProviderSubjectHashes: [
      subjectHash('firebase-uid-a'),
    ],
  })
  const revoked = await request(
    revokedApp,
    '/api/secure-delivery/v1/student/pool',
    {
      headers: {
        Authorization: 'Bearer revoked-token',
        Origin: allowedOrigin,
      },
    },
  )
  assert.equal(revoked.status, 401)
  assert.equal(
    JSON.stringify(await revoked.json()).includes(
      'firebase-uid-a',
    ),
    false,
  )
})

test('pilot CORS preflight permits Authorization only for exact preview origin', async () => {
  const app = createStudent08PilotApp({
    tokenVerifier,
    allowedOrigin,
    allowedProviderSubjectHashes,
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
    allowedProviderSubjectHashes,
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


test('pilot store fails closed for unknown IDs and every write seam', async () => {
  const store = createStudent08PilotStore({
    allowedProviderSubjectHashes,
  })

  assert.equal(
    await store.getPreparedAssignment('unknown'),
    null,
  )
  assert.equal(
    await store.getPracticePackage('unknown'),
    null,
  )
  assert.equal(
    await store.getDelivery('unknown'),
    null,
  )
  assert.deepEqual(
    await store.listActiveDeliveriesForStudent(
      'unknown',
    ),
    [],
  )
  assert.deepEqual(
    await store.listPoolPublicationsForStudent(
      'unknown',
    ),
    [],
  )
  assert.equal(
    await store.getPieceAssignment('unknown'),
    null,
  )
  assert.equal(
    await store.getPieceLifecycle('unknown'),
    null,
  )
  assert.deepEqual(
    await store.listPieceAssignmentsForStudent(
      'unknown',
    ),
    [],
  )
  assert.deepEqual(
    await store.listDeliveriesForTeacher(
      'pilot-teacher',
    ),
    [],
  )
  assert.equal(
    await store.getLifecycle(
      'unknown',
    ),
    null,
  )
  assert.equal(
    await store.getTeacherStudentGrant(
      'pilot-teacher',
      'unknown',
    ),
    null,
  )

  for (const method of [
    'commitPreparedBatch',
    'commitDeliveryBatch',
    'commitLifecycleMutation',
    'putPieceAssignment',
    'commitPieceLifecycleMutation',
    'putRosterEntriesForProvisioning',
    'putPoolPublicationsForProvisioning',
  ]) {
    await assert.rejects(
      () => store[method]([]),
      /pilot-read-only/,
    )
  }
})

test('pilot app rejects incomplete verifier and unsafe preview origins', () => {
  assert.throws(
    () => createStudent08PilotApp({
      tokenVerifier: null,
      allowedOrigin,
    }),
    /tokenVerifier/i,
  )

  assert.throws(
    () => createStudent08PilotApp({
      tokenVerifier,
      allowedOrigin: 'http://example.test',
    }),
    /exact HTTPS origin/i,
  )

  assert.throws(
    () => createStudent08PilotApp({
      tokenVerifier,
      allowedOrigin:
        'https://example.test/path',
    }),
    /exact HTTPS origin/i,
  )
})

test('pilot app fails authentication closed and returns bounded 404', async () => {
  const app = createStudent08PilotApp({
    tokenVerifier: {
      async verifyIdToken() {
        throw new Error('private-verifier-detail')
      },
    },
    allowedOrigin,
  })

  const denied = await request(
    app,
    '/api/secure-delivery/v1/student/pool',
    {
      headers: {
        Authorization: 'Bearer bad-token',
        Origin: allowedOrigin,
      },
    },
  )
  assert.equal(denied.status, 401)
  const deniedBody = await denied.json()
  assert.equal(
    JSON.stringify(deniedBody).includes(
      'private-verifier-detail',
    ),
    false,
  )

  const missing = await request(
    app,
    '/does-not-exist',
  )
  assert.equal(missing.status, 404)
  assert.deepEqual(
    await missing.json(),
    {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint bulunamadı.',
      },
    },
  )
})
