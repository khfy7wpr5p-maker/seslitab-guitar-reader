// Package 8B-T2 — verified evidence intake/readiness boundary.
//
// Research/data-domain only. This module never reads/writes files, runs Audiveris,
// trains or replaces a model, or imports production OMR/runtime/deployment code.
// Raw evidence bytes are hashed at this boundary and are never retained in output.

import { createHash } from 'node:crypto'

import {
  AUDIVERIS_TRAINABILITY_STATUS,
  evaluateAudiverisTrainingCandidate,
  isAudiverisTrainingCandidate,
} from './audiverisTrainingDatasetContract.js'

export const AUDIVERIS_EVIDENCE_READINESS_SCHEMA_VERSION = 1

export const AUDIVERIS_EVIDENCE_READINESS_STATUS = Object.freeze({
  ELIGIBLE: 'eligible',
  INCOMPLETE: 'incomplete',
  REJECTED: 'rejected',
})

export const AUDIVERIS_EVIDENCE_REJECTION_REASON = Object.freeze({
  DUPLICATE_EVIDENCE_FIELD: 'duplicate_evidence_field',
  UNDECLARED_EVIDENCE_FIELD: 'undeclared_evidence_field',
  PATH_MISMATCH: 'path_mismatch',
  HASH_MISMATCH: 'hash_mismatch',
})

export const AUDIVERIS_EVIDENCE_FIELD = Object.freeze({
  SOURCE_PDF: 'sourcePdf',
  PAGE_IMAGE: 'pageImage',
  OMR_ARTIFACT: 'omrArtifact',
  MUSIC_XML: 'musicXml',
  GLYPH_IMAGE: 'glyphImage',
  REFERENCE_APPROVAL_EVIDENCE: 'referenceApprovalEvidence',
  LICENSE_EVIDENCE: 'licenseEvidence',
  TRAINING_APPROVAL_EVIDENCE: 'trainingApprovalEvidence',
})

const EVIDENCE_FIELDS = Object.freeze(Object.values(AUDIVERIS_EVIDENCE_FIELD))
const EVIDENCE_ENTRY_FIELDS = Object.freeze(['field', 'path', 'bytes'])
const REJECTION_FIELDS = Object.freeze(['code', 'field'])
const REPORT_FIELDS = Object.freeze([
  'schemaVersion',
  'candidateId',
  'candidateFingerprint',
  'status',
  'trainabilityStatus',
  'trainabilityReasons',
  'verifiedEvidenceFields',
  'missingEvidenceFields',
  'rejections',
  'eligibleForManifestReview',
])
const FINGERPRINT_RE = /^sha256:[0-9a-f]{64}$/u

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function assertExactDataObject(value, fields, label) {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be a plain object.`)
  const keys = Reflect.ownKeys(value)
  if (
    keys.length !== fields.length ||
    keys.some((key) => typeof key !== 'string' || !fields.includes(key))
  ) {
    throw new TypeError(`${label} has an unsupported field set.`)
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const field of fields) {
    const descriptor = descriptors[field]
    if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw new TypeError(`${label}.${field} must be an enumerable data property.`)
    }
  }
}

function assertDenseArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`)
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError(`${label} must not contain symbol properties.`)
  }
  for (let index = 0; index < value.length; index++) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      throw new TypeError(`${label} must not be sparse.`)
    }
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (key === 'length') continue
    const index = Number(key)
    if (
      !Number.isInteger(index) || index < 0 || index >= value.length ||
      String(index) !== key || !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      throw new TypeError(`${label} contains an unsupported array property.`)
    }
  }
}

