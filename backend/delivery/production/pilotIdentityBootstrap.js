import crypto from 'node:crypto'

import {
  createSecureDeliveryProvisioningCommand,
} from '../../../src/services/secureDeliveryProvisioning.js'
import {
  normalizeRequiredTimestamp,
} from '../../../src/services/teacherDeliveryContractValidation.js'
import {
  createFirestoreSecureDeliveryProvisioningStore,
} from '../provisioning/firestoreSecureDeliveryProvisioningStore.js'
import {
  createSecureDeliveryProvisioningService,
} from '../provisioning/secureDeliveryProvisioningService.js'

const SUBJECT_HASH_PATTERN =
  /^[a-f0-9]{64}$/u

function enabled(value) {
  return (
    String(value ?? '')
      .trim()
      .toLowerCase() === 'true'
  )
}

function subjectHash(value) {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new TypeError(
      'verified Firebase subject must be non-empty text.',
    )
  }

  return crypto
    .createHash('sha256')
    .update(value.trim(), 'utf8')
    .digest('hex')
}

function parseSubjectHashes(value) {
  const entries =
    String(value ?? '')
      .split(',')
      .map((entry) =>
        entry.trim().toLowerCase(),
      )
      .filter(Boolean)

  const output = new Set()

  for (const entry of entries) {
    if (
      !SUBJECT_HASH_PATTERN.test(
        entry,
      )
    ) {
      throw new TypeError(
        'pilot bootstrap allowlist must contain SHA-256 hex hashes.',
      )
    }
    output.add(entry)
  }

  return output
}

function defaultProvisioningService({
  firestore,
}) {
  return createSecureDeliveryProvisioningService({
    store:
      createFirestoreSecureDeliveryProvisioningStore({
        firestore,
      }),
    applyEnabled: true,
  })
}

function noopResult(result) {
  return Object.freeze({
    matched: false,
    action: 'NOOP',
    result,
  })
}

function safeWrite(
  write,
  action,
  result,
) {
  try {
    write(
      JSON.stringify({
        event:
          'secure_delivery_identity_bootstrap',
        action,
        result,
      }),
    )
  } catch {
    // Acceptance observability must never change authorization behavior.
  }
}

export function createPilotIdentityBootstrap({
  env = process.env,
  firestore,
  createProvisioningService =
    defaultProvisioningService,
  write = console.log,
} = {}) {
  if (!env || typeof env !== 'object') {
    throw new TypeError(
      'pilot bootstrap environment is required.',
    )
  }

  const createEnabled =
    enabled(
      env
        .SECURE_DELIVERY_PILOT_IDENTITY_BOOTSTRAP_CREATE,
    )
  const disableEnabled =
    enabled(
      env
        .SECURE_DELIVERY_PILOT_IDENTITY_BOOTSTRAP_DISABLE,
    )

  if (
    createEnabled &&
    disableEnabled
  ) {
    throw new Error(
      'pilot identity bootstrap create/disable gates are mutually exclusive.',
    )
  }

  if (
    !createEnabled &&
    !disableEnabled
  ) {
    return Object.freeze({
      active: false,
      mode: 'OFF',
      async syncVerifiedSubject() {
        return noopResult(
          'BOOTSTRAP_DISABLED',
        )
      },
    })
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
    !enabled(
      env
        .SECURE_DELIVERY_PROVISIONING_PRODUCTION_APPLY,
    )
  ) {
    throw new Error(
      'secure-delivery-production-apply-disabled-by-safety-gate',
    )
  }

  const timestamp =
    normalizeRequiredTimestamp(
      env
        .SECURE_DELIVERY_PILOT_IDENTITY_BOOTSTRAP_TIMESTAMP,
      'pilotIdentityBootstrapTimestamp',
    )

  const allowedHashes =
    parseSubjectHashes(
      env
        .STUDENT08_PILOT_ALLOWED_PROVIDER_SUBJECT_HASHES,
    )

  if (allowedHashes.size === 0) {
    throw new Error(
      'pilot identity bootstrap requires the existing SES-8 allowlist.',
    )
  }

  if (
    typeof createProvisioningService !==
      'function'
  ) {
    throw new TypeError(
      'createProvisioningService must be a function.',
    )
  }

  if (typeof write !== 'function') {
    throw new TypeError(
      'pilot bootstrap writer must be a function.',
    )
  }

  const provisioning =
    createProvisioningService({
      firestore,
    })

  if (
    !provisioning ||
    typeof provisioning.execute !==
      'function'
  ) {
    throw new TypeError(
      'pilot bootstrap provisioning service must provide execute().',
    )
  }

  const mode =
    createEnabled
      ? 'CREATE_IDENTITY'
      : 'DISABLE_IDENTITY'

  async function syncVerifiedSubject(
    providerSubject,
  ) {
    const subject =
      String(
        providerSubject ?? '',
      ).trim()

    const digest =
      subjectHash(subject)

    if (
      !allowedHashes.has(digest)
    ) {
      return noopResult(
        'NOT_ALLOWLISTED',
      )
    }

    const suffix =
      digest.slice(0, 16)

    const command =
      createSecureDeliveryProvisioningCommand(
        mode === 'CREATE_IDENTITY'
          ? {
              operationId:
                'ses15-create-identity-' +
                suffix,
              action:
                'CREATE_IDENTITY',
              operatorId:
                'ses15-production-bootstrap',
              reason:
                'SES-15 production acceptance migration from the approved SES-8 pilot identity.',
              timestamp,
              providerSubject:
                subject,
              role: 'STUDENT',
              teacherId: null,
              studentId:
                'pilot-student-' +
                suffix,
            }
          : {
              operationId:
                'ses15-disable-identity-' +
                suffix,
              action:
                'DISABLE_IDENTITY',
              operatorId:
                'ses15-production-bootstrap',
              reason:
                'SES-15 production acceptance revoke verification.',
              timestamp,
              providerSubject:
                subject,
            },
      )

    const response =
      await provisioning.execute({
        commands: [command],
        apply: true,
      })

    const operation =
      response?.operations?.[0]

    const result =
      typeof operation?.result ===
        'string'
        ? operation.result
        : 'UNKNOWN'

    safeWrite(
      write,
      mode,
      result,
    )

    return Object.freeze({
      matched: true,
      action: mode,
      result,
    })
  }

  return Object.freeze({
    active: true,
    mode,
    syncVerifiedSubject,
  })
}

export function wrapTokenVerifierWithPilotIdentityBootstrap({
  tokenVerifier,
  bootstrap,
} = {}) {
  if (
    !tokenVerifier ||
    typeof tokenVerifier.verifyIdToken !==
      'function'
  ) {
    throw new TypeError(
      'tokenVerifier must provide verifyIdToken().',
    )
  }

  if (
    !bootstrap ||
    typeof bootstrap.syncVerifiedSubject !==
      'function'
  ) {
    throw new TypeError(
      'bootstrap must provide syncVerifiedSubject().',
    )
  }

  return Object.freeze({
    async verifyIdToken(token) {
      const decoded =
        await tokenVerifier
          .verifyIdToken(token)

      if (
        !decoded ||
        typeof decoded.uid !== 'string' ||
        decoded.uid.trim().length === 0
      ) {
        throw new Error(
          'firebase-token-uid-missing',
        )
      }

      await bootstrap
        .syncVerifiedSubject(
          decoded.uid.trim(),
        )

      return decoded
    },
  })
}
