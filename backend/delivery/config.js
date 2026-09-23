function parseBooleanFlag(value) {
  return String(value ?? '').trim().toLowerCase() === 'true'
}

export function createSecureDeliveryConfig(env = process.env) {
  if (!env || typeof env !== 'object') {
    throw new TypeError('secure delivery environment must be an object.')
  }

  return Object.freeze({
    enabled: parseBooleanFlag(env.SECURE_DELIVERY_ENABLED),
    writesEnabled: parseBooleanFlag(
      env.SECURE_DELIVERY_WRITES_ENABLED,
    ),
    studentReadsEnabled: parseBooleanFlag(
      env.STUDENT_DELIVERY_READS_ENABLED,
    ),
  })
}

export const SECURE_DELIVERY_CONFIG =
  createSecureDeliveryConfig(process.env)
