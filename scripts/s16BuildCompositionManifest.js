import { execFileSync } from 'node:child_process'
import { access, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export const S16_COMPOSITION_SCHEMA_VERSION = 1
export const S16_COMPOSITION_ID = 'teacher-smoosic-v1'
export const S16_SOURCE_REPOSITORY = 'khfy7wpr5p-maker/seslitab-guitar-reader'
export const S16_REQUIRED_SURFACES = Object.freeze([
  'pdf-omr',
  'musicxml',
  'discovery',
  'smoosic',
  'smoosic-writeback',
  'playback',
  'guitar-tab',
  'tuner',
  'midi',
])

const MANIFEST_KEYS = Object.freeze([
  'schemaVersion',
  'repository',
  'revision',
  'composition',
  'builtAt',
  'requiredSurfaces',
])
const SHA_PATTERN = /^[a-f0-9]{40}$/u
const UTC_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u

function normalizeRevision(value, label = 'revision') {
  const revision = String(value ?? '').trim().toLowerCase()
  if (!SHA_PATTERN.test(revision)) {
    throw new TypeError(`${label} must be a 40-character hexadecimal Git revision.`)
  }
  return revision
}

function normalizeBuiltAt(value) {
  const builtAt = String(value ?? '').trim()
  if (
    !UTC_ISO_PATTERN.test(builtAt)
    || !Number.isFinite(Date.parse(builtAt))
    || new Date(builtAt).toISOString() !== builtAt
  ) {
    throw new TypeError('builtAt must be an exact UTC ISO-8601 timestamp.')
  }
  return builtAt
}

function assertExactKeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('S16 build composition manifest must be an object.')
  }
  const allowed = new Set(MANIFEST_KEYS)
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw new TypeError(`Unsupported manifest field: ${String(key)}`)
    }
  }
  for (const key of MANIFEST_KEYS) {
    if (!Object.hasOwn(value, key)) {
      throw new TypeError(`Missing manifest field: ${key}`)
    }
  }
}

function assertRequiredSurfaces(value) {
  if (
    !Array.isArray(value)
    || value.length !== S16_REQUIRED_SURFACES.length
    || value.some((item, index) => item !== S16_REQUIRED_SURFACES[index])
  ) {
    throw new TypeError('S16 required surfaces do not match the teacher composition contract.')
  }
}

export function resolveS16BuildRevision({
  env = process.env,
  cwd = process.cwd(),
  execFileSyncImpl = execFileSync,
} = {}) {
  let checkedOut
  try {
    checkedOut = normalizeRevision(
      execFileSyncImpl('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }),
      'Checked-out revision',
    )
  } catch (error) {
    if (error instanceof TypeError && /checked-out revision/i.test(error.message)) throw error
    throw new Error('Unable to resolve checked-out revision.', { cause: error })
  }

  for (const name of ['RENDER_GIT_COMMIT', 'GITHUB_SHA']) {
    if (env?.[name] == null || String(env[name]).trim() === '') continue
    const supplied = normalizeRevision(env[name], name)
    if (supplied !== checkedOut) {
      throw new Error(`${name} does not match the checked-out revision.`)
    }
  }

  return checkedOut
}

export function createS16BuildCompositionManifest({ revision, builtAt } = {}) {
  return Object.freeze({
    schemaVersion: S16_COMPOSITION_SCHEMA_VERSION,
    repository: S16_SOURCE_REPOSITORY,
    revision: normalizeRevision(revision),
    composition: S16_COMPOSITION_ID,
    builtAt: normalizeBuiltAt(builtAt),
    requiredSurfaces: Object.freeze([...S16_REQUIRED_SURFACES]),
  })
}

export function validateS16BuildCompositionManifest(value, { expectedRevision } = {}) {
  assertExactKeys(value)
  if (value.schemaVersion !== S16_COMPOSITION_SCHEMA_VERSION) {
    throw new TypeError('S16 manifest schema version mismatch.')
  }
  if (value.repository !== S16_SOURCE_REPOSITORY) {
    throw new TypeError('S16 manifest repository mismatch.')
  }
  if (value.composition !== S16_COMPOSITION_ID) {
    throw new TypeError('S16 manifest composition mismatch.')
  }
  assertRequiredSurfaces(value.requiredSurfaces)

  const manifest = createS16BuildCompositionManifest({
    revision: value.revision,
    builtAt: value.builtAt,
  })
  if (
    expectedRevision != null
    && manifest.revision !== normalizeRevision(expectedRevision, 'Expected revision')
  ) {
    throw new Error('S16 manifest revision mismatch.')
  }
  return manifest
}

export async function writeS16BuildCompositionManifest({ distRoot, manifest } = {}) {
  const root = resolve(String(distRoot ?? ''))
  const indexPath = resolve(root, 'index.html')
  const outputPath = resolve(root, 'seslitab-build.json')

  try {
    await access(indexPath)
  } catch (error) {
    throw new Error(`${indexPath} does not exist; build provenance was not written.`, { cause: error })
  }

  const validated = validateS16BuildCompositionManifest(manifest)
  await writeFile(outputPath, `${JSON.stringify(validated, null, 2)}\n`, 'utf8')
  const reread = JSON.parse(await readFile(outputPath, 'utf8'))
  validateS16BuildCompositionManifest(reread, { expectedRevision: validated.revision })
  return outputPath
}
