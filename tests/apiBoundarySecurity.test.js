import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  InternalError,
  ValidationError,
  toGatewayError,
} from '../backend/utils/errors.js'

import {
  PUBLISHED_FRONTEND_ORIGIN,
  createCorsOptions,
  parseAllowedOrigins,
} from '../backend/security/corsPolicy.js'
import {
  RATE_LIMIT_ERROR_CODE,
  RATE_LIMIT_ERROR_MESSAGE,
  createFixedWindowRateLimiter,
  requestClientKey,
} from '../backend/security/rateLimitPolicy.js'

test('unknown exceptions are converted to a generic safe API error', () => {
  const rawError = new Error(
    'ENOENT: /var/lib/seslitab/private-score.pdf; API_KEY=secret-value'
  )

  const result = toGatewayError(rawError)

  assert.ok(result instanceof InternalError)
  assert.equal(result.code, 'INTERNAL_ERROR')
  assert.equal(result.statusCode, 500)
  assert.equal(result.message, 'Beklenmeyen sunucu hatası.')

  const response = result.toJSON()

  assert.deepEqual(response, {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Beklenmeyen sunucu hatası.',
    },
  })

  const serialized = JSON.stringify(response)
  assert.doesNotMatch(serialized, /\/var\/lib\/seslitab/)
  assert.doesNotMatch(serialized, /API_KEY/)
  assert.doesNotMatch(serialized, /secret-value/)
  assert.equal('stack' in response.error, false)
})

test('known gateway errors preserve their stable public message', () => {
  const original = new ValidationError('PDF dosyası zorunludur.')
  const result = toGatewayError(original)

  assert.equal(result, original)
  assert.equal(result.code, 'VALIDATION_ERROR')
  assert.equal(result.statusCode, 400)
  assert.deepEqual(result.toJSON(), {
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'PDF dosyası zorunludur.',
    },
  })
})


function evaluateCorsOrigin(options, origin) {
  return new Promise((resolve, reject) => {
    options.origin(origin, (error, permitted) => {
      if (error) reject(error)
      else resolve(permitted)
    })
  })
}

test('production CORS permits only the published Bolt origin', () => {
  const allowed = parseAllowedOrigins(undefined, 'production')

  assert.deepEqual(allowed, [PUBLISHED_FRONTEND_ORIGIN])
  assert.equal(
    PUBLISHED_FRONTEND_ORIGIN,
    'https://seslitab-guitar-tab-bg2n.bolt.host',
  )
  assert.equal(
    allowed.includes('https://attacker.example'),
    false,
  )
  assert.equal(
    allowed.includes(
      'https://evil.seslitab-guitar-tab-bg2n.bolt.host',
    ),
    false,
  )
})

test('development CORS keeps exact production and local origins', () => {
  const allowed = parseAllowedOrigins(undefined, 'development')

  assert.deepEqual(allowed, [
    'https://seslitab-guitar-tab-bg2n.bolt.host',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ])
})

test('configured CORS origins are normalized and deduplicated', () => {
  const allowed = parseAllowedOrigins(
    [
      'https://seslitab-guitar-tab-bg2n.bolt.host/',
      'https://seslitab-guitar-tab-bg2n.bolt.host',
      'https://example.org',
    ].join(','),
    'production',
  )

  assert.deepEqual(allowed, [
    'https://seslitab-guitar-tab-bg2n.bolt.host',
    'https://example.org',
  ])
})

test('unsafe or non-origin CORS configuration fails closed', () => {
  for (const value of [
    '*',
    'javascript:alert(1)',
    'https://example.org/private/path',
    'https://example.org?secret=value',
    'https://user:password@example.org',
  ]) {
    assert.throws(
      () => parseAllowedOrigins(value, 'production'),
    )
  }
})

test('CORS callback allows exact origin and origin-less health checks', async () => {
  const options = createCorsOptions(
    parseAllowedOrigins(undefined, 'production'),
  )

  assert.equal(
    await evaluateCorsOrigin(
      options,
      'https://seslitab-guitar-tab-bg2n.bolt.host',
    ),
    true,
  )

  assert.equal(
    await evaluateCorsOrigin(
      options,
      'https://attacker.example',
    ),
    false,
  )

  assert.equal(
    await evaluateCorsOrigin(options, undefined),
    true,
  )

  assert.equal(options.credentials, false)
  assert.deepEqual(options.allowedHeaders, ['Content-Type'])
})

test('server and Render use the exact configured CORS allowlist', () => {
  const serverSource = readFileSync(
    new URL('../backend/server.js', import.meta.url),
    'utf8',
  )
  const renderSource = readFileSync(
    new URL('../render.yaml', import.meta.url),
    'utf8',
  )

  assert.match(
    serverSource,
    /createCorsOptions\(GATEWAY_CONFIG\.allowedOrigins\)/,
  )
  assert.doesNotMatch(serverSource, /origin:\s*true/)
  assert.ok(
    renderSource.includes(
      'key: SESLITAB_ALLOWED_ORIGINS',
    ),
  )
  assert.ok(
    renderSource.includes(
      'value: "https://seslitab-guitar-tab-bg2n.bolt.host"',
    ),
  )
})


function createRateLimitResponse() {
  const headers = new Map()

  return {
    statusCode: 200,
    body: null,
    headers,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), String(value))
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(value) {
      this.body = value
      return this
    },
  }
}

function runRateLimiter(limiter, request) {
  const response = createRateLimitResponse()
  let nextCalled = false
  let nextError = null

  limiter(request, response, (error) => {
    nextCalled = true
    nextError = error || null
  })

  return {
    response,
    nextCalled,
    nextError,
  }
}

