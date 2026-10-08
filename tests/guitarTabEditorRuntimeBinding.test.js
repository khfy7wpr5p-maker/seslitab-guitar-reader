import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import {
  GUITAR_TAB_EDITOR_BROWSER_CONTRACT,
  GUITAR_TAB_EDITOR_BROWSER_VERSION,
  GUITAR_TAB_EDITOR_REVISION,
  GUITAR_TAB_EDITOR_RUNTIME_GLOBAL,
  GUITAR_TAB_EDITOR_RUNTIME_VERSION,
  verifyGuitarTabEditorArtifact,
  verifyGuitarTabEditorRuntimeManifest,
} from '../scripts/prepareGuitarTabEditorRuntime.js'
import {
  GUITAR_TAB_EDITOR_RUNTIME_URL,
  loadGuitarTabEditorRuntime,
  resolveGuitarTabEditorRuntime,
} from '../src/services/guitarTabEditorRuntimeLoader.js'

function validArtifact() {
  return Buffer.from('globalThis.STGuitarTabEditorRuntime={};')
}

function validManifest(artifact = validArtifact()) {
  return {
    contract: GUITAR_TAB_EDITOR_BROWSER_CONTRACT,
    version: GUITAR_TAB_EDITOR_BROWSER_VERSION,
    runtimeVersion: GUITAR_TAB_EDITOR_RUNTIME_VERSION,
    bundler: { package: 'esbuild', version: '0.28.2', license: 'MIT' },
    artifact: 'st-guitar-tab-editor.runtime.js',
    format: 'iife',
    target: 'es2022',
    global: GUITAR_TAB_EDITOR_RUNTIME_GLOBAL,
    externalImports: 0,
    networkCapable: false,
    persistenceCapable: false,
    rendererAuthority: false,
    sourceMutationAuthority: false,
    serverRevisionAuthority: false,
    approvalAuthority: false,
    publicationAuthority: false,
    bytes: artifact.byteLength,
    sha256: createHash('sha256').update(artifact).digest('hex'),
  }
}

function validRuntime() {
  const noop = () => null
  const profile = Object.freeze({
    networkCapable: false,
    persistenceCapable: false,
    rendererAuthority: false,
    sourceMutationAuthority: false,
    serverRevisionAuthority: false,
    approvalAuthority: false,
    publicationAuthority: false,
  })
  return Object.freeze({
    runtimeVersion: GUITAR_TAB_EDITOR_RUNTIME_VERSION,
    profile,
    inspectMusicXml: noop,
    createSourceSession: noop,
    createTabAssignmentDocument: noop,
    createKeyboardController: noop,
    createFixedSixStringRows: noop,
    positionToMidi: noop,
    validatePositionForEvent: noop,
    serializeGuitarTabMusicXml: noop,
  })
}

function fakeDocument({ scope = {}, existingScript = null, onAppend = null } = {}) {
  const appended = []
  const created = []
  const makeScript = () => {
    const listeners = new Map()
    const script = {
      src: '',
      async: false,
      dataset: {},
      addEventListener(type, listener) {
        listeners.set(type, listener)
      },
      dispatch(type) {
        listeners.get(type)?.()
      },
    }
    created.push(script)
    return script
  }
  const root = {
    defaultView: scope,
    createElement(tag) {
      assert.equal(tag, 'script')
      return makeScript()
    },
    querySelector(selector) {
      assert.equal(
        selector,
        'script[data-seslitab-guitar-tab-editor-runtime="true"]',
      )
      return existingScript
    },
    head: {
      appendChild(script) {
        appended.push(script)
        onAppend?.(script, scope)
        return script
      },
    },
  }
  return { root, scope, appended, created }
}

test('GTAB-09A Guitar TAB Editor runtime pin is exact reviewed revision', () => {
  assert.equal(GUITAR_TAB_EDITOR_REVISION, 'e1fe771f4a1637c46dedf15a881f2bfcf260e9ae')
  const manifest = validManifest()
  assert.equal(verifyGuitarTabEditorRuntimeManifest(manifest), manifest)
})

test('GTAB-09A manifest rejects capability or authority expansion', () => {
  for (const field of [
    'networkCapable',
    'persistenceCapable',
    'rendererAuthority',
    'sourceMutationAuthority',
    'serverRevisionAuthority',
    'approvalAuthority',
    'publicationAuthority',
  ]) {
    const manifest = validManifest()
    manifest[field] = true
    assert.throws(
      () => verifyGuitarTabEditorRuntimeManifest(manifest),
      /forbidden authority\/capability enabled/,
    )
  }
})

test('GTAB-09A manifest rejects contract, provenance and external-import drift', () => {
  const wrongContract = validManifest()
  wrongContract.contract = 'OTHER_CONTRACT'
  assert.throws(
    () => verifyGuitarTabEditorRuntimeManifest(wrongContract),
    /browser contract mismatch/,
  )

  const wrongGlobal = validManifest()
  wrongGlobal.global = 'OtherRuntime'
  assert.throws(
    () => verifyGuitarTabEditorRuntimeManifest(wrongGlobal),
    /export surface mismatch/,
  )

  const wrongBundler = validManifest()
  wrongBundler.bundler.version = '0.0.0'
  assert.throws(
    () => verifyGuitarTabEditorRuntimeManifest(wrongBundler),
    /bundler provenance mismatch/,
  )

  const external = validManifest()
  external.externalImports = 1
  assert.throws(
    () => verifyGuitarTabEditorRuntimeManifest(external),
    /external imports/,
  )
})

