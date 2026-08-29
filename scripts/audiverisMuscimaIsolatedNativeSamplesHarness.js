// Package 8B-T5 — isolated MUSCIMA -> Audiveris native sample staging harness.
//
// Pure research/data-domain preparation only. It never writes samples.zip,
// executes Audiveris, trains a classifier, replaces a model, or changes
// production OMR/runtime/deployment wiring.
//
// Audiveris upstream (master 7a36078e..., 2026-08-13) persists classifier
// samples through SampleRepository -> SampleSheet JAXB. A native Sample needs
// shape + interline + glyph location + run-table. Package 8B-T3 intentionally
// retained only a decoded-mask SHA-256, not raw mask payload or interline.
// T5 therefore fails closed rather than inventing either value.

import { createHash } from 'node:crypto'
import {
  MUSCIMA_EVALUATION_SCOPE,
  isMuscimaAccidentalPagePlan,
} from './audiverisMuscimaAccidentalMapping.js'
import {
  MUSCIMA_RESEARCH_ADMISSION_STATUS,
  MUSCIMA_RESEARCH_INTENDED_USE,
  assessMuscimaResearchTrainingAdmission,
} from './audiverisMuscimaResearchTrainingAdmission.js'

export const MUSCIMA_NATIVE_STAGING_SCHEMA_VERSION = 1

export const MUSCIMA_NATIVE_STAGING_STATUS = Object.freeze({
  BLOCKED_RESEARCH_ADMISSION: 'blocked_research_admission',
  BLOCKED_NATIVE_EVIDENCE: 'blocked_native_evidence',
  READY_FOR_AUDIVERIS_NATIVE_SERIALIZER: 'ready_for_audiveris_native_serializer',
})

export const MUSCIMA_NATIVE_STAGING_BLOCKER = Object.freeze({
  RESEARCH_ADMISSION_NOT_READY: 'research_admission_not_ready',
  MISSING_NATIVE_GLYPH_EVIDENCE: 'missing_native_glyph_evidence',
  AUDIVERIS_NATIVE_SERIALIZER_REQUIRED: 'audiveris_native_serializer_required',
})

export const AUDIVERIS_NATIVE_SAMPLE_REQUIREMENT = Object.freeze({
  upstreamRevision: '7a36078e7ba0c006052c1f661b949cf9b729f505',
  archiveFileName: 'samples.zip',
  perSheetEntryName: 'samples.xml',
  requiresShape: true,
  requiresInterline: true,
  requiresGlyphLocation: true,
  requiresRunTable: true,
})

const INPUT_FIELDS = Object.freeze(['plans', 'approvals', 'intendedUse', 'nativeEvidence'])
const EVIDENCE_FIELDS = Object.freeze(['sampleId', 'audiverisShape', 'maskRle', 'interline'])
const ENTRY_FIELDS = Object.freeze([
  'sampleId', 'pageId', 'sourceObjectId', 'audiverisShape', 'split',
  'left', 'top', 'width', 'height', 'interline', 'maskSha256', 'maskRle',
])
const MANIFEST_FIELDS = Object.freeze([
  'schemaVersion', 'format', 'evaluationScope', 'writerIndependentEvaluation',
  'sampleCount', 'entries',
])
const REPORT_FIELDS = Object.freeze([
  'schemaVersion', 'status', 'intendedUse', 'mappedSampleCount', 'approvalCount',
  'nativeEvidenceCount', 'missingNativeEvidenceCount', 'manifest',
  'manifestFingerprint', 'samplesZipBuilt', 'trainingExecuted',
  't1TrainableSampleCount', 't1OmrEvidenceSatisfied', 'productionAuthorized',
  'modelReplacementAuthorized', 'evaluationScope', 'writerIndependentEvaluation',
  'blockers',
])
const MASK_TOKEN_RE = /^([01]):([1-9][0-9]*)$/u
const SHA256_RE = /^[0-9a-f]{64}$/u

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
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
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

