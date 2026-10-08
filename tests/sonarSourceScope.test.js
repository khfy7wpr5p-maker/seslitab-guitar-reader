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
  assert.match(config, /^sonar\.tests=tests,browser-tests,scripts$/m)
  assert.match(config, /^sonar\.javascript\.lcov\.reportPaths=coverage\/lcov.info,coverage\/gtab10c-integration\/lcov.info$/m)
  assert.match(config, /^sonar\.python\.coverage\.reportPaths=coverage\/gtab10c-python.xml$/m)
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

import { spawnSync } from 'node:child_process'
function productCallers(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' })
  assert.ok(result.status === 0 || result.status === 1)
  return result.stdout
}
import { analysisType } from '../scripts/sonarSourceInventory.mjs'

test('only audited CI browser proofs and their test-only helpers are classified as tests', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8')
  const proofs = [...new Set([...ci.matchAll(/node (scripts\/verify\w*Browser\.js)/g)].map((match) => match[1]))]
  const approved = [...proofs, 'scripts/s14CdpProofHarness.js', 'scripts/ses153BrowserProofSession.js',
    'scripts/ceBridgeFixtureTransport.js'].sort()
  const actual = /^sonar\.test\.inclusions=(.*)$/m.exec(config)[1].split(',').filter((path) => path.startsWith('scripts/')).sort()
  assert.deepEqual(actual, approved)
  assert.equal(actual.length, 21)
  for (const path of approved) {
    assert.equal(analysisType(path, config), 'test', path)
    const callers = productCallers( ['grep', '-l', '-F', path.split('/').at(-1), '--',
      'src', 'backend', 'package.json', ':(top,glob)*.js'])
    // Only the script itself may be returned by this product-entrypoint search.
    assert.deepEqual(callers.trim().split('\n').filter(Boolean).filter((caller) => caller !== path), [])
  }
  for (const path of ['scripts/sonarDiagnostics.mjs', 'scripts/postMergeProductionGate.js',
    'scripts/verifyS16DeployedCompositionBrowser.js', 'scripts/prepareSmoosicEditor.js',
    'scripts/verifyScoreRuntimeBrowser.js', 'src/data/chordBoardCatalogSnapshotV1.json']) {
    assert.equal(analysisType(path, config), 'source', path)
  }
})

import { mkdtempSync, writeFileSync, chmodSync, existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

test('inventory uses trusted system git even when PATH starts with an attacker executable', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sonar-git-shadow-'))
  try {
    const marker = join(directory, 'shadow-executed')
    const fakeGit = join(directory, 'git')
    writeFileSync(fakeGit, `#!/bin/sh\nprintf shadow > '${marker}'\nexit 88\n`)
    chmodSync(fakeGit, 0o755)
    // Prove the fixture actually intercepts an unqualified executable lookup.
    const env = { ...process.env, PATH: directory + ':' + process.env.PATH }
    const unsafe = spawnSync('git', ['ls-files', '-z'], { env, encoding: 'utf8' })
    assert.equal(unsafe.status, 88)
    assert.equal(existsSync(marker), true)
    rmSync(marker)
    const result = spawnSync(process.execPath, [resolve('scripts/sonarSourceInventory.mjs')], { env, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(existsSync(marker), false)
    const inventory = JSON.parse(result.stdout)
    assert.ok(inventory.files.some((file) => file.path === 'src/data/chordBoardCatalogSnapshotV1.json'))
    assert.ok(inventory.files.length > 300)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})


test('Python oracle tests are tests while actual qualification implementation remains analyzed source', () => {
  assert.equal(analysisType('tests/python/test_gtab10c_oracle.py', config), 'test')
  assert.equal(analysisType('tests/gtab10cOracleGraph.integration.mjs', config), 'test')
  for (const path of ['scripts/gtab10cSemanticOracle.py', 'scripts/verifyGtab10cSemanticParity.js', 'src/qualification/gtab10cSemanticParity.js']) {
    assert.equal(analysisType(path, config), 'source', path)
    const exclusions = /^sonar\.coverage\.exclusions=(.*)$/m.exec(config)[1].split(',')
    assert.equal(sourceIncluded(path, exclusions), true, path)
  }
})
