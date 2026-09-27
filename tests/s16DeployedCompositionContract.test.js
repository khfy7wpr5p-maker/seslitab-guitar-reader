import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const MODULE_URL = new URL('../scripts/s16DeployedCompositionContract.js', import.meta.url)
const MODULE_EXISTS = existsSync(MODULE_URL)
const SHA = '1234567890abcdef1234567890abcdef12345678'
const OTHER_SHA = 'abcdef1234567890abcdef1234567890abcdef12'
const PRODUCTION_URL = 'https://seslitab-app.onrender.com/'
const MANIFEST_URL = 'https://seslitab-app.onrender.com/seslitab-build.json'
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

function manifest(overrides = {}) {
  return {
    schemaVersion: 1,
    repository: 'khfy7wpr5p-maker/seslitab-guitar-reader',
    revision: SHA,
    composition: 'teacher-smoosic-v1',
    builtAt: '2026-09-27T15:00:00.000Z',
    requiredSurfaces: REQUIRED_SURFACES,
    ...overrides,
  }
}

function response(overrides = {}) {
  return {
    status: 200,
    contentType: 'application/json; charset=utf-8',
    finalUrl: MANIFEST_URL,
    body: JSON.stringify(manifest()),
    ...overrides,
  }
}

function snapshot(overrides = {}) {
  return {
    finalUrl: PRODUCTION_URL,
    readyState: 'complete',
    musicXmlAccepted: true,
    surfaces: {
      discoverySearch: true,
      smoosicTab: true,
      smoosicApply: true,
      tuner: true,
      guitarTab: true,
    },
    pageErrors: [],
    consoleErrors: [],
    ...overrides,
  }
}

async function subject() {
  return import(MODULE_URL)
}

test('S16 deployed-composition contract module exists', () => {
  assert.equal(MODULE_EXISTS, true)
})

test('S16 accepts only the exact HTTPS Render production root', { skip: !MODULE_EXISTS }, async () => {
  const { normalizeS16ProductionTarget } = await subject()

  assert.equal(normalizeS16ProductionTarget(PRODUCTION_URL).href, PRODUCTION_URL)
  assert.equal(
    normalizeS16ProductionTarget(new URL(PRODUCTION_URL)).href,
    PRODUCTION_URL,
  )
})

test('S16 rejects alternate insecure credentialed or decorated production targets', { skip: !MODULE_EXISTS }, async () => {
  const { normalizeS16ProductionTarget } = await subject()
  const invalid = [
    '',
    'http://seslitab-app.onrender.com/',
    'https://user:pass@seslitab-app.onrender.com/',
    'https://seslitab-app.onrender.com/#fragment',
    'https://seslitab-app.onrender.com/?preview=true',
    'https://seslitab-app.onrender.com/path',
    'https://seslitab-app.onrender.com:444/',
    'https://seslitab-omr.onrender.com/',
    'https://seslitab-guitar-tab-bg2n.bolt.host/',
    'https://evil.example/',
  ]

  for (const value of invalid) {
    assert.throws(() => normalizeS16ProductionTarget(value), /exact SesliTab production URL/i)
  }
})

test('S16 verifies an exact deployed manifest response', { skip: !MODULE_EXISTS }, async () => {
  const { verifyS16DeployedManifest } = await subject()
  const verified = verifyS16DeployedManifest(response(), { expectedRevision: SHA.toUpperCase() })

  assert.deepEqual(verified, manifest())
  assert.equal(Object.isFrozen(verified), true)
  assert.equal(Object.isFrozen(verified.requiredSurfaces), true)
})

