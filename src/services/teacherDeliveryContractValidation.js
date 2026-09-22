export const DELIVERY_MAX_ID_LENGTH = 256
export const DELIVERY_MAX_DISPLAY_NAME_LENGTH = 160
export const DELIVERY_MAX_TIMESTAMP_LENGTH = 128

const ID_CONTROL = /[\u0000-\u001f\u007f]/u
const PROSE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u

export function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function assertStrictInputObject(input, allowedFields, label) {
  if (!isPlainObject(input)) {
    throw new TypeError(`${label} input must be a plain object.`)
  }

  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || !allowedFields.includes(key)) {
      throw new TypeError(`${label} input contains an unsupported field.`)
    }
  }

  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(input))) {
    if (!descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw new TypeError(`${label} input field ${key} must be enumerable plain data.`)
    }
  }
}

export function normalizeRequiredId(value, fieldName) {
  if (typeof value !== 'string') throw new TypeError(`${fieldName} must be a string.`)
  const normalized = value.trim()
  if (
    normalized === '' ||
    normalized.length > DELIVERY_MAX_ID_LENGTH ||
    ID_CONTROL.test(normalized)
  ) {
    throw new TypeError(`${fieldName} contains unsupported identity text.`)
  }
  return normalized
}

export function normalizeRequiredText(value, fieldName, maxLength) {
  if (typeof value !== 'string') throw new TypeError(`${fieldName} must be text.`)
  const normalized = value.trim()
  if (normalized === '' || normalized.length > maxLength || PROSE_CONTROL.test(normalized)) {
    throw new TypeError(`${fieldName} contains unsupported text.`)
  }
  return normalized
}

export function normalizeOptionalText(value, fieldName, maxLength) {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value !== 'string') throw new TypeError(`${fieldName} must be text.`)
  const normalized = value.trim()
  if (normalized.length > maxLength || PROSE_CONTROL.test(normalized)) {
    throw new TypeError(`${fieldName} contains unsupported text.`)
  }
  return normalized
}

export function normalizeRequiredTimestamp(value, fieldName) {
  if (typeof value !== 'string') throw new TypeError(`${fieldName} must be text.`)
  const normalized = value.trim()
  if (
    normalized === '' ||
    normalized.length > DELIVERY_MAX_TIMESTAMP_LENGTH ||
    ID_CONTROL.test(normalized)
  ) {
    throw new TypeError(`${fieldName} contains unsupported timestamp text.`)
  }
  return normalized
}

export function normalizeNullableTimestamp(value, fieldName) {
  if (value === null || value === undefined) return null
  return normalizeRequiredTimestamp(value, fieldName)
}

export function isStrictFrozenRecord(value, fields) {
  if (!isPlainObject(value) || !Object.isFrozen(value)) return false
  const keys = Reflect.ownKeys(value)
  if (
    keys.length !== fields.length ||
    keys.some((key) => typeof key !== 'string' || !fields.includes(key))
  ) {
    return false
  }

  const descriptors = Object.getOwnPropertyDescriptors(value)
  return fields.every((field) => {
    const descriptor = descriptors[field]
    return Boolean(
      descriptor &&
      descriptor.enumerable &&
      descriptor.configurable === false &&
      descriptor.writable === false &&
      Object.prototype.hasOwnProperty.call(descriptor, 'value'),
    )
  })
}
