// Package 8B-T4 — research-only MUSCIMA -> Audiveris training admission gate.
//
// This is a pure data-domain boundary. It does not write files, build
// samples.zip, execute Audiveris, train a classifier, replace a model, or
// change production OMR/runtime/deployment wiring.
//
// T4 intentionally keeps the stricter Package 8B-T1 `.omr` requirement
// untouched. It only distinguishes Audiveris' technical glyph+shape sample
// requirement from SesliTab's own T1 production-oriented evidence contract.

import {
  MUSCIMA_ACCIDENTAL_SOURCE_TO_AUDIVERIS_SHAPE,
  MUSCIMA_EVALUATION_SCOPE,
  isMuscimaAccidentalPagePlan,
} from './audiverisMuscimaAccidentalMapping.js'

export const MUSCIMA_RESEARCH_ADMISSION_SCHEMA_VERSION = 1

export const MUSCIMA_RESEARCH_INTENDED_USE = Object.freeze({
  NONCOMMERCIAL_RESEARCH: 'noncommercial_research',
  COMMERCIAL: 'commercial',
  PRODUCTION: 'production',
})

export const MUSCIMA_RESEARCH_APPROVAL_SCOPE = Object.freeze({
  AUDIVERIS_CLASSIFIER_RESEARCH_SAMPLE: 'audiveris_classifier_research_sample',
})

export const MUSCIMA_RESEARCH_ADMISSION_STATUS = Object.freeze({
  BLOCKED_LICENSE_USE: 'blocked_license_use',
  BLOCKED_MISSING_SAMPLE_APPROVALS: 'blocked_missing_sample_approvals',
  READY_FOR_ISOLATED_SAMPLES_ZIP_BUILD: 'ready_for_isolated_samples_zip_build',
})

export const MUSCIMA_RESEARCH_EXPERIMENT_BLOCKER = Object.freeze({
  NONCOMMERCIAL_LICENSE_ONLY: 'noncommercial_license_only',
  MISSING_EXPLICIT_SAMPLE_APPROVALS: 'missing_explicit_sample_approvals',
})

export const MUSCIMA_RESEARCH_T1_BLOCKER = Object.freeze({
  MISSING_OMR_ARTIFACT: 'missing_omr_artifact',
})

export const AUDIVERIS_GLYPH_CLASSIFIER_INPUT = Object.freeze({
  GLOBAL_SAMPLES_ZIP_GLYPH_SHAPE: 'global_samples_zip_glyph_shape',
})

export const MUSCIMA_RESEARCH_LICENSE_PROFILE = Object.freeze({
  profileId: 'muscima-pp-cvc-muscima-research-only-v1',
  muscimaPpLicense: 'CC-BY-NC-SA-4.0',
  cvcMuscimaUseBoundary: 'noncommercial_research_only',
  attributionRequired: true,
  shareAlikeRequired: true,
  commercialUseAllowed: false,
  productionUseAllowed: false,
})

const APPROVAL_INPUT_FIELDS = Object.freeze([
  'approvalId',
  'sampleId',
  'audiverisShape',
  'maskSha256',
  'approvedBy',
  'approvedAt',
  'scope',
  'licenseProfileId',
])
const APPROVAL_FIELDS = APPROVAL_INPUT_FIELDS
const ASSESSMENT_INPUT_FIELDS = Object.freeze(['plans', 'approvals', 'intendedUse'])
const REPORT_FIELDS = Object.freeze([
  'schemaVersion',
  'licenseProfileId',
  'intendedUse',
  'status',
  'pageCount',
  'mappedSampleCount',
  'approvalCount',
  'researchExperimentAdmittedSampleCount',
  't1TrainableSampleCount',
  'audiverisTechnicalInput',
  't1OmrEvidenceSatisfied',
  'evaluationScope',
  'writerIndependentEvaluation',
  'productionAuthorized',
  'modelReplacementAuthorized',
  'experimentBlockers',
  't1Blockers',
])

