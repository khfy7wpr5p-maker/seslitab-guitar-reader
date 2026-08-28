// Package 8-T1 — immutable teacher revision domain contract.
//
// This module is intentionally dependency-free and disconnected from UI,
// backend persistence, OMR, Audiveris, deployment, and student sharing.
// It establishes only the safe revision identity/snapshot boundary required
// before correction, approval, undo, concurrency, or teacher UI can be added.

export const TEACHER_REVISION_SCHEMA_VERSION = 1

export const TEACHER_REVISION_KIND = Object.freeze({
  AUTOMATIC: 'automatic',
  TEACHER_CORRECTED: 'teacher_corrected',
})

const FNV_1A_64_OFFSET = 0xcbf29ce484222325n
const FNV_1A_64_PRIME = 0x100000001b3n
const UINT64_MASK = 0xffffffffffffffffn

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function normalizeRequiredId(value, fieldName) {
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

function rejectUnsupportedObjectShape(value, path) {
  const symbolKeys = Object.getOwnPropertySymbols(value)
  if (symbolKeys.length > 0) {
    throw new TypeError(`Revision content contains a symbol key at ${path}.`)
  }

  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable) {
      throw new TypeError(
        `Revision content contains a non-enumerable property at ${path}.${key}.`,
      )
    }
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw new TypeError(
        `Revision content contains an accessor property at ${path}.${key}.`,
      )
    }
  }
}

