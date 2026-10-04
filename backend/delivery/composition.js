import { randomUUID } from 'node:crypto'

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
  createStudentWorkRequestRouter,
} from './http/studentWorkRequestRouter.js'
import {
  createTeacherPieceManagementRouter,
} from './http/teacherPieceManagementRouter.js'
import {
  createFirestoreStudentWorkRequestStore,
} from './firebase/firestoreStudentWorkRequestStore.js'
import {
  createPreparedAssignmentService,
} from './services/preparedAssignmentService.js'
import {
  createRequestBoundAssignmentComposerService,
} from './services/requestBoundAssignmentComposerService.js'
import {
  createSecureDeliveryRequestObserver,
} from './observability/secureDeliveryRequestObserver.js'
import {
  createStudentDeliveryReadService,
} from './services/studentDeliveryReadService.js'
import {
  createStudentWorkRequestService,
} from './services/studentWorkRequestService.js'
import {
  createTeacherSecureDeliveryService,
} from './services/teacherDeliveryService.js'
import {
  createTeacherPieceManagementService,
} from './services/teacherPieceManagementService.js'
import {
  createTeacherPieceService,
} from './services/teacherPieceService.js'
import {
  createTeacherRosterReadService,
} from './services/teacherRosterReadService.js'

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

function supportsWorkRequestStore(firestore) {
  return Boolean(
    firestore &&
    typeof firestore.collection === 'function' &&
    typeof firestore.runTransaction === 'function'
  )
}

export function createSecureDeliveryComposition({
  env = process.env,
  firebaseFactories,
  now,
  createHistoryEventId,
  observeRequest,
} = {}) {
  const config =
    createSecureDeliveryConfig(env)

  if (!config.enabled) {
    const requestObserver =
      typeof observeRequest === 'function'
        ? observeRequest
        : createSecureDeliveryRequestObserver()

    return Object.freeze({
      enabled: false,
      config,
      router:
        createUnavailableSecureDeliveryRouter({
          config,
          observeRequest:
            requestObserver,
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
  const teacherRosterService =
    createTeacherRosterReadService({
      authorization,
      store,
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

  if (
    observeRequest !== undefined &&
    typeof observeRequest !== 'function'
  ) {
    throw new TypeError(
      'observeRequest must be a function when provided.',
    )
  }

  const requestObserver =
    observeRequest ??
    createSecureDeliveryRequestObserver()

  const router =
    createSecureDeliveryRouter({
      tokenVerifier,
      preparedService,
      teacherService,
      teacherRosterService,
      teacherPieceService,
      studentService,
      config,
      observeRequest: requestObserver,
    })

  if (supportsWorkRequestStore(admin.firestore)) {
    const workRequestStore =
      createFirestoreStudentWorkRequestStore({
        firestore: admin.firestore,
      })
    const workRequestService =
      createStudentWorkRequestService({
        authorization,
        store: workRequestStore,
        now,
        createRequestId: () =>
          `work-request-${randomUUID()}`,
      })
    const teacherPieceManagementService =
      createTeacherPieceManagementService({
        rosterService: teacherRosterService,
        store,
        pieceService: teacherPieceService,
        workRequestService,
      })
    const requestBoundComposerService =
      createRequestBoundAssignmentComposerService({
        authorization,
        rosterService: teacherRosterService,
        preparedService,
        teacherDeliveryService: teacherService,
        pieceService: teacherPieceService,
        workRequestService,
        now,
      })

    router.use(
      createTeacherPieceManagementRouter({
        tokenVerifier,
        service: teacherPieceManagementService,
        requestBoundComposerService,
        config,
      }),
    )
    router.use(
      createStudentWorkRequestRouter({
        tokenVerifier,
        service: workRequestService,
        config,
        observeRequest: requestObserver,
      }),
    )
  }

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