const SHA256_RE = /^[0-9a-f]{64}$/u
const APPROVED_SHAPES = Object.freeze(
  [...new Set(Object.values(MUSCIMA_ACCIDENTAL_SOURCE_TO_AUDIVERIS_SHAPE))].sort(),
)

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function assertSupportedInputObject(value, allowedFields, label) {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be a plain object.`)
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowedFields.includes(key)) {
      throw new TypeError(`${label} contains an unsupported field.`)
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw new TypeError(`${label}.${key} must be an enumerable data property.`)
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
      !Number.isInteger(index) || index < 0 || index >= value.length || String(index) !== key ||
      !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      throw new TypeError(`${label} contains an unsupported array property.`)
    }
  }
}

function requiredString(value, fieldName, maxLength = 256) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${fieldName} must be a non-empty string.`)
  }
  const normalized = value.trim()
  if (normalized.length > maxLength || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new TypeError(`${fieldName} contains unsupported text.`)
  }
  return normalized
}

function requiredSha256(value, fieldName) {
  const normalized = requiredString(value, fieldName, 64).toLowerCase()
  if (!SHA256_RE.test(normalized)) {
    throw new TypeError(`${fieldName} must be a 64-character SHA-256 digest.`)
  }
  return normalized
}

function requiredTimestamp(value, fieldName) {
  const normalized = requiredString(value, fieldName, 64)
  const milliseconds = Date.parse(normalized)
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== normalized) {
    throw new TypeError(`${fieldName} must be an exact ISO-8601 timestamp.`)
  }
  return normalized
}

function normalizeIntendedUse(value) {
  if (!Object.values(MUSCIMA_RESEARCH_INTENDED_USE).includes(value)) {
    throw new TypeError('intendedUse is unsupported.')
  }
  return value
}

