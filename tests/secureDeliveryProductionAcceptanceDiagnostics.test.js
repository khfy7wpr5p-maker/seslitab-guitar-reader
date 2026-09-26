import assert from 'node:assert/strict'
import test from 'node:test'

import {
  runSecureDeliveryProductionAcceptance,
} from '../backend/delivery/production/secureDeliveryProductionAcceptance.js'

const ACCEPTANCE_UID =
  'ses15-production-acceptance-v1'
const ACCEPTANCE_STUDENT_ID =
  'ses15-production-acceptance-student-v1'

function env() {
  return {
    NODE_ENV: 'production',
    SECURE_DELIVERY_PRODUCTION_ACCEPTANCE_BOOTSTRAP:
      'true',
    SECURE_DELIVERY_PROVISIONING_PRODUCTION_AUTHORIZED:
      'true',
    SECURE_DELIVERY_PROVISIONING_APPLY:
      'true',
    SECURE_DELIVERY_PROVISIONING_PRODUCTION_APPLY:
      'true',
    SECURE_DELIVERY_WRITES_ENABLED:
      'false',
    SECURE_DELIVERY_FIREBASE_PROJECT_ID:
      'project-a',
    SECURE_DELIVERY_FIREBASE_WEB_API_KEY:
      'public-key',
    SECURE_DELIVERY_PRODUCTION_ACCEPTANCE_TIMESTAMP:
      '2026-09-26T18:54:00.000Z',
  }
}

function response(status, body = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() {
      return body
    },
  }
}

function harness({
  failCleanup = false,
  failCreateAfterMutation = false,
  customTokenError = null,
} = {}) {
  let mapping = null
  const actions = []
  const identityCommands = []
  const logs = []
  const customToken =
    'custom-token-sensitive-value'

  const provisioningStore = {
    async previewProvisioningBatch() {
      throw new Error(
        'preview not expected',
      )
    },
    async getProvisioningAudit() {
      return null
    },
    async listProvisioningAudit() {
      return []
    },
    async commitProvisioningBatch(
      commands,
    ) {
      for (const command of commands) {
        actions.push(
          command.action,
        )
        if (
          command.action ===
            'CREATE_IDENTITY' ||
          command.action ===
            'DISABLE_IDENTITY'
        ) {
          identityCommands.push({
            action:
              command.action,
            providerSubject:
              command.providerSubject,
            studentId:
              command.studentId ??
              null,
            operationId:
              command.operationId,
          })
        }

        if (
          command.action ===
          'CREATE_IDENTITY'
        ) {
          mapping = {
            providerSubject:
              ACCEPTANCE_UID,
            role: 'STUDENT',
            teacherId: null,
            studentId:
              ACCEPTANCE_STUDENT_ID,
            active: true,
            createdAt:
              command.timestamp,
            disabledAt: null,
          }

          if (
            failCreateAfterMutation
          ) {
            throw new Error(
              'synthetic ambiguous create failure',
            )
          }
        }

        if (
          command.action ===
          'DISABLE_IDENTITY'
        ) {
          if (failCleanup) {
            throw new Error(
              'synthetic cleanup failure',
            )
          }

          mapping = {
            ...mapping,
            active: false,
            disabledAt:
              command.timestamp,
          }
        }
      }

      return commands.map(
        (command) => ({
          operationId:
            command.operationId,
          action:
            command.action,
          result: 'APPLIED',
        }),
      )
    },
  }

  return {
    actions,
    identityCommands,
    logs,
    get mapping() {
      return mapping
    },
    factories: {
      createAdminServices() {
        return {
          auth: {
            async getUser() {
              throw Object.assign(
                new Error('not found'),
                {
                  code:
                    'auth/user-not-found',
                },
              )
            },
            async createUser() {},
            async createCustomToken() {
              if (customTokenError) {
                throw customTokenError
              }
              return customToken
            },
            async deleteUser() {},
          },
          firestore: {},
          async delete() {},
        }
      },
      createRuntimeStore() {
        return {
          async getIdentityMapping() {
            return mapping
          },
        }
      },
      createProvisioningStore() {
        return provisioningStore
      },
    },
    async fetchImpl(url) {
      if (
        String(url).includes(
          'identitytoolkit.googleapis.com',
        )
      ) {
        return response(500, {
          error: {
            message:
              'synthetic exchange failure',
          },
        })
      }

      throw new Error(
        'student read must not run',
      )
    },
    write(line) {
      logs.push(
        String(line),
      )
    },
    customToken,
  }
}

test('failed production acceptance logs only a privacy-safe stage and disables a partially-created identity', async () => {
  const h = harness()

  await assert.rejects(
    () =>
      runSecureDeliveryProductionAcceptance({
        env: env(),
        port: 10000,
        factories:
          h.factories,
        fetchImpl:
          h.fetchImpl,
        write:
          h.write,
      }),
    /production-acceptance-failed/i,
  )

  assert.deepEqual(
    h.actions,
    [
      'CREATE_IDENTITY',
      'DISABLE_IDENTITY',
    ],
  )
  assert.equal(
    h.mapping?.active,
    false,
  )

  const joined =
    h.logs.join('\n')

  assert.match(
    joined,
    /"outcome":"failed","stage":"token_exchange"/,
  )
  assert.match(
    joined,
    /"outcome":"failure_cleanup_pass","stage":"identity_disable_cleanup"/,
  )
  assert.doesNotMatch(
    joined,
    new RegExp(
      [
        ACCEPTANCE_UID,
        ACCEPTANCE_STUDENT_ID,
        h.customToken,
      ].join('|'),
    ),
  )
})

