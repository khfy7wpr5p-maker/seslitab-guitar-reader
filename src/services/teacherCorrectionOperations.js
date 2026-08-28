// Package 8-T2 — controlled teacher correction operations.
//
// Pure/domain-only layer. No persistence, UI, approval, OMR/Audiveris,
// deployment, or student-sharing behavior is introduced here.

import {
  createTeacherCorrectedRevision,
  isTeacherRevision,
} from './teacherRevisionModel.js'

export const TEACHER_CORRECTION_SCHEMA_VERSION = 1

export const TEACHER_CORRECTION_OPERATION_KIND = Object.freeze({
  REPLACE_VALUE: 'replace_value',
})

export const TEACHER_CORRECTION_AUDIT_EVENT_TYPE = 'teacher_correction'

const OP_FIELDS = Object.freeze(['operationId', 'kind', 'path', 'value'])
const AUDIT_FIELDS = Object.freeze([
  'schemaVersion',
  'eventType',
  'eventId',
  'actorId',
  'sourceId',
  'sourceRevisionId',
  'parentRevisionId',
  'parentContentFingerprint',
  'resultRevisionId',
  'resultContentFingerprint',
  'createdAt',
  'operations',
])
const AUDIT_OP_FIELDS = Object.freeze([
  'operationId',
  'kind',
  'path',
  'before',
  'after',
])
const PROTECTED_PATH_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function requiredId(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${field} must be a non-empty string.`)
  }
  return value.trim()
}

function normalizedTime(value) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError('createdAt must be null or a non-empty string.')
  }
  return value.trim()
}

function assertDenseArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`)
  if (Object.getOwnPropertySymbols(value).length) {
    throw new TypeError(`${label} must not contain symbol properties.`)
  }

  for (let index = 0; index < value.length; index++) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      throw new TypeError(`${label} must not be sparse.`)
    }
  }

  for (const [key, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(value),
  )) {
    if (key === 'length') continue
    const index = Number(key)
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= value.length ||
      String(index) !== key
    ) {
      throw new TypeError(`${label} must not contain custom array properties.`)
    }
    if (
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      throw new TypeError(`${label} must contain only enumerable data entries.`)
    }
  }
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

