import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { exclusionPatterns, sourceIncluded, trackedInventory } from '../scripts/sonarSourceInventory.mjs'

const config = readFileSync('sonar-project.properties', 'utf8')
const patterns = exclusionPatterns(config)
test('generated npm locks are excluded at root and nested paths without hiding manifests or source JSON', () => {
  assert.equal(sourceIncluded('package-lock.json', patterns), false)
  assert.equal(sourceIncluded('experiments/smoosic-mobile/package-lock.json', patterns), false)
  for (const path of ['package.json', 'experiments/smoosic-mobile/package.json', 'firebase.json',
    'firestore.indexes.json', 'src/data/chordBoardCatalogSnapshotV1.json', 'docs/new-code.json',
    'scripts/sonarDiagnostics.mjs', 'experiments/smoosic-mobile/src/index.js', '.github/workflows/ci.yml']) {
    assert.equal(sourceIncluded(path, patterns), true, path)
  }
  assert.match(config, /^sonar\.tests=tests,browser-tests$/m)
  assert.match(config, /^sonar\.javascript\.lcov\.reportPaths=coverage\/lcov.info$/m)
})
test('targeted exclusion changes tracked inventory only for npm-generated lockfiles', () => {
  const before = trackedInventory(config.replace(',**/package-lock.json', ''))
  const after = trackedInventory(config)
  const changed = after.files.filter((file) => file.included !== before.files.find((old) => old.path === file.path)?.included)
  assert.deepEqual(changed.map((file) => file.path), ['package-lock.json'])
  assert.ok(changed[0].physicalLines > 5199)
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
  assert.equal(lock.lockfileVersion, 3)
  assert.ok(Object.keys(lock.packages).length > 0)
  const audit = readFileSync('.github/workflows/dependency-security.yml', 'utf8')
  assert.match(audit, /npm ci --ignore-scripts/)
  assert.match(audit, /npm audit --omit=dev --json/)
  assert.match(audit, /npm audit --json/)
})
