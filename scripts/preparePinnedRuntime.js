import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export function sha256(content) {
  return createHash('sha256').update(content).digest('hex')
}

function assertSpec(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    throw new TypeError('Pinned runtime spec is invalid.')
  }
  for (const field of [
    'label',
    'repository',
    'revision',
    'repoRoot',
    'buildRoot',
    'checkoutRoot',
    'generatedRuntimeRoot',
    'publicRuntimeRoot',
    'buildScript',
    'artifactName',
    'manifestName',
    'provenanceName',
    'contract',
    'contractVersion',
    'runtimeVersion',
    'global',
    'sourceRevisionField',
    'provenanceRevisionField',
  ]) {
    if (typeof spec[field] !== 'string' || !spec[field]) {
      throw new TypeError(`Pinned runtime spec field is invalid: ${field}.`)
    }
  }
  if (!Array.isArray(spec.forbiddenFlags)) {
    throw new TypeError('Pinned runtime forbidden flags are invalid.')
  }
  return spec
}

export function verifyPinnedRuntimeManifest(manifest, rawSpec) {
  const spec = assertSpec(rawSpec)
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new TypeError(`${spec.label} runtime manifest is invalid.`)
  }
  if (manifest.contract !== spec.contract) {
    throw new Error(`${spec.label} contract mismatch.`)
  }
  if (manifest.contractVersion !== spec.contractVersion || manifest.runtimeVersion !== spec.runtimeVersion) {
    throw new Error(`${spec.label} runtime version mismatch.`)
  }
  if (manifest[spec.sourceRevisionField] !== spec.revision) {
    throw new Error(`${spec.label} revision mismatch.`)
  }
  if (
    manifest.artifact !== spec.artifactName
    || manifest.format !== 'iife'
    || manifest.target !== 'es2022'
    || manifest.global !== spec.global
  ) {
    throw new Error(`${spec.label} runtime export surface mismatch.`)
  }
  if (manifest.externalImports !== 0) {
    throw new Error(`${spec.label} runtime contains external imports.`)
  }
  for (const field of spec.forbiddenFlags) {
    if (manifest[field] !== false) {
      throw new Error(`${spec.label} forbidden authority/capability enabled: ${field}.`)
    }
  }
  if (!Number.isInteger(manifest.bytes) || manifest.bytes <= 0) {
    throw new Error(`${spec.label} runtime byte size is invalid.`)
  }
  if (typeof manifest.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(manifest.sha256)) {
    throw new Error(`${spec.label} runtime digest is invalid.`)
  }
  return manifest
}

export function verifyPinnedRuntimeArtifact(manifest, artifact, spec) {
  const verified = verifyPinnedRuntimeManifest(manifest, spec)
  const bytes = Buffer.isBuffer(artifact) ? artifact : Buffer.from(artifact ?? '')
  if (bytes.byteLength !== verified.bytes) {
    throw new Error(`${spec.label} runtime byte size does not match manifest.`)
  }
  if (sha256(bytes) !== verified.sha256) {
    throw new Error(`${spec.label} runtime digest does not match manifest.`)
  }
  return true
}

const defaultIo = Object.freeze({
  rm,
  mkdir,
  cp,
  readFile,
  writeFile,
  run(command, args, cwd) {
    execFileSync(command, args, { cwd, stdio: 'inherit' })
  },
})

export async function preparePinnedRuntime(rawSpec, { io = defaultIo } = {}) {
  const spec = assertSpec(rawSpec)
  await io.rm(spec.buildRoot, { recursive: true, force: true })
  await io.rm(spec.publicRuntimeRoot, { recursive: true, force: true })
  await io.mkdir(spec.buildRoot, { recursive: true })

  try {
    io.run('git', ['init', spec.checkoutRoot], spec.repoRoot)
    io.run('git', ['remote', 'add', 'origin', spec.repository], spec.checkoutRoot)
    io.run('git', ['fetch', '--depth=1', 'origin', spec.revision], spec.checkoutRoot)
    io.run('git', ['checkout', '--detach', 'FETCH_HEAD'], spec.checkoutRoot)
    io.run(
      'npm',
      ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false'],
      spec.checkoutRoot,
    )
    io.run('npm', ['run', spec.buildScript], spec.checkoutRoot)

    const manifestPath = path.join(spec.generatedRuntimeRoot, spec.manifestName)
    const artifactPath = path.join(spec.generatedRuntimeRoot, spec.artifactName)
    const manifestBytes = await io.readFile(manifestPath)
    const manifest = verifyPinnedRuntimeManifest(JSON.parse(manifestBytes.toString('utf8')), spec)
    const artifact = await io.readFile(artifactPath)
    verifyPinnedRuntimeArtifact(manifest, artifact, spec)
    if (spec.reviewedArtifactSha256 && manifest.sha256 !== spec.reviewedArtifactSha256) {
      throw new Error(`${spec.label} reviewed artifact digest mismatch.`)
    }

    await io.mkdir(path.dirname(spec.publicRuntimeRoot), { recursive: true })
    await io.cp(spec.generatedRuntimeRoot, spec.publicRuntimeRoot, { recursive: true, force: true })

    const provenance = Object.freeze({
      schemaVersion: 1,
      [spec.provenanceRevisionField]: spec.revision,
      upstreamManifest: spec.manifestName,
      upstreamManifestSha256: sha256(manifestBytes),
      runtimeVersion: manifest.runtimeVersion,
      global: manifest.global,
      files: Object.freeze([
        Object.freeze({
          path: spec.artifactName,
          bytes: artifact.byteLength,
          sha256: sha256(artifact),
        }),
        Object.freeze({
          path: spec.manifestName,
          bytes: manifestBytes.byteLength,
          sha256: sha256(manifestBytes),
        }),
      ]),
    })
    await io.writeFile(
      path.join(spec.publicRuntimeRoot, spec.provenanceName),
      `${JSON.stringify(provenance, null, 2)}\n`,
      'utf8',
    )

    return Object.freeze({
      destination: spec.publicRuntimeRoot,
      revision: spec.revision,
      runtimeVersion: manifest.runtimeVersion,
      artifactSha256: manifest.sha256,
    })
  } finally {
    await io.rm(spec.buildRoot, { recursive: true, force: true })
  }
}