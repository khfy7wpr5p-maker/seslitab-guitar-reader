import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import express from 'express'

import {
  selectSecureDeliveryServerModule,
} from '../backend/delivery/pilot/runtimeEntrypoint.js'
import {
  createSecureDeliveryProductionHttpApp,
} from '../backend/delivery/production/httpApp.js'

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

test('Render entrypoint preserves pilot unless the independent production master gate is exactly true', () => {
  assert.equal(
    selectSecureDeliveryServerModule({}),
    './legacyServer.js',
  )
  assert.equal(
    selectSecureDeliveryServerModule({
      SECURE_DELIVERY_PRODUCTION_ACTIVATION:
        'TRUE',
    }),
    '../production/server.js',
  )
  assert.equal(
    selectSecureDeliveryServerModule({
      SECURE_DELIVERY_PRODUCTION_ACTIVATION:
        '1',
    }),
    './legacyServer.js',
  )
})

test('production-only HTTP app exposes health and Secure Delivery without OMR gateway dependencies', async () => {
  const router = express.Router()
  router.get(
    '/student/assignments',
    (_req, res) => {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Kimlik doğrulanamadı.',
        },
      })
    },
  )

  const boundary = Object.freeze({
    active: true,
    config: Object.freeze({
      enabled: true,
      writesEnabled: false,
      studentReadsEnabled: true,
    }),
    router,
    async close() {},
  })

  const { app } =
    await createSecureDeliveryProductionHttpApp({
      env: {
        NODE_ENV: 'production',
      },
      boundary,
    })

  const health = await request(
    app,
    '/health',
  )
  assert.equal(health.status, 200)
  assert.deepEqual(
    (await health.json()).data,
    {
      status: 'ok',
      mode:
        'secure-delivery-production',
      active: true,
      studentReadsEnabled: true,
      writesEnabled: false,
    },
  )

  const denied = await request(
    app,
    '/api/secure-delivery/v1/student/assignments',
    {
      headers: {
        Origin:
          'https://st-student-app.onrender.com',
      },
    },
  )
  assert.equal(denied.status, 401)
  assert.equal(
    denied.headers.get(
      'access-control-allow-origin',
    ),
    'https://st-student-app.onrender.com',
  )
})

test('production-only entrypoint cannot start the OMR gateway or import OMR request handlers', () => {
  const source = readFileSync(
    new URL(
      '../backend/delivery/production/server.js',
      import.meta.url,
    ),
    'utf8',
  )

  assert.doesNotMatch(
    source,
    /startGateway|multer|handleUploadPdf|audiveris|OMR Gateway/,
  )
  assert.match(
    source,
    /createSecureDeliveryProductionHttpApp/,
  )
})

test('Render pilot server becomes only a dispatcher, keeping legacy implementation isolated', () => {
  const source = readFileSync(
    new URL(
      '../backend/delivery/pilot/server.js',
      import.meta.url,
    ),
    'utf8',
  )

  assert.match(
    source,
    /selectSecureDeliveryServerModule/,
  )
  assert.match(
    source,
    /await import/,
  )
  assert.doesNotMatch(
    source,
    /createPilotFirebaseTokenVerifier|STUDENT08_PILOT_ENABLED/,
  )
})
