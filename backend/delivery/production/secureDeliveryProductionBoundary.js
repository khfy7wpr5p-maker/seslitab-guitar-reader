import {
  randomUUID,
} from 'node:crypto'

import {
  createSecureDeliveryComposition,
} from '../composition.js'
import {
  createSecureDeliveryConfig,
} from '../config.js'
import {
  createUnavailableSecureDeliveryRouter,
} from '../http/router.js'

const EMULATOR_PROJECT_ID =
  'demo-seslitab-td06'

function enabled(value) {
  return (
    String(value ?? '')
      .trim()
      .toLowerCase() === 'true'
  )
}

function closedBoundary(config) {
  return Object.freeze({
    active: false,
    enabled: false,
    config,
    router:
      createUnavailableSecureDeliveryRouter({
        config,
      }),
    async close() {},
  })
}

async function loadFirebaseFactories() {
  const [
    adminModule,
    tokenModule,
    storeModule,
  ] = await Promise.all([
    import(
      '../firebase/firebaseAdmin.js'
    ),
    import(
      '../firebase/firebaseTokenVerifier.js'
    ),
    import(
      '../firebase/firestoreSecureDeliveryStore.js'
    ),
  ])

  return Object.freeze({
    createAdminServices:
      adminModule
        .createFirebaseAdminServices,
    createTokenVerifier:
      tokenModule
        .createFirebaseTokenVerifier,
    createStore:
      storeModule
        .createFirestoreSecureDeliveryStore,
  })
}

function productionFactories(
  factories,
  projectId,
) {
  if (
    !factories ||
    typeof factories !== 'object'
  ) {
    throw new TypeError(
      'production Firebase factories are required.',
    )
  }

  return Object.freeze({
    createAdminServices({ env }) {
      return factories
        .createAdminServices({
          env,
          projectId,
          productionAuthorized: true,
        })
    },
    createTokenVerifier(input) {
      return factories
        .createTokenVerifier(input)
    },
    createStore(input) {
      return factories
        .createStore(input)
    },
  })
}

export async function createSecureDeliveryProductionBoundary({
  env = process.env,
  firebaseFactories,
  now = () =>
    new Date().toISOString(),
  createHistoryEventId = () =>
    randomUUID(),
} = {}) {
  if (!env || typeof env !== 'object') {
    throw new TypeError(
      'production environment must be an object.',
    )
  }

  const config =
    createSecureDeliveryConfig(env)

  if (
    !enabled(
      env
        .SECURE_DELIVERY_PRODUCTION_ACTIVATION,
    )
  ) {
    return closedBoundary(config)
  }

  if (
    String(env.NODE_ENV ?? '')
      .trim()
      .toLowerCase() !==
      'production'
  ) {
    throw new Error(
      'secure-delivery-production-requires-node-env-production',
    )
  }

  if (!config.enabled) {
    throw new Error(
      'secure-delivery-production-requires-enabled',
    )
  }

  if (!config.studentReadsEnabled) {
    throw new Error(
      'secure-delivery-production-requires-student-reads',
    )
  }

  if (config.writesEnabled) {
    throw new Error(
      'secure-delivery-production-read-only-requires-writes-disabled',
    )
  }

  const projectId =
    String(
      env
        .SECURE_DELIVERY_FIREBASE_PROJECT_ID ??
        '',
    ).trim()

  if (projectId.length === 0) {
    throw new Error(
      'secure-delivery-production-project-id-required',
    )
  }

  if (projectId === EMULATOR_PROJECT_ID) {
    throw new Error(
      'secure-delivery-production-project-id-cannot-be-emulator',
    )
  }

  if (
    env.FIRESTORE_EMULATOR_HOST ||
    env.FIREBASE_AUTH_EMULATOR_HOST
  ) {
    throw new Error(
      'secure-delivery-production-emulator-hosts-forbidden',
    )
  }

  const factories =
    firebaseFactories ??
    await loadFirebaseFactories()

  const composition =
    createSecureDeliveryComposition({
      env,
      firebaseFactories:
        productionFactories(
          factories,
          projectId,
        ),
      now,
      createHistoryEventId,
    })

  return Object.freeze({
    ...composition,
    active: true,
  })
}
