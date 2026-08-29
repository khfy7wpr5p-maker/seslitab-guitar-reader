// Package 8B-T3 — MUSCIMA accidental -> Audiveris shape mapping contract.
//
// Research/data-domain only. This module does not read/write files, execute
// Audiveris, train a model, replace a model, or import production OMR/runtime
// code. It maps only a deliberately bounded accidental subset from already
// supplied annotation evidence and never upgrades that evidence to T1/T2
// trainability or production authorization.

import { createHash } from 'node:crypto'

export const MUSCIMA_ACCIDENTAL_MAPPING_SCHEMA_VERSION = 1

export const MUSCIMA_ACCIDENTAL_SOURCE_TO_AUDIVERIS_SHAPE = Object.freeze({
  accidentalSharp: 'SHARP',
  accidentalFlat: 'FLAT',
  accidentalNatural: 'NATURAL',
  accidentalDoubleSharp: 'DOUBLE_SHARP',
  accidentalDoubleFlat: 'DOUBLE_FLAT',
})

export const MUSCIMA_ACCIDENTAL_MAPPING_STATUS = Object.freeze({
  MAPPED_EXPERIMENTAL: 'mapped_experimental',
})

export const MUSCIMA_ACCIDENTAL_T1_BLOCKER = Object.freeze({
  MISSING_OMR_ARTIFACT: 'missing_omr_artifact',
  MISSING_TRAINING_APPROVAL: 'missing_training_approval',
  EXTERNAL_LICENSE_REVIEW_REQUIRED: 'external_license_review_required',
})

export const MUSCIMA_EVALUATION_SCOPE = Object.freeze({
  PAGE_DISJOINT_ONLY: 'page_disjoint_only',
})

const PAGE_INPUT_FIELDS = Object.freeze([
  'pageId', 'pageImageSha256', 'annotationXmlSha256', 'imageWidth', 'imageHeight',
  'split', 'objects',
])
const OBJECT_INPUT_FIELDS = Object.freeze([
  'objectId', 'className', 'top', 'left', 'width', 'height', 'maskRle',
])
const SAMPLE_FIELDS = Object.freeze([
  'sampleId', 'sourceObjectId', 'sourceClass', 'audiverisShape', 'split', 'bbox',
  'maskSha256', 'status', 't1Blockers',
])
const BBOX_FIELDS = Object.freeze(['x', 'y', 'width', 'height'])
const PLAN_FIELDS = Object.freeze([
  'schemaVersion', 'pageId', 'pageImageSha256', 'annotationXmlSha256',
  'imageWidth', 'imageHeight', 'split', 'evaluationScope', 'mappedSamples',
  'ignoredObjectCount',
])
const SHA256_RE = /^[0-9a-f]{64}$/u
const MASK_TOKEN_RE = /^([01]):([1-9][0-9]*)$/u

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

