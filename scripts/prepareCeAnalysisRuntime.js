import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  preparePinnedRuntime,
  verifyPinnedRuntimeArtifact,
  verifyPinnedRuntimeManifest,
} from './preparePinnedRuntime.js'

export const CE_ANALYSIS_REPOSITORY = 'https://github.com/khfy7wpr5p-maker/st-omr-correction-engine.git'
export const CE_ANALYSIS_REVISION = 'bdaeb1e6fec8aee27d1cc72347f5be735af3cf30'
export const CE_ANALYSIS_BROWSER_CONTRACT = 'ST_OMR_CORRECTION_ENGINE_ANALYSIS_BROWSER'
export const CE_ANALYSIS_BROWSER_CONTRACT_VERSION = '1.0.0'
export const CE_ANALYSIS_RUNTIME_VERSION = '1.0.0'
export const CE_ANALYSIS_RUNTIME_GLOBAL = 'STOmrCorrectionAnalysisRuntime'
export const CE_ANALYSIS_ARTIFACT_SHA256 = '2fb9762d05d6164f9a595736adc58fed08a7b40733b969cd54bd7db41bbb41aa'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const buildRoot = path.join(repoRoot, '.ce-analysis-runtime-build')
const checkoutRoot = path.join(buildRoot, 'engine')
const spec = Object.freeze({
  label: 'CE analysis browser',
  repository: CE_ANALYSIS_REPOSITORY,
  revision: CE_ANALYSIS_REVISION,
  repoRoot,
  buildRoot,
  checkoutRoot,
  generatedRuntimeRoot: path.join(checkoutRoot, 'dist', 'browser-analysis'),
  publicRuntimeRoot: path.join(repoRoot, 'public', 'st-omr-correction-analysis-runtime'),
  buildScript: 'build:ce-analysis-browser',
  artifactName: 'ce-analysis-browser-runtime.js',
  manifestName: 'ce-analysis-browser-runtime.manifest.json',
  provenanceName: 'seslitab-analysis-runtime-provenance.json',
  contract: CE_ANALYSIS_BROWSER_CONTRACT,
  contractVersion: CE_ANALYSIS_BROWSER_CONTRACT_VERSION,
  runtimeVersion: CE_ANALYSIS_RUNTIME_VERSION,
  global: CE_ANALYSIS_RUNTIME_GLOBAL,
  sourceRevisionField: 'engineSourceRevision',
  provenanceRevisionField: 'engineSourceRevision',
  reviewedArtifactSha256: CE_ANALYSIS_ARTIFACT_SHA256,
  forbiddenFlags: Object.freeze([
    'networkCapable',
    'persistenceCapable',
    'authenticationAuthority',
    'automaticApplyAuthority',
    'learningAuthority',
    'musicXmlWriteBackAuthority',
  ]),
})

export function verifyCeAnalysisRuntimeManifest(manifest) {
  return verifyPinnedRuntimeManifest(manifest, spec)
}

export function verifyCeAnalysisRuntimeArtifact(manifest, artifact) {
  return verifyPinnedRuntimeArtifact(manifest, artifact, spec)
}

export async function prepareCeAnalysisRuntime(options) {
  return preparePinnedRuntime(spec, options)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await prepareCeAnalysisRuntime()
  console.log(`CE analysis runtime prepared: ${path.relative(repoRoot, result.destination)}`)
  console.log(`Engine revision: ${result.revision}`)
  console.log(`Runtime: ${result.runtimeVersion}`)
  console.log(`Artifact SHA-256: ${result.artifactSha256}`)
}
