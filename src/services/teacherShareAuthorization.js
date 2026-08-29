// Package 12-T1 — exact-revision teacher-to-student share authorization.
//
// This is a pure immutable domain boundary. It separates explicit sharing
// authorization from Package 8 teacher approval and binds that authorization to
// one exact immutable revision, one exact approval record, and one caller-
// supplied recipient identity. It does not create accounts, authenticate
// actors/recipients, generate links/tokens, persist data, expose student
// content, override quality gates, or perform network sharing.

import {
  TEACHER_APPROVAL_APPLICABILITY,
  evaluateTeacherApprovalForRevision,
  isTeacherApprovalRecord,
} from './teacherApprovalModel.js'
import {
  TEACHER_REVISION_KIND,
  isTeacherRevision,
} from './teacherRevisionModel.js'

export const TEACHER_SHARE_AUTHORIZATION_SCHEMA_VERSION = 1
export const TEACHER_SHARE_AUTHORIZATION_STATE = 'share_authorized'
export const TEACHER_SHARE_REVOCATION_SCHEMA_VERSION = 1
export const TEACHER_SHARE_REVOCATION_STATE = 'share_revoked'

export const TEACHER_SHARE_AUTHORIZATION_APPLICABILITY = Object.freeze({
  AUTHORIZED_EXACT_BINDING: 'authorized_exact_binding',
  NOT_APPLICABLE: 'not_applicable',
  RECIPIENT_MISMATCH: 'recipient_mismatch',
  REVOKED: 'revoked',
})

const AUTHORIZATION_FIELDS = Object.freeze([
  'schemaVersion',
  'authorizationState',
  'authorizationId',
  'issuerActorId',
  'recipientId',
  'sourceId',
  'sourceRevisionId',
  'revisionId',
  'revisionKind',
  'parentRevisionId',
  'revisionCreatedAt',
  'contentFingerprint',
  'lineageFingerprint',
  'approvalId',
  'approvalActorId',
  'approvalCreatedAt',
  'createdAt',
])

