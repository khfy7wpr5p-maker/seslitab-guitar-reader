import { createHash } from 'node:crypto'

import {
  validateStudentPracticePackageV1,
} from '../../../src/services/studentPracticePackageV1.js'

function isPlainObject(value) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function canonicalize(value, ancestors) {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('canonical JSON number must be finite.')
    }
    return JSON.stringify(value)
  }
  if (
    typeof value === 'undefined' ||
    typeof value === 'function' ||
    typeof value === 'symbol' ||
    typeof value === 'bigint'
  ) {
    throw new TypeError('canonical JSON contains unsupported value.')
  }
  if (ancestors.has(value)) {
    throw new TypeError('canonical JSON contains a cyclic value.')
  }

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      return `[${value
        .map((child) => canonicalize(child, ancestors))
        .join(',')}]`
    }
    if (!isPlainObject(value)) {
      throw new TypeError(
        'canonical JSON object must be plain data.',
      )
    }

    const fields = Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalize(
            value[key],
            ancestors,
          )}`,
      )
    return `{${fields.join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}

export function canonicalPackageJson(value) {
  return canonicalize(value, new Set())
}

export function fingerprintPracticePackage(value) {
  const validation =
    validateStudentPracticePackageV1(value)
  if (!validation.ok) {
    throw new TypeError(
      `cannot fingerprint invalid PracticePackage: ${validation.errors.join('; ')}`,
    )
  }

  return createHash('sha256')
    .update(canonicalPackageJson(value), 'utf8')
    .digest('hex')
}
