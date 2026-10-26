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

export const SECURE_DELIVERY_FAILURE_CLASS =
  Object.freeze({
    DEADLINE_EXCEEDED:
      'UPSTREAM_DEADLINE_EXCEEDED',
    PERMISSION_DENIED:
      'UPSTREAM_PERMISSION_DENIED',
    RESOURCE_EXHAUSTED:
      'UPSTREAM_RESOURCE_EXHAUSTED',
    INTERNAL:
      'UPSTREAM_INTERNAL',
    UNAVAILABLE:
      'UPSTREAM_UNAVAILABLE',
    UNAUTHENTICATED:
      'UPSTREAM_UNAUTHENTICATED',
    NETWORK:
      'UPSTREAM_NETWORK',
  })

const FAILURE_CLASSES = new Set(
  Object.values(
    SECURE_DELIVERY_FAILURE_CLASS,
  ),
)

const NUMERIC_FAILURE_CLASSES =
  Object.freeze({
    4:
      SECURE_DELIVERY_FAILURE_CLASS
        .DEADLINE_EXCEEDED,
    7:
      SECURE_DELIVERY_FAILURE_CLASS
        .PERMISSION_DENIED,
    8:
      SECURE_DELIVERY_FAILURE_CLASS
        .RESOURCE_EXHAUSTED,
    13:
      SECURE_DELIVERY_FAILURE_CLASS
        .INTERNAL,
    14:
      SECURE_DELIVERY_FAILURE_CLASS
        .UNAVAILABLE,
    16:
      SECURE_DELIVERY_FAILURE_CLASS
        .UNAUTHENTICATED,
  })

const TEXT_FAILURE_CLASSES =
  Object.freeze({
    DEADLINE_EXCEEDED:
      SECURE_DELIVERY_FAILURE_CLASS
        .DEADLINE_EXCEEDED,
    PERMISSION_DENIED:
      SECURE_DELIVERY_FAILURE_CLASS
        .PERMISSION_DENIED,
    RESOURCE_EXHAUSTED:
      SECURE_DELIVERY_FAILURE_CLASS
        .RESOURCE_EXHAUSTED,
    INTERNAL:
      SECURE_DELIVERY_FAILURE_CLASS
        .INTERNAL,
    UNAVAILABLE:
      SECURE_DELIVERY_FAILURE_CLASS
        .UNAVAILABLE,
    UNAUTHENTICATED:
      SECURE_DELIVERY_FAILURE_CLASS
        .UNAUTHENTICATED,
    ETIMEDOUT:
      SECURE_DELIVERY_FAILURE_CLASS
        .NETWORK,
    ECONNRESET:
      SECURE_DELIVERY_FAILURE_CLASS
        .NETWORK,
    EAI_AGAIN:
      SECURE_DELIVERY_FAILURE_CLASS
        .NETWORK,
    ENETUNREACH:
      SECURE_DELIVERY_FAILURE_CLASS
        .NETWORK,
  })

export function secureDeliveryFailureClass(
  error,
) {
  const code = error?.code
  if (
    Number.isInteger(code) &&
    Object.hasOwn(
      NUMERIC_FAILURE_CLASSES,
      code,
    )
  ) {
    return NUMERIC_FAILURE_CLASSES[code]
  }

  if (typeof code !== 'string') {
    return null
  }

  const normalized =
    code
      .trim()
      .toUpperCase()
      .replaceAll('-', '_')
      .replace(/^GRPC_/u, '')

  if (/^\d+$/u.test(normalized)) {
    return (
      NUMERIC_FAILURE_CLASSES[
        Number(normalized)
      ] ?? null
    )
  }

  return (
    TEXT_FAILURE_CLASSES[normalized] ??
    null
  )
}

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
    const failureClass =
      input?.failureClass ?? null

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

    if (
      failureClass !== null &&
      !FAILURE_CLASSES.has(failureClass)
    ) {
      throw new TypeError(
        'Secure Delivery observer failure class is invalid.',
      )
    }

    const record = Object.freeze({
      event: EVENT_NAME,
      operation,
      outcome,
      status,
      ...(failureClass === null
        ? {}
        : { failureClass }),
    })

    write(JSON.stringify(record))
    return record
  }
}
