import assert from 'node:assert/strict'
import test from 'node:test'

import {
  runSecureDeliveryProductionProvisioningBootstrap,
} from '../backend/delivery/production/secureDeliveryProductionProvisioningBootstrap.js'

const UID = 'uid-real-student'
const STUDENT_ID = 'pilot-student-0123456789abcdef'
const OPERATION_ID = 'ses15-real-student-identity-v1'
const TIMESTAMP = '2026-09-26T21:00:00.000Z'

function baseEnv(mode = 'dry-run') {
  return {
    NODE_ENV: 'production',
    SECURE_DELIVERY_WRITES_ENABLED: 'false',
    SECURE_DELIVERY_PRODUCTION_PROVISIONING_BOOTSTRAP:
      mode,
    SECURE_DELIVERY_PROVISIONING_PRODUCTION_AUTHORIZED:
      'true',
    SECURE_DELIVERY_FIREBASE_PROJECT_ID:
      'st-student-app-85cde',
    SECURE_DELIVERY_PRODUCTION_PROVISIONING_PROVIDER_SUBJECT:
      UID,
    SECURE_DELIVERY_PRODUCTION_PROVISIONING_STUDENT_ID:
      STUDENT_ID,
    SECURE_DELIVERY_PRODUCTION_PROVISIONING_OPERATION_ID:
      OPERATION_ID,
    SECURE_DELIVERY_PRODUCTION_PROVISIONING_TIMESTAMP:
      TIMESTAMP,
  }
}

function makeFactories({
  existingMapping = null,
  commitResult = 'APPLIED',
  replayResult = 'IDEMPOTENT_REPLAY',
} = {}) {
  const calls = []
  let applied = false

  const provisioningStore = {
    async previewProvisioningBatch(commands) {
      calls.push(['preview', commands])
      return Object.freeze([
        Object.freeze({
          operationId: OPERATION_ID,
          action: 'CREATE_IDENTITY',
          result: applied
            ? replayResult
            : existingMapping === null
              ? 'APPLIED'
              : 'NOOP',
        }),
      ])
    },
    async commitProvisioningBatch(commands) {
      calls.push(['commit', commands])
      applied = true
      return Object.freeze([
        Object.freeze({
          operationId: OPERATION_ID,
          action: 'CREATE_IDENTITY',
          result: commitResult,
        }),
      ])
    },
    async getProvisioningAudit(operationId) {
      calls.push(['audit', operationId])
      if (!applied) return null
      return Object.freeze({
        operationId,
        action: 'CREATE_IDENTITY',
        providerSubject: UID,
        stableIdentity: 'STUDENT:' + STUDENT_ID,
        result: commitResult,
      })
    },
    async listProvisioningAudit() {
      return Object.freeze([])
    },
  }

  const runtimeStore = {
    async getIdentityMapping(providerSubject) {
      calls.push(['mapping', providerSubject])
      if (!applied) return existingMapping
      return Object.freeze({
        schemaVersion: 1,
        providerSubject: UID,
        role: 'STUDENT',
        teacherId: null,
        studentId: STUDENT_ID,
        active: true,
        createdAt: TIMESTAMP,
        disabledAt: null,
      })
    },
  }

  return {
    calls,
    factories: {
      createAdminServices(input) {
        calls.push(['admin', input])
        return {
          firestore: { kind: 'firestore' },
          async delete() {
            calls.push(['delete'])
          },
        }
      },
      createProvisioningStore({ firestore }) {
        calls.push(['provisioning-store', firestore])
        return provisioningStore
      },
      createRuntimeStore({ firestore }) {
        calls.push(['runtime-store', firestore])
        return runtimeStore
      },
    },
  }
}

test('production provisioning bootstrap is disabled unless mode is explicitly dry-run or apply', async () => {
  const result =
    await runSecureDeliveryProductionProvisioningBootstrap({
      env: {},
      factories: null,
      write() {
        assert.fail('disabled bootstrap must not log')
      },
    })

  assert.deepEqual(result, {
    ran: false,
    outcome: 'disabled',
  })
})

test('production provisioning bootstrap dry-run previews one STUDENT identity and writes nothing', async () => {
  const harness = makeFactories()
  const logs = []

  const result =
    await runSecureDeliveryProductionProvisioningBootstrap({
      env: baseEnv('dry-run'),
      factories: harness.factories,
      write(line) {
        logs.push(line)
      },
    })

  assert.equal(result.ran, true)
  assert.equal(result.outcome, 'pass')
  assert.equal(result.mode, 'DRY_RUN')
  assert.equal(result.operationResult, 'APPLIED')
  assert.equal(
    harness.calls.some(([name]) => name === 'commit'),
    false,
  )
  assert.equal(
    harness.calls.some(([name]) => name === 'audit'),
    false,
  )
  const rendered = logs.join('\n')
  assert.doesNotMatch(rendered, /uid-real-student/)
  assert.doesNotMatch(rendered, /pilot-student-0123456789abcdef/)
})

test('production provisioning bootstrap apply requires both production write gates', async () => {
  const harness = makeFactories()

  await assert.rejects(
    () =>
      runSecureDeliveryProductionProvisioningBootstrap({
        env: baseEnv('apply'),
        factories: harness.factories,
      }),
    /safety-gate|apply/i,
  )

  assert.equal(
    harness.calls.some(([name]) => name === 'commit'),
    false,
  )
})

test('production provisioning bootstrap apply verifies mapping audit and idempotent replay without leaking identity', async () => {
  const harness = makeFactories()
  const env = {
    ...baseEnv('apply'),
    SECURE_DELIVERY_PROVISIONING_APPLY: 'true',
    SECURE_DELIVERY_PROVISIONING_PRODUCTION_APPLY:
      'true',
  }
  const logs = []

  const result =
    await runSecureDeliveryProductionProvisioningBootstrap({
      env,
      factories: harness.factories,
      write(line) {
        logs.push(line)
      },
    })

  assert.deepEqual(result, {
    ran: true,
    outcome: 'pass',
    mode: 'APPLIED',
    operationResult: 'APPLIED',
    verification: 'IDEMPOTENT_REPLAY',
  })
  assert.equal(
    harness.calls.some(([name]) => name === 'commit'),
    true,
  )
  assert.equal(
    harness.calls.some(([name]) => name === 'audit'),
    true,
  )
  assert.equal(
    harness.calls.filter(([name]) => name === 'preview').length,
    1,
  )
  const rendered = logs.join('\n')
  assert.doesNotMatch(rendered, /uid-real-student/)
  assert.doesNotMatch(rendered, /pilot-student-0123456789abcdef/)
})

test('production provisioning bootstrap refuses to run while ordinary Secure Delivery writes are enabled', async () => {
  const harness = makeFactories()
  const env = {
    ...baseEnv('dry-run'),
    SECURE_DELIVERY_WRITES_ENABLED: 'true',
  }

  await assert.rejects(
    () =>
      runSecureDeliveryProductionProvisioningBootstrap({
        env,
        factories: harness.factories,
      }),
    /writes-disabled/i,
  )
})
