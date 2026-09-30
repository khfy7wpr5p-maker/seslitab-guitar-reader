import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
)
const packageLock = JSON.parse(
  readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'),
)
const workflow = readFileSync(
  new URL('../.github/workflows/dependency-security.yml', import.meta.url),
  'utf8',
)
const qualification = readFileSync(
  new URL('../docs/dependency-security-qualification.md', import.meta.url),
  'utf8',
)

test('TD-PROD-15 pins the qualified direct and transitive security versions', () => {
  assert.equal(packageJson.dependencies.multer, '2.4.0')
  assert.equal(packageJson.devDependencies['firebase-tools'], '15.32.0')
  assert.equal(packageJson.overrides?.['@grpc/grpc-js'], '^1.13.6')

  assert.equal(packageLock.packages[''].dependencies.multer, '2.4.0')
  assert.equal(
    packageLock.packages[''].devDependencies['firebase-tools'],
    '15.32.0',
  )
  assert.equal(packageLock.packages['node_modules/multer'].version, '2.4.0')
  assert.equal(
    packageLock.packages['node_modules/firebase-tools'].version,
    '15.32.0',
  )

  const grpcEntries = Object.entries(packageLock.packages)
    .filter(([path]) => path.endsWith('node_modules/@grpc/grpc-js'))

  assert.ok(grpcEntries.length > 0)
  for (const [path, entry] of grpcEntries) {
    const [major, minor, patch] = entry.version
      .split('.')
      .map(value => Number.parseInt(value, 10))
    const isQualified =
      major === 1 &&
      (minor > 13 || (minor === 13 && patch >= 6))

    assert.equal(
      isQualified,
      true,
      `${path} must stay at or above the qualified 1.13.6 security floor within major 1`,
    )
  }
})

test('TD-PROD-15 dependency workflow is read-only and fail-closed', () => {
  assert.match(workflow, /name:\s*Dependency Security/)
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/)
  assert.doesNotMatch(workflow, /contents:\s*write/)
  assert.doesNotMatch(workflow, /git push/)
  assert.doesNotMatch(workflow, /npm audit fix/)
  assert.doesNotMatch(workflow, /--force/)

  assert.match(
    workflow,
    /npm audit --omit=dev --audit-level=high --json/,
  )
  assert.match(workflow, /npm audit --audit-level=high --json/)
  assert.match(
    workflow,
    /high-or-critical-dependency-vulnerability-detected/,
  )
  assert.match(
    workflow,
    /unclassified-moderate-dependency-vulnerability-detected/,
  )
  assert.match(workflow, /'gaxios', 'uuid'/)
  assert.match(workflow, /'@google-cloud\/pubsub'/)
  assert.match(workflow, /'@opentelemetry\/core'/)
  assert.match(workflow, /'firebase-tools'/)
  assert.match(workflow, /td-prod-15-npm-audit/)
})

test('TD-PROD-15 documents the bounded residual moderate findings', () => {
  assert.match(qualification, /10 moderate, 6 high/)
  assert.match(qualification, /production graph: 2 moderate, 0 high, 0 critical/)
  assert.match(qualification, /full graph: 5 moderate, 0 high, 0 critical/)
  assert.match(qualification, /firebase-admin → optional @google-cloud\/storage/i)
  assert.match(qualification, /no Storage API usage/i)
  assert.match(qualification, /no semver-major transitive override/i)
})
