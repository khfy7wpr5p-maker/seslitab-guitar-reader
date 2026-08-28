import { GatewayError, ValidationError } from '../utils/errors.js'

const ALLOWED_HANDOFF_MODES = new Set(['direct-import', 'external-open', 'blocked'])
const ALLOWED_FORMATS = new Set(['pdf', 'musicxml', 'mxl', 'mei', 'web'])
const ALLOWED_LOCATOR_CAPABILITIES = new Set(['notation', 'chords', 'lyrics', 'tablature', 'audio', 'metadata'])
const MAX_QUERY_LENGTH = 160
const MAX_ARRAY_ITEMS = 20
const MAX_SOURCE_LOCATORS = 10

function normalizeText(value, maxLength = 300) {
  if (typeof value !== 'string') return null
  const text = value.normalize('NFC').replace(/\s+/gu, ' ').trim()
  return text ? text.slice(0, maxLength) : null
}

function normalizeStringArray(value, maxItems = MAX_ARRAY_ITEMS) {
  if (!Array.isArray(value)) return Object.freeze([])
  return Object.freeze(value
    .slice(0, maxItems)
    .map((item) => normalizeText(item, 80))
    .filter(Boolean))
}

function validateSearchInput(input, configuredLimit) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('Arama isteği geçersiz.')
  }

  const query = normalizeText(input.query, MAX_QUERY_LENGTH + 1)
  if (!query || query.length < 2 || query.length > MAX_QUERY_LENGTH) {
    throw new ValidationError('Arama metni 2 ile 160 karakter arasında olmalıdır.')
  }

  const filters = input.filters && typeof input.filters === 'object' && !Array.isArray(input.filters)
    ? input.filters
    : {}

  const safeFilters = {}
  for (const key of ['artist', 'genre', 'era', 'format', 'repertoireFamily', 'catalogScope', 'ensembleType', 'scoreRole']) {
    const value = normalizeText(filters[key], 80)
    if (value) safeFilters[key] = value
  }

  if (filters.requiredFeatures != null) {
    if (!Array.isArray(filters.requiredFeatures) || filters.requiredFeatures.length > 8) {
      throw new ValidationError('İçerik filtreleri geçersiz.')
    }
    safeFilters.requiredFeatures = filters.requiredFeatures.map((item) => normalizeText(item, 40)).filter(Boolean)
  }

  if (filters.requiredInstruments != null) {
    if (!Array.isArray(filters.requiredInstruments) || filters.requiredInstruments.length > 12) {
      throw new ValidationError('Enstrüman filtreleri geçersiz.')
    }
    safeFilters.requiredInstruments = filters.requiredInstruments.map((item) => normalizeText(item, 40)).filter(Boolean)
  }

  const requestedLimit = input.limit == null ? configuredLimit : Number(input.limit)
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
    throw new ValidationError('Sonuç sınırı geçersiz.')
  }

  return Object.freeze({
    query,
    filters: Object.freeze(safeFilters),
    limit: Math.min(requestedLimit, configuredLimit, 100),
  })
}

export function normalizeDiscoveryGatewayBaseUrl(rawUrl, nodeEnv = process.env.NODE_ENV) {
  const value = typeof rawUrl === 'string' ? rawUrl.trim() : ''
  if (!value) return null

  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new GatewayError('DISCOVERY_INVALID_CONFIGURATION', 'Nota arama servisi yapılandırması geçersiz.', {}, 500)
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new GatewayError('DISCOVERY_INVALID_CONFIGURATION', 'Nota arama servisi yapılandırması geçersiz.', {}, 500)
  }

  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new GatewayError('DISCOVERY_INVALID_CONFIGURATION', 'Nota arama servisi kök adresi kullanılmalıdır.', {}, 500)
  }

  if (nodeEnv === 'production') {
    if (parsed.protocol !== 'https:') {
      throw new GatewayError('DISCOVERY_INVALID_CONFIGURATION', 'Production nota arama servisi HTTPS olmalıdır.', {}, 500)
    }
  } else if (parsed.protocol !== 'https:') {
    const localHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
    if (parsed.protocol !== 'http:' || !localHosts.has(parsed.hostname)) {
      throw new GatewayError('DISCOVERY_INVALID_CONFIGURATION', 'Güvensiz nota arama servisi adresi reddedildi.', {}, 500)
    }
  }

  parsed.pathname = '/'
  return parsed
}

async function readBoundedJson(response, maxBytes) {
  const declaredLength = Number(response.headers?.get?.('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new GatewayError('DISCOVERY_RESPONSE_TOO_LARGE', 'Nota arama servisi yanıtı sınırı aşıyor.', {}, 502)
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new GatewayError('DISCOVERY_RESPONSE_TOO_LARGE', 'Nota arama servisi yanıtı sınırı aşıyor.', {}, 502)
    }
    try { return JSON.parse(text) } catch { throw new GatewayError('DISCOVERY_INVALID_RESPONSE', 'Nota arama servisi geçersiz yanıt verdi.', {}, 502) }
  }

  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        try { await reader.cancel() } catch {}
        throw new GatewayError('DISCOVERY_RESPONSE_TOO_LARGE', 'Nota arama servisi yanıtı sınırı aşıyor.', {}, 502)
      }
      chunks.push(value)
    }
  } finally {
    try { reader.releaseLock() } catch {}
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new GatewayError('DISCOVERY_INVALID_RESPONSE', 'Nota arama servisi geçersiz metin kodlaması döndürdü.', {}, 502)
  }

  try { return JSON.parse(text) } catch { throw new GatewayError('DISCOVERY_INVALID_RESPONSE', 'Nota arama servisi geçersiz JSON döndürdü.', {}, 502) }
}

