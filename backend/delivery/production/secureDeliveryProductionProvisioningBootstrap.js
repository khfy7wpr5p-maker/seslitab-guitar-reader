import {
  createSecureDeliveryProvisioningService,
} from '../provisioning/secureDeliveryProvisioningService.js'
import {
  assertSecureDeliveryProvisioningApplyAuthorization,
} from '../provisioning/secureDeliveryProvisioningTarget.js'

const EVENT =
  'secure_delivery_production_provisioning_bootstrap'
const OPERATOR_ID =
  'ses15-real-student-bootstrap'
const REASON =
  'SES-15 approved real Student identity bootstrap.'

function enabled(value) {
  return (
    String(value ?? '')
      .trim()
      .toLowerCase() === 'true'
  )
}

function requiredText(value, label) {
  const normalized =
    String(value ?? '').trim()
  if (normalized.length === 0) {
    throw new Error(
      'secure-delivery-production-provisioning-' +
        label +
        '-required',
    )
  }
  return normalized
}

function modeOf(env) {
  const raw =
    String(
      env
        .SECURE_DELIVERY_PRODUCTION_PROVISIONING_BOOTSTRAP ??
        '',
    )
      .trim()
      .toLowerCase()

  if (
    raw === '' ||
    raw === 'false' ||
    raw === 'disabled'
  ) {
    return null
  }
  if (
    raw === 'dry-run' ||
    raw === 'apply'
  ) {
    return raw
  }
  throw new Error(
    'secure-delivery-production-provisioning-bootstrap-mode-invalid',
  )
}

function timestampOf(value) {
  const text = requiredText(
    value,
    'timestamp',
  )
  const parsed = Date.parse(text)
  if (!Number.isFinite(parsed)) {
    throw new Error(
      'secure-delivery-production-provisioning-timestamp-invalid',
    )
  }
  return new Date(parsed).toISOString()
}

function assertEnvironment(env, mode) {
  if (
    String(env.NODE_ENV ?? '')
      .trim()
      .toLowerCase() !== 'production'
  ) {
    throw new Error(
      'secure-delivery-production-provisioning-requires-production',
    )
  }

  if (
    enabled(
      env
        .SECURE_DELIVERY_WRITES_ENABLED,
    )
  ) {
    throw new Error(
      'secure-delivery-production-provisioning-requires-writes-disabled',
    )
  }

  if (
    !enabled(
      env
        .SECURE_DELIVERY_PROVISIONING_PRODUCTION_AUTHORIZED,
    )
  ) {
    throw new Error(
      'secure-delivery-production-provisioning-not-authorized-by-gate',
    )
  }

  const apply = mode === 'apply'
  const applyEnabled =
    assertSecureDeliveryProvisioningApplyAuthorization({
      options: {
        apply,
        emulator: false,
        production: true,
      },
      env,
    })

  return Object.freeze({
    apply,
    applyEnabled,
    projectId: requiredText(
      env
        .SECURE_DELIVERY_FIREBASE_PROJECT_ID,
      'project-id',
    ),
    providerSubject: requiredText(
      env
        .SECURE_DELIVERY_PRODUCTION_PROVISIONING_PROVIDER_SUBJECT,
      'provider-subject',
    ),
    studentId: requiredText(
      env
        .SECURE_DELIVERY_PRODUCTION_PROVISIONING_STUDENT_ID,
      'student-id',
    ),
    operationId: requiredText(
      env
        .SECURE_DELIVERY_PRODUCTION_PROVISIONING_OPERATION_ID,
      'operation-id',
    ),
    timestamp: timestampOf(
      env
        .SECURE_DELIVERY_PRODUCTION_PROVISIONING_TIMESTAMP,
    ),
  })
}

async function loadFactories() {
  const [
    adminModule,
    provisioningStoreModule,
    runtimeStoreModule,
  ] = await Promise.all([
    import('../firebase/firebaseAdmin.js'),
    import(
      '../provisioning/firestoreSecureDeliveryProvisioningStore.js'
    ),
    import(
      '../firebase/firestoreSecureDeliveryStore.js'
    ),
  ])

  return Object.freeze({
    createAdminServices:
      adminModule
        .createFirebaseAdminServices,
    createProvisioningStore:
      provisioningStoreModule
        .createFirestoreSecureDeliveryProvisioningStore,
    createRuntimeStore:
      runtimeStoreModule
        .createFirestoreSecureDeliveryStore,
  })
}

function assertFactories(factories) {
  for (const method of [
    'createAdminServices',
    'createProvisioningStore',
    'createRuntimeStore',
  ]) {
    if (
      !factories ||
      typeof factories[method] !==
        'function'
    ) {
      throw new TypeError(
        'secure-delivery-production-provisioning-factory-invalid',
      )
    }
  }
  return factories
}

function safeWrite(
  write,
  outcome,
  detail = {},
) {
  write(
    JSON.stringify({
      event: EVENT,
      outcome,
      ...detail,
    }),
  )
}

