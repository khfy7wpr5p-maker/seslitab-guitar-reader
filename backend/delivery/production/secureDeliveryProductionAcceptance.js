import {
  createSecureDeliveryProvisioningService,
} from '../provisioning/secureDeliveryProvisioningService.js'
import {
  assertSecureDeliveryProvisioningApplyAuthorization,
} from '../provisioning/secureDeliveryProvisioningTarget.js'

const DEFAULT_ACCEPTANCE_RUN_ID =
  'v1'
const STUDENT_ORIGIN =
  'https://st-student-app.onrender.com'

function enabled(value) {
  return (
    String(value ?? '')
      .trim()
      .toLowerCase() === 'true'
  )
}

function classifyCustomTokenSigningFailure(error) {
  const code =
    String(
      error?.code ?? '',
    )
      .trim()
      .toLowerCase()
  const message =
    String(
      error?.message ?? '',
    )
      .trim()
      .toLowerCase()

  if (
    code ===
      'auth/insufficient-permission' ||
    message.includes(
      'iam.serviceaccounts.signblob',
    )
  ) {
    return 'signing_permission_denied'
  }

  if (
    message.includes(
      'failed to determine service account id',
    )
  ) {
    return 'service_account_identity_unavailable'
  }

  if (
    message.includes(
      'private key',
    ) ||
    message.includes(
      'pem',
    )
  ) {
    return 'private_key_unusable'
  }

  if (
    code ===
    'auth/invalid-credential'
  ) {
    return 'credential_invalid_for_signing'
  }

  return 'signing_error_unclassified'
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

function acceptanceIdentity(
  runId,
) {
  if (
    !/^[a-z0-9][a-z0-9-]{0,31}$/u.test(
      runId,
    )
  ) {
    throw new Error(
      'secure-delivery-production-acceptance-run-id-invalid',
    )
  }

  return Object.freeze({
    uid:
      'ses15-production-acceptance-' +
      runId,
    studentId:
      'ses15-production-acceptance-student-' +
      runId,
    createOperationId:
      'ses15-production-acceptance-create-' +
      runId,
    disableOperationId:
      'ses15-production-acceptance-disable-' +
      runId,
    failureDisableOperationId:
      'ses15-production-acceptance-failure-disable-' +
      runId,
  })
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
  const runId =
    String(
      env
        .SECURE_DELIVERY_PRODUCTION_ACCEPTANCE_RUN_ID ??
        DEFAULT_ACCEPTANCE_RUN_ID,
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
    ...acceptanceIdentity(
      runId,
    ),
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
  uid,
) {
  try {
    await auth.getUser(
      uid,
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
    uid,
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
        localServiceAccountSigning:
          true,
        appName:
          'ses15-production-acceptance',
      })

  let idToken = null
  let authorizedStatus = null
  let revokedStatus = null
  let failure = null
  let stage = 'identity_lookup'
  let runtimeStore = null
  let provisioningService = null
  let identityMayBeActive = false

  try {
    runtimeStore =
      trustedFactories
        .createRuntimeStore({
          firestore:
            admin.firestore,
        })
    stage = 'identity_lookup'
    const existing =
      await runtimeStore
        .getIdentityMapping(
          config.uid,
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
                config.createOperationId,
              action:
                'CREATE_IDENTITY',
              operatorId:
                'ses15-production-acceptance',
              reason:
                'SES-15 isolated production identity acceptance.',
              timestamp:
                config.timestamp,
              providerSubject:
                config.uid,
              role: 'STUDENT',
              teacherId: null,
              studentId:
                config.studentId,
            },
          ],
        })
      identityMayBeActive = true
    } else if (
      existing.providerSubject !==
        config.uid ||
      existing.role !==
        'STUDENT' ||
      existing.studentId !==
        config.studentId ||
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
      config.uid,
    )
    stage = 'custom_token'
    const customToken =
      await admin.auth
        .createCustomToken(
          config.uid,
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
              config.disableOperationId,
            action:
              'DISABLE_IDENTITY',
            operatorId:
              'ses15-production-acceptance',
            reason:
              'SES-15 revoke/fail-closed production acceptance.',
            timestamp:
              config.disableTimestamp,
            providerSubject:
              config.uid,
          },
        ],
      })
    identityMayBeActive = false

    stage = 'revoked_read'
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
      stage === 'custom_token'
        ? {
            stage,
            reason:
              classifyCustomTokenSigningFailure(
                error,
              ),
          }
        : {
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
      !identityMayBeActive &&
      stage === 'identity_provision' &&
      runtimeStore !== null &&
      provisioningService !== null
    ) {
      try {
        const possibleMapping =
          await runtimeStore
            .getIdentityMapping(
              config.uid,
            )

        if (
          possibleMapping !== null &&
          possibleMapping !== undefined
        ) {
          const isExpectedIdentity =
            possibleMapping
              .providerSubject ===
              config.uid &&
            possibleMapping.role ===
              'STUDENT' &&
            possibleMapping.teacherId ===
              null &&
            possibleMapping.studentId ===
              config.studentId

          if (!isExpectedIdentity) {
            throw new Error(
              'secure-delivery-production-acceptance-failure-cleanup-identity-conflict',
            )
          }

          if (
            possibleMapping.active ===
              true &&
            possibleMapping.disabledAt ===
              null
          ) {
            identityMayBeActive = true
          } else if (
            possibleMapping.active !==
              false ||
            possibleMapping.disabledAt ===
              null
          ) {
            throw new Error(
              'secure-delivery-production-acceptance-failure-cleanup-identity-state-invalid',
            )
          }
        }
      } catch (error) {
        identityCleanupFailure = error
        safeWrite(
          write,
          'failure_cleanup_failed',
          {
            stage:
              'identity_lookup_cleanup',
          },
        )
      }
    }

    if (
      failure !== null &&
      identityMayBeActive &&
      provisioningService !== null &&
      identityCleanupFailure === null
    ) {
      try {
        await provisioningService
          .execute({
            apply: true,
            commands: [
              {
                operationId:
                  config.failureDisableOperationId,
                action:
                  'DISABLE_IDENTITY',
                operatorId:
                  'ses15-production-acceptance',
                reason:
                  'SES-15 production acceptance failure cleanup.',
                timestamp:
                  config.disableTimestamp,
                providerSubject:
                  config.uid,
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
          config.uid,
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