function requiredPositiveSafeInteger(value, fieldName) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${fieldName} must be a positive safe integer.`)
  }
  return value
}

function hashBytes(value) {
  return createHash('sha256').update(value).digest('hex')
}

function hashText(value) {
  return hashBytes(Buffer.from(value, 'utf8'))
}

function decodedMaskSha256(maskRle, width, height) {
  const text = requiredString(maskRle, 'nativeEvidence.maskRle', 200000)
  const expectedPixels = width * height
  if (!Number.isSafeInteger(expectedPixels) || expectedPixels <= 0 || expectedPixels > 10_000_000) {
    throw new TypeError('native evidence mask dimensions are unsupported.')
  }

  const decoded = Buffer.alloc(expectedPixels)
  let offset = 0
  for (const token of text.split(/\s+/u)) {
    const match = MASK_TOKEN_RE.exec(token)
    if (!match) throw new TypeError('nativeEvidence.maskRle contains an invalid run token.')
    const bit = Number(match[1])
    const count = Number(match[2])
    if (!Number.isSafeInteger(count) || offset + count > expectedPixels) {
      throw new TypeError('nativeEvidence.maskRle exceeds the exact mapped glyph bounds.')
    }
    if (bit === 1) decoded.fill(1, offset, offset + count)
    offset += count
  }
  if (offset !== expectedPixels) {
    throw new TypeError('nativeEvidence.maskRle does not cover the exact mapped glyph bounds.')
  }
  return hashBytes(decoded)
}

function collectMappedSamples(plans) {
  assertDenseArray(plans, 'plans')
  const samples = new Map()
  const pages = new Set()
  for (const plan of plans) {
    if (!isMuscimaAccidentalPagePlan(plan)) {
      throw new TypeError('plans contains an invalid T3 page plan.')
    }
    if (pages.has(plan.pageId)) throw new TypeError('plans contains duplicate pageId evidence.')
    pages.add(plan.pageId)
    for (const sample of plan.mappedSamples) {
      if (samples.has(sample.sampleId)) throw new TypeError('plans contains duplicate sampleId evidence.')
      samples.set(sample.sampleId, { plan, sample })
    }
  }
  return samples
}

function deepFreezeManifest(entries) {
  const frozenEntries = Object.freeze(entries.map((entry) => Object.freeze(entry)))
  return Object.freeze({
    schemaVersion: MUSCIMA_NATIVE_STAGING_SCHEMA_VERSION,
    format: 'audiveris_native_sample_staging_manifest',
    evaluationScope: MUSCIMA_EVALUATION_SCOPE.PAGE_DISJOINT_ONLY,
    writerIndependentEvaluation: false,
    sampleCount: frozenEntries.length,
    entries: frozenEntries,
  })
}

function canonicalManifestFingerprint(manifest) {
  return hashText(JSON.stringify(manifest))
}

function blockedReport(admission, status, blockers, nativeEvidenceCount = 0, missingCount = admission.mappedSampleCount) {
  return Object.freeze({
    schemaVersion: MUSCIMA_NATIVE_STAGING_SCHEMA_VERSION,
    status,
    intendedUse: admission.intendedUse,
    mappedSampleCount: admission.mappedSampleCount,
    approvalCount: admission.approvalCount,
    nativeEvidenceCount,
    missingNativeEvidenceCount: missingCount,
    manifest: null,
    manifestFingerprint: null,
    samplesZipBuilt: false,
    trainingExecuted: false,
    t1TrainableSampleCount: 0,
    t1OmrEvidenceSatisfied: false,
    productionAuthorized: false,
    modelReplacementAuthorized: false,
    evaluationScope: MUSCIMA_EVALUATION_SCOPE.PAGE_DISJOINT_ONLY,
    writerIndependentEvaluation: false,
    blockers: Object.freeze([...blockers]),
  })
}

export function prepareMuscimaAudiverisNativeSampleStaging(input = {}) {
  assertSupportedInputObject(input, INPUT_FIELDS, 'native staging input')

  const admission = assessMuscimaResearchTrainingAdmission({
    plans: input.plans,
    approvals: input.approvals,
    intendedUse: input.intendedUse,
  })

  if (admission.status !== MUSCIMA_RESEARCH_ADMISSION_STATUS.READY_FOR_ISOLATED_SAMPLES_ZIP_BUILD) {
    return blockedReport(
      admission,
      MUSCIMA_NATIVE_STAGING_STATUS.BLOCKED_RESEARCH_ADMISSION,
      [MUSCIMA_NATIVE_STAGING_BLOCKER.RESEARCH_ADMISSION_NOT_READY],
    )
  }

  const samples = collectMappedSamples(input.plans)
  assertDenseArray(input.nativeEvidence, 'nativeEvidence')
  const evidenceBySample = new Map()

  for (const evidence of input.nativeEvidence) {
    assertSupportedInputObject(evidence, EVIDENCE_FIELDS, 'native evidence')
    const sampleId = requiredString(evidence.sampleId, 'nativeEvidence.sampleId', 256)
    const audiverisShape = requiredString(evidence.audiverisShape, 'nativeEvidence.audiverisShape', 64)
    const interline = requiredPositiveSafeInteger(evidence.interline, 'nativeEvidence.interline')
    if (evidenceBySample.has(sampleId)) throw new TypeError('nativeEvidence contains duplicate sampleId evidence.')

    const mapped = samples.get(sampleId)
    if (!mapped) throw new TypeError('nativeEvidence references an unknown mapped sample.')
    if (audiverisShape !== mapped.sample.audiverisShape) {
      throw new TypeError('nativeEvidence shape does not bind the exact mapped sample.')
    }

    const { width, height } = mapped.sample.bbox
    const maskSha256 = decodedMaskSha256(evidence.maskRle, width, height)
    if (maskSha256 !== mapped.sample.maskSha256) {
      throw new TypeError('nativeEvidence mask does not bind the exact T3 decoded-mask fingerprint.')
    }

    evidenceBySample.set(sampleId, Object.freeze({
      sampleId,
      audiverisShape,
      maskRle: requiredString(evidence.maskRle, 'nativeEvidence.maskRle', 200000),
      interline,
      maskSha256,
    }))
  }

  const missingCount = samples.size - evidenceBySample.size
  if (missingCount !== 0) {
    return blockedReport(
      admission,
      MUSCIMA_NATIVE_STAGING_STATUS.BLOCKED_NATIVE_EVIDENCE,
      [MUSCIMA_NATIVE_STAGING_BLOCKER.MISSING_NATIVE_GLYPH_EVIDENCE],
      evidenceBySample.size,
      missingCount,
    )
  }

  const entries = [...samples.values()]
    .map(({ plan, sample }) => {
      const evidence = evidenceBySample.get(sample.sampleId)
      const { x, y, width, height } = sample.bbox
      return {
        sampleId: sample.sampleId,
        pageId: plan.pageId,
        sourceObjectId: sample.sourceObjectId,
        audiverisShape: sample.audiverisShape,
        split: sample.split,
        left: x,
        top: y,
        width,
        height,
        interline: evidence.interline,
        maskSha256: evidence.maskSha256,
        maskRle: evidence.maskRle,
      }
    })
    .sort((left, right) => left.sampleId.localeCompare(right.sampleId))

  const manifest = deepFreezeManifest(entries)

  return Object.freeze({
    schemaVersion: MUSCIMA_NATIVE_STAGING_SCHEMA_VERSION,
    status: MUSCIMA_NATIVE_STAGING_STATUS.READY_FOR_AUDIVERIS_NATIVE_SERIALIZER,
    intendedUse: admission.intendedUse,
    mappedSampleCount: admission.mappedSampleCount,
    approvalCount: admission.approvalCount,
    nativeEvidenceCount: entries.length,
    missingNativeEvidenceCount: 0,
    manifest,
    manifestFingerprint: canonicalManifestFingerprint(manifest),
    samplesZipBuilt: false,
    trainingExecuted: false,
    t1TrainableSampleCount: 0,
    t1OmrEvidenceSatisfied: false,
    productionAuthorized: false,
    modelReplacementAuthorized: false,
    evaluationScope: MUSCIMA_EVALUATION_SCOPE.PAGE_DISJOINT_ONLY,
    writerIndependentEvaluation: false,
    blockers: Object.freeze([MUSCIMA_NATIVE_STAGING_BLOCKER.AUDIVERIS_NATIVE_SERIALIZER_REQUIRED]),
  })
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

function isManifest(value) {
  if (!isExactFrozenRecord(value, MANIFEST_FIELDS)) return false
  if (value.schemaVersion !== MUSCIMA_NATIVE_STAGING_SCHEMA_VERSION) return false
  if (value.format !== 'audiveris_native_sample_staging_manifest') return false
  if (value.evaluationScope !== MUSCIMA_EVALUATION_SCOPE.PAGE_DISJOINT_ONLY) return false
  if (value.writerIndependentEvaluation !== false) return false
  if (!Number.isSafeInteger(value.sampleCount) || value.sampleCount <= 0) return false
  if (!Array.isArray(value.entries) || !Object.isFrozen(value.entries) || value.entries.length !== value.sampleCount) return false
  const ids = new Set()
  for (const entry of value.entries) {
    if (!isExactFrozenRecord(entry, ENTRY_FIELDS)) return false
    if (ids.has(entry.sampleId)) return false
    ids.add(entry.sampleId)
    if (!SHA256_RE.test(entry.maskSha256)) return false
    if (!Number.isSafeInteger(entry.interline) || entry.interline <= 0) return false
    if (![entry.left, entry.top, entry.width, entry.height].every(Number.isSafeInteger)) return false
    if (entry.left < 0 || entry.top < 0 || entry.width <= 0 || entry.height <= 0) return false
  }
  return true
}

export function isMuscimaAudiverisNativeStagingReport(value) {
  try {
    if (!isExactFrozenRecord(value, REPORT_FIELDS)) return false
    if (value.schemaVersion !== MUSCIMA_NATIVE_STAGING_SCHEMA_VERSION) return false
    if (!Object.values(MUSCIMA_NATIVE_STAGING_STATUS).includes(value.status)) return false
    if (!Object.values(MUSCIMA_RESEARCH_INTENDED_USE).includes(value.intendedUse)) return false
    if (!Number.isSafeInteger(value.mappedSampleCount) || value.mappedSampleCount <= 0) return false
    if (!Number.isSafeInteger(value.approvalCount) || value.approvalCount < 0 || value.approvalCount > value.mappedSampleCount) return false
    if (!Number.isSafeInteger(value.nativeEvidenceCount) || value.nativeEvidenceCount < 0 || value.nativeEvidenceCount > value.mappedSampleCount) return false
    if (!Number.isSafeInteger(value.missingNativeEvidenceCount) || value.missingNativeEvidenceCount < 0) return false
    if (value.nativeEvidenceCount + value.missingNativeEvidenceCount !== value.mappedSampleCount) return false
    if (value.samplesZipBuilt !== false || value.trainingExecuted !== false) return false
    if (value.t1TrainableSampleCount !== 0 || value.t1OmrEvidenceSatisfied !== false) return false
    if (value.productionAuthorized !== false || value.modelReplacementAuthorized !== false) return false
    if (value.evaluationScope !== MUSCIMA_EVALUATION_SCOPE.PAGE_DISJOINT_ONLY || value.writerIndependentEvaluation !== false) return false
    if (!Array.isArray(value.blockers) || !Object.isFrozen(value.blockers)) return false

    if (value.status === MUSCIMA_NATIVE_STAGING_STATUS.READY_FOR_AUDIVERIS_NATIVE_SERIALIZER) {
      if (value.approvalCount !== value.mappedSampleCount || value.nativeEvidenceCount !== value.mappedSampleCount) return false
      if (!isManifest(value.manifest)) return false
      if (value.manifest.sampleCount !== value.mappedSampleCount) return false
      if (!SHA256_RE.test(value.manifestFingerprint)) return false
      if (canonicalManifestFingerprint(value.manifest) !== value.manifestFingerprint) return false
      return value.blockers.length === 1 &&
        value.blockers[0] === MUSCIMA_NATIVE_STAGING_BLOCKER.AUDIVERIS_NATIVE_SERIALIZER_REQUIRED
    }

    if (value.manifest !== null || value.manifestFingerprint !== null) return false
    if (value.status === MUSCIMA_NATIVE_STAGING_STATUS.BLOCKED_RESEARCH_ADMISSION) {
      return value.nativeEvidenceCount === 0 &&
        value.blockers.length === 1 &&
        value.blockers[0] === MUSCIMA_NATIVE_STAGING_BLOCKER.RESEARCH_ADMISSION_NOT_READY
    }
    if (value.status === MUSCIMA_NATIVE_STAGING_STATUS.BLOCKED_NATIVE_EVIDENCE) {
      return value.approvalCount === value.mappedSampleCount &&
        value.missingNativeEvidenceCount > 0 &&
        value.blockers.length === 1 &&
        value.blockers[0] === MUSCIMA_NATIVE_STAGING_BLOCKER.MISSING_NATIVE_GLYPH_EVIDENCE
    }
    return false
  } catch {
    return false
  }
}
