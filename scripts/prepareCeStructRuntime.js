import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  preparePinnedRuntime,
  verifyPinnedRuntimeArtifact,
  verifyPinnedRuntimeManifest,
} from './preparePinnedRuntime.js'

export const CE_STRUCT_REPOSITORY = 'https://github.com/khfy7wpr5p-maker/st-omr-correction-engine.git'
export const CE_STRUCT_REVISION = '7550e77b3ddff55e63e714b2dbc2b450b69771dc'
export const CE_STRUCT_BROWSER_CONTRACT = 'ST_OMR_CORRECTION_ENGINE_CE_STRUCT_BROWSER'
export const CE_STRUCT_BROWSER_CONTRACT_VERSION = '1.0.0'
export const CE_STRUCT_RUNTIME_VERSION = '1.0.0'
export const CE_STRUCT_RUNTIME_GLOBAL = 'STOmrCorrectionCeStructRuntime'
export const CE_STRUCT_ARTIFACT_SHA256 = 'b58df06f9f25ce61ed0ab6939238951cfdf9288912dddf9139b15bf6a9bb72e6'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const buildRoot = path.join(repoRoot, '.ce-struct-runtime-build')
const checkoutRoot = path.join(buildRoot, 'engine')
const spec = Object.freeze({
  label: 'CE-STRUCT browser',
  repository: CE_STRUCT_REPOSITORY,
  revision: CE_STRUCT_REVISION,
  repoRoot,
  buildRoot,
  checkoutRoot,
  generatedRuntimeRoot: path.join(checkoutRoot, 'dist', 'browser'),
  publicRuntimeRoot: path.join(repoRoot, 'public', 'st-omr-correction-engine-runtime'),
  buildScript: 'build:ce-struct-browser',
  artifactName: 'ce-struct-browser-runtime.js',
  manifestName: 'ce-struct-browser-runtime.manifest.json',
  provenanceName: 'seslitab-runtime-provenance.json',
  contract: CE_STRUCT_BROWSER_CONTRACT,
  contractVersion: CE_STRUCT_BROWSER_CONTRACT_VERSION,
  runtimeVersion: CE_STRUCT_RUNTIME_VERSION,
  global: CE_STRUCT_RUNTIME_GLOBAL,
  sourceRevisionField: 'engineSourceRevision',
  provenanceRevisionField: 'engineSourceRevision',
  reviewedArtifactSha256: CE_STRUCT_ARTIFACT_SHA256,
  forbiddenFlags: Object.freeze([
    'networkCapable',
    'persistenceCapable',
    'authenticationAuthority',
    'automaticApplyAuthority',
    'finalTeacherApprovalAuthority',
    'studentShareAuthority',
    'learningAuthority',
    'musicXmlWriteBackAuthority',
  ]),
})

export function verifyCeStructRuntimeManifest(manifest) {
  return verifyPinnedRuntimeManifest(manifest, spec)
}

export function verifyCeStructRuntimeArtifact(manifest, artifact) {
  return verifyPinnedRuntimeArtifact(manifest, artifact, spec)
}

export async function prepareCeStructRuntime(options) {
  return preparePinnedRuntime(spec, options)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await prepareCeStructRuntime()
  console.log(`CE-STRUCT runtime prepared: ${path.relative(repoRoot, result.destination)}`)
  console.log(`Engine revision: ${result.revision}`)
  console.log(`Runtime: ${result.runtimeVersion}`)
  console.log(`Artifact SHA-256: ${result.artifactSha256}`)
}
