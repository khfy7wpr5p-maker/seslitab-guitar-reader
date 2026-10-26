import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url))
const BACKEND_ROOT = path.join(REPO_ROOT, 'backend')
const DOCKERFILE_PATH = path.join(REPO_ROOT, 'Dockerfile')

function collectJavaScriptFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const resolved = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectJavaScriptFiles(resolved))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(resolved)
    }
  }
  return files
}

test('SES-150 OMR Docker image packages backend src/services runtime imports', () => {
  const dockerfile = readFileSync(DOCKERFILE_PATH, 'utf8')
  const importedServices = new Set()
  const serviceImportPattern =
    /(?:from\s+|import\(\s*)['"](?:\.\.\/)+src\/services\/([^'"]+)['"]/g

  for (const file of collectJavaScriptFiles(BACKEND_ROOT)) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(serviceImportPattern)) {
      importedServices.add(match[1])
    }
  }

  assert.ok(
    importedServices.size > 0,
    'backend must expose at least one src/services runtime dependency',
  )
  assert.ok(
    importedServices.has('secureDeliveryIdentity.js'),
    'regression fixture must include the module that failed in production',
  )
  assert.match(
    dockerfile,
    /COPY\s+src\/services\/\s+\.\/src\/services\//,
    'OMR Docker image must copy the shared src/services runtime tree',
  )
  assert.match(
    dockerfile,
    /COPY\s+\*\.js\s+\/app\//,
    'OMR Docker image must include root-level shared JS contracts',
  )
})

test('SES-150 OMR Docker build fails early on Secure Delivery resolution drift', () => {
  const dockerfile = readFileSync(DOCKERFILE_PATH, 'utf8')

  for (const modulePath of [
    './backend/delivery/authorization/secureDeliveryAuthorization.js',
    './backend/delivery/http/payloadBoundary.js',
    './backend/delivery/firebase/firestoreSecureDeliveryStore.js',
  ]) {
    assert.ok(
      dockerfile.includes(`import('${modulePath}')`),
      `Docker build smoke must resolve ${modulePath}`,
    )
  }
})

test('SES-216 OMR Docker image packages the bounded Chord Board catalog runtime asset', () => {
  const dockerfile = readFileSync(DOCKERFILE_PATH, 'utf8')

  assert.match(
    dockerfile,
    /COPY\s+src\/data\/chordBoardCatalogSnapshotV1\.json\s+\.\/src\/data\/chordBoardCatalogSnapshotV1\.json/,
    'OMR Docker image must copy only the pinned Chord Board catalog JSON into its expected runtime path',
  )
  assert.doesNotMatch(
    dockerfile,
    /COPY\s+src\/data\/\s+/,
    'OMR Docker image must not broaden packaging to the full src/data tree',
  )
  assert.doesNotMatch(
    dockerfile,
    /COPY\s+\.\s+\./,
    'OMR Docker image must not copy the entire repository',
  )
})

test('SES-216 OMR Docker build fails early on Chord Board catalog resolution drift', () => {
  const dockerfile = readFileSync(DOCKERFILE_PATH, 'utf8')

  assert.ok(
    dockerfile.includes("import('./src/services/chordBoardCatalog.js')"),
    'Docker build smoke must resolve the real Chord Board catalog import chain inside the final runtime image',
  )
})
