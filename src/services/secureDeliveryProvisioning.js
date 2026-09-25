import {
  assertStrictInputObject,
  normalizeRequiredId,
  normalizeRequiredText,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'
import {
  SECURE_DELIVERY_ROLE,
} from './secureDeliveryIdentity.js'

export const SECURE_DELIVERY_PROVISIONING_SCHEMA_VERSION = 1

export const SECURE_DELIVERY_PROVISIONING_ACTION =
  Object.freeze({
    CREATE_IDENTITY: 'CREATE_IDENTITY',
    DISABLE_IDENTITY: 'DISABLE_IDENTITY',
    CREATE_GRANT: 'CREATE_GRANT',
    REVOKE_GRANT: 'REVOKE_GRANT',
    REGRANT: 'REGRANT',
  })

const COMMON_FIELDS = Object.freeze([
  'operationId',
  'action',
  'operatorId',
  'reason',
  'timestamp',
])

const IDENTITY_FIELDS = Object.freeze([
  ...COMMON_FIELDS,
  'providerSubject',
  'role',
  'teacherId',
  'studentId',
])

const DISABLE_FIELDS = Object.freeze([
  ...COMMON_FIELDS,
  'providerSubject',
])

const GRANT_FIELDS = Object.freeze([
  ...COMMON_FIELDS,
  'teacherId',
  'studentId',
])

const MAX_REASON_LENGTH = 500

function common(input) {
  return {
    operationId: normalizeRequiredId(
      input.operationId,
      'operationId',
    ),
    action: input.action,
    operatorId: normalizeRequiredId(
      input.operatorId,
      'operatorId',
    ),
    reason: normalizeRequiredText(
      input.reason,
      'reason',
      MAX_REASON_LENGTH,
    ),
    timestamp: normalizeRequiredTimestamp(
      input.timestamp,
      'timestamp',
    ),
  }
}

function nullableIdentityId(
  value,
  fieldName,
) {
  if (value === null || value === undefined) {
    return null
  }
  return normalizeRequiredId(value, fieldName)
}

function createIdentityCommand(input) {
  assertStrictInputObject(
    input,
    IDENTITY_FIELDS,
    'SecureDeliveryProvisioningCommand',
  )

  if (
    !Object.values(
      SECURE_DELIVERY_ROLE,
    ).includes(input.role)
  ) {
    throw new TypeError(
      'role must be TEACHER or STUDENT.',
    )
  }

  const teacherId = nullableIdentityId(
    input.teacherId,
    'teacherId',
  )
  const studentId = nullableIdentityId(
    input.studentId,
    'studentId',
  )

  if (
    (
      input.role ===
        SECURE_DELIVERY_ROLE.TEACHER &&
      (
        teacherId === null ||
        studentId !== null
      )
    ) ||
    (
      input.role ===
        SECURE_DELIVERY_ROLE.STUDENT &&
      (
        studentId === null ||
        teacherId !== null
      )
    )
  ) {
    throw new Error(
      'role identity fields are inconsistent.',
    )
  }

  return Object.freeze({
    schemaVersion:
      SECURE_DELIVERY_PROVISIONING_SCHEMA_VERSION,
    ...common(input),
    providerSubject: normalizeRequiredId(
      input.providerSubject,
      'providerSubject',
    ),
    role: input.role,
    teacherId,
    studentId,
  })
}

function createDisableCommand(input) {
  assertStrictInputObject(
    input,
    DISABLE_FIELDS,
    'SecureDeliveryProvisioningCommand',
  )

  return Object.freeze({
    schemaVersion:
      SECURE_DELIVERY_PROVISIONING_SCHEMA_VERSION,
    ...common(input),
    providerSubject: normalizeRequiredId(
      input.providerSubject,
      'providerSubject',
    ),
  })
}

function createGrantCommand(input) {
  assertStrictInputObject(
    input,
    GRANT_FIELDS,
    'SecureDeliveryProvisioningCommand',
  )

  return Object.freeze({
    schemaVersion:
      SECURE_DELIVERY_PROVISIONING_SCHEMA_VERSION,
    ...common(input),
    teacherId: normalizeRequiredId(
      input.teacherId,
      'teacherId',
    ),
    studentId: normalizeRequiredId(
      input.studentId,
      'studentId',
    ),
  })
}

export function createSecureDeliveryProvisioningCommand(
  input = {},
) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input)
  ) {
    throw new TypeError(
      'SecureDeliveryProvisioningCommand input must be a plain object.',
    )
  }

  switch (input.action) {
    case SECURE_DELIVERY_PROVISIONING_ACTION.CREATE_IDENTITY:
      return createIdentityCommand(input)

    case SECURE_DELIVERY_PROVISIONING_ACTION.DISABLE_IDENTITY:
      return createDisableCommand(input)

    case SECURE_DELIVERY_PROVISIONING_ACTION.CREATE_GRANT:
    case SECURE_DELIVERY_PROVISIONING_ACTION.REVOKE_GRANT:
    case SECURE_DELIVERY_PROVISIONING_ACTION.REGRANT:
      return createGrantCommand(input)

    default:
      throw new TypeError(
        'unsupported secure delivery provisioning action.',
      )
  }
}

export function isSecureDeliveryProvisioningCommand(
  value,
) {
  if (
    !value ||
    typeof value !== 'object' ||
    !Object.isFrozen(value) ||
    value.schemaVersion !==
      SECURE_DELIVERY_PROVISIONING_SCHEMA_VERSION
  ) {
    return false
  }

  try {
    const {
      schemaVersion: _schemaVersion,
      ...input
    } = value
    const restored =
      createSecureDeliveryProvisioningCommand(
        input,
      )
    return (
      JSON.stringify(restored) ===
      JSON.stringify(value)
    )
  } catch {
    return false
  }
}

export function getProvisioningDomainIdentity(
  commandOrMapping,
) {
  const role = commandOrMapping?.role
  if (
    role === SECURE_DELIVERY_ROLE.TEACHER
  ) {
    return Object.freeze({
      role,
      stableId: normalizeRequiredId(
        commandOrMapping.teacherId,
        'teacherId',
      ),
    })
  }
  if (
    role === SECURE_DELIVERY_ROLE.STUDENT
  ) {
    return Object.freeze({
      role,
      stableId: normalizeRequiredId(
        commandOrMapping.studentId,
        'studentId',
      ),
    })
  }
  throw new TypeError(
    'domain identity role must be TEACHER or STUDENT.',
  )
}
