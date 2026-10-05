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

test('GTAB-09A Guitar TAB Editor runtime pin is exact reviewed revision', () => {
  assert.equal(GUITAR_TAB_EDITOR_REVISION, 'a07f00e0000d2eb0a60ffeed2e9d8ad440faf8a5')
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
})