function cloneSnapshotValue(value, seen, path) {
  if (value === null) return null

  const valueType = typeof value
  if (valueType === 'string' || valueType === 'boolean') return value

  if (valueType === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Revision content contains a non-finite number at ${path}.`)
    }
    return Object.is(value, -0) ? 0 : value
  }

  if (
    valueType === 'undefined' ||
    valueType === 'function' ||
    valueType === 'symbol' ||
    valueType === 'bigint'
  ) {
    throw new TypeError(`Revision content contains unsupported data at ${path}.`)
  }

  if (seen.has(value)) {
    throw new TypeError(`Revision content contains a circular reference at ${path}.`)
  }
  seen.add(value)

  if (Array.isArray(value)) {
    rejectUnsupportedObjectShape(value, path)
    const result = value.map((entry, index) =>
      cloneSnapshotValue(entry, seen, `${path}[${index}]`),
    )
    seen.delete(value)
    return result
  }

  if (!isPlainObject(value)) {
    seen.delete(value)
    throw new TypeError(`Revision content must contain only plain data at ${path}.`)
  }

  rejectUnsupportedObjectShape(value, path)
  const result = {}
  for (const key of Object.keys(value).sort()) {
    result[key] = cloneSnapshotValue(value[key], seen, `${path}.${key}`)
  }

  seen.delete(value)
  return result
}

function cloneRevisionContent(content) {
  if (!Array.isArray(content) && !isPlainObject(content)) {
    throw new TypeError('Revision content must be an array or plain object.')
  }
  return cloneSnapshotValue(content, new Set(), 'content')
}

function stableSerialize(value) {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return JSON.stringify(value)

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`
  }

  const keys = Object.keys(value).sort()
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
    .join(',')}}`
}

function fnv1a64(text) {
  let hash = FNV_1A_64_OFFSET
  const bytes = new TextEncoder().encode(text)

  for (const byte of bytes) {
    hash ^= BigInt(byte)
    hash = (hash * FNV_1A_64_PRIME) & UINT64_MASK
  }

  return hash.toString(16).padStart(16, '0')
}

function fingerprintSnapshot(snapshot) {
  const serialized = stableSerialize(snapshot)
  return `fnv1a64-v1:${fnv1a64(serialized)}:${serialized.length}`
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value

  for (const child of Object.values(value)) {
    deepFreeze(child)
  }
  return Object.freeze(value)
}

function buildFrozenRevision({
  revisionId,
  revisionKind,
  sourceId,
  sourceRevisionId,
  parentRevisionId,
  createdAt,
  content,
}) {
  const snapshot = cloneRevisionContent(content)
  const contentFingerprint = fingerprintSnapshot(snapshot)
  deepFreeze(snapshot)

  return Object.freeze({
    schemaVersion: TEACHER_REVISION_SCHEMA_VERSION,
    revisionId,
    revisionKind,
    sourceId,
    sourceRevisionId,
    parentRevisionId,
    createdAt,
    contentFingerprint,
    content: snapshot,
  })
}

function validateRevisionShape(value) {
  if (!isPlainObject(value) || !Object.isFrozen(value)) return false
  if (value.schemaVersion !== TEACHER_REVISION_SCHEMA_VERSION) return false
  if (!Object.values(TEACHER_REVISION_KIND).includes(value.revisionKind)) return false

  try {
    const revisionId = normalizeRequiredId(value.revisionId, 'revisionId')
    const sourceId = normalizeRequiredId(value.sourceId, 'sourceId')
    const sourceRevisionId = normalizeRequiredId(
      value.sourceRevisionId,
      'sourceRevisionId',
    )
    const createdAt = normalizeCreatedAt(value.createdAt)

    if (revisionId !== value.revisionId) return false
    if (sourceId !== value.sourceId) return false
    if (sourceRevisionId !== value.sourceRevisionId) return false
    if (createdAt !== value.createdAt) return false

    if (value.revisionKind === TEACHER_REVISION_KIND.AUTOMATIC) {
      if (value.parentRevisionId !== null) return false
      if (value.sourceRevisionId !== value.revisionId) return false
    } else {
      const parentRevisionId = normalizeRequiredId(
        value.parentRevisionId,
        'parentRevisionId',
      )
      if (parentRevisionId !== value.parentRevisionId) return false
      if (parentRevisionId === value.revisionId) return false
    }

    const snapshot = cloneRevisionContent(value.content)
    if (fingerprintSnapshot(snapshot) !== value.contentFingerprint) return false

    return true
  } catch {
    return false
  }
}

/**
 * Validate a Package 8-T1 revision record without mutating it.
 */
export function isTeacherRevision(value) {
  return validateRevisionShape(value)
}

/**
 * Create the immutable automatic source snapshot for one work/source.
 *
 * The caller owns identifiers/timestamps. This function intentionally does not
 * call Date.now(), generate IDs, persist data, or infer teacher approval.
 */
export function createAutomaticRevision({
  revisionId,
  sourceId,
  content,
  createdAt = null,
} = {}) {
  const normalizedRevisionId = normalizeRequiredId(revisionId, 'revisionId')
  const normalizedSourceId = normalizeRequiredId(sourceId, 'sourceId')

  return buildFrozenRevision({
    revisionId: normalizedRevisionId,
    revisionKind: TEACHER_REVISION_KIND.AUTOMATIC,
    sourceId: normalizedSourceId,
    sourceRevisionId: normalizedRevisionId,
    parentRevisionId: null,
    createdAt: normalizeCreatedAt(createdAt),
    content,
  })
}

/**
 * Create a new immutable teacher-corrected snapshot from an exact parent
 * revision. The parent is never changed and approval is deliberately absent
 * from this Package 8-T1 contract.
 */
export function createTeacherCorrectedRevision({
  revisionId,
  parentRevision,
  content,
  createdAt = null,
} = {}) {
  const normalizedRevisionId = normalizeRequiredId(revisionId, 'revisionId')

  if (!isTeacherRevision(parentRevision)) {
    throw new TypeError('parentRevision must be a valid immutable teacher revision.')
  }

  if (normalizedRevisionId === parentRevision.revisionId) {
    throw new Error('A corrected revision must use a new revisionId.')
  }

  return buildFrozenRevision({
    revisionId: normalizedRevisionId,
    revisionKind: TEACHER_REVISION_KIND.TEACHER_CORRECTED,
    sourceId: parentRevision.sourceId,
    sourceRevisionId: parentRevision.sourceRevisionId,
    parentRevisionId: parentRevision.revisionId,
    createdAt: normalizeCreatedAt(createdAt),
    content,
  })
}
