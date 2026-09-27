import { validateS16BuildCompositionManifest } from './s16BuildCompositionManifest.js'

export const S16_PRODUCTION_URL = 'https://seslitab-app.onrender.com/'
export const S16_PRODUCTION_MANIFEST_URL = `${S16_PRODUCTION_URL}seslitab-build.json`

const SNAPSHOT_KEYS = Object.freeze([
  'finalUrl',
  'readyState',
  'musicXmlAccepted',
  'surfaces',
  'pageErrors',
  'consoleErrors',
])
const SURFACE_KEYS = Object.freeze([
  'discoverySearch',
  'smoosicTab',
  'smoosicApply',
  'tuner',
  'guitarTab',
])

function assertExactObjectKeys(value, expectedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`)
  }
  const allowed = new Set(expectedKeys)
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw new TypeError(`${label} has unsupported field: ${String(key)}`)
    }
  }
  for (const key of expectedKeys) {
    if (!Object.hasOwn(value, key)) {
      throw new TypeError(`${label} is missing field: ${key}`)
    }
  }
}

function normalizeErrorList(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new TypeError(`${label} must be an array of strings.`)
  }
  if (value.length > 0) {
    throw new Error(`${label} detected: ${value.join(' | ')}`)
  }
  return Object.freeze([])
}

export function normalizeS16ProductionTarget(value) {
  let url
  try {
    url = value instanceof URL ? new URL(value.href) : new URL(String(value ?? ''))
  } catch (error) {
    throw new TypeError('Expected the exact SesliTab production URL.', { cause: error })
  }

  if (
    url.href !== S16_PRODUCTION_URL
    || url.protocol !== 'https:'
    || url.hostname !== 'seslitab-app.onrender.com'
    || url.port
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
  ) {
    throw new TypeError('Expected the exact SesliTab production URL.')
  }
  return url
}

export function verifyS16DeployedManifest(value, { expectedRevision } = {}) {
  assertExactObjectKeys(
    value,
    ['status', 'contentType', 'finalUrl', 'body'],
    'S16 deployed manifest response',
  )
  if (value.status !== 200) {
    throw new Error(`S16 deployed manifest returned HTTP ${String(value.status)}.`)
  }
  if (!/^application\/json(?:\s*;|$)/iu.test(String(value.contentType ?? '').trim())) {
    throw new TypeError('S16 deployed manifest must use application/json content type.')
  }
  if (String(value.finalUrl ?? '') !== S16_PRODUCTION_MANIFEST_URL) {
    throw new Error('S16 deployed manifest final URL does not match production authority.')
  }

  let parsed
  try {
    parsed = JSON.parse(String(value.body ?? ''))
  } catch (error) {
    throw new TypeError('S16 deployed manifest body must be valid JSON.', { cause: error })
  }
  return validateS16BuildCompositionManifest(parsed, { expectedRevision })
}

export function verifyS16MountedSurfaceSnapshot(value) {
  assertExactObjectKeys(value, SNAPSHOT_KEYS, 'S16 mounted surface snapshot')
  if (String(value.finalUrl ?? '') !== S16_PRODUCTION_URL) {
    throw new Error('S16 final production URL does not match production authority.')
  }
  if (value.readyState !== 'complete') {
    throw new Error('S16 production document did not reach complete state.')
  }
  if (value.musicXmlAccepted !== true) {
    throw new Error('S16 production MusicXML was not accepted.')
  }

  assertExactObjectKeys(value.surfaces, SURFACE_KEYS, 'S16 mounted surfaces')
  const surfaces = {}
  for (const key of SURFACE_KEYS) {
    if (value.surfaces[key] !== true) {
      throw new Error(`S16 required mounted surface is missing: ${key}`)
    }
    surfaces[key] = true
  }

  const pageErrors = normalizeErrorList(value.pageErrors, 'S16 page error')
  const consoleErrors = normalizeErrorList(value.consoleErrors, 'S16 console error')

  return Object.freeze({
    finalUrl: S16_PRODUCTION_URL,
    readyState: 'complete',
    musicXmlAccepted: true,
    surfaces: Object.freeze(surfaces),
    pageErrors,
    consoleErrors,
  })
}
