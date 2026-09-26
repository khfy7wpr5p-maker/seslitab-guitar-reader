import assert from 'node:assert/strict'
import test from 'node:test'

import {
  runSecureDeliveryProductionAcceptance,
} from '../backend/delivery/production/secureDeliveryProductionAcceptance.js'

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() {
      return body
    },
  }
}

function baseEnv() {
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
      'public-web-key',
    SECURE_DELIVERY_PRODUCTION_ACCEPTANCE_TIMESTAMP:
      '2026-09-26T17:45:00.000Z',
  }
}

test('production acceptance bootstrap is inert unless its dedicated gate is exactly true', async () => {
  const calls = []
  const result =
    await runSecureDeliveryProductionAcceptance({
      env: {
        ...baseEnv(),
        SECURE_DELIVERY_PRODUCTION_ACCEPTANCE_BOOTSTRAP:
          'false',
      },
      port: 10000,
      factories: {
        createAdminServices() {
          calls.push('admin')
        },
      },
    })

  assert.deepEqual(result, {
    ran: false,
    outcome: 'disabled',
  })
  assert.deepEqual(calls, [])
})

test('production acceptance creates an isolated student identity, exercises real bearer auth, disables it, and never logs uid or tokens', async () => {
  let mapping = null
  const calls = []
  const logs = []
  const uid =
    'ses15-production-acceptance-v1'
  const idToken = 'id-token-sensitive'
  const customToken =
    'custom-token-sensitive'

  const provisioningStore = {
    async previewProvisioningBatch() {
      throw new Error('preview not expected')
    },
    async getProvisioningAudit() {
      return null
    },
    async listProvisioningAudit() {
      return []
    },
    async commitProvisioningBatch(commands) {
      for (const command of commands) {
        calls.push([
          'provision',
          command.action,
        ])
        if (
          command.action ===
            'CREATE_IDENTITY'
        ) {
          mapping = Object.freeze({
            providerSubject: uid,
            role: 'STUDENT',
            teacherId: null,
            studentId:
              'ses15-production-acceptance-student-v1',
            active: true,
            createdAt:
              command.timestamp,
            disabledAt: null,
          })
        }
        if (
          command.action ===
            'DISABLE_IDENTITY'
        ) {
          mapping = Object.freeze({
            ...mapping,
            active: false,
            disabledAt:
              command.timestamp,
          })
        }
      }
      return commands.map(
        (command) => ({
          operationId:
            command.operationId,
          action: command.action,
          result: 'APPLIED',
        }),
      )
    },
  }

  const result =
    await runSecureDeliveryProductionAcceptance({
      env: baseEnv(),
      port: 10000,
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
              async createUser(input) {
                calls.push([
                  'create-user',
                  input.uid,
                ])
                return {
                  uid: input.uid,
                }
              },
              async createCustomToken(
                subject,
              ) {
                assert.equal(
                  subject,
                  uid,
                )
                return customToken
              },
              async deleteUser(subject) {
                calls.push([
                  'delete-user',
                  subject,
                ])
              },
            },
            firestore: {},
            async delete() {
              calls.push([
                'delete-admin',
              ])
            },
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
      fetchImpl: async (
        url,
        init = {},
      ) => {
        const textUrl =
          String(url)
        if (
          textUrl.includes(
            'identitytoolkit.googleapis.com',
          )
        ) {
          assert.equal(
            JSON.parse(
              init.body,
            ).token,
            customToken,
          )
          return response(200, {
            idToken,
          })
        }

        const auth =
          init.headers
            ?.Authorization
        assert.equal(
          auth,
          'Bearer ' + idToken,
        )
        assert.equal(
          init.headers?.Origin,
          'https://st-student-app.onrender.com',
        )

        if (mapping?.active) {
          return response(200, {
            success: true,
            data: [],
          })
        }

        return response(400, {
          success: false,
          error: {
            code:
              'INVALID_REQUEST',
          },
        })
      },
      write(line) {
        logs.push(String(line))
      },
    })

  assert.deepEqual(result, {
    ran: true,
    outcome: 'pass',
    authorizedStatus: 200,
    revokedStatus: 400,
  })
  assert.equal(mapping.active, false)
  assert.equal(
    calls.some(
      (call) =>
        call[0] ===
          'delete-user',
    ),
    true,
  )

  const joined =
    logs.join('\n')
  assert.doesNotMatch(
    joined,
    /id-token-sensitive|custom-token-sensitive|ses15-production-acceptance-v1/,
  )
  assert.match(
    joined,
    /production_acceptance.*pass/,
  )
})

test('a previously disabled acceptance mapping makes restart idempotently complete without recreating Auth state', async () => {
  const calls = []
  const result =
    await runSecureDeliveryProductionAcceptance({
      env: baseEnv(),
      port: 10000,
      factories: {
        createAdminServices() {
          return {
            auth: {
              async deleteUser() {
                throw Object.assign(
                  new Error('not found'),
                  {
                    code:
                      'auth/user-not-found',
                  },
                )
              },
            },
            firestore: {},
            async delete() {
              calls.push('delete')
            },
          }
        },
        createRuntimeStore() {
          return {
            async getIdentityMapping() {
              return {
                providerSubject:
                  'ses15-production-acceptance-v1',
                role: 'STUDENT',
                teacherId: null,
                studentId:
                  'ses15-production-acceptance-student-v1',
                active: false,
                createdAt:
                  '2026-09-26T17:45:00.000Z',
                disabledAt:
                  '2026-09-26T17:45:01.000Z',
              }
            },
          }
        },
        createProvisioningStore() {
          throw new Error(
            'provisioning must not be recreated',
          )
        },
      },
      write() {},
    })

  assert.deepEqual(result, {
    ran: false,
    outcome:
      'already-complete',
  })
  assert.deepEqual(calls, [
    'delete',
  ])
})
