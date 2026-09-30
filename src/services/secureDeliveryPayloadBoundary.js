// SES-121 / TD-PROD-08 — bounded Secure Delivery payload policy.
//
// The ordinary Secure Delivery API remains deliberately small. Only the
// prepared-assignment route gets a larger, still-bounded lane because SCORE
// packages may carry final MusicXML (and optional bounded Guitar TAB XML).
// The aggregate guard is lower than the HTTP parser ceiling so legitimate
// parser overhead cannot silently bypass the application-level batch policy.

export const SECURE_DELIVERY_STANDARD_JSON_BODY_MAX_BYTES =
  16 * 1024

export const SECURE_DELIVERY_PREPARED_JSON_BODY_MAX_BYTES =
  24 * 1024 * 1024

export const SECURE_DELIVERY_PREPARE_BATCH_MAX_BYTES =
  20 * 1024 * 1024

function normalizeMaxBytes(value) {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new TypeError(
      'secure delivery payload maxBytes must be a positive safe integer.',
    )
  }
  return value
}

function utf8JsonBytes(value) {
  if (typeof TextEncoder !== 'function') {
    throw new Error(
      'secure-delivery-text-encoder-unavailable',
    )
  }

  let serialized
  try {
    serialized = JSON.stringify(value)
  } catch {
    throw new TypeError(
      'secure delivery payload must be JSON serializable.',
    )
  }

  if (typeof serialized !== 'string') {
    throw new TypeError(
      'secure delivery payload must serialize to JSON text.',
    )
  }

  return new TextEncoder()
    .encode(serialized)
    .byteLength
}

export function secureDeliveryPrepareBodyBytes(
  items,
) {
  if (!Array.isArray(items)) {
    throw new TypeError(
      'secure delivery prepare items must be an array.',
    )
  }

  return utf8JsonBytes({ items })
}

export function assertSecureDeliveryPrepareBatchBytes(
  items,
  {
    maxBytes =
      SECURE_DELIVERY_PREPARE_BATCH_MAX_BYTES,
  } = {},
) {
  const trustedMax =
    normalizeMaxBytes(maxBytes)
  const bytes =
    secureDeliveryPrepareBodyBytes(items)

  if (bytes > trustedMax) {
    throw new RangeError(
      'secure-delivery-payload-too-large',
    )
  }

  return bytes
}