test('GTAB-09A artifact bytes and SHA-256 must exactly match manifest', () => {
  const artifact = validArtifact()
  const manifest = validManifest(artifact)
  assert.equal(verifyGuitarTabEditorArtifact(manifest, artifact), true)
  assert.throws(
    () => verifyGuitarTabEditorArtifact(manifest, Buffer.from('tampered')),
    /byte size does not match|digest does not match/,
  )
})

test('GTAB-09A loader accepts only the frozen expected runtime surface', () => {
  const runtime = validRuntime()
  assert.equal(
    resolveGuitarTabEditorRuntime({ [GUITAR_TAB_EDITOR_RUNTIME_GLOBAL]: runtime }),
    runtime,
  )
  assert.equal(resolveGuitarTabEditorRuntime({}), null)

  const wrongVersion = Object.freeze({
    ...runtime,
    runtimeVersion: '9.9.9',
  })
  assert.equal(
    resolveGuitarTabEditorRuntime({
      [GUITAR_TAB_EDITOR_RUNTIME_GLOBAL]: wrongVersion,
    }),
    null,
  )

  const expanded = Object.freeze({
    ...runtime,
    profile: Object.freeze({ ...runtime.profile, networkCapable: true }),
  })
  assert.equal(
    resolveGuitarTabEditorRuntime({ [GUITAR_TAB_EDITOR_RUNTIME_GLOBAL]: expanded }),
    null,
  )

  const incomplete = { ...runtime }
  delete incomplete.serializeGuitarTabMusicXml
  assert.equal(
    resolveGuitarTabEditorRuntime({
      [GUITAR_TAB_EDITOR_RUNTIME_GLOBAL]: Object.freeze(incomplete),
    }),
    null,
  )

  const unfrozen = { ...runtime }
  assert.equal(
    resolveGuitarTabEditorRuntime({ [GUITAR_TAB_EDITOR_RUNTIME_GLOBAL]: unfrozen }),
    null,
  )
})

test('GTAB-09A loader returns an already connected runtime without injecting a script', async () => {
  const runtime = validRuntime()
  const scope = { [GUITAR_TAB_EDITOR_RUNTIME_GLOBAL]: runtime }
  const { root, appended } = fakeDocument({ scope })

  assert.equal(await loadGuitarTabEditorRuntime(root), runtime)
  assert.equal(appended.length, 0)
})

test('GTAB-09A loader fails closed when a document cannot host the runtime script', async () => {
  assert.equal(await loadGuitarTabEditorRuntime(null, 0), null)
  assert.equal(await loadGuitarTabEditorRuntime({ createElement() {} }, 0), null)
})

test('GTAB-09A loader injects the pinned runtime script and resolves only after validation', async () => {
  const runtime = validRuntime()
  const { root, appended } = fakeDocument({
    onAppend(script, scope) {
      assert.equal(script.src, GUITAR_TAB_EDITOR_RUNTIME_URL)
      assert.equal(script.async, true)
      assert.equal(script.dataset.seslitabGuitarTabEditorRuntime, 'true')
      scope[GUITAR_TAB_EDITOR_RUNTIME_GLOBAL] = runtime
      queueMicrotask(() => script.dispatch('load'))
    },
  })

  assert.equal(await loadGuitarTabEditorRuntime(root, 100), runtime)
  assert.equal(appended.length, 1)
})

test('GTAB-09A loader shares one pending script load for concurrent callers', async () => {
  const runtime = validRuntime()
  let injectedScript
  const { root, appended, scope } = fakeDocument({
    onAppend(script) {
      injectedScript = script
    },
  })

  const first = loadGuitarTabEditorRuntime(root, 100)
  const second = loadGuitarTabEditorRuntime(root, 100)
  assert.equal(appended.length, 1)
  scope[GUITAR_TAB_EDITOR_RUNTIME_GLOBAL] = runtime
  injectedScript.dispatch('load')

  const [left, right] = await Promise.all([first, second])
  assert.equal(left, runtime)
  assert.equal(right, runtime)
})

test('GTAB-09A loader clears a failed load so the same document can retry', async () => {
  let attempt = 0
  const runtime = validRuntime()
  const { root, appended, scope } = fakeDocument({
    onAppend(script) {
      attempt += 1
      if (attempt === 1) queueMicrotask(() => script.dispatch('error'))
      else {
        scope[GUITAR_TAB_EDITOR_RUNTIME_GLOBAL] = runtime
        queueMicrotask(() => script.dispatch('load'))
      }
    },
  })

  assert.equal(await loadGuitarTabEditorRuntime(root, 100), null)
  assert.equal(await loadGuitarTabEditorRuntime(root, 100), runtime)
  assert.equal(appended.length, 2)
})

test('GTAB-09A loader times out fail-closed when the runtime never becomes valid', async () => {
  const { root } = fakeDocument()
  assert.equal(await loadGuitarTabEditorRuntime(root, 0), null)
})
