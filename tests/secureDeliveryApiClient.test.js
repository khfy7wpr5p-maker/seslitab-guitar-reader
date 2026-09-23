import assert from 'node:assert/strict'
import test from 'node:test'

async function loadClient() {
  try {
    return await import('../src/services/secureDeliveryApiClient.js')
  } catch {
    assert.fail('secureDeliveryApiClient module must exist')
  }
}

async function loadComposition() {
  try {
    return await import('../backend/delivery/composition.js')
  } catch {
    assert.fail('secure delivery composition module must exist')
  }
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload
    },
  }
}

test('client injects a fresh bearer token per call and never persists it', async () => {
  const { createSecureDeliveryApiClient } = await loadClient()
  const tokens = ['token-1', 'token-2']
  const calls = []
  const client = createSecureDeliveryApiClient({
    baseUrl: 'https://example.invalid',
    getIdToken: async () => tokens.shift(),
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return jsonResponse({
        success: true,
        data: [],
      })
    },
  })

  await client.listTeacherDeliveries()
  await client.listTeacherDeliveries()

  assert.equal(
    calls[0].init.headers.Authorization,
    'Bearer token-1',
  )
  assert.equal(
    calls[1].init.headers.Authorization,
    'Bearer token-2',
  )
  assert.equal('token' in client, false)
  assert.equal('getIdToken' in client, false)
})

test('client maps all TD-06 methods to the bounded HTTP contract', async () => {
  const { createSecureDeliveryApiClient } = await loadClient()
  const calls = []
  const client = createSecureDeliveryApiClient({
    baseUrl: 'https://example.invalid/api/secure-delivery/v1/',
    getIdToken: async () => 'fresh-token',
    fetchImpl: async (url, init) => {
      calls.push({
        url,
        method: init.method,
        body: init.body ?? null,
      })
      return jsonResponse({
        success: true,
        data: { ok: true },
      })
    },
  })

  await client.prepareAssignments([{ assignment: {}, package: {} }])
  await client.deliverAssignments(['assignment-a'])
  await client.listTeacherDeliveries()
  await client.applyAssignmentAction('assignment-a', 'COMPLETE')
  await client.listStudentAssignments()
  await client.getStudentAssignment('assignment-a')

  assert.deepEqual(
    calls.map((call) => [
      call.url,
      call.method,
      call.body,
    ]),
    [
      [
        'https://example.invalid/api/secure-delivery/v1/teacher/prepared-assignments',
        'POST',
        JSON.stringify({ items: [{ assignment: {}, package: {} }] }),
      ],
      [
        'https://example.invalid/api/secure-delivery/v1/teacher/deliveries',
        'POST',
        JSON.stringify({ assignmentIds: ['assignment-a'] }),
      ],
      [
        'https://example.invalid/api/secure-delivery/v1/teacher/deliveries',
        'GET',
        null,
      ],
      [
        'https://example.invalid/api/secure-delivery/v1/teacher/assignments/assignment-a/actions',
        'POST',
        JSON.stringify({ action: 'COMPLETE' }),
      ],
      [
        'https://example.invalid/api/secure-delivery/v1/student/assignments',
        'GET',
        null,
      ],
      [
        'https://example.invalid/api/secure-delivery/v1/student/assignments/assignment-a',
        'GET',
        null,
      ],
    ],
  )
})

test('client exposes only bounded public API errors and never echoes bearer token', async () => {
  const { createSecureDeliveryApiClient } = await loadClient()
  const client = createSecureDeliveryApiClient({
    baseUrl: 'https://example.invalid',
    getIdToken: async () => 'super-secret-token',
    fetchImpl: async () => jsonResponse({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Bu işlem için yetkiniz yok.',
        providerDiagnostic: 'internal-secret',
      },
    }, 403),
  })

  await assert.rejects(
    () => client.listTeacherDeliveries(),
    (error) => {
      assert.equal(error.code, 'FORBIDDEN')
      assert.equal(
        error.message,
        'Bu işlem için yetkiniz yok.',
      )
      assert.doesNotMatch(
        JSON.stringify(error),
        /super-secret-token|internal-secret/,
      )
      return true
    },
  )
})

test('closed-default composition never initializes Firebase factories', async () => {
  const { createSecureDeliveryComposition } = await loadComposition()
  const calls = []
  const firebaseFactories = {
    createAdminServices() {
      calls.push('admin')
      throw new Error('must not run')
    },
    createTokenVerifier() {
      calls.push('token')
      throw new Error('must not run')
    },
    createStore() {
      calls.push('store')
      throw new Error('must not run')
    },
  }

  const composition = createSecureDeliveryComposition({
    env: {},
    firebaseFactories,
    now: () => '2026-09-23T09:00:00Z',
    createHistoryEventId: () => 'history-a',
  })

  assert.equal(composition.enabled, false)
  assert.deepEqual(calls, [])
  assert.equal(
    composition.config.enabled,
    false,
  )
  assert.equal(
    typeof composition.router,
    'function',
  )
})

test('enabled composition uses injected provider factories without importing browser Firebase', async () => {
  const { createSecureDeliveryComposition } = await loadComposition()
  const calls = []
  const store = {
    async getIdentityMapping() { return null },
    async getTeacherStudentGrant() { return null },
    async getPreparedAssignment() { return null },
    async getPracticePackage() { return null },
    async getLifecycle() { return null },
    async getDelivery() { return null },
    async listDeliveriesForTeacher() { return [] },
    async listActiveDeliveriesForStudent() { return [] },
    async commitPreparedBatch() { return [] },
    async commitDeliveryBatch() { return [] },
    async commitLifecycleMutation() { return {} },
    async putRosterEntriesForProvisioning() { return [] },
    async putPoolPublicationsForProvisioning() { return [] },
  }
  const composition = createSecureDeliveryComposition({
    env: {
      SECURE_DELIVERY_ENABLED: 'true',
      SECURE_DELIVERY_WRITES_ENABLED: 'false',
      STUDENT_DELIVERY_READS_ENABLED: 'false',
    },
    firebaseFactories: {
      createAdminServices() {
        calls.push('admin')
        return {
          auth: {},
          firestore: {},
          async delete() {},
        }
      },
      createTokenVerifier({ auth }) {
        assert.deepEqual(auth, {})
        calls.push('token')
        return {
          async verifyIdToken() {
            return { uid: 'unused' }
          },
        }
      },
      createStore({ firestore }) {
        assert.deepEqual(firestore, {})
        calls.push('store')
        return store
      },
    },
    now: () => '2026-09-23T09:00:00Z',
    createHistoryEventId: () => 'history-a',
  })

  assert.equal(composition.enabled, true)
  assert.deepEqual(calls, ['admin', 'token', 'store'])
  assert.equal(
    composition.config.writesEnabled,
    false,
  )
  assert.equal(
    composition.config.studentReadsEnabled,
    false,
  )
})
