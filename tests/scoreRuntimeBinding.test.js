import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SCORE_RENDERER_CONTRACT_VERSION,
  SCORE_RENDERER_OSMD_VERSION,
  SCORE_RENDERER_REVISION,
  verifyRuntimeManifest,
} from '../scripts/prepareScoreRuntime.js'

function validManifest() {
  return {
    rendererSourceRevision: SCORE_RENDERER_REVISION,
    scoreRendererContractVersion: SCORE_RENDERER_CONTRACT_VERSION,
    vendor: {
      opensheetmusicdisplay: {
        version: SCORE_RENDERER_OSMD_VERSION,
      },
    },
    files: [
      {
        path: 'index.html',
        bytes: 100,
        sha256: 'a'.repeat(64),
      },
    ],
  }
}

test('score runtime manifest accepts exact reviewed provenance', () => {
  const manifest = validManifest()
  assert.equal(verifyRuntimeManifest(manifest), manifest)
})

test('score runtime manifest rejects renderer revision drift', () => {
  const manifest = validManifest()
  manifest.rendererSourceRevision = '0'.repeat(40)
  assert.throws(() => verifyRuntimeManifest(manifest), /revision mismatch/)
})

test('score runtime manifest rejects contract drift', () => {
  const manifest = validManifest()
  manifest.scoreRendererContractVersion = '999.0.0'
  assert.throws(() => verifyRuntimeManifest(manifest), /contract version mismatch/)
})

test('score runtime manifest rejects OSMD provenance drift', () => {
  const manifest = validManifest()
  manifest.vendor.opensheetmusicdisplay.version = '999.0.0'
  assert.throws(() => verifyRuntimeManifest(manifest), /OSMD provenance mismatch/)
})

test('score runtime manifest rejects unsafe paths and digests', () => {
  const unsafePath = validManifest()
  unsafePath.files[0].path = '../index.html'
  assert.throws(() => verifyRuntimeManifest(unsafePath), /unsafe file path/)

  const badDigest = validManifest()
  badDigest.files[0].sha256 = 'not-a-digest'
  assert.throws(() => verifyRuntimeManifest(badDigest), /invalid digest/)
})
