// Package 8B-T1 — verified Audiveris training-dataset contract.
//
// Research/data-domain only. This module does not read or write files, run
// Audiveris, train a model, replace a model, or import production OMR/runtime
// code. MusicXML may be retained as provenance evidence, but it is never enough
// to make a symbol sample trainable.

import { createHash } from 'node:crypto'

export const AUDIVERIS_DATASET_SCHEMA_VERSION = 1
export const AUDIVERIS_TRAINING_APPROVAL_SCOPE = 'audiveris_training_sample'

export const AUDIVERIS_DATASET_SPLIT = Object.freeze({
  TRAIN: 'train',
  EVALUATION: 'evaluation',
})

export const AUDIVERIS_TRAINABILITY_STATUS = Object.freeze({
  TRAINABLE: 'trainable',
  INCOMPLETE: 'incomplete',
})

export const AUDIVERIS_TRAINABILITY_REASON = Object.freeze({
  MUSICXML_ONLY_EVIDENCE: 'musicxml_only_evidence',
  MISSING_SOURCE_PDF: 'missing_source_pdf',
  MISSING_PAGE_IMAGE: 'missing_page_image',
  MISSING_OMR_ARTIFACT: 'missing_omr_artifact',
  MISSING_GLYPH_IMAGE: 'missing_glyph_image',
  MISSING_SHAPE_LABEL: 'missing_shape_label',
  MISSING_SYMBOL_COORDINATES: 'missing_symbol_coordinates',
  MISSING_TRAINING_APPROVAL: 'missing_training_approval',
  MISSING_LICENSE_EVIDENCE: 'missing_license_evidence',
  MISSING_AUDIVERIS_VERSION: 'missing_audiveris_version',
  MISSING_SPLIT: 'missing_split',
})

const CANDIDATE_FIELDS = Object.freeze([
  'schemaVersion',
  'candidateId',
  'provenanceId',
  'split',
  'sourcePdf',
  'pageImage',
  'omrArtifact',
  'musicXml',
  'glyphImage',
  'shapeLabel',
  'symbolCoordinates',
  'referenceApprovalEvidence',
  'trainingApproval',
  'licenseId',
  'licenseEvidence',
  'audiverisVersion',
])

const ARTIFACT_FIELDS = Object.freeze(['path', 'sha256'])
const APPROVAL_FIELDS = Object.freeze([
  'approvalId',
  'actorId',
  'approvedAt',
  'scope',
  'evidence',
])
const COORDINATE_FIELDS = Object.freeze(['pageIndex', 'x', 'y', 'width', 'height'])
const MANIFEST_FIELDS = Object.freeze([
  'schemaVersion',
  'datasetId',
  'versionId',
  'createdAt',
  'samples',
  'splitCounts',
  'datasetFingerprint',
])

const PDF_EXTENSIONS = Object.freeze(['.pdf'])
const OMR_EXTENSIONS = Object.freeze(['.omr'])
const MUSICXML_EXTENSIONS = Object.freeze(['.musicxml', '.xml', '.mxl'])
const IMAGE_EXTENSIONS = Object.freeze(['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.bmp'])
const EVIDENCE_EXTENSIONS = Object.freeze(['.md', '.txt', '.json'])
const SHA256_RE = /^[0-9a-f]{64}$/u

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
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

function optionalString(value, fieldName, maxLength = 256) {
  if (value === null || value === undefined) return null
  return requiredString(value, fieldName, maxLength)
}

function normalizedTime(value, fieldName = 'createdAt') {
  if (value === null || value === undefined) return null
  return requiredString(value, fieldName, 128)
}

function assertExactObject(value, fields, label) {
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
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
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
      !Number.isInteger(index) ||
      index < 0 ||
      index >= value.length ||
      String(index) !== key ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      throw new TypeError(`${label} contains an unsupported array property.`)
    }
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

function normalizedRepositoryPath(value, fieldName, allowedExtensions) {
  const path = requiredString(value, `${fieldName}.path`, 1024)
  if (
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes('://') ||
    path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new TypeError(`${fieldName}.path must be a safe repository-relative path.`)
  }
  const lower = path.toLowerCase()
  if (!allowedExtensions.some((extension) => lower.endsWith(extension))) {
    throw new TypeError(`${fieldName}.path has an unsupported file extension.`)
  }
  return path
}

function normalizeArtifact(value, fieldName, allowedExtensions, { optional = true } = {}) {
  if (value === null || value === undefined) {
    if (optional) return null
    throw new TypeError(`${fieldName} is required.`)
  }
  assertExactObject(value, ARTIFACT_FIELDS, fieldName)
  const path = normalizedRepositoryPath(value.path, fieldName, allowedExtensions)
  const sha256 = requiredString(value.sha256, `${fieldName}.sha256`, 64).toLowerCase()
  if (!SHA256_RE.test(sha256)) {
    throw new TypeError(`${fieldName}.sha256 must be a 64-character SHA-256 digest.`)
  }
  return Object.freeze({ path, sha256 })
}

