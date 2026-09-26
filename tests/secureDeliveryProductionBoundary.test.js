import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

import {
  createSecureDeliveryProductionBoundary,
} from '../backend/delivery/production/secureDeliveryProductionBoundary.js'

function fakeStore() {
  return {
    async getIdentityMapping() { return null },
    async getTeacherStudentGrant() { return null },
    async getPreparedAssignment() { return null },
    async getPracticePackage() { return null },
    async getLifecycle() { return null },
    async getDelivery() { return null },
    async getPieceAssignment() { return null },
    async getPieceLifecycle() { return null },
    async listPieceAssignmentsForStudent() { return [] },
    async putPieceAssignment(piece) { return piece },
    async commitPieceLifecycleMutation() { return null },
    async listDeliveriesForTeacher() { return [] },
    async listActiveDeliveriesForStudent() { return [] },
    async listPoolPublicationsForStudent() { return [] },
    async commitPreparedBatch() { return [] },
    async commitDeliveryBatch() { return [] },
    async commitLifecycleMutation() { return {} },
    async putRosterEntriesForProvisioning() { return [] },
    async putPoolPublicationsForProvisioning() { return [] },
  }
}

function fakeFactories(calls) {
  const store = fakeStore()
  return {
    createAdminServices(input) {
      calls.push(['admin', input])
      return {
        auth: {},
        firestore: {},
        async delete() {
          calls.push(['delete'])
        },
      }
    },
    createTokenVerifier({ auth }) {
      calls.push(['token', auth])
      return {
        async verifyIdToken() {
          return { uid: 'unused' }
        },
      }
    },
    createStore({ firestore }) {
      calls.push(['store', firestore])
      return store
    },
  }
}

function enabledReadOnlyEnv(overrides = {}) {
  return {
    SECURE_DELIVERY_PRODUCTION_ACTIVATION: 'true',
    SECURE_DELIVERY_ENABLED: 'true',
    STUDENT_DELIVERY_READS_ENABLED: 'true',
    SECURE_DELIVERY_WRITES_ENABLED: 'false',
    SECURE_DELIVERY_FIREBASE_PROJECT_ID:
      'seslitab-production-example',
    ...overrides,
  }
}

test('production boundary stays closed when only legacy Secure Delivery flags are enabled', async () => {
  const calls = []
  const boundary =
    await createSecureDeliveryProductionBoundary({
      env: {
        SECURE_DELIVERY_ENABLED: 'true',
        STUDENT_DELIVERY_READS_ENABLED: 'true',
        SECURE_DELIVERY_WRITES_ENABLED: 'false',
        SECURE_DELIVERY_FIREBASE_PROJECT_ID:
          'seslitab-production-example',
      },
      firebaseFactories: fakeFactories(calls),
    })

  assert.equal(boundary.active, false)
  assert.equal(typeof boundary.router, 'function')
  assert.deepEqual(calls, [])
})

test('production activation refuses incomplete or write-enabled profiles before Firebase initialization', async () => {
  const cases = [
    [
      enabledReadOnlyEnv({
        SECURE_DELIVERY_ENABLED: 'false',
      }),
      /requires-enabled/i,
    ],
    [
      enabledReadOnlyEnv({
        STUDENT_DELIVERY_READS_ENABLED:
          'false',
      }),
      /requires-student-reads/i,
    ],
    [
      enabledReadOnlyEnv({
        SECURE_DELIVERY_WRITES_ENABLED:
          'true',
      }),
      /read-only|writes-disabled/i,
    ],
    [
      enabledReadOnlyEnv({
        SECURE_DELIVERY_FIREBASE_PROJECT_ID:
          '',
      }),
      /project-id/i,
    ],
    [
      enabledReadOnlyEnv({
        SECURE_DELIVERY_FIREBASE_PROJECT_ID:
          'demo-seslitab-td06',
      }),
      /project-id|emulator/i,
    ],
  ]

  for (const [env, expected] of cases) {
    const calls = []
    await assert.rejects(
      () =>
        createSecureDeliveryProductionBoundary({
          env,
          firebaseFactories:
            fakeFactories(calls),
        }),
      expected,
    )
    assert.deepEqual(calls, [])
  }
})

test('explicit read-only production activation passes a non-emulator project and authorization sentinel to Firebase factories', async () => {
  const calls = []
  const boundary =
    await createSecureDeliveryProductionBoundary({
      env: enabledReadOnlyEnv(),
      firebaseFactories: fakeFactories(calls),
      now: () => '2026-09-26T12:00:00Z',
      createHistoryEventId: () =>
        'history-readiness-a',
    })

  assert.equal(boundary.active, true)
  assert.equal(boundary.config.enabled, true)
  assert.equal(
    boundary.config.studentReadsEnabled,
    true,
  )
  assert.equal(
    boundary.config.writesEnabled,
    false,
  )

  assert.deepEqual(calls[0], [
    'admin',
    {
      env: enabledReadOnlyEnv(),
      projectId:
        'seslitab-production-example',
      productionAuthorized: true,
    },
  ])
  assert.equal(calls[1][0], 'token')
  assert.equal(calls[2][0], 'store')

  await boundary.close()
  assert.equal(
    calls.some(([name]) => name === 'delete'),
    true,
  )
})

test('server wiring uses the guarded production boundary instead of mounting unavailable router directly', () => {
  const server = readFileSync(
    new URL('../backend/server.js', import.meta.url),
    'utf8',
  )

  assert.match(
    server,
    /createSecureDeliveryProductionBoundary/,
  )
  assert.doesNotMatch(
    server,
    /createUnavailableSecureDeliveryRouter/,
  )
  assert.match(
    server,
    /await\s+createSecureDeliveryProductionBoundary/,
  )
})

test('production Firebase adapter requires an explicit authorization sentinel and uses Application Default Credentials without secret literals', () => {
  const source = readFileSync(
    new URL(
      '../backend/delivery/firebase/firebaseAdmin.js',
      import.meta.url,
    ),
    'utf8',
  )

  assert.match(
    source,
    /productionAuthorized/,
  )
  assert.match(
    source,
    /applicationDefault/,
  )
  assert.doesNotMatch(
    source,
    /serviceAccount|private_key|client_email|credential\.cert/i,
  )
})
