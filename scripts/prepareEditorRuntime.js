import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SCORE_EDITOR_REPOSITORY = 'https://github.com/khfy7wpr5p-maker/st-score-editor-core.git'
export const SCORE_EDITOR_REVISION = '2e6b975b4b6b8b558593ca43132309848dc3ccab'
export const SCORE_EDITOR_BROWSER_CONTRACT = 'ST_SCORE_EDITOR_CORE_BROWSER_BUNDLE'
export const SCORE_EDITOR_BROWSER_VERSION = '1.0.0'
export const SCORE_EDITOR_RUNTIME_VERSION = '1.0.0'
export const SCORE_EDITOR_RUNTIME_GLOBAL = 'STScoreEditorCoreRuntime'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const buildRoot = path.join(repoRoot, '.score-editor-runtime-build')
const editorRoot = path.join(buildRoot, 'editor')
const generatedRuntimeRoot = path.join(editorRoot, 'dist', 'browser')
const publicRuntimeRoot = path.join(repoRoot, 'public', 'st-score-editor-core-runtime')
const upstreamManifestName = 'st-score-editor-core.runtime.manifest.json'
const artifactName = 'st-score-editor-core.runtime.js'
const provenanceName = 'seslitab-runtime-provenance.json'

function sha256(content) {
  return createHash('sha256').update(content).digest('hex')
}

export function verifyEditorRuntimeManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new TypeError('ST Score Editor Core runtime manifest is invalid.')
  }
  if (manifest.contract !== SCORE_EDITOR_BROWSER_CONTRACT) {
    throw new Error('ST Score Editor Core browser contract mismatch.')
  }
  if (manifest.version !== SCORE_EDITOR_BROWSER_VERSION || manifest.runtimeVersion !== SCORE_EDITOR_RUNTIME_VERSION) {
    throw new Error('ST Score Editor Core runtime version mismatch.')
  }
  if (manifest.global !== SCORE_EDITOR_RUNTIME_GLOBAL || manifest.artifact !== artifactName) {
    throw new Error('ST Score Editor Core runtime export surface mismatch.')
  }
  if (manifest.externalImports !== 0) {
    throw new Error('ST Score Editor Core runtime contains external imports.')
  }
  for (const field of ['networkCapable', 'persistenceCapable', 'serverRevisionAuthority', 'approvalAuthority', 'publicationAuthority']) {
    if (manifest[field] !== false) {
      throw new Error(`ST Score Editor Core forbidden authority/capability enabled: ${field}.`)
    }
  }
  if (!Number.isInteger(manifest.bytes) || manifest.bytes <= 0) {
    throw new Error('ST Score Editor Core runtime byte size is invalid.')
  }
  if (typeof manifest.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(manifest.sha256)) {
    throw new Error('ST Score Editor Core runtime digest is invalid.')
  }
  return manifest
}

export function verifyEditorArtifact(manifest, artifact) {
  const verified = verifyEditorRuntimeManifest(manifest)
  const bytes = Buffer.isBuffer(artifact) ? artifact : Buffer.from(artifact ?? '')
  if (bytes.byteLength !== verified.bytes) {
    throw new Error('ST Score Editor Core runtime byte size does not match manifest.')
  }
  if (sha256(bytes) !== verified.sha256) {
    throw new Error('ST Score Editor Core runtime digest does not match manifest.')
  }
  return true
}

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: 'inherit' })
}

export async function prepareEditorRuntime() {
  await rm(buildRoot, { recursive: true, force: true })
  await rm(publicRuntimeRoot, { recursive: true, force: true })
  await mkdir(buildRoot, { recursive: true })

  try {
    run('git', ['init', editorRoot], repoRoot)
    run('git', ['remote', 'add', 'origin', SCORE_EDITOR_REPOSITORY], editorRoot)
    run('git', ['fetch', '--depth=1', 'origin', SCORE_EDITOR_REVISION], editorRoot)
    run('git', ['checkout', '--detach', 'FETCH_HEAD'], editorRoot)
    // The reviewed Editor Core revision intentionally has no package-lock.json.
    // package.json pins runtime/build dependencies exactly; lifecycle scripts stay disabled.
    run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false'], editorRoot)
    run('npm', ['run', 'build:browser'], editorRoot)

    const upstreamManifestBytes = await readFile(path.join(generatedRuntimeRoot, upstreamManifestName))
    const manifest = verifyEditorRuntimeManifest(JSON.parse(upstreamManifestBytes.toString('utf8')))
    const artifact = await readFile(path.join(generatedRuntimeRoot, artifactName))
    verifyEditorArtifact(manifest, artifact)

    await mkdir(path.dirname(publicRuntimeRoot), { recursive: true })
    await cp(generatedRuntimeRoot, publicRuntimeRoot, { recursive: true, force: true })

    const provenance = Object.freeze({
      schemaVersion: 1,
      editorSourceRevision: SCORE_EDITOR_REVISION,
      upstreamManifest: upstreamManifestName,
      upstreamManifestSha256: sha256(upstreamManifestBytes),
      runtimeVersion: manifest.runtimeVersion,
      global: manifest.global,
      files: Object.freeze([
        Object.freeze({ path: artifactName, bytes: artifact.byteLength, sha256: sha256(artifact) }),
        Object.freeze({ path: upstreamManifestName, bytes: upstreamManifestBytes.byteLength, sha256: sha256(upstreamManifestBytes) }),
      ]),
    })
    await writeFile(path.join(publicRuntimeRoot, provenanceName), `${JSON.stringify(provenance, null, 2)}\n`, 'utf8')

    return Object.freeze({
      destination: publicRuntimeRoot,
      revision: SCORE_EDITOR_REVISION,
      runtimeVersion: manifest.runtimeVersion,
      artifactSha256: manifest.sha256,
    })
  } finally {
    await rm(buildRoot, { recursive: true, force: true })
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await prepareEditorRuntime()
  console.log(`ST Score Editor Core runtime prepared: ${path.relative(repoRoot, result.destination)}`)
  console.log(`Editor revision: ${result.revision}`)
  console.log(`Runtime: ${result.runtimeVersion}`)
  console.log(`Artifact SHA-256: ${result.artifactSha256}`)
}