function normalizeSplit(value) {
  if (value === null || value === undefined) return null
  if (!Object.values(AUDIVERIS_DATASET_SPLIT).includes(value)) {
    throw new TypeError('split must be train, evaluation, or null.')
  }
  return value
}

function normalizeCoordinates(value) {
  if (value === null || value === undefined) return null
  assertExactObject(value, COORDINATE_FIELDS, 'symbolCoordinates')
  const normalized = {}
  for (const field of COORDINATE_FIELDS) {
    const number = value[field]
    if (!Number.isSafeInteger(number) || number < 0) {
      throw new TypeError(`symbolCoordinates.${field} must be a non-negative safe integer.`)
    }
    normalized[field] = number
  }
  if (normalized.width === 0 || normalized.height === 0) {
    throw new TypeError('symbolCoordinates width and height must be greater than zero.')
  }
  return Object.freeze(normalized)
}

function normalizeTrainingApproval(value) {
  if (value === null || value === undefined) return null
  assertExactObject(value, APPROVAL_FIELDS, 'trainingApproval')
  if (value.scope !== AUDIVERIS_TRAINING_APPROVAL_SCOPE) {
    throw new TypeError('trainingApproval.scope must explicitly approve Audiveris training use.')
  }
  return Object.freeze({
    approvalId: requiredString(value.approvalId, 'trainingApproval.approvalId'),
    actorId: requiredString(value.actorId, 'trainingApproval.actorId'),
    approvedAt: requiredString(value.approvedAt, 'trainingApproval.approvedAt', 128),
    scope: AUDIVERIS_TRAINING_APPROVAL_SCOPE,
    evidence: normalizeArtifact(value.evidence, 'trainingApproval.evidence', EVIDENCE_EXTENSIONS, {
      optional: false,
    }),
  })
}

function buildCandidate(input) {
  return deepFreeze({
    schemaVersion: AUDIVERIS_DATASET_SCHEMA_VERSION,
    candidateId: requiredString(input.candidateId, 'candidateId'),
    provenanceId: requiredString(input.provenanceId, 'provenanceId'),
    split: normalizeSplit(input.split),
    sourcePdf: normalizeArtifact(input.sourcePdf, 'sourcePdf', PDF_EXTENSIONS),
    pageImage: normalizeArtifact(input.pageImage, 'pageImage', IMAGE_EXTENSIONS),
    omrArtifact: normalizeArtifact(input.omrArtifact, 'omrArtifact', OMR_EXTENSIONS),
    musicXml: normalizeArtifact(input.musicXml, 'musicXml', MUSICXML_EXTENSIONS),
    glyphImage: normalizeArtifact(input.glyphImage, 'glyphImage', IMAGE_EXTENSIONS),
    shapeLabel: optionalString(input.shapeLabel, 'shapeLabel', 128),
    symbolCoordinates: normalizeCoordinates(input.symbolCoordinates),
    referenceApprovalEvidence: normalizeArtifact(
      input.referenceApprovalEvidence,
      'referenceApprovalEvidence',
      EVIDENCE_EXTENSIONS,
    ),
    trainingApproval: normalizeTrainingApproval(input.trainingApproval),
    licenseId: optionalString(input.licenseId, 'licenseId', 128),
    licenseEvidence: normalizeArtifact(input.licenseEvidence, 'licenseEvidence', EVIDENCE_EXTENSIONS),
    audiverisVersion: optionalString(input.audiverisVersion, 'audiverisVersion', 64),
  })
}

function candidateInputFromRecord(candidate) {
  return {
    candidateId: candidate.candidateId,
    provenanceId: candidate.provenanceId,
    split: candidate.split,
    sourcePdf: candidate.sourcePdf,
    pageImage: candidate.pageImage,
    omrArtifact: candidate.omrArtifact,
    musicXml: candidate.musicXml,
    glyphImage: candidate.glyphImage,
    shapeLabel: candidate.shapeLabel,
    symbolCoordinates: candidate.symbolCoordinates,
    referenceApprovalEvidence: candidate.referenceApprovalEvidence,
    trainingApproval: candidate.trainingApproval,
    licenseId: candidate.licenseId,
    licenseEvidence: candidate.licenseEvidence,
    audiverisVersion: candidate.audiverisVersion,
  }
}

function sameArtifact(left, right) {
  if (left === null || right === null) return left === right
  return left.path === right.path && left.sha256 === right.sha256
}

