import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import express from 'express'

import {
  SECURE_DELIVERY_PREPARED_JSON_BODY_MAX_BYTES,
  SECURE_DELIVERY_PREPARE_BATCH_MAX_BYTES,
  SECURE_DELIVERY_STANDARD_JSON_BODY_MAX_BYTES,
  assertSecureDeliveryPrepareBatchBytes,
  secureDeliveryPrepareBodyBytes,
} from '../src/services/secureDeliveryPayloadBoundary.js'
import {
  createSecureDeliveryJsonBodyParser,
  isSecureDeliveryRequestPath,
  secureDeliveryPayloadErrorHandler,
} from '../backend/delivery/http/payloadBoundary.js'
import {
  secureDeliveryErrorStatus,
} from '../backend/delivery/http/errorResponse.js'

async function request(app, path, init = {}) {
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) =>
    server.once('listening', resolve),
  )
  try {
    const { port } = server.address()
    return await fetch(
      'http://127.0.0.1:' + port + path,
      init,
    )
  } finally {
    await new Promise((resolve) =>
      server.close(resolve),
    )
  }
}

function jsonPost(body) {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  }
}

test('SES-121 pins isolated Secure Delivery body and aggregate byte ceilings', () => {
  assert.equal(
    SECURE_DELIVERY_STANDARD_JSON_BODY_MAX_BYTES,
    16 * 1024,
  )
  assert.equal(
    SECURE_DELIVERY_PREPARED_JSON_BODY_MAX_BYTES,
    24 * 1024 * 1024,
  )
  assert.equal(
    SECURE_DELIVERY_PREPARE_BATCH_MAX_BYTES,
    20 * 1024 * 1024,
  )
  assert.ok(
    SECURE_DELIVERY_PREPARED_JSON_BODY_MAX_BYTES >
      SECURE_DELIVERY_PREPARE_BATCH_MAX_BYTES,
  )
})

test('SES-121 measures exact UTF-8 prepare envelope bytes and fails closed above the aggregate boundary', () => {
  const items = [{
    assignment: {
      assignmentId: 'assignment-a',
    },
    package: {
      title: 'Çağdaş',
    },
  }]
  const expected = new TextEncoder()
    .encode(JSON.stringify({ items }))
    .byteLength

  assert.equal(
    secureDeliveryPrepareBodyBytes(items),
    expected,
  )
  assert.equal(
    assertSecureDeliveryPrepareBatchBytes(
      items,
      { maxBytes: expected },
    ),
    expected,
  )
  assert.throws(
    () =>
      assertSecureDeliveryPrepareBatchBytes(
        items,
        { maxBytes: expected - 1 },
      ),
    /secure-delivery-payload-too-large/i,
  )
})

test('SES-121 route parser allows a larger prepared-assignment body while keeping ordinary Secure Delivery JSON small', async () => {
  const app = express()
  app.use(
    '/api/secure-delivery/v1',
    createSecureDeliveryJsonBodyParser({
      standardBodyMaxBytes: 64,
      preparedAssignmentsBodyMaxBytes: 256,
    }),
  )
  app.post(
    '/api/secure-delivery/v1/teacher/prepared-assignments',
    (req, res) =>
      res.status(200).json({
        success: true,
        data: req.body,
      }),
  )
  app.post(
    '/api/secure-delivery/v1/teacher/deliveries',
    (req, res) =>
      res.status(200).json({
        success: true,
        data: req.body,
      }),
  )
  app.use(
    '/api/secure-delivery/v1',
    secureDeliveryPayloadErrorHandler,
  )

  const medium = JSON.stringify({
    items: [{
      value: 'x'.repeat(96),
    }],
  })
  assert.ok(
    new TextEncoder().encode(medium).byteLength > 64,
  )
  assert.ok(
    new TextEncoder().encode(medium).byteLength < 256,
  )

  const prepared = await request(
    app,
    '/api/secure-delivery/v1/teacher/prepared-assignments',
    jsonPost(medium),
  )
  assert.equal(prepared.status, 200)

  const ordinary = await request(
    app,
    '/api/secure-delivery/v1/teacher/deliveries',
    jsonPost(medium),
  )
  assert.equal(ordinary.status, 413)
  assert.deepEqual(
    await ordinary.json(),
    {
      success: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message:
          'Güvenli teslimat isteği boyut sınırını aşıyor.',
      },
    },
  )

  const tooLargePrepared = await request(
    app,
    '/api/secure-delivery/v1/teacher/prepared-assignments',
    jsonPost(JSON.stringify({
      items: [{
        value: 'x'.repeat(300),
      }],
    })),
  )
  assert.equal(tooLargePrepared.status, 413)
  assert.equal(
    (await tooLargePrepared.json()).error.code,
    'PAYLOAD_TOO_LARGE',
  )
})

test('SES-121 classifies parser and aggregate overflow as 413 without exposing internal details', () => {
  assert.equal(
    secureDeliveryErrorStatus(
      new Error('secure-delivery-payload-too-large'),
    ),
    413,
  )
  assert.equal(
    isSecureDeliveryRequestPath({
      originalUrl:
        '/api/secure-delivery/v1/teacher/prepared-assignments?x=1',
    }),
    true,
  )
  assert.equal(
    isSecureDeliveryRequestPath({
      originalUrl: '/api/v1/pdf/analyze',
    }),
    false,
  )
})

test('SES-121 gateway wiring isolates Secure Delivery parsing and leaves the general OMR JSON parser at its existing default', () => {
  const server = readFileSync(
    new URL('../backend/server.js', import.meta.url),
    'utf8',
  )
  const productionHttp = readFileSync(
    new URL(
      '../backend/delivery/production/httpApp.js',
      import.meta.url,
    ),
    'utf8',
  )

  assert.match(
    server,
    /createSecureDeliveryJsonBodyParser/,
  )
  assert.match(
    server,
    /isSecureDeliveryRequestPath/,
  )
  assert.match(
    server,
    /const\s+gatewayJsonParser\s*=\s*express\.json\(\)/,
  )
  assert.doesNotMatch(
    server,
    /gatewayJsonParser\s*=\s*express\.json\(\{[^}]*limit/s,
  )

  assert.match(
    productionHttp,
    /createSecureDeliveryJsonBodyParser/,
  )
  assert.doesNotMatch(
    productionHttp,
    /limit:\s*['"]16kb['"]/,
  )
})