function requiredString(value, fieldName, maxLength = 1024) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${fieldName} must be a non-empty string.`)
  }
  const normalized = value.trim()
  if (normalized.length > maxLength || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new TypeError(`${fieldName} contains unsupported text.`)
  }
  return normalized
}

function evidenceArtifact(candidate, field) {
  if (field === AUDIVERIS_EVIDENCE_FIELD.TRAINING_APPROVAL_EVIDENCE) {
    return candidate.trainingApproval?.evidence ?? null
  }
  return candidate[field] ?? null
}

function normalizeEvidenceBytes(value, label) {
  if (!(value instanceof Uint8Array)) {
    throw new TypeError(`${label}.bytes must be a Uint8Array.`)
  }
  if (value.byteLength === 0) {
    throw new TypeError(`${label}.bytes must not be empty.`)
  }
  return value
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function frozenSortedStrings(values) {
  return Object.freeze([...values].sort((left, right) => left.localeCompare(right, 'en')))
}

function frozenRejection(code, field) {
  return Object.freeze({ code, field })
}

function sortRejections(rejections) {
  return Object.freeze([...rejections].sort((left, right) => {
    const fieldOrder = left.field.localeCompare(right.field, 'en')
    return fieldOrder || left.code.localeCompare(right.code, 'en')
  }))
}

function strictFrozenArray(value) {
  if (!Array.isArray(value) || !Object.isFrozen(value)) return false
  try {
    assertDenseArray(value, 'array')
  } catch {
    return false
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  return Object.entries(descriptors).every(([key, descriptor]) =>
    key === 'length' || (
      descriptor.enumerable === true && descriptor.configurable === false &&
      descriptor.writable === false && Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ),
  )
}

function strictFrozenRecord(value, fields) {
  if (!isPlainObject(value) || !Object.isFrozen(value)) return false
  const keys = Reflect.ownKeys(value)
  if (
    keys.length !== fields.length ||
    keys.some((key) => typeof key !== 'string' || !fields.includes(key))
  ) return false
  const descriptors = Object.getOwnPropertyDescriptors(value)
  return fields.every((field) => {
    const descriptor = descriptors[field]
    return Boolean(
      descriptor && descriptor.enumerable === true && descriptor.configurable === false &&
      descriptor.writable === false && Object.prototype.hasOwnProperty.call(descriptor, 'value'),
    )
  })
}

export function evaluateAudiverisEvidenceReadiness(candidate, evidenceEntries = []) {
  if (!isAudiverisTrainingCandidate(candidate)) {
    throw new TypeError('candidate must be a valid immutable Audiveris training candidate.')
  }
  assertDenseArray(evidenceEntries, 'evidenceEntries')

  const trainability = evaluateAudiverisTrainingCandidate(candidate)
  const seenFields = new Set()
  const verifiedFields = new Set()
  const rejections = []

  for (let index = 0; index < evidenceEntries.length; index++) {
    const entry = evidenceEntries[index]
    const label = `evidenceEntries[${index}]`
    assertExactDataObject(entry, EVIDENCE_ENTRY_FIELDS, label)
    const field = requiredString(entry.field, `${label}.field`, 64)
    if (!EVIDENCE_FIELDS.includes(field)) {
      throw new TypeError(`${label}.field is unsupported.`)
    }
    const path = requiredString(entry.path, `${label}.path`)
    const bytes = normalizeEvidenceBytes(entry.bytes, label)

    if (seenFields.has(field)) {
      rejections.push(frozenRejection(
        AUDIVERIS_EVIDENCE_REJECTION_REASON.DUPLICATE_EVIDENCE_FIELD,
        field,
      ))
      continue
    }
    seenFields.add(field)

    const expected = evidenceArtifact(candidate, field)
    if (!expected) {
      rejections.push(frozenRejection(
        AUDIVERIS_EVIDENCE_REJECTION_REASON.UNDECLARED_EVIDENCE_FIELD,
        field,
      ))
      continue
    }
    if (path !== expected.path) {
      rejections.push(frozenRejection(AUDIVERIS_EVIDENCE_REJECTION_REASON.PATH_MISMATCH, field))
      continue
    }
    if (sha256(bytes) !== expected.sha256) {
      rejections.push(frozenRejection(AUDIVERIS_EVIDENCE_REJECTION_REASON.HASH_MISMATCH, field))
      continue
    }
    verifiedFields.add(field)
  }

  const declaredFields = EVIDENCE_FIELDS.filter((field) => evidenceArtifact(candidate, field) !== null)
  const missingFields = declaredFields.filter((field) => !seenFields.has(field))
  const sortedRejections = sortRejections(rejections)
  const verifiedEvidenceFields = frozenSortedStrings(verifiedFields)
  const missingEvidenceFields = frozenSortedStrings(missingFields)

  let status = AUDIVERIS_EVIDENCE_READINESS_STATUS.ELIGIBLE
  if (sortedRejections.length > 0) {
    status = AUDIVERIS_EVIDENCE_READINESS_STATUS.REJECTED
  } else if (
    trainability.status !== AUDIVERIS_TRAINABILITY_STATUS.TRAINABLE ||
    missingEvidenceFields.length > 0
  ) {
    status = AUDIVERIS_EVIDENCE_READINESS_STATUS.INCOMPLETE
  }

  return Object.freeze({
    schemaVersion: AUDIVERIS_EVIDENCE_READINESS_SCHEMA_VERSION,
    candidateId: candidate.candidateId,
    candidateFingerprint: candidate.candidateFingerprint,
    status,
    trainabilityStatus: trainability.status,
    trainabilityReasons: Object.freeze([...trainability.reasons]),
    verifiedEvidenceFields,
    missingEvidenceFields,
    rejections: sortedRejections,
    eligibleForManifestReview: status === AUDIVERIS_EVIDENCE_READINESS_STATUS.ELIGIBLE,
  })
}

export function isAudiverisEvidenceReadinessReport(value) {
  try {
    if (!strictFrozenRecord(value, REPORT_FIELDS)) return false
    if (value.schemaVersion !== AUDIVERIS_EVIDENCE_READINESS_SCHEMA_VERSION) return false
    if (!FINGERPRINT_RE.test(value.candidateFingerprint)) return false
    if (!Object.values(AUDIVERIS_EVIDENCE_READINESS_STATUS).includes(value.status)) return false
    if (!Object.values(AUDIVERIS_TRAINABILITY_STATUS).includes(value.trainabilityStatus)) return false
    if (!strictFrozenArray(value.trainabilityReasons)) return false
    if (!strictFrozenArray(value.verifiedEvidenceFields)) return false
    if (!strictFrozenArray(value.missingEvidenceFields)) return false
    if (!strictFrozenArray(value.rejections)) return false
    if (!value.rejections.every((rejection) => strictFrozenRecord(rejection, REJECTION_FIELDS))) {
      return false
    }
    if (typeof value.eligibleForManifestReview !== 'boolean') return false
    if (value.eligibleForManifestReview !== (value.status === AUDIVERIS_EVIDENCE_READINESS_STATUS.ELIGIBLE)) {
      return false
    }
    return true
  } catch {
    return false
  }
}