function isExactFrozenRecord(value, fields) {
  if (!isPlainObject(value) || !Object.isFrozen(value)) return false
  const keys = Reflect.ownKeys(value)
  if (keys.length !== fields.length || keys.some((key) => typeof key !== 'string' || !fields.includes(key))) {
    return false
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  return fields.every((field) => {
    const descriptor = descriptors[field]
    return Boolean(
      descriptor?.enumerable === true && descriptor.configurable === false &&
      descriptor.writable === false && Object.prototype.hasOwnProperty.call(descriptor, 'value'),
    )
  })
}

function collectPlanEvidence(plans) {
  assertDenseArray(plans, 'plans')
  if (plans.length === 0) throw new TypeError('plans must contain at least one page plan.')

  const pageIds = new Set()
  const samples = new Map()
  for (const plan of plans) {
    if (!isMuscimaAccidentalPagePlan(plan)) {
      throw new TypeError('plans contains an invalid T3 page plan.')
    }
    if (plan.evaluationScope !== MUSCIMA_EVALUATION_SCOPE.PAGE_DISJOINT_ONLY) {
      throw new TypeError('plans must preserve the T3 page-disjoint evaluation scope.')
    }
    if (pageIds.has(plan.pageId)) throw new TypeError('plans must not contain duplicate pageId values.')
    pageIds.add(plan.pageId)

    for (const sample of plan.mappedSamples) {
      if (samples.has(sample.sampleId)) throw new TypeError('plans must not contain duplicate sampleId values.')
      samples.set(sample.sampleId, sample)
    }
  }

  if (samples.size === 0) throw new TypeError('plans must contain at least one mapped accidental sample.')
  return { pageCount: pageIds.size, samples }
}

export function createMuscimaResearchSampleApproval(input = {}) {
  assertSupportedInputObject(input, APPROVAL_INPUT_FIELDS, 'research sample approval')

  const scope = requiredString(input.scope, 'scope', 128)
  if (scope !== MUSCIMA_RESEARCH_APPROVAL_SCOPE.AUDIVERIS_CLASSIFIER_RESEARCH_SAMPLE) {
    throw new TypeError('scope must be audiveris_classifier_research_sample.')
  }

  const licenseProfileId = requiredString(input.licenseProfileId, 'licenseProfileId', 128)
  if (licenseProfileId !== MUSCIMA_RESEARCH_LICENSE_PROFILE.profileId) {
    throw new TypeError('licenseProfileId does not match the bounded MUSCIMA research profile.')
  }

  const audiverisShape = requiredString(input.audiverisShape, 'audiverisShape', 64)
  if (!APPROVED_SHAPES.includes(audiverisShape)) {
    throw new TypeError('audiverisShape is outside the bounded accidental classifier set.')
  }

  return Object.freeze({
    approvalId: requiredString(input.approvalId, 'approvalId', 256),
    sampleId: requiredString(input.sampleId, 'sampleId', 256),
    audiverisShape,
    maskSha256: requiredSha256(input.maskSha256, 'maskSha256'),
    approvedBy: requiredString(input.approvedBy, 'approvedBy', 256),
    approvedAt: requiredTimestamp(input.approvedAt, 'approvedAt'),
    scope,
    licenseProfileId,
  })
}

export function isMuscimaResearchSampleApproval(value) {
  try {
    if (!isExactFrozenRecord(value, APPROVAL_FIELDS)) return false
    if (value.scope !== MUSCIMA_RESEARCH_APPROVAL_SCOPE.AUDIVERIS_CLASSIFIER_RESEARCH_SAMPLE) return false
    if (value.licenseProfileId !== MUSCIMA_RESEARCH_LICENSE_PROFILE.profileId) return false
    if (!APPROVED_SHAPES.includes(value.audiverisShape)) return false
    if (!SHA256_RE.test(value.maskSha256)) return false
    if (requiredString(value.approvalId, 'approvalId', 256) !== value.approvalId) return false
    if (requiredString(value.sampleId, 'sampleId', 256) !== value.sampleId) return false
    if (requiredString(value.approvedBy, 'approvedBy', 256) !== value.approvedBy) return false
    if (requiredTimestamp(value.approvedAt, 'approvedAt') !== value.approvedAt) return false
    return true
  } catch {
    return false
  }
}

export function assessMuscimaResearchTrainingAdmission(input = {}) {
  assertSupportedInputObject(input, ASSESSMENT_INPUT_FIELDS, 'research admission input')
  const intendedUse = normalizeIntendedUse(input.intendedUse)
  const { pageCount, samples } = collectPlanEvidence(input.plans)
  assertDenseArray(input.approvals, 'approvals')

  const seenApprovalIds = new Set()
  const approvedSampleIds = new Set()
  for (const approval of input.approvals) {
    if (!isMuscimaResearchSampleApproval(approval)) {
      throw new TypeError('approvals contains an invalid research sample approval.')
    }
    if (seenApprovalIds.has(approval.approvalId)) {
      throw new TypeError('approvalId must be unique.')
    }
    seenApprovalIds.add(approval.approvalId)
    if (approvedSampleIds.has(approval.sampleId)) {
      throw new TypeError('each mapped sample may have at most one T4 research approval.')
    }

    const sample = samples.get(approval.sampleId)
    if (!sample) throw new TypeError('research approval references an unknown mapped sample.')
    if (approval.audiverisShape !== sample.audiverisShape || approval.maskSha256 !== sample.maskSha256) {
      throw new TypeError('research approval does not bind the exact mapped sample evidence.')
    }
    approvedSampleIds.add(approval.sampleId)
  }

  const experimentBlockers = []
  let status
  let admittedCount = 0

  if (intendedUse !== MUSCIMA_RESEARCH_INTENDED_USE.NONCOMMERCIAL_RESEARCH) {
    experimentBlockers.push(MUSCIMA_RESEARCH_EXPERIMENT_BLOCKER.NONCOMMERCIAL_LICENSE_ONLY)
    status = MUSCIMA_RESEARCH_ADMISSION_STATUS.BLOCKED_LICENSE_USE
  } else if (approvedSampleIds.size !== samples.size) {
    experimentBlockers.push(MUSCIMA_RESEARCH_EXPERIMENT_BLOCKER.MISSING_EXPLICIT_SAMPLE_APPROVALS)
    status = MUSCIMA_RESEARCH_ADMISSION_STATUS.BLOCKED_MISSING_SAMPLE_APPROVALS
  } else {
    status = MUSCIMA_RESEARCH_ADMISSION_STATUS.READY_FOR_ISOLATED_SAMPLES_ZIP_BUILD
    admittedCount = samples.size
  }

  return Object.freeze({
    schemaVersion: MUSCIMA_RESEARCH_ADMISSION_SCHEMA_VERSION,
    licenseProfileId: MUSCIMA_RESEARCH_LICENSE_PROFILE.profileId,
    intendedUse,
    status,
    pageCount,
    mappedSampleCount: samples.size,
    approvalCount: approvedSampleIds.size,
    researchExperimentAdmittedSampleCount: admittedCount,
    t1TrainableSampleCount: 0,
    audiverisTechnicalInput: AUDIVERIS_GLYPH_CLASSIFIER_INPUT.GLOBAL_SAMPLES_ZIP_GLYPH_SHAPE,
    t1OmrEvidenceSatisfied: false,
    evaluationScope: MUSCIMA_EVALUATION_SCOPE.PAGE_DISJOINT_ONLY,
    writerIndependentEvaluation: false,
    productionAuthorized: false,
    modelReplacementAuthorized: false,
    experimentBlockers: Object.freeze(experimentBlockers),
    t1Blockers: Object.freeze([MUSCIMA_RESEARCH_T1_BLOCKER.MISSING_OMR_ARTIFACT]),
  })
}

export function isMuscimaResearchAdmissionReport(value) {
  try {
    if (!isExactFrozenRecord(value, REPORT_FIELDS)) return false
    if (value.schemaVersion !== MUSCIMA_RESEARCH_ADMISSION_SCHEMA_VERSION) return false
    if (value.licenseProfileId !== MUSCIMA_RESEARCH_LICENSE_PROFILE.profileId) return false
    if (!Object.values(MUSCIMA_RESEARCH_INTENDED_USE).includes(value.intendedUse)) return false
    if (!Object.values(MUSCIMA_RESEARCH_ADMISSION_STATUS).includes(value.status)) return false
    if (!Number.isSafeInteger(value.pageCount) || value.pageCount <= 0) return false
    if (!Number.isSafeInteger(value.mappedSampleCount) || value.mappedSampleCount <= 0) return false
    if (!Number.isSafeInteger(value.approvalCount) || value.approvalCount < 0 || value.approvalCount > value.mappedSampleCount) return false
    if (!Number.isSafeInteger(value.researchExperimentAdmittedSampleCount) || value.researchExperimentAdmittedSampleCount < 0) return false
    if (value.t1TrainableSampleCount !== 0) return false
    if (value.audiverisTechnicalInput !== AUDIVERIS_GLYPH_CLASSIFIER_INPUT.GLOBAL_SAMPLES_ZIP_GLYPH_SHAPE) return false
    if (value.t1OmrEvidenceSatisfied !== false) return false
    if (value.evaluationScope !== MUSCIMA_EVALUATION_SCOPE.PAGE_DISJOINT_ONLY) return false
    if (value.writerIndependentEvaluation !== false) return false
    if (value.productionAuthorized !== false || value.modelReplacementAuthorized !== false) return false
    if (!Array.isArray(value.experimentBlockers) || !Object.isFrozen(value.experimentBlockers)) return false
    if (!Array.isArray(value.t1Blockers) || !Object.isFrozen(value.t1Blockers)) return false
    if (value.t1Blockers.length !== 1 || value.t1Blockers[0] !== MUSCIMA_RESEARCH_T1_BLOCKER.MISSING_OMR_ARTIFACT) return false

    if (value.status === MUSCIMA_RESEARCH_ADMISSION_STATUS.READY_FOR_ISOLATED_SAMPLES_ZIP_BUILD) {
      if (value.intendedUse !== MUSCIMA_RESEARCH_INTENDED_USE.NONCOMMERCIAL_RESEARCH) return false
      if (value.approvalCount !== value.mappedSampleCount) return false
      if (value.researchExperimentAdmittedSampleCount !== value.mappedSampleCount) return false
      if (value.experimentBlockers.length !== 0) return false
    } else {
      if (value.researchExperimentAdmittedSampleCount !== 0) return false
      if (value.experimentBlockers.length !== 1) return false
    }

    return true
  } catch {
    return false
  }
}