test('custom-token signing failure logs a fixed privacy-safe reason without leaking the underlying error', async () => {
  const signingError = Object.assign(
    new Error(
      'Permission iam.serviceAccounts.signBlob is required for service-account@example.invalid',
    ),
    {
      code:
        'auth/insufficient-permission',
    },
  )
  const h = harness({
    customTokenError:
      signingError,
  })

  await assert.rejects(
    () =>
      runSecureDeliveryProductionAcceptance({
        env: env(),
        port: 10000,
        factories:
          h.factories,
        fetchImpl:
          h.fetchImpl,
        write:
          h.write,
      }),
    /production-acceptance-failed/i,
  )

  assert.deepEqual(
    h.actions,
    [
      'CREATE_IDENTITY',
      'DISABLE_IDENTITY',
    ],
  )

  const joined =
    h.logs.join('\n')

  assert.match(
    joined,
    /"outcome":"failed","stage":"custom_token","reason":"signing_permission_denied"/,
  )
  assert.match(
    joined,
    /"outcome":"failure_cleanup_pass","stage":"identity_disable_cleanup"/,
  )
  assert.doesNotMatch(
    joined,
    /iam\.serviceAccounts\.signBlob|service-account@example\.invalid|insufficient-permission/,
  )
})

test('failed production acceptance fails closed when identity cleanup itself fails', async () => {
  const h = harness({
    failCleanup: true,
  })

  await assert.rejects(
    () =>
      runSecureDeliveryProductionAcceptance({
        env: env(),
        port: 10000,
        factories:
          h.factories,
        fetchImpl:
          h.fetchImpl,
        write:
          h.write,
      }),
    /production-acceptance-failure-cleanup-failed/i,
  )

  assert.deepEqual(
    h.actions,
    [
      'CREATE_IDENTITY',
      'DISABLE_IDENTITY',
    ],
  )

  const joined =
    h.logs.join('\n')

  assert.match(
    joined,
    /"outcome":"failed","stage":"token_exchange"/,
  )
  assert.match(
    joined,
    /"outcome":"failure_cleanup_failed","stage":"identity_disable_cleanup"/,
  )
  assert.doesNotMatch(
    joined,
    /ses15-production-acceptance-v1|custom-token-sensitive-value/,
  )
})


test('ambiguous create failure re-reads and disables an identity that may already have committed', async () => {
  const h = harness({
    failCreateAfterMutation: true,
  })

  await assert.rejects(
    () =>
      runSecureDeliveryProductionAcceptance({
        env: env(),
        port: 10000,
        factories:
          h.factories,
        fetchImpl:
          h.fetchImpl,
        write:
          h.write,
      }),
    /production-acceptance-failed/i,
  )

  assert.deepEqual(
    h.actions,
    [
      'CREATE_IDENTITY',
      'DISABLE_IDENTITY',
    ],
  )
  assert.equal(
    h.mapping?.active,
    false,
  )

  const joined =
    h.logs.join('\n')
  assert.match(
    joined,
    /"outcome":"failed","stage":"identity_provision"/,
  )
  assert.match(
    joined,
    /"outcome":"failure_cleanup_pass","stage":"identity_disable_cleanup"/,
  )
  assert.doesNotMatch(
    joined,
    /ses15-production-acceptance-v1|custom-token-sensitive-value/,
  )
})


test('acceptance run id isolates retry identity and provisioning operation ids without logging them', async () => {
  const h = harness()
  const retryEnv = {
    ...env(),
    SECURE_DELIVERY_PRODUCTION_ACCEPTANCE_RUN_ID:
      'retry-2',
  }

  await assert.rejects(
    () =>
      runSecureDeliveryProductionAcceptance({
        env: retryEnv,
        port: 10000,
        factories:
          h.factories,
        fetchImpl:
          h.fetchImpl,
        write:
          h.write,
      }),
    /production-acceptance-failed/i,
  )

  assert.deepEqual(
    h.identityCommands,
    [
      {
        action:
          'CREATE_IDENTITY',
        providerSubject:
          'ses15-production-acceptance-retry-2',
        studentId:
          'ses15-production-acceptance-student-retry-2',
        operationId:
          'ses15-production-acceptance-create-retry-2',
      },
      {
        action:
          'DISABLE_IDENTITY',
        providerSubject:
          'ses15-production-acceptance-retry-2',
        studentId: null,
        operationId:
          'ses15-production-acceptance-failure-disable-retry-2',
      },
    ],
  )

  const joined =
    h.logs.join('\n')
  assert.doesNotMatch(
    joined,
    /retry-2|ses15-production-acceptance-retry-2/,
  )
})
