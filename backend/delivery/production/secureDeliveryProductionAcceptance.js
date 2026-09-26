import {
  createSecureDeliveryProvisioningService,
} from '../provisioning/secureDeliveryProvisioningService.js'
import {
  assertSecureDeliveryProvisioningApplyAuthorization,
} from '../provisioning/secureDeliveryProvisioningTarget.js'

const ACCEPTANCE_UID =
  'ses15-production-acceptance-v1'
const ACCEPTANCE_STUDENT_ID =
  'ses15-production-acceptance-student-v1'
const STUDENT_ORIGIN =
  'https://st-student-app.onrender.com'

function enabled(value) {
  return (
    String(value ?? '')
      .trim()
      .toLowerCase() === 'true'
  )
}

function safeWrite(
  write,
  outcome,
  detail = {},
) {
  write(
    JSON.stringify({
      event:
        'secure_delivery_production_acceptance',
      outcome,
      ...detail,
    }),
  )
}

function addSecond(timestamp) {
  const value = Date.parse(timestamp)
  if (!Number.isFinite(value)) {
    throw new Error(
      'secure-delivery-production-acceptance-timestamp-invalid',
    )
  }
  return new Date(
    value + 1000,
  ).toISOString()
}

async function loadFactories() {
  const [
    adminModule,
    runtimeStoreModule,
    provisioningStoreModule,
  ] = await Promise.all([
    import(
      '../firebase/firebaseAdmin.js'
    ),
    import(
      '../firebase/firestoreSecureDeliveryStore.js'
    ),
    import(
      '../provisioning/firestoreSecureDeliveryProvisioningStore.js'
    ),
  ])

  return Object.freeze({
    createAdminServices:
      adminModule
        .createFirebaseAdminServices,
    createRuntimeStore:
      runtimeStoreModule
        .createFirestoreSecureDeliveryStore,
    createProvisioningStore:
      provisioningStoreModule
        .createFirestoreSecureDeliveryProvisioningStore,
  })
}

function assertAcceptanceEnvironment(
  env,
) {
  if (
    String(env.NODE_ENV ?? '')
      .trim()
      .toLowerCase() !==
      'production'
  ) {
    throw new Error(
      'secure-delivery-production-acceptance-requires-production',
    )
  }

  if (
    enabled(
      env
        .SECURE_DELIVERY_WRITES_ENABLED,
    )
  ) {
    throw new Error(
      'secure-delivery-production-acceptance-requires-writes-disabled',
    )
  }

  if (
    !enabled(
      env
        .SECURE_DELIVERY_PROVISIONING_PRODUCTION_AUTHORIZED,
    )
  ) {
    throw new Error(
      'secure-delivery-production-acceptance-provisioning-not-authorized',
    )
  }

  assertSecureDeliveryProvisioningApplyAuthorization({
    options: {
      apply: true,
      emulator: false,
      production: true,
    },
    env,
  })

  const projectId =
    String(
      env
        .SECURE_DELIVERY_FIREBASE_PROJECT_ID ??
        '',
    ).trim()
  const apiKey =
    String(
      env
        .SECURE_DELIVERY_FIREBASE_WEB_API_KEY ??
        '',
    ).trim()
  const timestamp =
    String(
      env
        .SECURE_DELIVERY_PRODUCTION_ACCEPTANCE_TIMESTAMP ??
        '',
    ).trim()

  if (!projectId) {
    throw new Error(
      'secure-delivery-production-acceptance-project-id-required',
    )
  }
  if (!apiKey) {
    throw new Error(
      'secure-delivery-production-acceptance-web-api-key-required',
    )
  }
  if (!timestamp) {
    throw new Error(
      'secure-delivery-production-acceptance-timestamp-required',
    )
  }

  return Object.freeze({
    projectId,
    apiKey,
    timestamp:
      new Date(
        Date.parse(timestamp),
      ).toISOString(),
    disableTimestamp:
      addSecond(timestamp),
  })
}

async function ensureAuthUser(
  auth,
) {
  try {
    await auth.getUser(
      ACCEPTANCE_UID,
    )
    return
  } catch (error) {
    if (
      error?.code !==
        'auth/user-not-found'
    ) {
      throw error
    }
  }

  await auth.createUser({
    uid: ACCEPTANCE_UID,
    disabled: false,
  })
}

