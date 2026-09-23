import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'

import {
  createPoolItem,
  POOL_AUDIENCE_MODE,
} from '../src/services/poolItem.js'
import {
  createActivePoolPublicationRecord,
  revokePoolPublicationRecord,
} from '../src/services/poolPublicationRecord.js'
import {
  createSecureDeliveryIdentityMapping,
} from '../src/services/secureDeliveryIdentity.js'
import {
  createSecureDeliveryAuthorization,
} from '../backend/delivery/authorization/secureDeliveryAuthorization.js'
import {
  createInMemorySecureDeliveryStore,
} from '../backend/delivery/repositories/inMemorySecureDeliveryStore.js'
import {
  createStudentDeliveryReadService,
} from '../backend/delivery/services/studentDeliveryReadService.js'
import {
  createSecureDeliveryRouter,
} from '../backend/delivery/http/router.js'
import {
  createSecureDeliveryApiClient,
} from '../src/services/secureDeliveryApiClient.js'

function studentMapping(uid, studentId) {
  return createSecureDeliveryIdentityMapping({
    providerSubject: uid,
    role: 'STUDENT',
    teacherId: null,
    studentId,
    active: true,
    createdAt: '2026-09-23T10:30:00Z',
    disabledAt: null,
  })
}

function poolRecord({
  poolItemId,
  audienceMode = POOL_AUDIENCE_MODE.ALL,
  recipients = [],
  publishedAt = '2026-09-23T10:30:00Z',
  revokedAt = null,
}) {
  const active = createActivePoolPublicationRecord(
    createPoolItem({
      poolItemId,
      title: `Başlık ${poolItemId}`,
      shortDescription: `Kısa ${poolItemId}`,
      detailText: `Detay ${poolItemId}`,
      publishedAt,
      audienceMode,
      recipientStudentIds: recipients,
    }),
  )

  return revokedAt === null
    ? active
    : revokePoolPublicationRecord(active, revokedAt)
}

function makeStudentPoolHarness() {
  const store = createInMemorySecureDeliveryStore({
    identityMappings: [
      studentMapping('uid-student-a', 'student-a'),
      studentMapping('uid-student-b', 'student-b'),
    ],
    poolPublications: [
      poolRecord({
        poolItemId: 'pool-all',
      }),
      poolRecord({
        poolItemId: 'pool-selected-a',
        audienceMode: POOL_AUDIENCE_MODE.SELECTED,
        recipients: ['student-a'],
      }),
      poolRecord({
        poolItemId: 'pool-selected-b',
        audienceMode: POOL_AUDIENCE_MODE.SELECTED,
        recipients: ['student-b'],
      }),
      poolRecord({
        poolItemId: 'pool-revoked',
        revokedAt: '2026-09-23T10:31:00Z',
      }),
    ],
  })

  return {
    store,
    authorization: createSecureDeliveryAuthorization({ store }),
  }
}

test('student Pool read returns only ALL plus exact SELECTED records and strips recipient lists', async () => {
  const h = makeStudentPoolHarness()
  const service = createStudentDeliveryReadService(h)

  const rows = await service.listPoolItems({
    providerSubject: 'uid-student-a',
  })

  assert.deepEqual(
    rows.map((row) => row.poolItemId).sort(),
    ['pool-all', 'pool-selected-a'],
  )

  for (const row of rows) {
    assert.deepEqual(
      Object.keys(row).sort(),
      [
        'audienceMode',
        'detailText',
        'poolItemId',
        'publishedAt',
        'shortDescription',
        'title',
      ],
    )
  }

  const serialized = JSON.stringify(rows)
  assert.equal(serialized.includes('recipientStudentIds'), false)
  assert.equal(serialized.includes('student-a'), false)
  assert.equal(serialized.includes('student-b'), false)
  assert.equal(serialized.includes('pool-revoked'), false)
})

test('student Pool authorization is exact per authenticated student', async () => {
  const h = makeStudentPoolHarness()
  const service = createStudentDeliveryReadService(h)

  const rows = await service.listPoolItems({
    providerSubject: 'uid-student-b',
  })

  assert.deepEqual(
    rows.map((row) => row.poolItemId).sort(),
    ['pool-all', 'pool-selected-b'],
  )
})

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

function routerDeps() {
  const calls = []
  return {
    calls,
    config: {
      enabled: true,
      writesEnabled: false,
      studentReadsEnabled: true,
    },
    tokenVerifier: {
      async verifyIdToken(token) {
        calls.push(['verify', token])
        return { uid: 'uid-student-a' }
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
    studentService: {
      async listAssignments() {
        return []
      },
      async getAssignment() {
        return {}
      },
      async listPoolItems(input) {
        calls.push(['student-pool', input])
        return [
          {
            poolItemId: 'pool-all',
            title: 'Duyuru',
            shortDescription: 'Kısa',
            detailText: 'Detay',
            publishedAt: '2026-09-23T10:30:00Z',
            audienceMode: 'ALL',
          },
        ]
      },
    },
  }
}

test('GET /student/pool is read-gated and derives authority only from bearer identity', async () => {
  const deps = routerDeps()
  const app = appFor(createSecureDeliveryRouter(deps))

  const response = await request(
    app,
    '/api/secure-delivery/v1/student/pool',
    {
      method: 'GET',
      headers: {
        Authorization: 'Bearer student-token',
      },
    },
  )

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    success: true,
    data: [
      {
        poolItemId: 'pool-all',
        title: 'Duyuru',
        shortDescription: 'Kısa',
        detailText: 'Detay',
        publishedAt: '2026-09-23T10:30:00Z',
        audienceMode: 'ALL',
      },
    ],
  })
  assert.deepEqual(deps.calls, [
    ['verify', 'student-token'],
    ['student-pool', {
      providerSubject: 'uid-student-a',
    }],
  ])
})

test('Secure Delivery API client exposes bounded listStudentPool GET mapping', async () => {
  const calls = []
  const client = createSecureDeliveryApiClient({
    baseUrl: 'https://example.invalid/api/secure-delivery/v1',
    getIdToken: async () => 'fresh-student-token',
    fetchImpl: async (url, init) => {
      calls.push({
        url,
        method: init.method,
        authorization: init.headers.Authorization,
      })
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            success: true,
            data: [],
          }
        },
      }
    },
  })

  assert.deepEqual(
    await client.listStudentPool(),
    [],
  )
  assert.deepEqual(calls, [
    {
      url: 'https://example.invalid/api/secure-delivery/v1/student/pool',
      method: 'GET',
      authorization: 'Bearer fresh-student-token',
    },
  ])
})
