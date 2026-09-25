import {
  createHash,
} from 'node:crypto'

import {
  createSecureDeliveryIdentityMapping,
  isSecureDeliveryIdentityMapping,
  SECURE_DELIVERY_ROLE,
} from '../../../src/services/secureDeliveryIdentity.js'
import {
  createTeacherStudentGrant,
  isTeacherStudentGrant,
} from '../../../src/services/teacherStudentGrant.js'
import {
  getProvisioningDomainIdentity,
  isSecureDeliveryProvisioningCommand,
  SECURE_DELIVERY_PROVISIONING_ACTION,
} from '../../../src/services/secureDeliveryProvisioning.js'
import {
  normalizeRequiredId,
} from '../../../src/services/teacherDeliveryContractValidation.js'

export const SECURE_DELIVERY_PROVISIONING_AUDIT_SCHEMA_VERSION = 1

function hashJson(value) {
  return createHash('sha256')
    .update(
      JSON.stringify(
        value === undefined ? null : value,
      ),
      'utf8',
    )
    .digest('hex')
}

function exact(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function provisioningDomainBindingKey(
  role,
  stableId,
) {
  if (
    role !== SECURE_DELIVERY_ROLE.TEACHER &&
    role !== SECURE_DELIVERY_ROLE.STUDENT
  ) {
    throw new TypeError(
      'provisioning domain role must be TEACHER or STUDENT.',
    )
  }
  return (
    role +
    '\u0001' +
    normalizeRequiredId(
      stableId,
      'stableId',
    )
  )
}

export function provisioningGrantKey(
  teacherId,
  studentId,
) {
  return (
    normalizeRequiredId(
      teacherId,
      'teacherId',
    ) +
    '\u0001' +
    normalizeRequiredId(
      studentId,
      'studentId',
    )
  )
}

function mappingDomainIdentity(mapping) {
  return getProvisioningDomainIdentity(
    mapping,
  )
}

function mappingDomainKey(mapping) {
  const identity =
    mappingDomainIdentity(mapping)
  return provisioningDomainBindingKey(
    identity.role,
    identity.stableId,
  )
}

function commandFingerprint(command) {
  return hashJson(command)
}

function assertState(state) {
  if (
    !state ||
    typeof state !== 'object'
  ) {
    throw new TypeError(
      'provisioning state is required.',
    )
  }

  for (const field of [
    'identities',
    'bindings',
    'grants',
    'audits',
  ]) {
    if (!(state[field] instanceof Map)) {
      throw new TypeError(
        `provisioning state ${field} must be a Map.`,
      )
    }
  }
  return state
}

export function cloneProvisioningState(
  state,
) {
  assertState(state)
  return {
    identities: new Map(state.identities),
    bindings: new Map(state.bindings),
    grants: new Map(state.grants),
    audits: new Map(state.audits),
  }
}

function bindingRecord({
  role,
  stableId,
  providerSubject,
}) {
  return Object.freeze({
    role,
    stableId,
    providerSubject,
  })
}

function assertMappingMatchesBinding(
  mapping,
  binding,
) {
  if (
    !isSecureDeliveryIdentityMapping(
      mapping,
    )
  ) {
    throw new Error(
      'secure-delivery-provisioning-identity-invalid',
    )
  }

  const identity =
    mappingDomainIdentity(mapping)

  if (
    identity.role !== binding.role ||
    identity.stableId !==
      binding.stableId ||
    mapping.providerSubject !==
      binding.providerSubject
  ) {
    throw new Error(
      'secure-delivery-provisioning-domain-binding-conflict',
    )
  }
}

function requireActiveDomainIdentity(
  state,
  role,
  stableId,
) {
  const key =
    provisioningDomainBindingKey(
      role,
      stableId,
    )
  const binding =
    state.bindings.get(key) ?? null

  if (binding === null) {
    throw new Error(
      'secure-delivery-provisioning-domain-binding-missing',
    )
  }

  const mapping =
    state.identities.get(
      binding.providerSubject,
    ) ?? null

  if (mapping === null) {
    throw new Error(
      'secure-delivery-provisioning-identity-mapping-missing',
    )
  }

  assertMappingMatchesBinding(
    mapping,
    binding,
  )

  if (
    !mapping.active ||
    mapping.disabledAt !== null
  ) {
    throw new Error(
      'secure-delivery-provisioning-identity-disabled',
    )
  }

  return mapping
}

function identitySnapshot(
  state,
  providerSubject,
  domainKey,
) {
  return Object.freeze({
    mapping:
      state.identities.get(
        providerSubject,
      ) ?? null,
    binding:
      domainKey === null
        ? null
        : state.bindings.get(
            domainKey,
          ) ?? null,
  })
}

function grantSnapshot(
  state,
  teacherId,
  studentId,
) {
  return (
    state.grants.get(
      provisioningGrantKey(
        teacherId,
        studentId,
      ),
    ) ?? null
  )
}

function targetMetadata(
  command,
  beforeState,
  afterState,
) {
  if (
    command.action ===
      SECURE_DELIVERY_PROVISIONING_ACTION.CREATE_IDENTITY
  ) {
    const identity =
      getProvisioningDomainIdentity(
        command,
      )
    return {
      targetType: 'IDENTITY',
      stableIdentity:
        identity.role +
        ':' +
        identity.stableId,
      providerSubject:
        command.providerSubject,
    }
  }

  if (
    command.action ===
      SECURE_DELIVERY_PROVISIONING_ACTION.DISABLE_IDENTITY
  ) {
    const mapping =
      afterState?.mapping ??
      beforeState?.mapping
    const identity =
      mappingDomainIdentity(mapping)
    return {
      targetType: 'IDENTITY',
      stableIdentity:
        identity.role +
        ':' +
        identity.stableId,
      providerSubject:
        command.providerSubject,
    }
  }

  return {
    targetType: 'GRANT',
    stableIdentity:
      'TEACHER:' +
      command.teacherId +
      '->STUDENT:' +
      command.studentId,
    providerSubject: null,
  }
}

function createAudit({
  command,
  beforeState,
  afterState,
  result,
}) {
  const target =
    targetMetadata(
      command,
      beforeState,
      afterState,
    )

  return Object.freeze({
    schemaVersion:
      SECURE_DELIVERY_PROVISIONING_AUDIT_SCHEMA_VERSION,
    operationId: command.operationId,
    action: command.action,
    targetType: target.targetType,
    stableIdentity:
      target.stableIdentity,
    providerSubject:
      target.providerSubject,
    operatorId: command.operatorId,
    reason: command.reason,
    timestamp: command.timestamp,
    commandFingerprint:
      commandFingerprint(command),
    beforeFingerprint:
      hashJson(beforeState),
    afterFingerprint:
      hashJson(afterState),
    result,
  })
}

function operationResult(
  command,
  result,
) {
  return Object.freeze({
    operationId: command.operationId,
    action: command.action,
    result,
  })
}

function applyCreateIdentity(
  state,
  command,
) {
  const identity =
    getProvisioningDomainIdentity(
      command,
    )
  const domainKey =
    provisioningDomainBindingKey(
      identity.role,
      identity.stableId,
    )
  const before =
    identitySnapshot(
      state,
      command.providerSubject,
      domainKey,
    )
  const existingMapping =
    before.mapping
  const existingBinding =
    before.binding

  for (
    const candidate
    of state.identities.values()
  ) {
    if (
      candidate.providerSubject ===
        command.providerSubject
    ) {
      continue
    }

    const candidateIdentity =
      mappingDomainIdentity(
        candidate,
      )
    if (
      candidateIdentity.role ===
        identity.role &&
      candidateIdentity.stableId ===
        identity.stableId
    ) {
      throw new Error(
        'secure-delivery-provisioning-domain-binding-conflict',
      )
    }
  }

  if (existingMapping !== null) {
    const existingIdentity =
      mappingDomainIdentity(
        existingMapping,
      )

    if (
      existingIdentity.role !==
        identity.role ||
      existingIdentity.stableId !==
        identity.stableId
    ) {
      throw new Error(
        'secure-delivery-provisioning-provider-identity-conflict',
      )
    }

    if (
      !existingMapping.active ||
      existingMapping.disabledAt !==
        null
    ) {
      throw new Error(
        'secure-delivery-provisioning-disabled-identity-cannot-be-recreated',
      )
    }
  }

  if (
    existingBinding !== null &&
    existingBinding.providerSubject !==
      command.providerSubject
  ) {
    throw new Error(
      'secure-delivery-provisioning-domain-binding-conflict',
    )
  }

  let changed = false

  if (existingMapping === null) {
    state.identities.set(
      command.providerSubject,
      createSecureDeliveryIdentityMapping({
        providerSubject:
          command.providerSubject,
        role: command.role,
        teacherId:
          command.teacherId,
        studentId:
          command.studentId,
        active: true,
        createdAt: command.timestamp,
        disabledAt: null,
      }),
    )
    changed = true
  }

  if (existingBinding === null) {
    state.bindings.set(
      domainKey,
      bindingRecord({
        role: identity.role,
        stableId:
          identity.stableId,
        providerSubject:
          command.providerSubject,
      }),
    )
    changed = true
  }

  const after =
    identitySnapshot(
      state,
      command.providerSubject,
      domainKey,
    )

  return {
    before,
    after,
    result: changed
      ? 'APPLIED'
      : 'NOOP',
  }
}

function applyDisableIdentity(
  state,
  command,
) {
  const existing =
    state.identities.get(
      command.providerSubject,
    ) ?? null

  if (existing === null) {
    throw new Error(
      'secure-delivery-provisioning-identity-mapping-missing',
    )
  }

  const domainKey =
    mappingDomainKey(existing)
  const binding =
    state.bindings.get(
      domainKey,
    ) ?? null

  if (binding === null) {
    throw new Error(
      'secure-delivery-provisioning-domain-binding-missing',
    )
  }
  assertMappingMatchesBinding(
    existing,
    binding,
  )

  const before =
    identitySnapshot(
      state,
      command.providerSubject,
      domainKey,
    )

  if (
    existing.active &&
    existing.disabledAt === null
  ) {
    state.identities.set(
      command.providerSubject,
      createSecureDeliveryIdentityMapping({
        providerSubject:
          existing.providerSubject,
        role: existing.role,
        teacherId:
          existing.teacherId,
        studentId:
          existing.studentId,
        active: false,
        createdAt:
          existing.createdAt,
        disabledAt:
          command.timestamp,
      }),
    )
  }

  const after =
    identitySnapshot(
      state,
      command.providerSubject,
      domainKey,
    )

  return {
    before,
    after,
    result: exact(before, after)
      ? 'NOOP'
      : 'APPLIED',
  }
}

function applyCreateGrant(
  state,
  command,
) {
  requireActiveDomainIdentity(
    state,
    SECURE_DELIVERY_ROLE.TEACHER,
    command.teacherId,
  )
  requireActiveDomainIdentity(
    state,
    SECURE_DELIVERY_ROLE.STUDENT,
    command.studentId,
  )

  const key =
    provisioningGrantKey(
      command.teacherId,
      command.studentId,
    )
  const before =
    state.grants.get(key) ?? null

  if (
    before !== null &&
    (
      !isTeacherStudentGrant(
        before,
      ) ||
      before.teacherId !==
        command.teacherId ||
      before.studentId !==
        command.studentId
    )
  ) {
    throw new Error(
      'secure-delivery-provisioning-grant-conflict',
    )
  }

  if (
    before !== null &&
    (
      !before.active ||
      before.revokedAt !== null
    )
  ) {
    throw new Error(
      'secure-delivery-provisioning-grant-requires-regrant',
    )
  }

  if (before === null) {
    state.grants.set(
      key,
      createTeacherStudentGrant({
        teacherId:
          command.teacherId,
        studentId:
          command.studentId,
        active: true,
        createdAt:
          command.timestamp,
        revokedAt: null,
      }),
    )
  }

  const after =
    state.grants.get(key) ?? null

  return {
    before,
    after,
    result: before === null
      ? 'APPLIED'
      : 'NOOP',
  }
}

function applyRevokeGrant(
  state,
  command,
) {
  const key =
    provisioningGrantKey(
      command.teacherId,
      command.studentId,
    )
  const before =
    state.grants.get(key) ?? null

  if (before === null) {
    throw new Error(
      'secure-delivery-provisioning-grant-missing',
    )
  }

  if (!isTeacherStudentGrant(before)) {
    throw new Error(
      'secure-delivery-provisioning-grant-conflict',
    )
  }

  if (
    before.active &&
    before.revokedAt === null
  ) {
    state.grants.set(
      key,
      createTeacherStudentGrant({
        teacherId:
          before.teacherId,
        studentId:
          before.studentId,
        active: false,
        createdAt:
          before.createdAt,
        revokedAt:
          command.timestamp,
      }),
    )
  }

  const after =
    state.grants.get(key)

  return {
    before,
    after,
    result: exact(before, after)
      ? 'NOOP'
      : 'APPLIED',
  }
}

function applyRegrant(
  state,
  command,
) {
  requireActiveDomainIdentity(
    state,
    SECURE_DELIVERY_ROLE.TEACHER,
    command.teacherId,
  )
  requireActiveDomainIdentity(
    state,
    SECURE_DELIVERY_ROLE.STUDENT,
    command.studentId,
  )

  const key =
    provisioningGrantKey(
      command.teacherId,
      command.studentId,
    )
  const before =
    state.grants.get(key) ?? null

  if (before === null) {
    throw new Error(
      'secure-delivery-provisioning-grant-missing',
    )
  }

  if (
    !isTeacherStudentGrant(before)
  ) {
    throw new Error(
      'secure-delivery-provisioning-grant-conflict',
    )
  }

  if (
    before.active ||
    before.revokedAt === null
  ) {
    throw new Error(
      'secure-delivery-provisioning-regrant-requires-revoked-grant',
    )
  }

  state.grants.set(
    key,
    createTeacherStudentGrant({
      teacherId:
        command.teacherId,
      studentId:
        command.studentId,
      active: true,
      createdAt:
        command.timestamp,
      revokedAt: null,
    }),
  )

  return {
    before,
    after: state.grants.get(key),
    result: 'APPLIED',
  }
}

function applyNewCommand(
  state,
  command,
) {
  switch (command.action) {
    case SECURE_DELIVERY_PROVISIONING_ACTION.CREATE_IDENTITY:
      return applyCreateIdentity(
        state,
        command,
      )

    case SECURE_DELIVERY_PROVISIONING_ACTION.DISABLE_IDENTITY:
      return applyDisableIdentity(
        state,
        command,
      )

    case SECURE_DELIVERY_PROVISIONING_ACTION.CREATE_GRANT:
      return applyCreateGrant(
        state,
        command,
      )

    case SECURE_DELIVERY_PROVISIONING_ACTION.REVOKE_GRANT:
      return applyRevokeGrant(
        state,
        command,
      )

    case SECURE_DELIVERY_PROVISIONING_ACTION.REGRANT:
      return applyRegrant(
        state,
        command,
      )

    default:
      throw new TypeError(
        'unsupported secure delivery provisioning action.',
      )
  }
}

export function simulateSecureDeliveryProvisioningBatch({
  state,
  commands,
} = {}) {
  assertState(state)

  if (
    !Array.isArray(commands) ||
    commands.length === 0
  ) {
    throw new TypeError(
      'provisioning command batch must be non-empty.',
    )
  }

  const next =
    cloneProvisioningState(state)
  const operations = []

  for (const command of commands) {
    if (
      !isSecureDeliveryProvisioningCommand(
        command,
      )
    ) {
      throw new TypeError(
        'provisioning batch contains an invalid command.',
      )
    }

    const existingAudit =
      next.audits.get(
        command.operationId,
      ) ?? null

    if (existingAudit !== null) {
      if (
        existingAudit.commandFingerprint !==
        commandFingerprint(command)
      ) {
        throw new Error(
          'secure-delivery-provisioning-operationId-payload-conflict',
        )
      }

      operations.push(
        operationResult(
          command,
          'IDEMPOTENT_REPLAY',
        ),
      )
      continue
    }

    const transition =
      applyNewCommand(
        next,
        command,
      )

    const audit =
      createAudit({
        command,
        beforeState:
          transition.before,
        afterState:
          transition.after,
        result:
          transition.result,
      })

    next.audits.set(
      command.operationId,
      audit,
    )
    operations.push(
      operationResult(
        command,
        transition.result,
      ),
    )
  }

  return Object.freeze({
    state: next,
    operations: Object.freeze(
      operations,
    ),
  })
}

export function createProvisioningState({
  identities = new Map(),
  bindings = new Map(),
  grants = new Map(),
  audits = new Map(),
} = {}) {
  const state = {
    identities: new Map(identities),
    bindings: new Map(bindings),
    grants: new Map(grants),
    audits: new Map(audits),
  }

  for (const [subject, mapping] of state.identities) {
    if (
      !isSecureDeliveryIdentityMapping(
        mapping,
      ) ||
      mapping.providerSubject !==
        subject
    ) {
      throw new TypeError(
        'provisioning identity state is invalid.',
      )
    }
  }

  for (const [key, grant] of state.grants) {
    if (
      !isTeacherStudentGrant(grant) ||
      provisioningGrantKey(
        grant.teacherId,
        grant.studentId,
      ) !== key
    ) {
      throw new TypeError(
        'provisioning grant state is invalid.',
      )
    }
  }

  return state
}