function commandFor(config) {
  return Object.freeze({
    operationId:
      config.operationId,
    action: 'CREATE_IDENTITY',
    operatorId: OPERATOR_ID,
    reason: REASON,
    timestamp: config.timestamp,
    providerSubject:
      config.providerSubject,
    role: 'STUDENT',
    teacherId: null,
    studentId: config.studentId,
  })
}

function assertOperation(
  operation,
  operationId,
) {
  if (
    !operation ||
    operation.operationId !==
      operationId ||
    operation.action !==
      'CREATE_IDENTITY' ||
    typeof operation.result !==
      'string'
  ) {
    throw new Error(
      'secure-delivery-production-provisioning-operation-invalid',
    )
  }
  return operation
}

function assertMapping(
  mapping,
  config,
) {
  if (
    !mapping ||
    mapping.providerSubject !==
      config.providerSubject ||
    mapping.role !== 'STUDENT' ||
    mapping.teacherId !== null ||
    mapping.studentId !==
      config.studentId ||
    mapping.active !== true ||
    mapping.disabledAt !== null
  ) {
    throw new Error(
      'secure-delivery-production-provisioning-mapping-verification-failed',
    )
  }
}

function assertAudit(
  audit,
  config,
) {
  if (
    !audit ||
    audit.operationId !==
      config.operationId ||
    audit.action !==
      'CREATE_IDENTITY' ||
    audit.providerSubject !==
      config.providerSubject ||
    audit.stableIdentity !==
      'STUDENT:' +
        config.studentId
  ) {
    throw new Error(
      'secure-delivery-production-provisioning-audit-verification-failed',
    )
  }
}

export async function runSecureDeliveryProductionProvisioningBootstrap({
  env = process.env,
  factories,
  write = console.log,
} = {}) {
  const mode = modeOf(env)
  if (mode === null) {
    return Object.freeze({
      ran: false,
      outcome: 'disabled',
    })
  }

  if (typeof write !== 'function') {
    throw new TypeError(
      'secure-delivery-production-provisioning-write-invalid',
    )
  }

  const config =
    assertEnvironment(
      env,
      mode,
    )
  const trustedFactories =
    assertFactories(
      factories ??
        await loadFactories(),
    )

  const admin =
    trustedFactories
      .createAdminServices({
        emulator: false,
        projectId:
          config.projectId,
        productionAuthorized: true,
        appName:
          'ses15-real-student-provisioning-bootstrap',
      })

  let stage = 'stores'

  try {
    const provisioningStore =
      trustedFactories
        .createProvisioningStore({
          firestore:
            admin.firestore,
        })
    const runtimeStore =
      trustedFactories
        .createRuntimeStore({
          firestore:
            admin.firestore,
        })
    const service =
      createSecureDeliveryProvisioningService({
        store: provisioningStore,
        applyEnabled:
          config.applyEnabled,
      })
    const command =
      commandFor(config)

    stage = 'execute'
    const execution =
      await service.execute({
        commands: [command],
        apply: config.apply,
      })
    const operation =
      assertOperation(
        execution.operations?.[0],
        config.operationId,
      )

    if (!config.apply) {
      safeWrite(
        write,
        'pass',
        {
          mode: 'DRY_RUN',
          operationResult:
            operation.result,
        },
      )
      return Object.freeze({
        ran: true,
        outcome: 'pass',
        mode: 'DRY_RUN',
        operationResult:
          operation.result,
      })
    }

    stage = 'mapping_verification'
    assertMapping(
      await runtimeStore
        .getIdentityMapping(
          config.providerSubject,
        ),
      config,
    )

    stage = 'audit_verification'
    assertAudit(
      await provisioningStore
        .getProvisioningAudit(
          config.operationId,
        ),
      config,
    )

    stage = 'replay_verification'
    const replay =
      await service.execute({
        commands: [command],
        apply: false,
      })
    const replayOperation =
      assertOperation(
        replay.operations?.[0],
        config.operationId,
      )
    if (
      replayOperation.result !==
        'IDEMPOTENT_REPLAY'
    ) {
      throw new Error(
        'secure-delivery-production-provisioning-replay-verification-failed',
      )
    }

    safeWrite(
      write,
      'pass',
      {
        mode: 'APPLIED',
        operationResult:
          operation.result,
        verification:
          'IDEMPOTENT_REPLAY',
      },
    )

    return Object.freeze({
      ran: true,
      outcome: 'pass',
      mode: 'APPLIED',
      operationResult:
        operation.result,
      verification:
        'IDEMPOTENT_REPLAY',
    })
  } catch (error) {
    safeWrite(
      write,
      'failed',
      { stage },
    )
    throw new Error(
      'secure-delivery-production-provisioning-bootstrap-failed',
      { cause: error },
    )
  } finally {
    await admin.delete()
  }
}
