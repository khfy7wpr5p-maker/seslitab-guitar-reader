import {
  createSecureDeliveryAuthorization,
} from './authorization/secureDeliveryAuthorization.js'
import {
  createSecureDeliveryConfig,
} from './config.js'
import {
  createSecureDeliveryRouter,
  createUnavailableSecureDeliveryRouter,
} from './http/router.js'
import {
  createPreparedAssignmentService,
} from './services/preparedAssignmentService.js'
import {
  createStudentDeliveryReadService,
} from './services/studentDeliveryReadService.js'
import {
  createTeacherSecureDeliveryService,
} from './services/teacherDeliveryService.js'
import {
  createTeacherPieceService,
} from './services/teacherPieceService.js'

function assertFactories(factories) {
  if (
    !factories ||
    typeof factories !== 'object'
  ) {
    throw new TypeError(
      'firebaseFactories are required when Secure Delivery is enabled.',
    )
  }
  for (const method of [
    'createAdminServices',
    'createTokenVerifier',
    'createStore',
  ]) {
    if (
      typeof factories[method] !==
      'function'
    ) {
      throw new TypeError(
        `firebaseFactories must provide ${method}().`,
      )
    }
  }
  return factories
}

export function createSecureDeliveryComposition({
  env = process.env,
  firebaseFactories,
  now,
  createHistoryEventId,
} = {}) {
  const config =
    createSecureDeliveryConfig(env)

  if (!config.enabled) {
    return Object.freeze({
      enabled: false,
      config,
      router:
        createUnavailableSecureDeliveryRouter({
          config,
        }),
      async close() {},
    })
  }

  if (typeof now !== 'function') {
    throw new TypeError(
      'now must be a function when Secure Delivery is enabled.',
    )
  }
  if (
    typeof createHistoryEventId !==
      'function'
  ) {
    throw new TypeError(
      'createHistoryEventId must be a function when Secure Delivery is enabled.',
    )
  }

  const factories =
    assertFactories(firebaseFactories)
  const admin =
    factories.createAdminServices({ env })
  if (
    !admin ||
    typeof admin !== 'object'
  ) {
    throw new Error(
      'secure-delivery-firebase-admin-unavailable',
    )
  }

  const tokenVerifier =
    factories.createTokenVerifier({
      auth: admin.auth,
      env,
    })
  const store =
    factories.createStore({
      firestore: admin.firestore,
      env,
    })
  const authorization =
    createSecureDeliveryAuthorization({
      store,
    })
  const preparedService =
    createPreparedAssignmentService({
      authorization,
      store,
      now,
    })
  const teacherService =
    createTeacherSecureDeliveryService({
      authorization,
      store,
      now,
      createHistoryEventId,
    })
  const teacherPieceService =
    createTeacherPieceService({
      authorization,
      store,
      now,
    })
  const studentService =
    createStudentDeliveryReadService({
      authorization,
      store,
    })

  const router =
    createSecureDeliveryRouter({
      tokenVerifier,
      preparedService,
      teacherService,
      teacherPieceService,
      studentService,
      config,
    })

  return Object.freeze({
    enabled: true,
    config,
    router,
    async close() {
      if (
        typeof admin.delete ===
        'function'
      ) {
        await admin.delete()
      }
    },
  })
}