function assertExactFrozenRecord(value, fields, label) {
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

function requiredSafeInteger(value, fieldName, { positive = false } = {}) {
  if (!Number.isSafeInteger(value) || value < 0 || (positive && value === 0)) {
    throw new TypeError(`${fieldName} must be ${positive ? 'a positive' : 'a non-negative'} safe integer.`)
  }
  return value
}

function normalizeSplit(value) {
  if (value !== 'train' && value !== 'evaluation') {
    throw new TypeError('split must be train or evaluation.')
  }
  return value
}

function hashBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function hashText(value) {
  return hashBytes(Buffer.from(value, 'utf8'))
}

function decodeMaskFingerprint(maskRle, width, height) {
  const text = requiredString(maskRle, 'object.maskRle', 200000)
  const expectedPixels = width * height
  if (!Number.isSafeInteger(expectedPixels) || expectedPixels <= 0 || expectedPixels > 10_000_000) {
    throw new TypeError('object mask dimensions are unsupported.')
  }

  const decoded = Buffer.alloc(expectedPixels)
  let offset = 0
  for (const token of text.split(/\s+/u)) {
    const match = MASK_TOKEN_RE.exec(token)
    if (!match) throw new TypeError('object.maskRle contains an invalid run token.')
    const bit = Number(match[1])
    const count = Number(match[2])
    if (!Number.isSafeInteger(count) || offset + count > expectedPixels) {
      throw new TypeError('object.maskRle run length exceeds the declared glyph bounds.')
    }
    if (bit === 1) decoded.fill(1, offset, offset + count)
    offset += count
  }
  if (offset !== expectedPixels) {
    throw new TypeError('object.maskRle does not cover the exact declared glyph bounds.')
  }
  return hashBytes(decoded)
}

function freezeBbox(left, top, width, height) {
  return Object.freeze({ x: left, y: top, width, height })
}

function freezeBlockers() {
  return Object.freeze([
    MUSCIMA_ACCIDENTAL_T1_BLOCKER.MISSING_OMR_ARTIFACT,
    MUSCIMA_ACCIDENTAL_T1_BLOCKER.MISSING_TRAINING_APPROVAL,
    MUSCIMA_ACCIDENTAL_T1_BLOCKER.EXTERNAL_LICENSE_REVIEW_REQUIRED,
  ])
}

function normalizeMappedSample(page, object) {
  assertSupportedInputObject(object, OBJECT_INPUT_FIELDS, 'object')
  const objectId = requiredString(String(object.objectId), 'object.objectId', 128)
  const sourceClass = requiredString(object.className, 'object.className', 128)
  const audiverisShape = MUSCIMA_ACCIDENTAL_SOURCE_TO_AUDIVERIS_SHAPE[sourceClass]
  if (!audiverisShape) return null

  const top = requiredSafeInteger(object.top, 'object.top')
  const left = requiredSafeInteger(object.left, 'object.left')
  const width = requiredSafeInteger(object.width, 'object.width', { positive: true })
  const height = requiredSafeInteger(object.height, 'object.height', { positive: true })
  if (left + width > page.imageWidth || top + height > page.imageHeight) {
    throw new TypeError('mapped accidental bounds must stay within the declared page image.')
  }
  const maskSha256 = decodeMaskFingerprint(object.maskRle, width, height)
  const bbox = freezeBbox(left, top, width, height)
  const sampleId = `muscima:${hashText([
    page.pageId,
    page.annotationXmlSha256,
    objectId,
    sourceClass,
    audiverisShape,
    `${left},${top},${width},${height}`,
    maskSha256,
  ].join('|'))}`

  return Object.freeze({
    sampleId,
    sourceObjectId: objectId,
    sourceClass,
    audiverisShape,
    split: page.split,
    bbox,
    maskSha256,
    status: MUSCIMA_ACCIDENTAL_MAPPING_STATUS.MAPPED_EXPERIMENTAL,
    t1Blockers: freezeBlockers(),
  })
}

export function createMuscimaAccidentalPagePlan(input = {}) {
  assertSupportedInputObject(input, PAGE_INPUT_FIELDS, 'page input')
  assertDenseArray(input.objects, 'page input.objects')

  const page = Object.freeze({
    pageId: requiredString(input.pageId, 'pageId', 256),
    pageImageSha256: requiredSha256(input.pageImageSha256, 'pageImageSha256'),
    annotationXmlSha256: requiredSha256(input.annotationXmlSha256, 'annotationXmlSha256'),
    imageWidth: requiredSafeInteger(input.imageWidth, 'imageWidth', { positive: true }),
    imageHeight: requiredSafeInteger(input.imageHeight, 'imageHeight', { positive: true }),
    split: normalizeSplit(input.split),
  })

  const mappedSamples = []
  const seenObjectIds = new Set()
  let ignoredObjectCount = 0
  for (const object of input.objects) {
    assertSupportedInputObject(object, OBJECT_INPUT_FIELDS, 'object')
    const objectId = requiredString(String(object.objectId), 'object.objectId', 128)
    if (seenObjectIds.has(objectId)) throw new TypeError('objectId must be unique within one page.')
    seenObjectIds.add(objectId)
    const mapped = normalizeMappedSample(page, object)
    if (mapped) mappedSamples.push(mapped)
    else ignoredObjectCount += 1
  }

  mappedSamples.sort((left, right) => left.sampleId.localeCompare(right.sampleId))

  return Object.freeze({
    schemaVersion: MUSCIMA_ACCIDENTAL_MAPPING_SCHEMA_VERSION,
    ...page,
    evaluationScope: MUSCIMA_EVALUATION_SCOPE.PAGE_DISJOINT_ONLY,
    mappedSamples: Object.freeze(mappedSamples),
    ignoredObjectCount,
  })
}

export function assignDeterministicPageSplits(pageIds, evaluationPageCount) {
  assertDenseArray(pageIds, 'pageIds')
  if (!Number.isSafeInteger(evaluationPageCount) || evaluationPageCount <= 0 || evaluationPageCount >= pageIds.length) {
    throw new TypeError('evaluationPageCount must leave at least one train and one evaluation page.')
  }
  const normalized = pageIds.map((pageId, index) => requiredString(pageId, `pageIds[${index}]`, 256))
  if (new Set(normalized).size !== normalized.length) throw new TypeError('pageIds must be unique.')

  const ranked = normalized
    .map((pageId) => ({ pageId, rank: hashText(pageId) }))
    .sort((left, right) => left.rank.localeCompare(right.rank) || left.pageId.localeCompare(right.pageId))

  const evaluationIds = new Set(ranked.slice(-evaluationPageCount).map((entry) => entry.pageId))
  return Object.freeze(Object.fromEntries(
    [...normalized].sort().map((pageId) => [pageId, evaluationIds.has(pageId) ? 'evaluation' : 'train']),
  ))
}

export function summarizeMuscimaAccidentalPlans(plans) {
  assertDenseArray(plans, 'plans')
  const pageIds = new Set()
  const sampleIds = new Set()
  const classCounts = Object.create(null)
  const splitCounts = { train: 0, evaluation: 0 }
  let mappedSampleCount = 0
  let ignoredObjectCount = 0

  for (const plan of plans) {
    if (!isMuscimaAccidentalPagePlan(plan)) throw new TypeError('plans contains an invalid page plan.')
    if (pageIds.has(plan.pageId)) throw new TypeError('plans must not contain duplicate pageId values.')
    pageIds.add(plan.pageId)
    ignoredObjectCount += plan.ignoredObjectCount
    for (const sample of plan.mappedSamples) {
      if (sampleIds.has(sample.sampleId)) throw new TypeError('plans must not contain duplicate sampleId values.')
      sampleIds.add(sample.sampleId)
      mappedSampleCount += 1
      splitCounts[sample.split] += 1
      classCounts[sample.audiverisShape] = (classCounts[sample.audiverisShape] ?? 0) + 1
    }
  }

  return Object.freeze({
    pageCount: pageIds.size,
    mappedSampleCount,
    ignoredObjectCount,
    splitCounts: Object.freeze({ ...splitCounts }),
    classCounts: Object.freeze(Object.fromEntries(Object.entries(classCounts).sort())),
    evaluationScope: MUSCIMA_EVALUATION_SCOPE.PAGE_DISJOINT_ONLY,
    t1TrainableSampleCount: 0,
  })
}

export function isMuscimaAccidentalPagePlan(value) {
  try {
    if (!assertExactFrozenRecord(value, PLAN_FIELDS, 'page plan')) return false
    if (value.schemaVersion !== MUSCIMA_ACCIDENTAL_MAPPING_SCHEMA_VERSION) return false
    if (!SHA256_RE.test(value.pageImageSha256) || !SHA256_RE.test(value.annotationXmlSha256)) return false
    if (!Number.isSafeInteger(value.imageWidth) || value.imageWidth <= 0) return false
    if (!Number.isSafeInteger(value.imageHeight) || value.imageHeight <= 0) return false
    if (value.split !== 'train' && value.split !== 'evaluation') return false
    if (value.evaluationScope !== MUSCIMA_EVALUATION_SCOPE.PAGE_DISJOINT_ONLY) return false
    if (!Array.isArray(value.mappedSamples) || !Object.isFrozen(value.mappedSamples)) return false
    if (!Number.isSafeInteger(value.ignoredObjectCount) || value.ignoredObjectCount < 0) return false

    const seen = new Set()
    for (const sample of value.mappedSamples) {
      if (!assertExactFrozenRecord(sample, SAMPLE_FIELDS, 'sample')) return false
      if (!assertExactFrozenRecord(sample.bbox, BBOX_FIELDS, 'sample.bbox')) return false
      if (!Object.isFrozen(sample.t1Blockers) || sample.t1Blockers.length !== 3) return false
      if (sample.split !== value.split) return false
      if (sample.status !== MUSCIMA_ACCIDENTAL_MAPPING_STATUS.MAPPED_EXPERIMENTAL) return false
      if (MUSCIMA_ACCIDENTAL_SOURCE_TO_AUDIVERIS_SHAPE[sample.sourceClass] !== sample.audiverisShape) return false
      if (!SHA256_RE.test(sample.maskSha256)) return false
      if (seen.has(sample.sampleId)) return false
      seen.add(sample.sampleId)
      const { x, y, width, height } = sample.bbox
      if (![x, y, width, height].every(Number.isSafeInteger) || x < 0 || y < 0 || width <= 0 || height <= 0) return false
      if (x + width > value.imageWidth || y + height > value.imageHeight) return false
      if (
        sample.t1Blockers[0] !== MUSCIMA_ACCIDENTAL_T1_BLOCKER.MISSING_OMR_ARTIFACT ||
        sample.t1Blockers[1] !== MUSCIMA_ACCIDENTAL_T1_BLOCKER.MISSING_TRAINING_APPROVAL ||
        sample.t1Blockers[2] !== MUSCIMA_ACCIDENTAL_T1_BLOCKER.EXTERNAL_LICENSE_REVIEW_REQUIRED
      ) return false
    }
    return true
  } catch {
    return false
  }
}
