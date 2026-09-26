import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertSecureDeliveryProvisioningApplyAuthorization,
  createSecureDeliveryProvisioningTarget,
} from '../backend/delivery/provisioning/secureDeliveryProvisioningTarget.js'

function fakeFactories(calls) {
  return {
    emulatorProjectId: 'demo-seslitab-td06',
    createAdminServices(input) {
      calls.push(['admin', input])
      return {
        firestore: {},
        async delete() {
          calls.push(['delete'])
        },
      }
    },
    createProvisioningStore({ firestore }) {
      calls.push(['store', firestore])
      return {
        async previewProvisioningBatch() {
          return []
        },
        async commitProvisioningBatch() {
          return []
        },
        async getProvisioningAudit() {
          return null
        },
        async listProvisioningAudit() {
          return []
        },
      }
    },
  }
}

test('production provisioning target is impossible without its explicit production access gate', async () => {
  const calls = []
  await assert.rejects(
    () =>
      createSecureDeliveryProvisioningTarget({
        options: {
          emulator: false,
          production: true,
        },
        env: {
          SECURE_DELIVERY_FIREBASE_PROJECT_ID:
            'seslitab-production-example',
        },
        firebaseFactories:
          fakeFactories(calls),
      }),
    /production.*authorized|production.*gate/i,
  )
  assert.deepEqual(calls, [])
})

test('production provisioning target passes only approved project metadata to Firebase Admin and never needs repo credentials', async () => {
  const calls = []
  const target =
    await createSecureDeliveryProvisioningTarget({
      options: {
        emulator: false,
        production: true,
      },
      env: {
        SECURE_DELIVERY_PROVISIONING_PRODUCTION_AUTHORIZED:
          'true',
        SECURE_DELIVERY_FIREBASE_PROJECT_ID:
          'seslitab-production-example',
      },
      firebaseFactories:
        fakeFactories(calls),
    })

  assert.equal(
    target.target,
    'FIREBASE_PRODUCTION',
  )
  assert.deepEqual(calls[0], [
    'admin',
    {
      emulator: false,
      projectId:
        'seslitab-production-example',
      productionAuthorized: true,
      appName:
        'seslitab-production-provisioning-cli',
    },
  ])
  assert.equal(calls[1][0], 'store')
  await target.close()
  assert.equal(calls.at(-1)[0], 'delete')
})

test('production provisioning apply requires both generic apply and a separate production-apply gate', () => {
  const options = {
    apply: true,
    emulator: false,
    production: true,
  }

  assert.throws(
    () =>
      assertSecureDeliveryProvisioningApplyAuthorization({
        options,
        env: {
          SECURE_DELIVERY_PROVISIONING_APPLY:
            'true',
        },
      }),
    /production.*apply/i,
  )

  assert.equal(
    assertSecureDeliveryProvisioningApplyAuthorization({
      options,
      env: {
        SECURE_DELIVERY_PROVISIONING_APPLY:
          'true',
        SECURE_DELIVERY_PROVISIONING_PRODUCTION_APPLY:
          'true',
      },
    }),
    true,
  )
})

test('manifest-only dry-run remains local and touches no Firebase factory', async () => {
  const calls = []
  const target =
    await createSecureDeliveryProvisioningTarget({
      options: {
        emulator: false,
        production: false,
      },
      env: {},
      firebaseFactories:
        fakeFactories(calls),
    })

  assert.equal(
    target.target,
    'MANIFEST_ONLY_DRY_RUN',
  )
  assert.deepEqual(calls, [])
})
