import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const MODULE_URL = new URL('../scripts/s16BuildCompositionManifest.js', import.meta.url)
const MODULE_EXISTS = existsSync(MODULE_URL)
const SHA = '1234567890abcdef1234567890abcdef12345678'
const OTHER_SHA = 'abcdef1234567890abcdef1234567890abcdef12'
const BUILT_AT = '2026-09-27T15:00:00.000Z'
const REQUIRED_SURFACES = [
  'pdf-omr',
  'musicxml',
  'discovery',
  'smoosic',
  'smoosic-writeback',
  'playback',
  'guitar-tab',
  'tuner',
  'midi',
]

async function subject() {
  return import(MODULE_URL)
}

test('S16 build-composition module exists', () => {
  assert.equal(MODULE_EXISTS, true)
})

test('S16 creates the exact teacher composition manifest', { skip: !MODULE_EXISTS }, async () => {
  const {
    S16_COMPOSITION_SCHEMA_VERSION,
    S16_COMPOSITION_ID,
    S16_SOURCE_REPOSITORY,
    createS16BuildCompositionManifest,
  } = await subject()

  assert.equal(S16_COMPOSITION_SCHEMA_VERSION, 1)
  assert.equal(S16_COMPOSITION_ID, 'teacher-smoosic-v1')
  assert.equal(S16_SOURCE_REPOSITORY, 'khfy7wpr5p-maker/seslitab-guitar-reader')
  assert.deepEqual(
    createS16BuildCompositionManifest({ revision: SHA, builtAt: BUILT_AT }),
    {
      schemaVersion: 1,
      repository: 'khfy7wpr5p-maker/seslitab-guitar-reader',
      revision: SHA,
      composition: 'teacher-smoosic-v1',
      builtAt: BUILT_AT,
      requiredSurfaces: REQUIRED_SURFACES,
    },
  )
})

test('S16 normalizes uppercase revision and deeply freezes manifest values', { skip: !MODULE_EXISTS }, async () => {
  const { createS16BuildCompositionManifest } = await subject()
  const manifest = createS16BuildCompositionManifest({
    revision: SHA.toUpperCase(),
    builtAt: BUILT_AT,
  })

  assert.equal(manifest.revision, SHA)
  assert.equal(Object.isFrozen(manifest), true)
  assert.equal(Object.isFrozen(manifest.requiredSurfaces), true)
  assert.throws(() => manifest.requiredSurfaces.push('other'), TypeError)
})

test('S16 validates a JSON round-trip and rejects drift or malformed evidence', { skip: !MODULE_EXISTS }, async () => {
  const {
    createS16BuildCompositionManifest,
    validateS16BuildCompositionManifest,
  } = await subject()
  const manifest = createS16BuildCompositionManifest({ revision: SHA, builtAt: BUILT_AT })
  const parsed = JSON.parse(JSON.stringify(manifest))

  assert.deepEqual(
    validateS16BuildCompositionManifest(parsed, { expectedRevision: SHA.toUpperCase() }),
    manifest,
  )
  assert.throws(
    () => validateS16BuildCompositionManifest(parsed, { expectedRevision: OTHER_SHA }),
    /revision mismatch/i,
  )
  assert.throws(
    () => validateS16BuildCompositionManifest({ ...parsed, revision: 'main' }),
    /40-character/i,
  )
  assert.throws(
    () => validateS16BuildCompositionManifest({ ...parsed, composition: 'legacy-shell' }),
    /composition/i,
  )
  assert.throws(
    () => validateS16BuildCompositionManifest({ ...parsed, extra: true }),
    /unsupported manifest field/i,
  )
  assert.throws(
    () => validateS16BuildCompositionManifest({ ...parsed, requiredSurfaces: [...REQUIRED_SURFACES].reverse() }),
    /required surfaces/i,
  )
})

test('S16 rejects missing invalid revision and timestamp inputs', { skip: !MODULE_EXISTS }, async () => {
  const { createS16BuildCompositionManifest } = await subject()

  for (const revision of [undefined, '', 'main', SHA.slice(0, 12), `${SHA}0`, 'g'.repeat(40)]) {
    assert.throws(
      () => createS16BuildCompositionManifest({ revision, builtAt: BUILT_AT }),
      /40-character/i,
    )
  }
  for (const builtAt of [undefined, '', 'today', '2026-09-27', '2026-09-27T15:00:00+03:00']) {
    assert.throws(
      () => createS16BuildCompositionManifest({ revision: SHA, builtAt }),
      /UTC ISO-8601/i,
    )
  }
})