test('S16 deployed manifest fails closed on HTTP content and redirect errors', { skip: !MODULE_EXISTS }, async () => {
  const { verifyS16DeployedManifest } = await subject()

  assert.throws(
    () => verifyS16DeployedManifest(response({ status: 404 }), { expectedRevision: SHA }),
    /HTTP 404/i,
  )
  assert.throws(
    () => verifyS16DeployedManifest(response({ contentType: 'text/html' }), { expectedRevision: SHA }),
    /application\/json/i,
  )
  assert.throws(
    () => verifyS16DeployedManifest(response({ body: '<html>missing</html>' }), { expectedRevision: SHA }),
    /valid JSON/i,
  )
  assert.throws(
    () => verifyS16DeployedManifest(response({ finalUrl: 'https://seslitab-guitar-tab-bg2n.bolt.host/seslitab-build.json' }), { expectedRevision: SHA }),
    /manifest final URL/i,
  )
  assert.throws(
    () => verifyS16DeployedManifest(response({ finalUrl: `${MANIFEST_URL}?stale=1` }), { expectedRevision: SHA }),
    /manifest final URL/i,
  )
})

test('S16 deployed manifest rejects schema repository revision and composition drift', { skip: !MODULE_EXISTS }, async () => {
  const { verifyS16DeployedManifest } = await subject()

  for (const [overrides, pattern] of [
    [{ schemaVersion: 2 }, /schema/i],
    [{ repository: 'other/repository' }, /repository/i],
    [{ revision: OTHER_SHA }, /revision mismatch/i],
    [{ composition: 'legacy-shell' }, /composition/i],
  ]) {
    assert.throws(
      () => verifyS16DeployedManifest(
        response({ body: JSON.stringify(manifest(overrides)) }),
        { expectedRevision: SHA },
      ),
      pattern,
    )
  }
})

test('S16 accepts a complete mounted production surface snapshot', { skip: !MODULE_EXISTS }, async () => {
  const { verifyS16MountedSurfaceSnapshot } = await subject()
  const verified = verifyS16MountedSurfaceSnapshot(snapshot())

  assert.deepEqual(verified, snapshot())
  assert.equal(Object.isFrozen(verified), true)
  assert.equal(Object.isFrozen(verified.surfaces), true)
  assert.equal(Object.isFrozen(verified.pageErrors), true)
  assert.equal(Object.isFrozen(verified.consoleErrors), true)
})

test('S16 mounted snapshot rejects redirect runtime errors and missing teacher surfaces', { skip: !MODULE_EXISTS }, async () => {
  const { verifyS16MountedSurfaceSnapshot } = await subject()

  assert.throws(
    () => verifyS16MountedSurfaceSnapshot(snapshot({ finalUrl: 'https://seslitab-guitar-tab-bg2n.bolt.host/' })),
    /final production URL/i,
  )
  assert.throws(
    () => verifyS16MountedSurfaceSnapshot(snapshot({ readyState: 'interactive' })),
    /document.*complete/i,
  )
  assert.throws(
    () => verifyS16MountedSurfaceSnapshot(snapshot({ musicXmlAccepted: false })),
    /MusicXML.*accepted/i,
  )
  assert.throws(
    () => verifyS16MountedSurfaceSnapshot(snapshot({ pageErrors: ['ReferenceError: broken'] })),
    /page error/i,
  )
  assert.throws(
    () => verifyS16MountedSurfaceSnapshot(snapshot({ consoleErrors: ['failed to mount'] })),
    /console error/i,
  )
  for (const key of ['discoverySearch', 'smoosicTab', 'smoosicApply', 'tuner', 'guitarTab']) {
    assert.throws(
      () => verifyS16MountedSurfaceSnapshot(snapshot({
        surfaces: { ...snapshot().surfaces, [key]: false },
      })),
      new RegExp(key, 'i'),
    )
  }
})

test('S16 exposes one explicit read-only live probe command', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  )

  assert.equal(
    packageJson.scripts['verify:production-composition'],
    'node scripts/verifyS16DeployedCompositionBrowser.js',
  )
  assert.doesNotMatch(packageJson.scripts.test, /production-composition|verifyS16Deployed/u)
  assert.doesNotMatch(packageJson.scripts.build, /verifyS16Deployed|production-composition/u)
})

test('S16 live probe fails closed before network access when target evidence is missing', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/verifyS16DeployedCompositionBrowser.js'],
    {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
      env: { PATH: process.env.PATH },
    },
  )

  assert.equal(result.status, 1)
  assert.match(result.stderr, /SESLITAB_PRODUCTION_URL.*required/i)
  assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND/i)
})
