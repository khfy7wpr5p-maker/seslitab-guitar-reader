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

function env() {
  return {
    NODE_ENV: 'production',
    SECURE_DELIVERY_PRODUCTION_ACCEPTANCE_BOOTSTRAP: 'true',
    SECURE_DELIVERY_PROVISIONING_PRODUCTION_AUTHORIZED: 'true',
    SECURE_DELIVERY_PROVISIONING_APPLY: 'true',
    SECURE_DELIVERY_PROVISIONING_PRODUCTION_APPLY: 'true',
    SECURE_DELIVERY_WRITES_ENABLED: 'false',
    SECURE_DELIVERY_FIREBASE_PROJECT_ID: 'project-a',
    SECURE_DELIVERY_FIREBASE_WEB_API_KEY: 'public-key',
    SECURE_DELIVERY_PRODUCTION_ACCEPTANCE_TIMESTAMP:
      '2026-09-26T17:45:00.000Z',
  }
}

function harness({
  revokedStatus = 400,
  revokedCode = 'INVALID_REQUEST',
  cleanupError = null,
} = {}) {
  let mapping = null
  const store = {
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
        if (command.action === 'CREATE_IDENTITY') {
          mapping = {
            providerSubject:
              'ses15-production-acceptance-v1',
            role: 'STUDENT',
            teacherId: null,
            studentId:
              'ses15-production-acceptance-student-v1',
            active: true,
            createdAt: command.timestamp,
            disabledAt: null,
          }
        }
        if (command.action === 'DISABLE_IDENTITY') {
          mapping = {
            ...mapping,
            active: false,
            disabledAt: command.timestamp,
          }
        }
      }
      return commands.map((command) => ({
        operationId: command.operationId,
        action: command.action,
        result: 'APPLIED',
      }))
    },
  }

  return {
    factories: {
      createAdminServices() {
        return {
          auth: {
            async getUser() {
              throw Object.assign(
                new Error('not found'),
                {
                  code: 'auth/user-not-found',
                },
              )
            },
            async createUser() {},
            async createCustomToken() {
              throw new Error(
                'runtime admin signer must not be used',
              )
            },
            async deleteUser() {
              if (cleanupError) throw cleanupError
            },
          },
          firestore: {},
          async delete() {},
        }
      },
      createAcceptanceLocalSigner() {
        return {
          auth: {
            async createCustomToken() {
              return 'custom-value'
            },
          },
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
        return store
      },
    },
    async fetchImpl(url) {
      if (
        String(url).includes(
          'identitytoolkit.googleapis.com',
        )
      ) {
        return response(200, {
          idToken: 'bearer-value',
        })
      }
      if (mapping?.active) {
        return response(200, {
          success: true,
          data: [],
        })
      }
      return response(revokedStatus, {
        success: false,
        error: {
          code: revokedCode,
        },
      })
    },
  }
}

test('acceptance rejects a rate-limit response as revoke evidence', async () => {
  const h = harness({
    revokedStatus: 429,
    revokedCode: 'RATE_LIMITED',
  })

  await assert.rejects(
    () =>
      runSecureDeliveryProductionAcceptance({
        env: env(),
        port: 10000,
        factories: h.factories,
        fetchImpl: h.fetchImpl,
        write() {},
      }),
    /production-acceptance-failed/i,
  )
})

test('acceptance fails if temporary Auth cleanup fails', async () => {
  const h = harness({
    cleanupError:
      Object.assign(
        new Error('cleanup failed'),
        {
          code: 'auth/internal-error',
        },
      ),
  })

  await assert.rejects(
    () =>
      runSecureDeliveryProductionAcceptance({
        env: env(),
        port: 10000,
        factories: h.factories,
        fetchImpl: h.fetchImpl,
        write() {},
      }),
    /production-acceptance-cleanup-failed/i,
  )
})