test('S16 resolves the checked-out Git revision and requires environment agreement', { skip: !MODULE_EXISTS }, async () => {
  const { resolveS16BuildRevision } = await subject()
  const calls = []
  const git = (...args) => {
    calls.push(args)
    return `${SHA.toUpperCase()}\n`
  }

  assert.equal(
    resolveS16BuildRevision({ env: {}, cwd: '/repo', execFileSyncImpl: git }),
    SHA,
  )
  assert.deepEqual(calls[0], ['git', ['rev-parse', 'HEAD'], { cwd: '/repo', encoding: 'utf8' }])
  assert.equal(
    resolveS16BuildRevision({
      env: { RENDER_GIT_COMMIT: SHA.toUpperCase(), GITHUB_SHA: SHA },
      cwd: '/repo',
      execFileSyncImpl: git,
    }),
    SHA,
  )
  assert.throws(
    () => resolveS16BuildRevision({
      env: { RENDER_GIT_COMMIT: OTHER_SHA },
      cwd: '/repo',
      execFileSyncImpl: git,
    }),
    /RENDER_GIT_COMMIT.*checked-out revision/i,
  )
  assert.throws(
    () => resolveS16BuildRevision({
      env: { GITHUB_SHA: 'main' },
      cwd: '/repo',
      execFileSyncImpl: git,
    }),
    /GITHUB_SHA.*40-character/i,
  )
})

test('S16 fails closed when Git does not provide an exact revision', { skip: !MODULE_EXISTS }, async () => {
  const { resolveS16BuildRevision } = await subject()

  assert.throws(
    () => resolveS16BuildRevision({
      env: {},
      cwd: '/repo',
      execFileSyncImpl: () => 'main\n',
    }),
    /checked-out revision.*40-character/i,
  )
  assert.throws(
    () => resolveS16BuildRevision({
      env: {},
      cwd: '/repo',
      execFileSyncImpl: () => { throw new Error('not a repository') },
    }),
    /unable to resolve checked-out revision/i,
  )
})

test('S16 writes and rereads only the completed dist manifest', { skip: !MODULE_EXISTS }, async (t) => {
  const {
    createS16BuildCompositionManifest,
    writeS16BuildCompositionManifest,
  } = await subject()
  const root = await mkdtemp(join(tmpdir(), 'seslitab-s16-manifest-'))
  t.after(async () => {
    const { rm } = await import('node:fs/promises')
    await rm(root, { recursive: true, force: true })
  })
  const distRoot = join(root, 'dist')
  await mkdir(distRoot)
  await writeFile(join(distRoot, 'index.html'), '<!doctype html>', 'utf8')
  const manifest = createS16BuildCompositionManifest({ revision: SHA, builtAt: BUILT_AT })

  const outputPath = await writeS16BuildCompositionManifest({ distRoot, manifest })

  assert.equal(outputPath, join(distRoot, 'seslitab-build.json'))
  assert.deepEqual(JSON.parse(await readFile(outputPath, 'utf8')), manifest)
  assert.deepEqual((await readdir(root)).sort(), ['dist'])
  assert.deepEqual((await readdir(distRoot)).sort(), ['index.html', 'seslitab-build.json'])
})

test('S16 refuses to write provenance before the production bundle exists', { skip: !MODULE_EXISTS }, async (t) => {
  const {
    createS16BuildCompositionManifest,
    writeS16BuildCompositionManifest,
  } = await subject()
  const root = await mkdtemp(join(tmpdir(), 'seslitab-s16-no-build-'))
  t.after(async () => {
    const { rm } = await import('node:fs/promises')
    await rm(root, { recursive: true, force: true })
  })
  const distRoot = join(root, 'dist')
  await mkdir(distRoot)

  await assert.rejects(
    writeS16BuildCompositionManifest({
      distRoot,
      manifest: createS16BuildCompositionManifest({ revision: SHA, builtAt: BUILT_AT }),
    }),
    /dist\/index\.html.*does not exist/i,
  )
  assert.deepEqual(await readdir(distRoot), [])
})
