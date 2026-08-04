// Fixed-window rate limiting for the SesliTab OMR Gateway.
//
// The store is process-local because the current Render deployment uses
// a single application instance. The store is bounded and expired entries
// are periodically removed to prevent unbounded memory growth.

export const RATE_LIMIT_ERROR_CODE = 'RATE_LIMITED'
export const RATE_LIMIT_ERROR_MESSAGE =
  'Çok fazla istek gönderildi. Lütfen daha sonra tekrar deneyin.'

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} pozitif bir tam sayı olmalıdır.`)
  }
  return value
}

export function requestClientKey(req) {
  const value =
    req?.ip ||
    req?.socket?.remoteAddress ||
    'unknown-client'

  return String(value)
}

export function createFixedWindowRateLimiter({
  windowMs,
  maxRequests,
  maxEntries = 10000,
  keyGenerator = requestClientKey,
  now = Date.now,
} = {}) {
  positiveInteger(windowMs, 'windowMs')
  positiveInteger(maxRequests, 'maxRequests')
  positiveInteger(maxEntries, 'maxEntries')

  if (typeof keyGenerator !== 'function') {
    throw new Error('keyGenerator bir fonksiyon olmalıdır.')
  }

  if (typeof now !== 'function') {
    throw new Error('now bir fonksiyon olmalıdır.')
  }

  const buckets = new Map()
  let nextSweepAt = 0

  function removeExpired(currentTime) {
    for (const [key, bucket] of buckets) {
      if (currentTime >= bucket.resetAt) {
        buckets.delete(key)
      }
    }
  }

  function ensureCapacity() {
    while (buckets.size >= maxEntries) {
      const oldestKey = buckets.keys().next().value
      if (oldestKey === undefined) break
      buckets.delete(oldestKey)
    }
  }

  function middleware(req, res, next) {
    const currentTime = Number(now())

    if (!Number.isFinite(currentTime) || currentTime < 0) {
      return next(new Error('Rate-limit saati geçersiz.'))
    }

    if (currentTime >= nextSweepAt) {
      removeExpired(currentTime)
      nextSweepAt = currentTime + windowMs
    }

    const key = String(keyGenerator(req) || 'unknown-client')
    let bucket = buckets.get(key)

    if (!bucket || currentTime >= bucket.resetAt) {
      ensureCapacity()
      bucket = {
        count: 0,
        resetAt: currentTime + windowMs,
      }
      buckets.set(key, bucket)
    }

    bucket.count += 1

    const remaining = Math.max(0, maxRequests - bucket.count)
    const resetSeconds = Math.max(
      1,
      Math.ceil((bucket.resetAt - currentTime) / 1000),
    )

    res.setHeader('RateLimit-Limit', String(maxRequests))
    res.setHeader('RateLimit-Remaining', String(remaining))
    res.setHeader('RateLimit-Reset', String(resetSeconds))

    if (bucket.count > maxRequests) {
      res.setHeader('Retry-After', String(resetSeconds))
      return res.status(429).json({
        success: false,
        error: {
          code: RATE_LIMIT_ERROR_CODE,
          message: RATE_LIMIT_ERROR_MESSAGE,
        },
      })
    }

    return next()
  }

  middleware.reset = () => {
    buckets.clear()
    nextSweepAt = 0
  }

  middleware.storeSize = () => buckets.size

  return middleware
}