function safeHttpsSourcePage(value) {
  if (typeof value !== 'string' || !value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}

function sanitizeResult(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const id = normalizeText(raw.id, 200)
  const title = normalizeText(raw.title, 300)
  const format = normalizeText(raw.format, 30)?.toLowerCase()
  const handoffMode = normalizeText(raw.handoffMode, 30)?.toLowerCase()
  if (!id || !title || !ALLOWED_FORMATS.has(format) || !ALLOWED_HANDOFF_MODES.has(handoffMode)) return null

  const sourcePageUrl = safeHttpsSourcePage(raw.sourcePageUrl)
  return Object.freeze({
    id,
    title,
    artist: normalizeText(raw.artist, 300),
    genre: normalizeText(raw.genre, 160),
    era: normalizeText(raw.era, 120),
    scoreType: normalizeText(raw.scoreType, 120),
    format,
    contentFeatures: normalizeStringArray(raw.contentFeatures, 8),
    repertoireFamily: normalizeText(raw.repertoireFamily, 40),
    catalogScope: normalizeText(raw.catalogScope, 40),
    instrumentation: normalizeStringArray(raw.instrumentation, 20),
    ensembleType: normalizeText(raw.ensembleType, 60),
    scoreRole: normalizeText(raw.scoreRole, 60),
    source: normalizeText(raw.source, 160),
    sourcePageUrl,
    rightsStatus: normalizeText(raw.rightsStatus, 60),
    rightsLicense: normalizeText(raw.rightsLicense, 100),
    handoffMode,
    // Remote asset URLs intentionally never cross this consumer boundary.
    // A future authenticated/opaque handoff package must own direct import.
    canOpenSource: handoffMode === 'external-open' && Boolean(sourcePageUrl),
    canDirectImport: false,
  })
}

function sanitizeSourceLocator(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const id = normalizeText(raw.id, 160)
  const source = normalizeText(raw.source, 120)
  const label = normalizeText(raw.label, 200)
  const sourcePageUrl = safeHttpsSourcePage(raw.sourcePageUrl)
  if (!id || !source || !label || !sourcePageUrl) return null

  const capabilities = normalizeStringArray(raw.capabilities, 8)
    .filter((value) => ALLOWED_LOCATOR_CAPABILITIES.has(value))
  if (capabilities.length === 0) return null

  return Object.freeze({
    id,
    source,
    label,
    sourcePageUrl,
    capabilities: Object.freeze(capabilities),
    queryApplied: raw.queryApplied === true,
    availability: raw.availability === 'search-unverified' ? 'search-unverified' : 'search-unverified',
    note: normalizeText(raw.note, 300),
  })
}

export function createDiscoveryGatewayClient({
  baseUrl,
  timeoutMs = 10000,
  maxResponseBytes = 1024 * 1024,
  resultLimit = 50,
  fetchImpl = globalThis.fetch,
  nodeEnv = process.env.NODE_ENV,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function')
  const parsedBaseUrl = normalizeDiscoveryGatewayBaseUrl(baseUrl, nodeEnv)

  return Object.freeze({
    configured: Boolean(parsedBaseUrl),
    async search(input) {
      if (!parsedBaseUrl) {
        throw new GatewayError('DISCOVERY_NOT_CONFIGURED', 'Nota arama servisi bu ortamda yapılandırılmamış.', {}, 503)
      }

      const request = validateSearchInput(input, Math.min(Math.max(Number(resultLimit) || 50, 1), 100))
      const endpoint = new URL('/v1/search', parsedBaseUrl)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Math.min(Math.max(Number(timeoutMs) || 10000, 1000), 30000))

      let response
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          redirect: 'error',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        })
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new GatewayError('DISCOVERY_TIMEOUT', 'Nota arama servisi zaman aşımına uğradı.', {}, 504)
        }
        throw new GatewayError('DISCOVERY_UNAVAILABLE', 'Nota arama servisine ulaşılamıyor.', {}, 503)
      } finally {
        clearTimeout(timer)
      }

      if (!response.ok) {
        throw new GatewayError('DISCOVERY_UPSTREAM_ERROR', 'Nota arama servisi isteği tamamlayamadı.', {}, response.status === 429 ? 429 : 502)
      }

      const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase()
      if (!contentType.startsWith('application/json')) {
        throw new GatewayError('DISCOVERY_INVALID_RESPONSE', 'Nota arama servisi JSON yanıtı vermedi.', {}, 502)
      }

      const payload = await readBoundedJson(response, Math.min(Math.max(Number(maxResponseBytes) || 1024 * 1024, 1024), 2 * 1024 * 1024))
      if (!payload || typeof payload !== 'object' || !Array.isArray(payload.results)) {
        throw new GatewayError('DISCOVERY_INVALID_RESPONSE', 'Nota arama servisi yanıt sözleşmesi geçersiz.', {}, 502)
      }

      const results = payload.results.map(sanitizeResult).filter(Boolean)
      const sourceLocators = Array.isArray(payload.sourceLocators)
        ? payload.sourceLocators.slice(0, MAX_SOURCE_LOCATORS).map(sanitizeSourceLocator).filter(Boolean)
        : []
      return Object.freeze({
        results: Object.freeze(results),
        sourceLocators: Object.freeze(sourceLocators),
        totalResults: Number.isInteger(payload.totalResults) && payload.totalResults >= results.length
          ? payload.totalResults
          : results.length,
        truncated: payload.truncated === true,
        partial: Array.isArray(payload.providerErrors) && payload.providerErrors.length > 0,
      })
    },
  })
}
