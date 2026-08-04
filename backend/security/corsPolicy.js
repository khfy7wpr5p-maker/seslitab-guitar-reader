// Exact-origin CORS policy for the SesliTab OMR Gateway.

export const PUBLISHED_FRONTEND_ORIGIN =
  'https://seslitab-guitar-tab-bg2n.bolt.host'

const DEVELOPMENT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

function normalizeOrigin(value) {
  const raw = String(value ?? '').trim()

  if (!raw) return null
  if (raw === '*') {
    throw new Error('CORS origin joker karakter olamaz.')
  }

  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error(`Geçersiz CORS origin: ${raw}`)
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Desteklenmeyen CORS protokolü: ${raw}`)
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname && parsed.pathname !== '/')
  ) {
    throw new Error(`CORS girdisi yalnız origin içermelidir: ${raw}`)
  }

  if (!parsed.origin || parsed.origin === 'null') {
    throw new Error(`Geçersiz CORS origin: ${raw}`)
  }

  return parsed.origin
}

export function parseAllowedOrigins(
  rawValue,
  nodeEnv = 'development',
) {
  const configured = typeof rawValue === 'string'
    ? rawValue.split(',').map((value) => value.trim()).filter(Boolean)
    : []

  const defaults = nodeEnv === 'production'
    ? [PUBLISHED_FRONTEND_ORIGIN]
    : [PUBLISHED_FRONTEND_ORIGIN, ...DEVELOPMENT_ORIGINS]

  const source = configured.length > 0 ? configured : defaults
  const normalized = [
    ...new Set(source.map(normalizeOrigin).filter(Boolean)),
  ]

  if (normalized.length === 0) {
    throw new Error('En az bir CORS origin yapılandırılmalıdır.')
  }

  return Object.freeze(normalized)
}

export function createCorsOptions(allowedOrigins) {
  const allowed = new Set(allowedOrigins)

  if (allowed.size === 0) {
    throw new Error('CORS allowlist boş olamaz.')
  }

  return {
    origin(origin, callback) {
      // Requests without an Origin header include Render health checks,
      // command-line smoke tests and server-to-server requests.
      const permitted = !origin || allowed.has(origin)
      callback(null, permitted)
    },
    credentials: false,
    methods: ['GET', 'HEAD', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    optionsSuccessStatus: 204,
    maxAge: 600,
  }
}
