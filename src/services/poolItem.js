import {
  assertStrictInputObject,
  isStrictFrozenRecord,
  normalizeOptionalText,
  normalizeRequiredId,
  normalizeRequiredText,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

export const POOL_ITEM_SCHEMA_VERSION = 1
export const POOL_ITEM_MAX_TITLE_LENGTH = 160
export const POOL_ITEM_MAX_SHORT_DESCRIPTION_LENGTH = 500
export const POOL_ITEM_MAX_DETAIL_TEXT_LENGTH = 4000

export const POOL_AUDIENCE_MODE = Object.freeze({
  ALL: 'ALL',
  SELECTED: 'SELECTED',
})

const INPUT_FIELDS = Object.freeze([
  'poolItemId',
  'title',
  'shortDescription',
  'detailText',
  'publishedAt',
  'audienceMode',
  'recipientStudentIds',
])

const RECORD_FIELDS = Object.freeze([
  'schemaVersion',
  'poolItemId',
  'title',
  'shortDescription',
  'detailText',
  'publishedAt',
  'audienceMode',
  'recipientStudentIds',
  'revokedAt',
])

function normalizeRecipients(value) {
  if (!Array.isArray(value)) {
    throw new TypeError('recipientStudentIds must be an array.')
  }

  const seen = new Set()
  const normalized = []
  for (const raw of value) {
    const studentId = normalizeRequiredId(raw, 'recipientStudentIds entry')
    if (seen.has(studentId)) continue
    seen.add(studentId)
    normalized.push(studentId)
  }
  return Object.freeze(normalized)
}

function validateAudience(audienceMode, recipientStudentIds) {
  if (!Object.values(POOL_AUDIENCE_MODE).includes(audienceMode)) {
    throw new TypeError('audienceMode must be ALL or SELECTED.')
  }
  if (audienceMode === POOL_AUDIENCE_MODE.ALL && recipientStudentIds.length !== 0) {
    throw new Error('ALL PoolItem must not contain recipientStudentIds.')
  }
  if (audienceMode === POOL_AUDIENCE_MODE.SELECTED && recipientStudentIds.length === 0) {
    throw new Error('SELECTED PoolItem requires at least one recipientStudentIds entry.')
  }
}

export function createPoolItem(input = {}) {
  assertStrictInputObject(input, INPUT_FIELDS, 'PoolItem')

  const audienceMode = input.audienceMode ?? POOL_AUDIENCE_MODE.ALL
  const recipients = normalizeRecipients(input.recipientStudentIds ?? [])
  validateAudience(audienceMode, recipients)

  return Object.freeze({
    schemaVersion: POOL_ITEM_SCHEMA_VERSION,
    poolItemId: normalizeRequiredId(input.poolItemId, 'poolItemId'),
    title: normalizeRequiredText(input.title, 'title', POOL_ITEM_MAX_TITLE_LENGTH),
    shortDescription: normalizeRequiredText(
      input.shortDescription,
      'shortDescription',
      POOL_ITEM_MAX_SHORT_DESCRIPTION_LENGTH,
    ),
    detailText: normalizeOptionalText(
      input.detailText,
      'detailText',
      POOL_ITEM_MAX_DETAIL_TEXT_LENGTH,
    ),
    publishedAt: normalizeRequiredTimestamp(input.publishedAt, 'publishedAt'),
    audienceMode,
    recipientStudentIds: recipients,
    revokedAt: null,
  })
}

export function isPoolItem(value) {
  try {
    if (
      value?.schemaVersion !== POOL_ITEM_SCHEMA_VERSION ||
      !isStrictFrozenRecord(value, RECORD_FIELDS) ||
      value.revokedAt !== null ||
      !Array.isArray(value.recipientStudentIds) ||
      !Object.isFrozen(value.recipientStudentIds)
    ) {
      return false
    }

    if (normalizeRequiredId(value.poolItemId, 'poolItemId') !== value.poolItemId) return false
    if (
      normalizeRequiredText(value.title, 'title', POOL_ITEM_MAX_TITLE_LENGTH) !==
      value.title
    ) {
      return false
    }
    if (
      normalizeRequiredText(
        value.shortDescription,
        'shortDescription',
        POOL_ITEM_MAX_SHORT_DESCRIPTION_LENGTH,
      ) !== value.shortDescription
    ) {
      return false
    }
    if (
      normalizeOptionalText(
        value.detailText,
        'detailText',
        POOL_ITEM_MAX_DETAIL_TEXT_LENGTH,
      ) !== value.detailText
    ) {
      return false
    }
    if (
      normalizeRequiredTimestamp(value.publishedAt, 'publishedAt') !==
      value.publishedAt
    ) {
      return false
    }

    const normalized = normalizeRecipients(value.recipientStudentIds)
    if (
      normalized.length !== value.recipientStudentIds.length ||
      normalized.some((studentId, index) => studentId !== value.recipientStudentIds[index])
    ) {
      return false
    }

    validateAudience(value.audienceMode, value.recipientStudentIds)
    return true
  } catch {
    return false
  }
}
