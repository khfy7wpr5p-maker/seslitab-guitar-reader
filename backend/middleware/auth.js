// backend/middleware/auth.js
export function apiKeyMiddleware(req, res, next) {
  const headerKey = req.header('X-API-Key') || (req.header('Authorization') || '').replace(/^Bearer\s+/i, '')
  const envKeys = (process.env.ALLOWED_API_KEYS || '').split(',').map(s => s.trim()).filter(Boolean)
  // If no keys configured, deny in production. In dev you can set ALLOW_OPEN_API=true to skip.
  if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_OPEN_API === 'true') {
    return next()
  }
  if (!headerKey || !envKeys.length || !envKeys.includes(headerKey)) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'API key required' } })
  }
  // attach principal if needed
  req.apiKey = headerKey
  next()
}
