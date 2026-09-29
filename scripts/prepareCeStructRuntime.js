import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const CE_STRUCT_REPOSITORY = 'https://github.com/khfy7wpr5p-maker/st-omr-correction-engine.git'
export const CE_STRUCT_REVISION = '7550e77b3ddff55e63e714b2dbc2b450b69771dc'
export const CE_STRUCT_BROWSER_CONTRACT = 'ST_OMR_CORRECTION_ENGINE_CE_STRUCT_BROWSER'
export const CE_STRUCT_BROWSER_CONTRACT_VERSION = '1.0.0'
export const CE_STRUCT_RUNTIME_VERSION = '1.0.0'
export const CE_STRUCT_RUNTIME_GLOBAL = 'STOmrCorrectionCeStructRuntime'
export const CE_STRUCT_ARTIFACT_SHA256 = 'b58df06f9f25ce61ed0ab6939238951cfdf9288912dddf9139b15bf6a9bb72e6'

const artifactName = 'ce-struct-browser-runtime.js'
const manifestName = 'ce-struct-browser-runtime.manifest.json'
const provenanceName = 'seslitab-runtime-provenance.json'
const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const buildRoot = path.join(repoRoot, '.ce-struct-runtime-build')
const engineRoot = path.join(buildRoot, 'engine')
const generatedRuntimeRoot = path.join(engineRoot, 'dist', 'browser')
const publicRuntimeRoot = path.join(repoRoot, 'public', 'st-omr-correction-engine-runtime')

const FORBIDDEN_FLAGS = Object.freeze([
  'networkCapable',
  'persistenceCapable',
  'authenticationAuthority',
  'automaticApplyAuthority',
  'finalTeacherApprovalAuthority',
  'studentShareAuthority',
  'learningAuthority',
  'musicXmlWriteBackAuthority',
])

function sha256(content) {
  return createHash('sha256').update(content).digest('hex')
}

export function verifyCeStructRuntimeManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new TypeError('CE-STRUCT browser runtime manifest is invalid.')
  }
  if (manifest.contract !== CE_STRUCT_BROWSER_CONTRACT) {
    throw new Error('CE-STRUCT browser contract mismatch.')
  }
  if (
    manifest.contractVersion !== CE_STRUCT_BROWSER_CONTRACT_VERSION
    || manifest.runtimeVersion !== CE_STRUCT_RUNTIME_VERSION
  ) {
    throw new Error('CE-STRUCT browser runtime version mismatch.')
  }
  if (manifest.engineSourceRevision !== CE_STRUCT_REVISION) {
    throw new Error('CE-STRUCT browser engine revision mismatch.')
  }
  if (
    manifest.artifact !== artifactName
    || manifest.format !== 'iife'
    || manifest.target !== 'es2022'
    || manifest.global !== CE_STRUCT_RUNTIME_GLOBAL
  ) {
    throw new Error('CE-STRUCT browser runtime export surface mismatch.')
  }
  if (manifest.externalImports !== 0) {
    throw new Error('CE-STRUCT browser runtime contains external imports.')
  }
  for (const field of FORBIDDEN_FLAGS) {
    if (manifest[field] !== false) {
      throw new Error(`CE-STRUCT browser forbidden authority/capability enabled: ${field}.`)
    }
  }
  if (!Number.isInteger(manifest.bytes) || manifest.bytes <= 0) {
    throw new Error('CE-STRUCT browser runtime byte size is invalid.')
  }
  if (typeof manifest.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(manifest.sha256)) {
    throw new Error('CE-STRUCT browser runtime digest is invalid.')
  }
  return manifest
}

export function verifyCeStructRuntimeArtifact(manifest, artifact) {
  const verified = verifyCeStructRuntimeManifest(manifest)
  const bytes = Buffer.isBuffer(artifact) ? artifact : Buffer.from(artifact ?? '')
  if (bytes.byteLength !== verified.bytes) {
    throw new Error('CE-STRUCT browser runtime byte size does not match manifest.')
  }
  if (sha256(bytes) !== verified.sha256) {
    throw new Error('CE-STRUCT browser runtime digest does not match manifest.')
  }
  return true
}

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: 'inherit' })
}

export async function prepareCeStructRuntime() {
  await rm(buildRoot, { recursive: true, force: true })
  await rm(publicRuntimeRoot, { recursive: true, force: true })
  await mkdir(buildRoot, { recursive: true })

  try {
    run('git', ['init', engineRoot], repoRoot)
    run('git', ['remote', 'add', 'origin', CE_STRUCT_REPOSITORY], engineRoot)
    run('git', ['fetch', '--depth=1', 'origin', CE_STRUCT_REVISION], engineRoot)
    run('git', ['checkout', '--detach', 'FETCH_HEAD'], engineRoot)
    run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false'], engineRoot)
    run('npm', ['run', 'build:ce-struct-browser'], engineRoot)

    const manifestBytes = await readFile(path.join(generatedRuntimeRoot, manifestName))
    const manifest = verifyCeStructRuntimeManifest(JSON.parse(manifestBytes.toString('utf8')))
    const artifact = await readFile(path.join(generatedRuntimeRoot, artifactName))
    verifyCeStructRuntimeArtifact(manifest, artifact)
    if (manifest.sha256 !== CE_STRUCT_ARTIFACT_SHA256) {
      throw new Error('CE-STRUCT reviewed artifact digest mismatch.')
    }

    await mkdir(path.dirname(publicRuntimeRoot), { recursive: true })
    await cp(generatedRuntimeRoot, publicRuntimeRoot, { recursive: true, force: true })

    const provenance = Object.freeze({
      schemaVersion: 1,
      engineSourceRevision: CE_STRUCT_REVISION,
      upstreamManifest: manifestName,
      upstreamManifestSha256: sha256(manifestBytes),
      runtimeVersion: manifest.runtimeVersion,
      global: manifest.global,
      files: Object.freeze([
        Object.freeze({ path: artifactName, bytes: artifact.byteLength, sha256: sha256(artifact) }),
        Object.freeze({ path: manifestName, bytes: manifestBytes.byteLength, sha256: sha256(manifestBytes) }),
      ]),
    })
    await writeFile(
      path.join(publicRuntimeRoot, provenanceName),
      `${JSON.stringify(provenance, null, 2)}\n`,
      'utf8',
    )

    return Object.freeze({
      destination: publicRuntimeRoot,
      revision: CE_STRUCT_REVISION,
      runtimeVersion: manifest.runtimeVersion,
      artifactSha256: manifest.sha256,
    })
  } finally {
    await rm(buildRoot, { recursive: true, force: true })
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await prepareCeStructRuntime()
  console.log(`CE-STRUCT runtime prepared: ${path.relative(repoRoot, result.destination)}`)
  console.log(`Engine revision: ${result.revision}`)
  console.log(`Runtime: ${result.runtimeVersion}`)
  console.log(`Artifact SHA-256: ${result.artifactSha256}`)
}
