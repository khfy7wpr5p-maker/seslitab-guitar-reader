import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const moduleUrl = new URL('../scripts/prepareCeStructRuntime.js', import.meta.url)

test('CE-STRUCT runtime preparer exists before binding assertions run', () => {
  assert.equal(existsSync(fileURLToPath(moduleUrl)), true)
})

test('CE-STRUCT runtime pin and manifest verifier preserve the reviewed boundary', async () => {
  const runtime = await import(moduleUrl)
  assert.equal(runtime.CE_STRUCT_REVISION, '7550e77b3ddff55e63e714b2dbc2b450b69771dc')
  assert.equal(runtime.CE_STRUCT_BROWSER_CONTRACT, 'ST_OMR_CORRECTION_ENGINE_CE_STRUCT_BROWSER')
  assert.equal(runtime.CE_STRUCT_BROWSER_CONTRACT_VERSION, '1.0.0')
  assert.equal(runtime.CE_STRUCT_RUNTIME_VERSION, '1.0.0')
  assert.equal(runtime.CE_STRUCT_RUNTIME_GLOBAL, 'STOmrCorrectionCeStructRuntime')
  assert.equal(runtime.CE_STRUCT_ARTIFACT_SHA256, 'b58df06f9f25ce61ed0ab6939238951cfdf9288912dddf9139b15bf6a9bb72e6')

  const artifact = Buffer.from('globalThis.STOmrCorrectionCeStructRuntime={};')
  const manifest = {
    contract: runtime.CE_STRUCT_BROWSER_CONTRACT,
    contractVersion: runtime.CE_STRUCT_BROWSER_CONTRACT_VERSION,
    runtimeVersion: runtime.CE_STRUCT_RUNTIME_VERSION,
    engineSourceRevision: runtime.CE_STRUCT_REVISION,
    bundler: { package: 'esbuild', version: '0.28.2', license: 'MIT' },
    hashProvider: { package: '@noble/hashes', version: '2.4.0', license: 'MIT' },
    artifact: 'ce-struct-browser-runtime.js',
    format: 'iife',
    target: 'es2022',
    global: runtime.CE_STRUCT_RUNTIME_GLOBAL,
    externalImports: 0,
    networkCapable: false,
    persistenceCapable: false,
    authenticationAuthority: false,
    automaticApplyAuthority: false,
    finalTeacherApprovalAuthority: false,
    studentShareAuthority: false,
    learningAuthority: false,
    musicXmlWriteBackAuthority: false,
    bytes: artifact.byteLength,
    sha256: createHash('sha256').update(artifact).digest('hex'),
  }

  assert.equal(runtime.verifyCeStructRuntimeManifest(manifest), manifest)
  assert.equal(runtime.verifyCeStructRuntimeArtifact(manifest, artifact), true)

  for (const field of [
    'networkCapable',
    'persistenceCapable',
    'authenticationAuthority',
    'automaticApplyAuthority',
    'finalTeacherApprovalAuthority',
    'studentShareAuthority',
    'learningAuthority',
    'musicXmlWriteBackAuthority',
  ]) {
    const expanded = structuredClone(manifest)
    expanded[field] = true
    assert.throws(
      () => runtime.verifyCeStructRuntimeManifest(expanded),
      /forbidden authority\/capability enabled/,
    )
  }

  const driftedRevision = structuredClone(manifest)
  driftedRevision.engineSourceRevision = '0'.repeat(40)
  assert.throws(() => runtime.verifyCeStructRuntimeManifest(driftedRevision), /revision mismatch/)

  const external = structuredClone(manifest)
  external.externalImports = 1
  assert.throws(() => runtime.verifyCeStructRuntimeManifest(external), /external imports/)

  assert.throws(
    () => runtime.verifyCeStructRuntimeArtifact(manifest, Buffer.from('tampered')),
    /byte size does not match|digest does not match/,
  )

  assert.throws(() => runtime.verifyCeStructRuntimeManifest(null), /manifest is invalid/i)
  assert.throws(() => runtime.verifyCeStructRuntimeManifest([]), /manifest is invalid/i)

  const wrongContract = structuredClone(manifest)
  wrongContract.contract = 'OTHER'
  assert.throws(() => runtime.verifyCeStructRuntimeManifest(wrongContract), /contract mismatch/i)

  const wrongVersion = structuredClone(manifest)
  wrongVersion.runtimeVersion = '9.9.9'
  assert.throws(() => runtime.verifyCeStructRuntimeManifest(wrongVersion), /version mismatch/i)

  const wrongSurface = structuredClone(manifest)
  wrongSurface.artifact = 'other-runtime.js'
  assert.throws(() => runtime.verifyCeStructRuntimeManifest(wrongSurface), /export surface mismatch/i)

  const invalidBytes = structuredClone(manifest)
  invalidBytes.bytes = 0
  assert.throws(() => runtime.verifyCeStructRuntimeManifest(invalidBytes), /byte size is invalid/i)

  const invalidDigest = structuredClone(manifest)
  invalidDigest.sha256 = 'not-a-digest'
  assert.throws(() => runtime.verifyCeStructRuntimeManifest(invalidDigest), /digest is invalid/i)

  const sameLengthTampered = Buffer.from(artifact)
  sameLengthTampered[0] = sameLengthTampered[0] === 0x67 ? 0x68 : 0x67
  assert.equal(sameLengthTampered.byteLength, artifact.byteLength)
  assert.throws(
    () => runtime.verifyCeStructRuntimeArtifact(manifest, sameLengthTampered),
    /digest does not match/i,
  )
})