const REVOCATION_FIELDS = Object.freeze([
  'schemaVersion',
  'revocationState',
  'revocationId',
  'authorizationId',
  'actorId',
  'recipientId',
  'sourceId',
  'revisionId',
  'createdAt',
])

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function normalizeRequiredString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${fieldName} must be a non-empty string.`)
  }
  return value.trim()
}

function normalizeNullableString(value, fieldName) {
  if (value === null || value === undefined) return null
  return normalizeRequiredString(value, fieldName)
}

function hasStrictFrozenShape(value, fields) {
  if (!isPlainObject(value) || !Object.isFrozen(value)) return false

  const ownKeys = Reflect.ownKeys(value)
  if (
    ownKeys.length !== fields.length ||
    ownKeys.some((key) => typeof key !== 'string' || !fields.includes(key))
  ) {
    return false
  }

  const descriptors = Object.getOwnPropertyDescriptors(value)
  return fields.every((field) => {
    const descriptor = descriptors[field]
    return Boolean(
      descriptor &&
        descriptor.enumerable === true &&
        descriptor.configurable === false &&
        descriptor.writable === false &&
        Object.prototype.hasOwnProperty.call(descriptor, 'value'),
    )
  })
}

function revisionBindingMatches(authorization, revision) {
  return (
    authorization.sourceId === revision.sourceId &&
    authorization.sourceRevisionId === revision.sourceRevisionId &&
    authorization.revisionId === revision.revisionId &&
    authorization.revisionKind === revision.revisionKind &&
    authorization.parentRevisionId === revision.parentRevisionId &&
    authorization.revisionCreatedAt === revision.createdAt &&
    authorization.contentFingerprint === revision.contentFingerprint &&
    authorization.lineageFingerprint === revision.lineageFingerprint
  )
}

function approvalBindingMatches(authorization, approval, revision) {
  if (
    evaluateTeacherApprovalForRevision({ approval, revision }) !==
    TEACHER_APPROVAL_APPLICABILITY.APPROVED_EXACT_REVISION
  ) {
    return false
  }

  return (
    authorization.approvalId === approval.approvalId &&
    authorization.approvalActorId === approval.actorId &&
    authorization.approvalCreatedAt === approval.createdAt
  )
}

function validateAuthorizationRecord(value) {
  if (!hasStrictFrozenShape(value, AUTHORIZATION_FIELDS)) return false
  if (value.schemaVersion !== TEACHER_SHARE_AUTHORIZATION_SCHEMA_VERSION) return false
  if (value.authorizationState !== TEACHER_SHARE_AUTHORIZATION_STATE) return false
  if (!Object.values(TEACHER_REVISION_KIND).includes(value.revisionKind)) return false

  try {
    for (const field of [
      'authorizationId',
      'issuerActorId',
      'recipientId',
      'sourceId',
      'sourceRevisionId',
      'revisionId',
      'revisionKind',
      'contentFingerprint',
      'lineageFingerprint',
      'approvalId',
      'approvalActorId',
    ]) {
      if (normalizeRequiredString(value[field], field) !== value[field]) return false
    }

    if (
      normalizeNullableString(value.parentRevisionId, 'parentRevisionId') !==
      value.parentRevisionId
    ) {
      return false
    }
    if (
      normalizeNullableString(value.revisionCreatedAt, 'revisionCreatedAt') !==
      value.revisionCreatedAt
    ) {
      return false
    }
    if (
      normalizeNullableString(value.approvalCreatedAt, 'approvalCreatedAt') !==
      value.approvalCreatedAt
    ) {
      return false
    }
    if (normalizeNullableString(value.createdAt, 'createdAt') !== value.createdAt) {
      return false
    }

    if (value.revisionKind === TEACHER_REVISION_KIND.AUTOMATIC) {
      if (value.parentRevisionId !== null) return false
      if (value.revisionId !== value.sourceRevisionId) return false
    } else {
      if (value.parentRevisionId === null) return false
      if (value.parentRevisionId === value.revisionId) return false
      if (value.revisionId === value.sourceRevisionId) return false
    }
    return true
  } catch {
    return false
  }
}

function validateRevocationRecord(value) {
  if (!hasStrictFrozenShape(value, REVOCATION_FIELDS)) return false
  if (value.schemaVersion !== TEACHER_SHARE_REVOCATION_SCHEMA_VERSION) return false
  if (value.revocationState !== TEACHER_SHARE_REVOCATION_STATE) return false

  try {
    for (const field of [
      'revocationId',
      'authorizationId',
      'actorId',
      'recipientId',
      'sourceId',
      'revisionId',
    ]) {
      if (normalizeRequiredString(value[field], field) !== value[field]) return false
    }
    return normalizeNullableString(value.createdAt, 'createdAt') === value.createdAt
  } catch {
    return false
  }
}

export function isTeacherShareAuthorizationRecord(value) {
  return validateAuthorizationRecord(value)
}

export function isTeacherShareRevocationRecord(value) {
  return validateRevocationRecord(value)
}

/**
 * Create explicit authorization evidence for one recipient and one exact
 * Package 8 approved revision.
 *
 * The caller owns every identifier/time value. `issuerActorId` and
 * `recipientId` are domain labels only; authentication/authorization of those
 * identities belongs to a later application/security layer.
 *
 * This record is not final student-delivery permission because Package 12 must
 * still require exact revision safety/quality evidence before content leaves
 * the teacher boundary.
 */
export function createTeacherShareAuthorization({
  authorizationId,
  issuerActorId,
  recipientId,
  revision,
  approval,
  createdAt = null,
} = {}) {
  const normalizedAuthorizationId = normalizeRequiredString(
    authorizationId,
    'authorizationId',
  )
  const normalizedIssuerActorId = normalizeRequiredString(
    issuerActorId,
    'issuerActorId',
  )
  const normalizedRecipientId = normalizeRequiredString(recipientId, 'recipientId')
  const normalizedCreatedAt = normalizeNullableString(createdAt, 'createdAt')

  if (!isTeacherRevision(revision)) {
    throw new TypeError('revision must be a valid immutable teacher revision.')
  }
  if (!isTeacherApprovalRecord(approval)) {
    throw new TypeError('approval must be a valid immutable teacher approval record.')
  }
  if (
    evaluateTeacherApprovalForRevision({ approval, revision }) !==
    TEACHER_APPROVAL_APPLICABILITY.APPROVED_EXACT_REVISION
  ) {
    throw new Error('approval must apply to the exact revision being authorized.')
  }

  return Object.freeze({
    schemaVersion: TEACHER_SHARE_AUTHORIZATION_SCHEMA_VERSION,
    authorizationState: TEACHER_SHARE_AUTHORIZATION_STATE,
    authorizationId: normalizedAuthorizationId,
    issuerActorId: normalizedIssuerActorId,
    recipientId: normalizedRecipientId,
    sourceId: revision.sourceId,
    sourceRevisionId: revision.sourceRevisionId,
    revisionId: revision.revisionId,
    revisionKind: revision.revisionKind,
    parentRevisionId: revision.parentRevisionId,
    revisionCreatedAt: revision.createdAt,
    contentFingerprint: revision.contentFingerprint,
    lineageFingerprint: revision.lineageFingerprint,
    approvalId: approval.approvalId,
    approvalActorId: approval.actorId,
    approvalCreatedAt: approval.createdAt,
    createdAt: normalizedCreatedAt,
  })
}

/**
 * Create immutable revocation evidence for one exact authorization record.
 *
 * T1 intentionally requires the same caller-supplied issuer actor label used by
 * the authorization. This is a consistency check only, not authentication.
 */
export function createTeacherShareRevocation({
  revocationId,
  actorId,
  authorization,
  createdAt = null,
} = {}) {
  const normalizedRevocationId = normalizeRequiredString(revocationId, 'revocationId')
  const normalizedActorId = normalizeRequiredString(actorId, 'actorId')
  const normalizedCreatedAt = normalizeNullableString(createdAt, 'createdAt')

  if (!isTeacherShareAuthorizationRecord(authorization)) {
    throw new TypeError(
      'authorization must be a valid immutable teacher share authorization record.',
    )
  }
  if (normalizedActorId !== authorization.issuerActorId) {
    throw new Error('revocation actorId must match the authorization issuerActorId.')
  }

  return Object.freeze({
    schemaVersion: TEACHER_SHARE_REVOCATION_SCHEMA_VERSION,
    revocationState: TEACHER_SHARE_REVOCATION_STATE,
    revocationId: normalizedRevocationId,
    authorizationId: authorization.authorizationId,
    actorId: normalizedActorId,
    recipientId: authorization.recipientId,
    sourceId: authorization.sourceId,
    revisionId: authorization.revisionId,
    createdAt: normalizedCreatedAt,
  })
}

/**
 * Evaluate whether authorization evidence still applies to one exact revision,
 * approval and recipient label. Later corrections/undo/replay, a different
 * approval record, a different recipient, or exact revocation fail closed.
 *
 * AUTHORIZED_EXACT_BINDING means only that the separate Package 12 share
 * authorization remains applicable. It deliberately does not mean
 * `safeToShare`, does not bypass quality/safety evidence, and does not expose or
 * transmit revision content.
 */
export function evaluateTeacherShareAuthorization({
  authorization,
  revision,
  approval,
  recipientId,
  revocation = null,
} = {}) {
  if (!isTeacherShareAuthorizationRecord(authorization)) {
    throw new TypeError(
      'authorization must be a valid immutable teacher share authorization record.',
    )
  }
  if (!isTeacherRevision(revision)) {
    throw new TypeError('revision must be a valid immutable teacher revision.')
  }
  if (!isTeacherApprovalRecord(approval)) {
    throw new TypeError('approval must be a valid immutable teacher approval record.')
  }
  const normalizedRecipientId = normalizeRequiredString(recipientId, 'recipientId')

  if (!revisionBindingMatches(authorization, revision)) {
    return TEACHER_SHARE_AUTHORIZATION_APPLICABILITY.NOT_APPLICABLE
  }
  if (!approvalBindingMatches(authorization, approval, revision)) {
    return TEACHER_SHARE_AUTHORIZATION_APPLICABILITY.NOT_APPLICABLE
  }
  if (authorization.recipientId !== normalizedRecipientId) {
    return TEACHER_SHARE_AUTHORIZATION_APPLICABILITY.RECIPIENT_MISMATCH
  }

  if (revocation !== null && revocation !== undefined) {
    if (!isTeacherShareRevocationRecord(revocation)) {
      throw new TypeError('revocation must be null or a valid immutable share revocation record.')
    }

    const exactRevocation =
      revocation.authorizationId === authorization.authorizationId &&
      revocation.actorId === authorization.issuerActorId &&
      revocation.recipientId === authorization.recipientId &&
      revocation.sourceId === authorization.sourceId &&
      revocation.revisionId === authorization.revisionId

    return exactRevocation
      ? TEACHER_SHARE_AUTHORIZATION_APPLICABILITY.REVOKED
      : TEACHER_SHARE_AUTHORIZATION_APPLICABILITY.NOT_APPLICABLE
  }

  return TEACHER_SHARE_AUTHORIZATION_APPLICABILITY.AUTHORIZED_EXACT_BINDING
}
