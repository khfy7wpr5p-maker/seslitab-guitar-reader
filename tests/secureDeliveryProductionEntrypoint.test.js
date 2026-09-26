import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import express from 'express'

import {
  selectSecureDeliveryServerModule,
  startSelectedSecureDeliveryServer,
} from '../backend/delivery/pilot/runtimeEntrypoint.js'
import {
  startSecureDeliveryServer as startLegacySecureDeliveryServer,
} from '../backend/delivery/pilot/legacyServer.js'
import {
  createSecureDeliveryProductionHttpApp,
} from '../backend/delivery/production/httpApp.js'
import {
  startSecureDeliveryServer as startProductionSecureDeliveryServer,
} from '../backend/delivery/production/server.js'

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

function fakeServer(onClose = () => {}) {
  return {
    close(callback) {
      onClose()
      callback()
    },
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

test('runtime dispatcher imports only the selected module and starts it with the original environment', async () => {
  const env = {
    SECURE_DELIVERY_PRODUCTION_ACTIVATION:
      'true',
  }
  const calls = []

  const runtime =
    await startSelectedSecureDeliveryServer({
      env,
      async importModule(modulePath) {
        calls.push([
          'import',
          modulePath,
        ])
        return {
          async startSecureDeliveryServer(
            input,
          ) {
            calls.push([
              'start',
              input,
            ])
            return {
              mode: 'fake-production',
            }
          },
        }
      },
    })

  assert.equal(
    runtime.mode,
    'fake-production',
  )
  assert.deepEqual(
    calls,
    [
      [
        'import',
        '../production/server.js',
      ],
      [
        'start',
        { env },
      ],
    ],
  )

  await assert.rejects(
    () =>
      startSelectedSecureDeliveryServer({
        env: {},
        importModule: null,
      }),
    /runtime-importer-required/i,
  )

  await assert.rejects(
    () =>
      startSelectedSecureDeliveryServer({
        env: {},
        async importModule() {
          return {}
        },
      }),
    /runtime-start-function-required/i,
  )
})

test('legacy pilot runtime preserves live allowlist/revoke inputs and closes idempotently', async () => {
  const allowedHash = 'a'.repeat(64)
  const revokedHash = 'b'.repeat(64)
  const calls = []
  let serverCloseCount = 0
  let verifierCloseCount = 0

  const runtime =
    await startLegacySecureDeliveryServer({
      env: {
        STUDENT08_PILOT_ENABLED:
          'true',
        STUDENT08_PILOT_ALLOWED_ORIGIN:
          'https://st-student-app.onrender.com',
        STUDENT08_PILOT_FIREBASE_PROJECT_ID:
          'st-student-app-85cde',
        STUDENT08_PILOT_ALLOWED_PROVIDER_SUBJECT_HASHES:
          ' ' + allowedHash + ' ',
        STUDENT08_PILOT_REVOKED_PROVIDER_SUBJECT_HASHES:
          revokedHash,
        PORT: '10000',
      },
      createTokenVerifier(input) {
        calls.push([
          'token',
          input,
        ])
        return {
          async close() {
            verifierCloseCount += 1
          },
        }
      },
      createApp(input) {
        calls.push([
          'app',
          input,
        ])
        return {
          kind: 'pilot-app',
        }
      },
      listen(
        app,
        port,
        host,
        callback,
      ) {
        calls.push([
          'listen',
          {
            app,
            port,
            host,
          },
        ])
        callback()
        return fakeServer(() => {
          serverCloseCount += 1
        })
      },
    })

  assert.equal(
    runtime.mode,
    'student08-pilot',
  )
  assert.deepEqual(
    calls[0],
    [
      'token',
      {
        projectId:
          'st-student-app-85cde',
      },
    ],
  )
  assert.deepEqual(
    calls[1][1]
      .allowedProviderSubjectHashes,
    [allowedHash],
  )
  assert.deepEqual(
    calls[1][1]
      .revokedProviderSubjectHashes,
    [revokedHash],
  )
  assert.equal(
    calls[1][1].allowedOrigin,
    'https://st-student-app.onrender.com',
  )
  assert.deepEqual(
    calls[2],
    [
      'listen',
      {
        app: {
          kind: 'pilot-app',
        },
        port: 10000,
        host: '0.0.0.0',
      },
    ],
  )

  await runtime.close()
  await runtime.close()

  assert.equal(
    serverCloseCount,
    1,
  )
  assert.equal(
    verifierCloseCount,
    1,
  )
})

test('legacy pilot runtime rejects disabled, invalid-port and invalid dependency states', async () => {
  await assert.rejects(
    () =>
      startLegacySecureDeliveryServer({
        env: {},
      }),
    /pilot-disabled/i,
  )

  await assert.rejects(
    () =>
      startLegacySecureDeliveryServer({
        env: {
          STUDENT08_PILOT_ENABLED:
            'true',
          PORT: '0',
        },
      }),
    /invalid-port/i,
  )

  await assert.rejects(
    () =>
      startLegacySecureDeliveryServer({
        env: {
          STUDENT08_PILOT_ENABLED:
            'true',
          PORT: '10000',
        },
        createTokenVerifier: null,
      }),
    /runtime-dependency-invalid/i,
  )
})

test('production-only HTTP app exposes health, exact CORS and bounded rate limiting without OMR dependencies', async () => {
  let routerHits = 0
  const router = express.Router()
  router.get(
    '/student/assignments',
    (_req, res) => {
      routerHits += 1
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

  const result =
    await createSecureDeliveryProductionHttpApp({
      env: {
        NODE_ENV: 'production',
      },
      boundary,
      rateLimit: {
        windowMs: 60_000,
        apiMaxRequests: 1,
        maxEntries: 16,
      },
    })

  const health = await request(
    result.app,
    '/health',
  )
  assert.equal(health.status, 200)
  assert.equal(
    health.headers.get(
      'x-powered-by',
    ),
    null,
  )
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

  const firstDenied = await request(
    result.app,
    '/api/secure-delivery/v1/student/assignments',
    {
      headers: {
        Origin:
          'https://st-student-app.onrender.com',
      },
    },
  )
  assert.equal(
    firstDenied.status,
    401,
  )
  assert.equal(
    firstDenied.headers.get(
      'access-control-allow-origin',
    ),
    'https://st-student-app.onrender.com',
  )
  assert.equal(
    firstDenied.headers.get(
      'ratelimit-limit',
    ),
    '1',
  )
  assert.equal(routerHits, 1)

  const rateLimited = await request(
    result.app,
    '/api/secure-delivery/v1/student/assignments',
    {
      headers: {
        Origin:
          'https://st-student-app.onrender.com',
      },
    },
  )
  assert.equal(
    rateLimited.status,
    429,
  )
  assert.equal(
    (await rateLimited.json())
      .error.code,
    'RATE_LIMITED',
  )
  assert.equal(routerHits, 1)

  const missing = await request(
    result.app,
    '/not-a-route',
  )
  assert.equal(missing.status, 404)

  assert.deepEqual(
    result.allowedOrigins,
    [
      'https://seslitab-guitar-tab-bg2n.bolt.host',
      'https://st-student-app.onrender.com',
    ],
  )
  assert.deepEqual(
    result.publishedOrigins,
    result.allowedOrigins,
  )

  await assert.rejects(
    () =>
      createSecureDeliveryProductionHttpApp({
        env: {
          NODE_ENV: 'production',
        },
        boundary,
        rateLimit: null,
      }),
    /rate-limit-config-invalid/i,
  )
})

test('production runtime starts the dedicated app, uses the requested port and closes idempotently', async () => {
  const app = {
    kind: 'production-app',
  }
  let boundaryCloseCount = 0
  let serverCloseCount = 0
  const boundary = {
    async close() {
      boundaryCloseCount += 1
    },
  }
  const calls = []

  const runtime =
    await startProductionSecureDeliveryServer({
      env: {
        PORT: '10001',
      },
      async createHttpApp(input) {
        calls.push([
          'http',
          input,
        ])
        return {
          app,
          boundary,
        }
      },
      listen(
        inputApp,
        port,
        host,
        callback,
      ) {
        calls.push([
          'listen',
          {
            inputApp,
            port,
            host,
          },
        ])
        callback()
        return fakeServer(() => {
          serverCloseCount += 1
        })
      },
    })

  assert.equal(
    runtime.mode,
    'secure-delivery-production',
  )
  assert.deepEqual(
    calls[0],
    [
      'http',
      {
        env: {
          PORT: '10001',
        },
      },
    ],
  )
  assert.deepEqual(
    calls[1],
    [
      'listen',
      {
        inputApp: app,
        port: 10001,
        host: '0.0.0.0',
      },
    ],
  )

  await runtime.close()
  await runtime.close()

  assert.equal(
    serverCloseCount,
    1,
  )
  assert.equal(
    boundaryCloseCount,
    1,
  )
})

test('production runtime rejects invalid port and invalid injected runtime dependencies', async () => {
  await assert.rejects(
    () =>
      startProductionSecureDeliveryServer({
        env: {
          PORT: '-1',
        },
      }),
    /invalid-port/i,
  )

  await assert.rejects(
    () =>
      startProductionSecureDeliveryServer({
        env: {
          PORT: '10000',
        },
        createHttpApp: null,
      }),
    /runtime-dependency-invalid/i,
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

test('Render pilot server remains a tiny dispatcher and cannot embed pilot or production business logic', () => {
  const source = readFileSync(
    new URL(
      '../backend/delivery/pilot/server.js',
      import.meta.url,
    ),
    'utf8',
  )

  assert.match(
    source,
    /startSelectedSecureDeliveryServer/,
  )
  assert.doesNotMatch(
    source,
    /createPilotFirebaseTokenVerifier|STUDENT08_PILOT_ENABLED|createSecureDeliveryProductionHttpApp|startGateway|multer/,
  )
})


test('production runtime runs the gated acceptance bootstrap only after listen and exposes its completion result', async () => {
  const calls = []
  const runtime =
    await startProductionSecureDeliveryServer({
      env: {
        PORT: '10002',
        SECURE_DELIVERY_PRODUCTION_ACCEPTANCE_BOOTSTRAP:
          'true',
      },
      async createHttpApp() {
        return {
          app: {
            kind:
              'production-app',
          },
          boundary: {
            async close() {},
          },
        }
      },
      async runAcceptance(input) {
        calls.push([
          'acceptance',
          input.port,
          input.env
            .SECURE_DELIVERY_PRODUCTION_ACCEPTANCE_BOOTSTRAP,
        ])
        return Object.freeze({
          ran: true,
          outcome: 'pass',
          authorizedStatus:
            200,
          revokedStatus: 400,
        })
      },
      listen(
        _app,
        _port,
        _host,
        callback,
      ) {
        calls.push([
          'listen',
        ])
        callback()
        return fakeServer()
      },
    })

  const result =
    await runtime
      .waitForAcceptance()

  assert.deepEqual(
    calls,
    [
      ['listen'],
      [
        'acceptance',
        10002,
        'true',
      ],
    ],
  )
  assert.deepEqual(
    result,
    {
      ran: true,
      outcome: 'pass',
      authorizedStatus: 200,
      revokedStatus: 400,
    },
  )

  await runtime.close()
})
