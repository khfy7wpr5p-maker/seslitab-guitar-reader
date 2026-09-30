import express from 'express'

import {
  SECURE_DELIVERY_PREPARED_JSON_BODY_MAX_BYTES,
  SECURE_DELIVERY_STANDARD_JSON_BODY_MAX_BYTES,
} from '../../../src/services/secureDeliveryPayloadBoundary.js'

const SECURE_DELIVERY_PREFIX =
  '/api/secure-delivery/v1'
const PREPARED_ASSIGNMENTS_PATH =
  SECURE_DELIVERY_PREFIX +
  '/teacher/prepared-assignments'

function normalizeLimit(value, label) {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new TypeError(
      `${label} must be a positive safe integer.`,
    )
  }
  return value
}

function requestPath(req) {
  const value =
    typeof req?.originalUrl === 'string'
      ? req.originalUrl
      : typeof req?.url === 'string'
        ? req.url
        : ''
  const queryIndex = value.indexOf('?')
  return queryIndex >= 0
    ? value.slice(0, queryIndex)
    : value
}

export function isSecureDeliveryRequestPath(req) {
  const path = requestPath(req)
  return (
    path === SECURE_DELIVERY_PREFIX ||
    path.startsWith(
      SECURE_DELIVERY_PREFIX + '/',
    )
  )
}

function isPreparedAssignmentRequest(req) {
  return (
    String(req?.method ?? '').toUpperCase() ===
      'POST' &&
    requestPath(req) ===
      PREPARED_ASSIGNMENTS_PATH
  )
}

export function createSecureDeliveryJsonBodyParser({
  standardBodyMaxBytes =
    SECURE_DELIVERY_STANDARD_JSON_BODY_MAX_BYTES,
  preparedAssignmentsBodyMaxBytes =
    SECURE_DELIVERY_PREPARED_JSON_BODY_MAX_BYTES,
} = {}) {
  const standardLimit =
    normalizeLimit(
      standardBodyMaxBytes,
      'standardBodyMaxBytes',
    )
  const preparedLimit =
    normalizeLimit(
      preparedAssignmentsBodyMaxBytes,
      'preparedAssignmentsBodyMaxBytes',
    )

  if (preparedLimit < standardLimit) {
    throw new TypeError(
      'preparedAssignmentsBodyMaxBytes must not be smaller than standardBodyMaxBytes.',
    )
  }

  const standardParser = express.json({
    limit: standardLimit,
  })
  const preparedParser = express.json({
    limit: preparedLimit,
  })

  return function secureDeliveryJsonBodyParser(
    req,
    res,
    next,
  ) {
    const parser =
      isPreparedAssignmentRequest(req)
        ? preparedParser
        : standardParser
    return parser(req, res, next)
  }
}

export function secureDeliveryPayloadErrorHandler(
  error,
  _req,
  res,
  next,
) {
  if (
    error?.type !== 'entity.too.large' &&
    error?.status !== 413 &&
    error?.statusCode !== 413
  ) {
    return next(error)
  }

  return res.status(413).json({
    success: false,
    error: {
      code: 'PAYLOAD_TOO_LARGE',
      message:
        'Güvenli teslimat isteği boyut sınırını aşıyor.',
    },
  })
}
