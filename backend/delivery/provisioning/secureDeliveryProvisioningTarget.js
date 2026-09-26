import {
  createInMemorySecureDeliveryStore,
} from '../repositories/inMemorySecureDeliveryStore.js'

function enabled(value) {
  return (
    String(value ?? '')
      .trim()
      .toLowerCase() === 'true'
  )
}

function assertOptions(options) {
  if (
    !options ||
    typeof options !== 'object'
  ) {
    throw new TypeError(
      'provisioning target options are required.',
    )
  }

  if (
    options.emulator &&
    options.production
  ) {
    throw new Error(
      'provisioning target cannot be emulator and production together.',
    )
  }

  return options
}

async function loadFirebaseFactories() {
  const [
    adminModule,
    storeModule,
  ] = await Promise.all([
    import(
      '../firebase/firebaseAdmin.js'
    ),
    import(
      './firestoreSecureDeliveryProvisioningStore.js'
    ),
  ])

  return Object.freeze({
    emulatorProjectId:
      adminModule.EMULATOR_PROJECT_ID,
    createAdminServices:
      adminModule
        .createFirebaseAdminServices,
    createProvisioningStore:
      storeModule
        .createFirestoreSecureDeliveryProvisioningStore,
  })
}

export function assertSecureDeliveryProvisioningApplyAuthorization({
  options,
  env = process.env,
} = {}) {
  const trusted =
    assertOptions(options)

  if (!trusted.apply) {
    return false
  }

  if (
    !enabled(
      env
        .SECURE_DELIVERY_PROVISIONING_APPLY,
    )
  ) {
    throw new Error(
      'secure-delivery-provisioning-apply-disabled-by-safety-gate',
    )
  }

  if (
    trusted.production &&
    !enabled(
      env
        .SECURE_DELIVERY_PROVISIONING_PRODUCTION_APPLY,
    )
  ) {
    throw new Error(
      'secure-delivery-production-apply-disabled-by-safety-gate',
    )
  }

  return true
}

export async function createSecureDeliveryProvisioningTarget({
  options,
  env = process.env,
  firebaseFactories,
} = {}) {
  const trusted =
    assertOptions(options)

  if (
    !trusted.emulator &&
    !trusted.production
  ) {
    return Object.freeze({
      store:
        createInMemorySecureDeliveryStore(),
      close: async () => {},
      target:
        'MANIFEST_ONLY_DRY_RUN',
    })
  }

  if (
    trusted.production &&
    !enabled(
      env
        .SECURE_DELIVERY_PROVISIONING_PRODUCTION_AUTHORIZED,
    )
  ) {
    throw new Error(
      'secure-delivery-production-provisioning-not-authorized-by-gate',
    )
  }

  const factories =
    firebaseFactories ??
    await loadFirebaseFactories()

  let admin
  let target

  if (trusted.emulator) {
    admin =
      factories.createAdminServices({
        emulator: true,
        projectId:
          factories.emulatorProjectId,
        appName:
          'seslitab-ses14-provisioning-cli',
      })
    target =
      'FIREBASE_EMULATOR'
  } else {
    const projectId =
      String(
        env
          .SECURE_DELIVERY_FIREBASE_PROJECT_ID ??
          '',
      ).trim()

    if (
      projectId.length === 0 ||
      projectId ===
        factories.emulatorProjectId
    ) {
      throw new Error(
        'secure-delivery-production-provisioning-project-id-invalid',
      )
    }

    admin =
      factories.createAdminServices({
        emulator: false,
        projectId,
        productionAuthorized: true,
        appName:
          'seslitab-production-provisioning-cli',
      })
    target =
      'FIREBASE_PRODUCTION'
  }

  return Object.freeze({
    store:
      factories.createProvisioningStore({
        firestore:
          admin.firestore,
      }),
    close: () => admin.delete(),
    target,
  })
}
