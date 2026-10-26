import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const SHA40 = /^[0-9a-f]{40}$/u
const SHA256 = /^[0-9a-f]{64}$/u

function requireBoundedManifest(value) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new Error('Student renderer runtime manifest must be an object.')
  }
  return value
}

function runtimeFilePath(runtimeRoot, relativePath) {
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`invalid runtime file path: ${String(relativePath)}`)
  }

  const root = path.resolve(runtimeRoot)
  const resolved = path.resolve(root, relativePath)
  const prefix = `${root}${path.sep}`
  if (resolved !== root && !resolved.startsWith(prefix)) {
    throw new Error(`runtime file escapes root: ${relativePath}`)
  }
  return resolved
}

function sha256(bytes) {
  return createHash('sha256')
    .update(bytes)
    .digest('hex')
}

export async function verifyStudentRendererRuntimeIntegrity({
  runtimeRoot,
  expectedRendererRevision,
  expectedContractVersion = '0.2.0',
} = {}) {
  if (
    typeof runtimeRoot !== 'string' ||
    runtimeRoot.length === 0
  ) {
    throw new Error('Student renderer runtime root is required.')
  }
  if (!SHA40.test(expectedRendererRevision ?? '')) {
    throw new Error('Expected Student renderer revision must be a 40-character lowercase SHA.')
  }
  if (
    typeof expectedContractVersion !== 'string' ||
    expectedContractVersion.length === 0
  ) {
    throw new Error('Expected Student renderer contract version is required.')
  }

  const manifestPath = path.join(
    path.resolve(runtimeRoot),
    'runtime-manifest.json',
  )
  const manifest = requireBoundedManifest(
    JSON.parse(await readFile(manifestPath, 'utf8')),
  )

  if (manifest.schemaVersion !== 1) {
    throw new Error('Student renderer runtime manifest schemaVersion mismatch.')
  }
  if (manifest.rendererSourceRevision !== expectedRendererRevision) {
    throw new Error('Student renderer source revision mismatch.')
  }
  if (manifest.scoreRendererContractVersion !== expectedContractVersion) {
    throw new Error('Student renderer contract version mismatch.')
  }
  if (manifest.runtimeTarget !== 'browser') {
    throw new Error('Student renderer runtime target must be browser.')
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error('Student renderer runtime manifest files are required.')
  }

  const seen = new Set()
  for (const entry of manifest.files) {
    if (
      entry === null ||
      typeof entry !== 'object' ||
      Array.isArray(entry) ||
      typeof entry.path !== 'string' ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0 ||
      !SHA256.test(entry.sha256 ?? '')
    ) {
      throw new Error('Student renderer runtime manifest contains an invalid file entry.')
    }
    if (seen.has(entry.path)) {
      throw new Error(`duplicate runtime file entry: ${entry.path}`)
    }
    seen.add(entry.path)

    const bytes = await readFile(
      runtimeFilePath(runtimeRoot, entry.path),
    )
    if (bytes.byteLength !== entry.bytes) {
      throw new Error(`byte length mismatch: ${entry.path}`)
    }
    if (sha256(bytes) !== entry.sha256) {
      throw new Error(`sha256 mismatch: ${entry.path}`)
    }
  }

  return Object.freeze({
    rendererSourceRevision: expectedRendererRevision,
    scoreRendererContractVersion: expectedContractVersion,
    verifiedFiles: manifest.files.length,
  })
}
