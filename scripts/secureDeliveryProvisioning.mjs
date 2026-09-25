import {
  readFile,
} from 'node:fs/promises'

import {
  createInMemorySecureDeliveryStore,
} from '../backend/delivery/repositories/inMemorySecureDeliveryStore.js'
import {
  createSecureDeliveryProvisioningService,
} from '../backend/delivery/provisioning/secureDeliveryProvisioningService.js'
import {
  normalizeSecureDeliveryProvisioningManifest,
  parseSecureDeliveryProvisioningCliArgs,
} from '../backend/delivery/provisioning/secureDeliveryProvisioningManifest.js'

function safeError(error) {
  return error instanceof Error
    ? error.message
    : 'secure-delivery-provisioning-failed'
}

async function readManifest(path) {
  const text = await readFile(
    path,
    'utf8',
  )
  return normalizeSecureDeliveryProvisioningManifest(
    JSON.parse(text),
  )
}

async function createStore({
  emulator,
}) {
  if (!emulator) {
    return Object.freeze({
      store:
        createInMemorySecureDeliveryStore(),
      close: async () => {},
      target:
        'MANIFEST_ONLY_DRY_RUN',
    })
  }

  const {
    createFirebaseAdminServices,
    EMULATOR_PROJECT_ID,
  } = await import(
    '../backend/delivery/firebase/firebaseAdmin.js'
  )
  const {
    createFirestoreSecureDeliveryProvisioningStore,
  } = await import(
    '../backend/delivery/provisioning/firestoreSecureDeliveryProvisioningStore.js'
  )

  const admin =
    createFirebaseAdminServices({
      emulator: true,
      projectId:
        EMULATOR_PROJECT_ID,
      appName:
        'seslitab-ses14-provisioning-cli',
    })

  return Object.freeze({
    store:
      createFirestoreSecureDeliveryProvisioningStore({
        firestore:
          admin.firestore,
      }),
    close: () => admin.delete(),
    target:
      'FIREBASE_EMULATOR',
  })
}

async function main() {
  const options =
    parseSecureDeliveryProvisioningCliArgs(
      process.argv.slice(2),
    )
  const manifest =
    await readManifest(
      options.manifestPath,
    )

  const applyEnabled =
    process.env
      .SECURE_DELIVERY_PROVISIONING_APPLY ===
    'true'

  if (
    options.apply &&
    !applyEnabled
  ) {
    throw new Error(
      'secure-delivery-provisioning-apply-disabled-by-safety-gate',
    )
  }

  const target =
    await createStore(options)

  try {
    const service =
      createSecureDeliveryProvisioningService({
        store: target.store,
        applyEnabled,
      })

    const result =
      await service.execute({
        commands:
          manifest.commands,
        apply:
          options.apply,
      })

    process.stdout.write(
      JSON.stringify({
        ok: true,
        target: target.target,
        mode: result.mode,
        operations:
          result.operations,
      }) + '\n',
    )
  } finally {
    await target.close()
  }
}

main().catch((error) => {
  process.stderr.write(
    JSON.stringify({
      ok: false,
      error: safeError(error),
    }) + '\n',
  )
  process.exitCode = 1
})