function cloneData(value, seen = new Set(), path = 'value') {
  if (value === null) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} contains a non-finite number.`)
    return Object.is(value, -0) ? 0 : value
  }
  if (
    typeof value === 'undefined' ||
    typeof value === 'function' ||
    typeof value === 'symbol' ||
    typeof value === 'bigint'
  ) {
    throw new TypeError(`${path} contains unsupported data.`)
  }

  if (seen.has(value)) throw new TypeError(`${path} contains a circular reference.`)
  seen.add(value)

  if (Array.isArray(value)) {
    assertDenseArray(value, path)
    const clone = value.map((entry, index) =>
      cloneData(entry, seen, `${path}[${index}]`),
    )
    seen.delete(value)
    return clone
  }

  if (!isPlainObject(value)) {
    seen.delete(value)
    throw new TypeError(`${path} must contain only plain data.`)
  }
  if (Object.getOwnPropertySymbols(value).length) {
    seen.delete(value)
    throw new TypeError(`${path} must not contain symbol properties.`)
  }

  const clone = {}
  for (const [key, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(value),
  ).sort(([a], [b]) => a.localeCompare(b))) {
    if (
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      seen.delete(value)
      throw new TypeError(`${path}.${key} must be an enumerable data property.`)
    }
    Object.defineProperty(clone, key, {
      value: cloneData(descriptor.value, seen, `${path}.${key}`),
      enumerable: true,
      writable: true,
      configurable: true,
    })
  }

  seen.delete(value)
  return clone
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

function dataEqual(left, right) {
  if (Object.is(left, right)) return true
  if (typeof left !== typeof right || left === null || right === null) return false

  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => dataEqual(entry, right[index]))
    )
  }

  if (typeof left === 'object') {
    if (!isPlainObject(left) || !isPlainObject(right)) return false
    const leftKeys = Object.keys(left).sort()
    const rightKeys = Object.keys(right).sort()
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key, index) =>
          key === rightKeys[index] && dataEqual(left[key], right[key]),
      )
    )
  }

  return false
}

function normalizePath(path, operationId) {
  assertDenseArray(path, `operation ${operationId} path`)
  if (!path.length) throw new TypeError(`operation ${operationId} path must not be empty.`)

  return path.map((segment, index) => {
    if (typeof segment === 'number') {
      if (!Number.isInteger(segment) || segment < 0) {
        throw new TypeError(
          `operation ${operationId} path segment ${index} must be a non-negative integer.`,
        )
      }
      return segment
    }
    if (typeof segment === 'string') {
      if (!segment.length) {
        throw new TypeError(`operation ${operationId} path segment ${index} must not be empty.`)
      }
      if (PROTECTED_PATH_KEYS.has(segment)) {
        throw new TypeError(`operation ${operationId} path contains a protected key.`)
      }
      return segment
    }
    throw new TypeError(
      `operation ${operationId} path segment ${index} must be a string or non-negative integer.`,
    )
  })
}

function normalizeOperation(operation) {
  assertExactObject(operation, OP_FIELDS, 'correction operation')
  const operationId = requiredId(operation.operationId, 'operationId')
  if (operation.kind !== TEACHER_CORRECTION_OPERATION_KIND.REPLACE_VALUE) {
    throw new TypeError(`Unsupported correction operation kind: ${operation.kind}.`)
  }
  return {
    operationId,
    kind: operation.kind,
    path: normalizePath(operation.path, operationId),
    value: cloneData(operation.value, new Set(), `operation ${operationId} value`),
  }
}

function pathsOverlap(left, right) {
  const length = Math.min(left.length, right.length)
  for (let index = 0; index < length; index++) {
    if (!Object.is(left[index], right[index])) return false
  }
  return true
}

function validateBatch(operations) {
  const ids = new Set()
  for (const operation of operations) {
    if (ids.has(operation.operationId)) {
      throw new Error(`Duplicate correction operationId: ${operation.operationId}.`)
    }
    ids.add(operation.operationId)
  }
  for (let i = 0; i < operations.length; i++) {
    for (let j = i + 1; j < operations.length; j++) {
      if (pathsOverlap(operations[i].path, operations[j].path)) {
        throw new Error('Correction operations in one batch must target independent paths.')
      }
    }
  }
}

function existingTarget(root, path, operationId) {
  let container = root

  for (let index = 0; index < path.length - 1; index++) {
    const segment = path[index]
    if (Array.isArray(container)) {
      if (typeof segment !== 'number' || segment >= container.length) {
        throw new Error(`operation ${operationId} path does not exist.`)
      }
    } else if (isPlainObject(container)) {
      if (
        typeof segment !== 'string' ||
        !Object.prototype.hasOwnProperty.call(container, segment)
      ) {
        throw new Error(`operation ${operationId} path does not exist.`)
      }
    } else {
      throw new Error(`operation ${operationId} path does not exist.`)
    }
    container = container[segment]
  }

  const leaf = path.at(-1)
  if (Array.isArray(container)) {
    if (typeof leaf !== 'number' || leaf >= container.length) {
      throw new Error(`operation ${operationId} path does not exist.`)
    }
  } else if (isPlainObject(container)) {
    if (
      typeof leaf !== 'string' ||
      !Object.prototype.hasOwnProperty.call(container, leaf)
    ) {
      throw new Error(`operation ${operationId} path does not exist.`)
    }
  } else {
    throw new Error(`operation ${operationId} path does not exist.`)
  }

  return { container, leaf }
}

function replaceExisting(root, operation) {
  const { container, leaf } = existingTarget(
    root,
    operation.path,
    operation.operationId,
  )
  const before = cloneData(container[leaf])
  const after = cloneData(operation.value)

  if (dataEqual(before, after)) {
    throw new Error(`operation ${operation.operationId} is a no-op correction.`)
  }

  if (Array.isArray(container)) {
    container[leaf] = after
  } else {
    Object.defineProperty(container, leaf, {
      value: after,
      enumerable: true,
      writable: true,
      configurable: true,
    })
  }

  return {
    operationId: operation.operationId,
    kind: operation.kind,
    path: [...operation.path],
    before,
    after: cloneData(after),
  }
}

function isDeepFrozenPlainData(value, seen = new Set()) {
  if (!value || typeof value !== 'object') return true
  if ((!Array.isArray(value) && !isPlainObject(value)) || !Object.isFrozen(value)) {
    return false
  }
  if (seen.has(value) || Object.getOwnPropertySymbols(value).length) return false

  seen.add(value)
  for (const [key, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(value),
  )) {
    if (Array.isArray(value) && key === 'length') continue
    if (
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      !isDeepFrozenPlainData(descriptor.value, seen)
    ) {
      seen.delete(value)
      return false
    }
  }
  seen.delete(value)
  return true
}

export function isTeacherCorrectionAuditEvent(value) {
  try {
    if (!isPlainObject(value) || !Object.isFrozen(value)) return false
    assertExactObject(value, AUDIT_FIELDS, 'audit event')
    if (value.schemaVersion !== TEACHER_CORRECTION_SCHEMA_VERSION) return false
    if (value.eventType !== TEACHER_CORRECTION_AUDIT_EVENT_TYPE) return false

    for (const field of [
      'eventId',
      'actorId',
      'sourceId',
      'sourceRevisionId',
      'parentRevisionId',
      'parentContentFingerprint',
      'resultRevisionId',
      'resultContentFingerprint',
    ]) {
      if (requiredId(value[field], field) !== value[field]) return false
    }
    if (normalizedTime(value.createdAt) !== value.createdAt) return false
    if (!Array.isArray(value.operations) || !value.operations.length) return false
    if (!isDeepFrozenPlainData(value.operations)) return false

    const ids = new Set()
    const paths = []
    for (const operation of value.operations) {
      assertExactObject(operation, AUDIT_OP_FIELDS, 'audit operation')
      const operationId = requiredId(operation.operationId, 'operationId')
      if (operationId !== operation.operationId || ids.has(operationId)) return false
      ids.add(operationId)
      if (operation.kind !== TEACHER_CORRECTION_OPERATION_KIND.REPLACE_VALUE) return false
      const path = normalizePath(operation.path, operationId)
      if (dataEqual(operation.before, operation.after)) return false
      paths.push(path)
    }
    validateBatch(
      paths.map((path, index) => ({
        operationId: value.operations[index].operationId,
        path,
      })),
    )
    return true
  } catch {
    return false
  }
}

export function applyTeacherCorrectionBatch({
  eventId,
  actorId,
  revisionId,
  parentRevision,
  operations,
  createdAt = null,
} = {}) {
  const normalizedEventId = requiredId(eventId, 'eventId')
  const normalizedActorId = requiredId(actorId, 'actorId')
  const normalizedCreatedAt = normalizedTime(createdAt)

  if (!isTeacherRevision(parentRevision)) {
    throw new TypeError('parentRevision must be a valid immutable teacher revision.')
  }

  assertDenseArray(operations, 'operations')
  if (!operations.length) {
    throw new TypeError('operations must contain at least one correction.')
  }

  const normalizedOperations = operations.map(normalizeOperation)
  validateBatch(normalizedOperations)

  const nextContent = cloneData(parentRevision.content, new Set(), 'parent content')
  const auditOperations = normalizedOperations.map((operation) =>
    replaceExisting(nextContent, operation),
  )

  const revision = createTeacherCorrectedRevision({
    revisionId,
    parentRevision,
    content: nextContent,
    createdAt: normalizedCreatedAt,
  })

  const auditEvent = deepFreeze({
    schemaVersion: TEACHER_CORRECTION_SCHEMA_VERSION,
    eventType: TEACHER_CORRECTION_AUDIT_EVENT_TYPE,
    eventId: normalizedEventId,
    actorId: normalizedActorId,
    sourceId: revision.sourceId,
    sourceRevisionId: revision.sourceRevisionId,
    parentRevisionId: parentRevision.revisionId,
    parentContentFingerprint: parentRevision.contentFingerprint,
    resultRevisionId: revision.revisionId,
    resultContentFingerprint: revision.contentFingerprint,
    createdAt: normalizedCreatedAt,
    operations: auditOperations,
  })

  return Object.freeze({ revision, auditEvent })
}