test('rate limiter permits requests up to the configured limit', () => {
  let currentTime = 0

  const limiter = createFixedWindowRateLimiter({
    windowMs: 60000,
    maxRequests: 2,
    maxEntries: 100,
    now: () => currentTime,
    keyGenerator: (request) => request.client,
  })

  const first = runRateLimiter(limiter, { client: 'client-a' })
  const second = runRateLimiter(limiter, { client: 'client-a' })

  assert.equal(first.nextCalled, true)
  assert.equal(first.nextError, null)
  assert.equal(first.response.statusCode, 200)
  assert.equal(
    first.response.headers.get('ratelimit-remaining'),
    '1',
  )

  assert.equal(second.nextCalled, true)
  assert.equal(second.response.statusCode, 200)
  assert.equal(
    second.response.headers.get('ratelimit-remaining'),
    '0',
  )
})

test('rate limiter returns stable 429 response and Retry-After', () => {
  const limiter = createFixedWindowRateLimiter({
    windowMs: 60000,
    maxRequests: 1,
    maxEntries: 100,
    now: () => 0,
    keyGenerator: (request) => request.client,
  })

  runRateLimiter(limiter, { client: 'client-a' })
  const blocked = runRateLimiter(
    limiter,
    { client: 'client-a' },
  )

  assert.equal(blocked.nextCalled, false)
  assert.equal(blocked.response.statusCode, 429)
  assert.equal(
    blocked.response.headers.get('retry-after'),
    '60',
  )
  assert.deepEqual(blocked.response.body, {
    success: false,
    error: {
      code: RATE_LIMIT_ERROR_CODE,
      message: RATE_LIMIT_ERROR_MESSAGE,
    },
  })

  const serialized = JSON.stringify(blocked.response.body)
  assert.doesNotMatch(serialized, /stack/i)
  assert.doesNotMatch(serialized, /internal/i)
})

test('rate-limit windows reset and clients remain independent', () => {
  let currentTime = 0

  const limiter = createFixedWindowRateLimiter({
    windowMs: 1000,
    maxRequests: 1,
    maxEntries: 100,
    now: () => currentTime,
    keyGenerator: (request) => request.client,
  })

  assert.equal(
    runRateLimiter(limiter, { client: 'client-a' }).nextCalled,
    true,
  )

  assert.equal(
    runRateLimiter(limiter, { client: 'client-b' }).nextCalled,
    true,
  )

  assert.equal(
    runRateLimiter(limiter, { client: 'client-a' })
      .response.statusCode,
    429,
  )

  currentTime = 1000

  assert.equal(
    runRateLimiter(limiter, { client: 'client-a' }).nextCalled,
    true,
  )
})

test('rate-limit store remains bounded', () => {
  const limiter = createFixedWindowRateLimiter({
    windowMs: 60000,
    maxRequests: 10,
    maxEntries: 2,
    now: () => 0,
    keyGenerator: (request) => request.client,
  })

  runRateLimiter(limiter, { client: 'client-a' })
  runRateLimiter(limiter, { client: 'client-b' })
  runRateLimiter(limiter, { client: 'client-c' })

  assert.equal(limiter.storeSize(), 2)

  limiter.reset()

  assert.equal(limiter.storeSize(), 0)
})

test('request client key prefers Express resolved IP', () => {
  assert.equal(
    requestClientKey({
      ip: '203.0.113.25',
      socket: { remoteAddress: '10.0.0.1' },
    }),
    '203.0.113.25',
  )

  assert.equal(
    requestClientKey({
      socket: { remoteAddress: '10.0.0.1' },
    }),
    '10.0.0.1',
  )
})

test('server limits API and job creation while exempting health', () => {
  const serverSource = readFileSync(
    new URL('../backend/server.js', import.meta.url),
    'utf8',
  )

  const apiHealthIndex = serverSource.indexOf(
    "app.get('/api/v1/health'",
  )
  const apiLimiterIndex = serverSource.indexOf(
    "app.use('/api', apiRateLimiter)",
  )

  assert.ok(apiHealthIndex >= 0)
  assert.ok(apiLimiterIndex > apiHealthIndex)

  assert.match(
    serverSource,
    /app\.post\('\/api\/jobs', jobRateLimiter,/,
  )

  assert.match(
    serverSource,
    /app\.post\('\/api\/v1\/pdf\/upload', jobRateLimiter,/,
  )

  assert.match(
    serverSource,
    /app\.post\('\/api\/v1\/pdf\/analyze', jobRateLimiter,/,
  )

  assert.ok(
    serverSource.includes(
      "app.set('trust proxy', [",
    ),
  )

  assert.ok(serverSource.includes("'loopback'"))
  assert.ok(serverSource.includes("'linklocal'"))
  assert.ok(serverSource.includes("'uniquelocal'"))
  assert.doesNotMatch(
    serverSource,
    /app\.set\('trust proxy',\s*true\)/,
  )
})

test('Render contains explicit bounded rate-limit configuration', () => {
  const renderSource = readFileSync(
    new URL('../render.yaml', import.meta.url),
    'utf8',
  )

  for (const key of [
    'SESLITAB_RATE_LIMIT_WINDOW_MS',
    'SESLITAB_API_RATE_LIMIT_MAX',
    'SESLITAB_JOB_RATE_LIMIT_MAX',
    'SESLITAB_RATE_LIMIT_MAX_ENTRIES',
  ]) {
    assert.ok(renderSource.includes(`key: ${key}`))
  }
})
