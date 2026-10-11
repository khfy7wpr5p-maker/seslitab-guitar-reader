import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const GUITAR_TAB_EDITOR_REPOSITORY = 'https://github.com/khfy7wpr5p-maker/st-guitar-tab-editor.git'
export const GUITAR_TAB_EDITOR_REVISION = '4eb479bc84b12c6deefb289d03c933ce9980bc9f'
export const GUITAR_TAB_EDITOR_BROWSER_CONTRACT = 'ST_GUITAR_TAB_EDITOR_BROWSER_BUNDLE'
export const GUITAR_TAB_EDITOR_BROWSER_VERSION = '1.0.0'
export const GUITAR_TAB_EDITOR_RUNTIME_VERSION = '1.0.0'
export const GUITAR_TAB_EDITOR_RUNTIME_GLOBAL = 'STGuitarTabEditorRuntime'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const buildRoot = path.join(repoRoot, '.guitar-tab-editor-runtime-build')
const editorRoot = path.join(buildRoot, 'editor')
const generatedRuntimeRoot = path.join(editorRoot, 'dist', 'browser')
const publicRuntimeRoot = path.join(repoRoot, 'public', 'st-guitar-tab-editor-runtime')
const upstreamManifestName = 'st-guitar-tab-editor.runtime.manifest.json'
const artifactName = 'st-guitar-tab-editor.runtime.js'
const provenanceName = 'seslitab-runtime-provenance.json'

function sha256(content) {
  return createHash('sha256').update(content).digest('hex')
}

export function verifyGuitarTabEditorRuntimeManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new TypeError('ST Guitar TAB Editor runtime manifest is invalid.')
  }
  if (manifest.contract !== GUITAR_TAB_EDITOR_BROWSER_CONTRACT) {
    throw new Error('ST Guitar TAB Editor browser contract mismatch.')
  }
  if (
    manifest.version !== GUITAR_TAB_EDITOR_BROWSER_VERSION
    || manifest.runtimeVersion !== GUITAR_TAB_EDITOR_RUNTIME_VERSION
  ) {
    throw new Error('ST Guitar TAB Editor runtime version mismatch.')
  }
  if (
    manifest.global !== GUITAR_TAB_EDITOR_RUNTIME_GLOBAL
    || manifest.artifact !== artifactName
    || manifest.format !== 'iife'
    || manifest.target !== 'es2022'
  ) {
    throw new Error('ST Guitar TAB Editor runtime export surface mismatch.')
  }
  if (
    manifest.bundler?.package !== 'esbuild'
    || manifest.bundler?.version !== '0.28.2'
    || manifest.bundler?.license !== 'MIT'
  ) {
    throw new Error('ST Guitar TAB Editor runtime bundler provenance mismatch.')
  }
  if (manifest.externalImports !== 0) {
    throw new Error('ST Guitar TAB Editor runtime contains external imports.')
  }
  for (const field of [
    'networkCapable',
    'persistenceCapable',
    'rendererAuthority',
    'sourceMutationAuthority',
    'serverRevisionAuthority',
    'approvalAuthority',
    'publicationAuthority',
  ]) {
    if (manifest[field] !== false) {
      throw new Error(`ST Guitar TAB Editor forbidden authority/capability enabled: ${field}.`)
    }
  }
  if (!Number.isInteger(manifest.bytes) || manifest.bytes <= 0) {
    throw new Error('ST Guitar TAB Editor runtime byte size is invalid.')
  }
  if (typeof manifest.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(manifest.sha256)) {
    throw new Error('ST Guitar TAB Editor runtime digest is invalid.')
  }
  return manifest
}

export function verifyGuitarTabEditorArtifact(manifest, artifact) {
  const verified = verifyGuitarTabEditorRuntimeManifest(manifest)
  const bytes = Buffer.isBuffer(artifact) ? artifact : Buffer.from(artifact ?? '')
  if (bytes.byteLength !== verified.bytes) {
    throw new Error('ST Guitar TAB Editor runtime byte size does not match manifest.')
  }
  if (sha256(bytes) !== verified.sha256) {
    throw new Error('ST Guitar TAB Editor runtime digest does not match manifest.')
  }
  return true
}

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: 'inherit' })
}

export async function prepareGuitarTabEditorRuntime() {
  await rm(buildRoot, { recursive: true, force: true })
  await rm(publicRuntimeRoot, { recursive: true, force: true })
  await mkdir(buildRoot, { recursive: true })

  try {
    run('git', ['init', editorRoot], repoRoot)
    run('git', ['remote', 'add', 'origin', GUITAR_TAB_EDITOR_REPOSITORY], editorRoot)
    run('git', ['fetch', '--depth=1', 'origin', GUITAR_TAB_EDITOR_REVISION], editorRoot)
    run('git', ['checkout', '--detach', 'FETCH_HEAD'], editorRoot)
    run(
      'npm',
      ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false'],
      editorRoot,
    )
    run('npm', ['run', 'build:browser'], editorRoot)

    const upstreamManifestBytes = await readFile(path.join(generatedRuntimeRoot, upstreamManifestName))
    const manifest = verifyGuitarTabEditorRuntimeManifest(
      JSON.parse(upstreamManifestBytes.toString('utf8')),
    )
    const artifact = await readFile(path.join(generatedRuntimeRoot, artifactName))
    verifyGuitarTabEditorArtifact(manifest, artifact)

    await mkdir(path.dirname(publicRuntimeRoot), { recursive: true })
    await cp(generatedRuntimeRoot, publicRuntimeRoot, { recursive: true, force: true })

    const provenance = Object.freeze({
      schemaVersion: 1,
      editorSourceRevision: GUITAR_TAB_EDITOR_REVISION,
      upstreamManifest: upstreamManifestName,
      upstreamManifestSha256: sha256(upstreamManifestBytes),
      runtimeVersion: manifest.runtimeVersion,
      global: manifest.global,
      files: Object.freeze([
        Object.freeze({ path: artifactName, bytes: artifact.byteLength, sha256: sha256(artifact) }),
        Object.freeze({
          path: upstreamManifestName,
          bytes: upstreamManifestBytes.byteLength,
          sha256: sha256(upstreamManifestBytes),
        }),
      ]),
    })
    await writeFile(
      path.join(publicRuntimeRoot, provenanceName),
      `${JSON.stringify(provenance, null, 2)}\n`,
      'utf8',
    )

    return Object.freeze({
      destination: publicRuntimeRoot,
      revision: GUITAR_TAB_EDITOR_REVISION,
      runtimeVersion: manifest.runtimeVersion,
      artifactSha256: manifest.sha256,
    })
  } finally {
    await rm(buildRoot, { recursive: true, force: true })
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await prepareGuitarTabEditorRuntime()
  console.log(`ST Guitar TAB Editor runtime prepared: ${path.relative(repoRoot, result.destination)}`)
  console.log(`Editor revision: ${result.revision}`)
  console.log(`Runtime: ${result.runtimeVersion}`)
  console.log(`Artifact SHA-256: ${result.artifactSha256}`)
}
