import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'

import {
  SCORE_EDITOR_BROWSER_CONTRACT,
  SCORE_EDITOR_BROWSER_VERSION,
  SCORE_EDITOR_REVISION,
  SCORE_EDITOR_RUNTIME_GLOBAL,
  SCORE_EDITOR_RUNTIME_VERSION,
  verifyEditorArtifact,
  verifyEditorRuntimeManifest,
} from '../scripts/prepareEditorRuntime.js'

function validArtifact() {
  return Buffer.from('globalThis.STScoreEditorCoreRuntime={};')
}

function validManifest(artifact = validArtifact()) {
  return {
    contract: SCORE_EDITOR_BROWSER_CONTRACT,
    version: SCORE_EDITOR_BROWSER_VERSION,
    runtimeVersion: SCORE_EDITOR_RUNTIME_VERSION,
    bundler: { package: 'esbuild', version: '0.28.2', license: 'MIT' },
    artifact: 'st-score-editor-core.runtime.js',
    format: 'iife',
    target: 'es2022',
    global: SCORE_EDITOR_RUNTIME_GLOBAL,
    externalImports: 0,
    networkCapable: false,
    persistenceCapable: false,
    serverRevisionAuthority: false,
    approvalAuthority: false,
    publicationAuthority: false,
    bytes: artifact.byteLength,
    sha256: createHash('sha256').update(artifact).digest('hex'),
  }
}

test('Editor Core runtime pin is exact reviewed notation-rehydration revision', () => {
  assert.equal(SCORE_EDITOR_REVISION, '2e6b975b4b6b8b558593ca43132309848dc3ccab')
  const manifest = validManifest()
  assert.equal(verifyEditorRuntimeManifest(manifest), manifest)
})

test('Editor Core runtime rejects authority or capability expansion', () => {
  for (const field of ['networkCapable', 'persistenceCapable', 'serverRevisionAuthority', 'approvalAuthority', 'publicationAuthority']) {
    const manifest = validManifest()
    manifest[field] = true
    assert.throws(() => verifyEditorRuntimeManifest(manifest), /forbidden authority\/capability enabled/)
  }
})

test('Editor Core runtime rejects contract, global and external-import drift', () => {
  const wrongContract = validManifest()
  wrongContract.contract = 'OTHER_CONTRACT'
  assert.throws(() => verifyEditorRuntimeManifest(wrongContract), /browser contract mismatch/)

  const wrongGlobal = validManifest()
  wrongGlobal.global = 'OtherRuntime'
  assert.throws(() => verifyEditorRuntimeManifest(wrongGlobal), /export surface mismatch/)

  const external = validManifest()
  external.externalImports = 1
  assert.throws(() => verifyEditorRuntimeManifest(external), /external imports/)
})

test('Editor Core artifact bytes and SHA-256 must exactly match upstream manifest', () => {
  const artifact = validArtifact()
  const manifest = validManifest(artifact)
  assert.equal(verifyEditorArtifact(manifest, artifact), true)
  assert.throws(() => verifyEditorArtifact(manifest, Buffer.from('tampered')), /byte size does not match|digest does not match/)
})
