const EVENT_NAME =
  'secure_delivery_request'

const OPERATION_PATTERN =
  /^[a-z][a-z0-9_]{0,63}$/u

const OUTCOMES = new Set([
  'authorized',
  'unauthorized',
  'revoked',
  'not_found',
  'unavailable',
  'rejected',
])

function messageOf(error) {
  return error instanceof Error
    ? String(error.message || '').toLowerCase()
    : ''
}

export function secureDeliveryRequestOutcome(
  error,
  status,
) {
  const message = messageOf(error)

  if (
    /not-found.*revoked|revoked|grant-inactive|identity-mapping-disabled/.test(
      message,
    )
  ) {
    return 'revoked'
  }

  if (status === 401 || status === 403) {
    return 'unauthorized'
  }

  if (status === 404) {
    return 'not_found'
  }

  if (status === 503) {
    return 'unavailable'
  }

  return 'rejected'
}

export function createSecureDeliveryRequestObserver({
  write = console.log,
} = {}) {
  if (typeof write !== 'function') {
    throw new TypeError(
      'Secure Delivery observer write must be a function.',
    )
  }

  return function observe(input = {}) {
    const operation = input?.operation
    const outcome = input?.outcome
    const status = input?.status

    if (
      typeof operation !== 'string' ||
      !OPERATION_PATTERN.test(operation)
    ) {
      throw new TypeError(
        'Secure Delivery observer operation is invalid.',
      )
    }

    if (!OUTCOMES.has(outcome)) {
      throw new TypeError(
        'Secure Delivery observer outcome is invalid.',
      )
    }

    if (
      !Number.isInteger(status) ||
      status < 100 ||
      status > 599
    ) {
      throw new TypeError(
        'Secure Delivery observer status is invalid.',
      )
    }

    const record = Object.freeze({
      event: EVENT_NAME,
      operation,
      outcome,
      status,
    })

    write(JSON.stringify(record))
    return record
  }
}