async function exchangeCustomToken({
  fetchImpl,
  apiKey,
  customToken,
}) {
  const response =
    await fetchImpl(
      'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=' +
        encodeURIComponent(
          apiKey,
        ),
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json',
        },
        body: JSON.stringify({
          token: customToken,
          returnSecureToken: true,
        }),
      },
    )

  if (!response.ok) {
    throw new Error(
      'secure-delivery-production-acceptance-token-exchange-failed',
    )
  }

  const data = await response.json()
  if (
    typeof data?.idToken !==
      'string' ||
    data.idToken.length === 0
  ) {
    throw new Error(
      'secure-delivery-production-acceptance-id-token-missing',
    )
  }

  return data.idToken
}

async function studentRead({
  fetchImpl,
  port,
  idToken,
}) {
  return fetchImpl(
    'http://127.0.0.1:' +
      port +
      '/api/secure-delivery/v1/student/assignments',
    {
      method: 'GET',
      headers: {
        Authorization:
          'Bearer ' + idToken,
        Origin: STUDENT_ORIGIN,
      },
    },
  )
}

export async function runSecureDeliveryProductionAcceptance({
  env = process.env,
  port,
  factories,
  fetchImpl = fetch,
  write = console.log,
} = {}) {
  if (
    !enabled(
      env
        .SECURE_DELIVERY_PRODUCTION_ACCEPTANCE_BOOTSTRAP,
    )
  ) {
    return Object.freeze({
      ran: false,
      outcome: 'disabled',
    })
  }

  if (
    !Number.isInteger(port) ||
    port <= 0 ||
    port > 65535
  ) {
    throw new Error(
      'secure-delivery-production-acceptance-port-invalid',
    )
  }
  if (
    typeof fetchImpl !==
      'function' ||
    typeof write !==
      'function'
  ) {
    throw new TypeError(
      'secure-delivery-production-acceptance-dependency-invalid',
    )
  }

  const config =
    assertAcceptanceEnvironment(
      env,
    )
  const trustedFactories =
    factories ??
    await loadFactories()

  for (const method of [
    'createAdminServices',
    'createRuntimeStore',
    'createProvisioningStore',
  ]) {
    if (
      typeof trustedFactories[
        method
      ] !== 'function'
    ) {
      throw new TypeError(
        'secure-delivery-production-acceptance-factory-invalid',
      )
    }
  }

  const admin =
    trustedFactories
      .createAdminServices({
        emulator: false,
        projectId:
          config.projectId,
        productionAuthorized:
          true,
        appName:
          'ses15-production-acceptance',
      })

  let idToken = null
  let authorizedStatus = null
  let revokedStatus = null
  let failure = null
  let stage = 'identity_lookup'
  let provisioningService = null
  let identityMayBeActive = false

  try {
    const runtimeStore =
      trustedFactories
        .createRuntimeStore({
          firestore:
            admin.firestore,
        })
    stage = 'identity_lookup'
    const existing =
      await runtimeStore
        .getIdentityMapping(
          ACCEPTANCE_UID,
        )

    if (
      existing !== null &&
      existing !== undefined &&
      existing.active === false
    ) {
      safeWrite(
        write,
        'already_complete',
      )
      return Object.freeze({
        ran: false,
        outcome:
          'already-complete',
      })
    }

    provisioningService =
      createSecureDeliveryProvisioningService({
        store:
          trustedFactories
            .createProvisioningStore({
              firestore:
                admin.firestore,
            }),
        applyEnabled: true,
      })

    if (
      existing === null ||
      existing === undefined
    ) {
      stage = 'identity_provision'
      await provisioningService
        .execute({
          apply: true,
          commands: [
            {
              operationId:
                'ses15-production-acceptance-create-v1',
              action:
                'CREATE_IDENTITY',
              operatorId:
                'ses15-production-acceptance',
              reason:
                'SES-15 isolated production identity acceptance.',
              timestamp:
                config.timestamp,
              providerSubject:
                ACCEPTANCE_UID,
              role: 'STUDENT',
              teacherId: null,
              studentId:
                ACCEPTANCE_STUDENT_ID,
            },
          ],
        })
      identityMayBeActive = true
    } else if (
      existing.providerSubject !==
        ACCEPTANCE_UID ||
      existing.role !==
        'STUDENT' ||
      existing.studentId !==
        ACCEPTANCE_STUDENT_ID ||
      existing.active !== true
    ) {
      throw new Error(
        'secure-delivery-production-acceptance-existing-identity-conflict',
      )
    } else {
      identityMayBeActive = true
    }

    stage = 'auth_user'
    await ensureAuthUser(
      admin.auth,
    )
    stage = 'custom_token'
    const customToken =
      await admin.auth
        .createCustomToken(
          ACCEPTANCE_UID,
        )
    stage = 'token_exchange'
    idToken =
      await exchangeCustomToken({
        fetchImpl,
        apiKey:
          config.apiKey,
        customToken,
      })

    stage = 'authorized_read'
    const authorized =
      await studentRead({
        fetchImpl,
        port,
        idToken,
      })
    authorizedStatus =
      authorized.status
    if (
      authorized.status !== 200
    ) {
      throw new Error(
        'secure-delivery-production-acceptance-authorized-read-failed',
      )
    }

    const body =
      await authorized.json()
    if (
      body?.success !== true ||
      !Array.isArray(
        body?.data,
      )
    ) {
      throw new Error(
        'secure-delivery-production-acceptance-authorized-payload-invalid',
      )
    }

    stage = 'identity_disable'
    await provisioningService
      .execute({
        apply: true,
        commands: [
          {
            operationId:
              'ses15-production-acceptance-disable-v1',
            action:
              'DISABLE_IDENTITY',
            operatorId:
              'ses15-production-acceptance',
            reason:
              'SES-15 revoke/fail-closed production acceptance.',
            timestamp:
              config.disableTimestamp,
            providerSubject:
              ACCEPTANCE_UID,
          },
        ],
      })

    const revoked =
      await studentRead({
        fetchImpl,
        port,
        idToken,
      })
    revokedStatus =
      revoked.status
    const revokedBody =
      await revoked.json()

    if (
      revoked.status !== 400 ||
      revokedBody?.success !== false ||
      revokedBody?.error?.code !==
        'INVALID_REQUEST'
    ) {
      throw new Error(
        'secure-delivery-production-acceptance-revoked-response-invalid',
      )
    }

    stage = 'complete'
    safeWrite(
      write,
      'pass',
      {
        authorizedStatus,
        revokedStatus,
      },
    )

    return Object.freeze({
      ran: true,
      outcome: 'pass',
      authorizedStatus,
      revokedStatus,
    })
  } catch (error) {
    failure = error
    safeWrite(
      write,
      'failed',
      {
        stage,
      },
    )
    throw new Error(
      'secure-delivery-production-acceptance-failed',
      {
        cause: error,
      },
    )
  } finally {
    let identityCleanupFailure = null
    if (
      failure !== null &&
      identityMayBeActive &&
      provisioningService !== null
    ) {
      try {
        await provisioningService
          .execute({
            apply: true,
            commands: [
              {
                operationId:
                  'ses15-production-acceptance-failure-disable-v1',
                action:
                  'DISABLE_IDENTITY',
                operatorId:
                  'ses15-production-acceptance',
                reason:
                  'SES-15 production acceptance failure cleanup.',
                timestamp:
                  config.disableTimestamp,
                providerSubject:
                  ACCEPTANCE_UID,
              },
            ],
          })
        identityMayBeActive = false
        safeWrite(
          write,
          'failure_cleanup_pass',
          {
            stage:
              'identity_disable_cleanup',
          },
        )
      } catch (error) {
        identityCleanupFailure = error
        safeWrite(
          write,
          'failure_cleanup_failed',
          {
            stage:
              'identity_disable_cleanup',
          },
        )
      }
    }

    let cleanupFailure = null
    try {
      await admin.auth
        .deleteUser(
          ACCEPTANCE_UID,
        )
    } catch (error) {
      if (
        error?.code !==
        'auth/user-not-found'
      ) {
        cleanupFailure = error
      }
    }

    await admin.delete()

    if (
      identityCleanupFailure !== null
    ) {
      throw new Error(
        'secure-delivery-production-acceptance-failure-cleanup-failed',
        {
          cause:
            identityCleanupFailure,
        },
      )
    }

    if (
      cleanupFailure !== null &&
      failure === null
    ) {
      safeWrite(
        write,
        'cleanup_failed',
      )
      throw new Error(
        'secure-delivery-production-acceptance-cleanup-failed',
        {
          cause:
            cleanupFailure,
        },
      )
    }
  }
}
