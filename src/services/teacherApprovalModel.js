// Package 8-T3 — exact-revision teacher approval binding.
//
// Pure domain layer only. Approval is historical evidence bound to one exact
// immutable revision. It is not persistence, authentication, authorization,
// quality-gate override, student sharing, UI, OMR/Audiveris, or deployment.

import { isTeacherRevision } from './teacherRevisionModel.js'

export const TEACHER_APPROVAL_SCHEMA_VERSION = 1
export const TEACHER_APPROVAL_STATE = 'teacher_approved'

export const TEACHER_APPROVAL_APPLICABILITY = Object.freeze({
  APPROVED_EXACT_REVISION: 'approved_exact_revision',
  NOT_APPLICABLE_TO_REVISION: 'not_applicable_to_revision',
})

const APPROVAL_FIELDS = Object.freeze([
  'schemaVersion',
  'approvalState',
  'approvalId',
  'actorId',
  'sourceId',
  'sourceRevisionId',
  'approvedRevisionId',
  'approvedContentFingerprint',
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

function normalizeCreatedAt(value) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError('createdAt must be null or a non-empty string.')
  }
  return value.trim()
}

function hasStrictApprovalShape(value) {
  const ownKeys = Reflect.ownKeys(value)
  if (
    ownKeys.length !== APPROVAL_FIELDS.length ||
    ownKeys.some(
      (key) => typeof key !== 'string' || !APPROVAL_FIELDS.includes(key),
    )
  ) {
    return false
  }

  const descriptors = Object.getOwnPropertyDescriptors(value)
  return APPROVAL_FIELDS.every((field) => {
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

function validateApprovalRecord(value) {
  if (!isPlainObject(value) || !Object.isFrozen(value)) return false
  if (!hasStrictApprovalShape(value)) return false
  if (value.schemaVersion !== TEACHER_APPROVAL_SCHEMA_VERSION) return false
  if (value.approvalState !== TEACHER_APPROVAL_STATE) return false

  try {
    for (const field of [
      'approvalId',
      'actorId',
      'sourceId',
      'sourceRevisionId',
      'approvedRevisionId',
      'approvedContentFingerprint',
    ]) {
      if (normalizeRequiredString(value[field], field) !== value[field]) return false
    }

    if (normalizeCreatedAt(value.createdAt) !== value.createdAt) return false
    return true
  } catch {
    return false
  }
}

/**
 * Recognize only a strict immutable Package 8-T3 approval record.
 *
 * This validates record integrity/shape, not authentication of actorId and not
 * applicability to a candidate revision. Use evaluateTeacherApprovalForRevision
 * for exact revision binding.
 */
export function isTeacherApprovalRecord(value) {
  return validateApprovalRecord(value)
}

/**
 * Record an explicit teacher approval for one exact immutable T1 revision.
 *
 * The caller owns approvalId, actorId, and createdAt. No identity/time is
 * generated and the revision is never mutated.
 */
export function createTeacherApprovalRecord({
  approvalId,
  actorId,
  revision,
  createdAt = null,
} = {}) {
  const normalizedApprovalId = normalizeRequiredString(approvalId, 'approvalId')
  const normalizedActorId = normalizeRequiredString(actorId, 'actorId')
  const normalizedCreatedAt = normalizeCreatedAt(createdAt)

  if (!isTeacherRevision(revision)) {
    throw new TypeError('revision must be a valid immutable teacher revision.')
  }

  return Object.freeze({
    schemaVersion: TEACHER_APPROVAL_SCHEMA_VERSION,
    approvalState: TEACHER_APPROVAL_STATE,
    approvalId: normalizedApprovalId,
    actorId: normalizedActorId,
    sourceId: revision.sourceId,
    sourceRevisionId: revision.sourceRevisionId,
    approvedRevisionId: revision.revisionId,
    approvedContentFingerprint: revision.contentFingerprint,
    createdAt: normalizedCreatedAt,
  })
}

/**
 * Determine whether historical approval evidence applies to the exact candidate
 * revision. A changed/new revision makes the old approval non-applicable; the
 * historical approval record itself is not mutated or deleted.
 *
 * The returned value is approval applicability only. It is deliberately not a
 * quality decision, authorization decision, or student-sharing permission.
 */
export function evaluateTeacherApprovalForRevision({ approval, revision } = {}) {
  if (!isTeacherApprovalRecord(approval)) {
    throw new TypeError('approval must be a valid immutable teacher approval record.')
  }
  if (!isTeacherRevision(revision)) {
    throw new TypeError('revision must be a valid immutable teacher revision.')
  }

  const exact =
    approval.sourceId === revision.sourceId &&
    approval.sourceRevisionId === revision.sourceRevisionId &&
    approval.approvedRevisionId === revision.revisionId &&
    approval.approvedContentFingerprint === revision.contentFingerprint

  return exact
    ? TEACHER_APPROVAL_APPLICABILITY.APPROVED_EXACT_REVISION
    : TEACHER_APPROVAL_APPLICABILITY.NOT_APPLICABLE_TO_REVISION
}