function sameApproval(left, right) {
  if (left === null || right === null) return left === right
  return (
    left.approvalId === right.approvalId &&
    left.actorId === right.actorId &&
    left.approvedAt === right.approvedAt &&
    left.scope === right.scope &&
    sameArtifact(left.evidence, right.evidence)
  )
}

function sameCoordinates(left, right) {
  if (left === null || right === null) return left === right
  return COORDINATE_FIELDS.every((field) => left[field] === right[field])
}

function hasStrictFrozenCandidateShape(value) {
  if (!isPlainObject(value) || !Object.isFrozen(value)) return false
  const keys = Reflect.ownKeys(value)
  if (
    keys.length !== CANDIDATE_FIELDS.length ||
    keys.some((key) => typeof key !== 'string' || !CANDIDATE_FIELDS.includes(key))
  ) return false
  const descriptors = Object.getOwnPropertyDescriptors(value)
  return CANDIDATE_FIELDS.every((field) => {
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

export function createAudiverisTrainingCandidate(input = {}) {
  return buildCandidate(input)
}

export function isAudiverisTrainingCandidate(value) {
  try {
    if (!hasStrictFrozenCandidateShape(value)) return false
    if (value.schemaVersion !== AUDIVERIS_DATASET_SCHEMA_VERSION) return false
    const rebuilt = buildCandidate(candidateInputFromRecord(value))
    return (
      rebuilt.candidateId === value.candidateId &&
      rebuilt.provenanceId === value.provenanceId &&
      rebuilt.split === value.split &&
      sameArtifact(rebuilt.sourcePdf, value.sourcePdf) &&
      sameArtifact(rebuilt.pageImage, value.pageImage) &&
      sameArtifact(rebuilt.omrArtifact, value.omrArtifact) &&
      sameArtifact(rebuilt.musicXml, value.musicXml) &&
      sameArtifact(rebuilt.glyphImage, value.glyphImage) &&
      rebuilt.shapeLabel === value.shapeLabel &&
      sameCoordinates(rebuilt.symbolCoordinates, value.symbolCoordinates) &&
      sameArtifact(rebuilt.referenceApprovalEvidence, value.referenceApprovalEvidence) &&
      sameApproval(rebuilt.trainingApproval, value.trainingApproval) &&
      rebuilt.licenseId === value.licenseId &&
      sameArtifact(rebuilt.licenseEvidence, value.licenseEvidence) &&
      rebuilt.audiverisVersion === value.audiverisVersion
    )
  } catch {
    return false
  }
}

export function evaluateAudiverisTrainingCandidate(candidate) {
  if (!isAudiverisTrainingCandidate(candidate)) {
    throw new TypeError('candidate must be a valid immutable Audiveris training candidate.')
  }

  const reasons = []
  if (
    candidate.musicXml &&
    !candidate.sourcePdf &&
    !candidate.pageImage &&
    !candidate.omrArtifact &&
    !candidate.glyphImage
  ) reasons.push(AUDIVERIS_TRAINABILITY_REASON.MUSICXML_ONLY_EVIDENCE)
  if (!candidate.sourcePdf) reasons.push(AUDIVERIS_TRAINABILITY_REASON.MISSING_SOURCE_PDF)
  if (!candidate.pageImage) reasons.push(AUDIVERIS_TRAINABILITY_REASON.MISSING_PAGE_IMAGE)
  if (!candidate.omrArtifact) reasons.push(AUDIVERIS_TRAINABILITY_REASON.MISSING_OMR_ARTIFACT)
  if (!candidate.glyphImage) reasons.push(AUDIVERIS_TRAINABILITY_REASON.MISSING_GLYPH_IMAGE)
  if (!candidate.shapeLabel) reasons.push(AUDIVERIS_TRAINABILITY_REASON.MISSING_SHAPE_LABEL)
  if (!candidate.symbolCoordinates) reasons.push(AUDIVERIS_TRAINABILITY_REASON.MISSING_SYMBOL_COORDINATES)
  if (!candidate.trainingApproval) reasons.push(AUDIVERIS_TRAINABILITY_REASON.MISSING_TRAINING_APPROVAL)
  if (!candidate.licenseId || !candidate.licenseEvidence) {
    reasons.push(AUDIVERIS_TRAINABILITY_REASON.MISSING_LICENSE_EVIDENCE)
  }
  if (!candidate.audiverisVersion) reasons.push(AUDIVERIS_TRAINABILITY_REASON.MISSING_AUDIVERIS_VERSION)
  if (!candidate.split) reasons.push(AUDIVERIS_TRAINABILITY_REASON.MISSING_SPLIT)

  return Object.freeze({
    status: reasons.length
      ? AUDIVERIS_TRAINABILITY_STATUS.INCOMPLETE
      : AUDIVERIS_TRAINABILITY_STATUS.TRAINABLE,
    reasons: Object.freeze(reasons),
  })
}

export function requireAudiverisTrainableSample(candidate) {
  const evaluation = evaluateAudiverisTrainingCandidate(candidate)
  if (evaluation.status !== AUDIVERIS_TRAINABILITY_STATUS.TRAINABLE) {
    throw new Error(`Audiveris training candidate is not trainable: ${evaluation.reasons.join(', ')}.`)
  }
  return candidate
}

function stableSerialize(value) {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`
}

function fingerprint(value) {
  return `sha256:${createHash('sha256').update(stableSerialize(value), 'utf8').digest('hex')}`
}

function enforceSplitIsolation(samples) {
  const provenanceSplits = new Map()
  const artifactSplits = new Map()

  for (const sample of samples) {
    const priorProvenanceSplit = provenanceSplits.get(sample.provenanceId)
    if (priorProvenanceSplit && priorProvenanceSplit !== sample.split) {
      throw new Error(`Train/evaluation leakage detected for provenanceId ${sample.provenanceId}.`)
    }
    provenanceSplits.set(sample.provenanceId, sample.split)

    for (const artifact of [sample.sourcePdf, sample.pageImage, sample.omrArtifact]) {
      const priorArtifactSplit = artifactSplits.get(artifact.sha256)
      if (priorArtifactSplit && priorArtifactSplit !== sample.split) {
        throw new Error('Train/evaluation leakage detected through shared source evidence.')
      }
      artifactSplits.set(artifact.sha256, sample.split)
    }
  }
}

export function createAudiverisDatasetManifest({
  datasetId,
  versionId,
  createdAt = null,
  samples,
} = {}) {
  const normalizedDatasetId = requiredString(datasetId, 'datasetId')
  const normalizedVersionId = requiredString(versionId, 'versionId')
  const normalizedCreatedAt = normalizedTime(createdAt)
  assertDenseArray(samples, 'samples')
  if (!samples.length) throw new TypeError('samples must contain at least one trainable sample.')

  const ids = new Set()
  const normalizedSamples = samples.map((sample) => {
    const trainable = requireAudiverisTrainableSample(sample)
    if (ids.has(trainable.candidateId)) {
      throw new Error(`Duplicate Audiveris training candidateId: ${trainable.candidateId}.`)
    }
    ids.add(trainable.candidateId)
    return trainable
  }).sort((left, right) => left.candidateId.localeCompare(right.candidateId, 'en'))

  enforceSplitIsolation(normalizedSamples)

  const splitCounts = Object.freeze({
    train: normalizedSamples.filter((sample) => sample.split === AUDIVERIS_DATASET_SPLIT.TRAIN).length,
    evaluation: normalizedSamples.filter(
      (sample) => sample.split === AUDIVERIS_DATASET_SPLIT.EVALUATION,
    ).length,
  })
  const fingerprintPayload = {
    schemaVersion: AUDIVERIS_DATASET_SCHEMA_VERSION,
    datasetId: normalizedDatasetId,
    versionId: normalizedVersionId,
    createdAt: normalizedCreatedAt,
    samples: normalizedSamples,
  }

  return Object.freeze({
    schemaVersion: AUDIVERIS_DATASET_SCHEMA_VERSION,
    datasetId: normalizedDatasetId,
    versionId: normalizedVersionId,
    createdAt: normalizedCreatedAt,
    samples: Object.freeze([...normalizedSamples]),
    splitCounts,
    datasetFingerprint: fingerprint(fingerprintPayload),
  })
}

export function isAudiverisDatasetManifest(value) {
  try {
    if (!isPlainObject(value) || !Object.isFrozen(value)) return false
    const keys = Reflect.ownKeys(value)
    if (
      keys.length !== MANIFEST_FIELDS.length ||
      keys.some((key) => typeof key !== 'string' || !MANIFEST_FIELDS.includes(key))
    ) return false
    if (!Object.isFrozen(value.samples) || !Object.isFrozen(value.splitCounts)) return false
    const rebuilt = createAudiverisDatasetManifest({
      datasetId: value.datasetId,
      versionId: value.versionId,
      createdAt: value.createdAt,
      samples: value.samples,
    })
    return (
      rebuilt.schemaVersion === value.schemaVersion &&
      rebuilt.datasetFingerprint === value.datasetFingerprint &&
      rebuilt.splitCounts.train === value.splitCounts.train &&
      rebuilt.splitCounts.evaluation === value.splitCounts.evaluation &&
      rebuilt.samples.length === value.samples.length &&
      rebuilt.samples.every((sample, index) => sample === value.samples[index])
    )
  } catch {
    return false
  }
}
