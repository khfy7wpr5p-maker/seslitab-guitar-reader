import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function repositorySource(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('Sonar S1143 regression: production acceptance never throws from finally cleanup', async () => {
  const source = await repositorySource(
    'backend/delivery/production/secureDeliveryProductionAcceptance.js',
  )
  const finallyIndex = source.indexOf('} finally {')
  assert.notEqual(finallyIndex, -1, 'expected production acceptance finally block')
  assert.doesNotMatch(
    source.slice(finallyIndex),
    /\bthrow\s+new\s+Error\s*\(/,
    'cleanup must defer failures until control has left finally',
  )
})

test('Sonar S9383 regression: production server marks both guarded startup chains as intentionally detached', async () => {
  const source = await repositorySource(
    'backend/delivery/production/server.js',
  )
  const detachedChains = source.match(/\bvoid\s+Promise\.resolve\(\)/g) ?? []
  assert.equal(
    detachedChains.length,
    2,
    'acceptance and provisioning bootstrap chains must be explicitly detached',
  )
})

test('Sonar S7773 regression: structural provenance uses Number.NaN explicitly', async () => {
  const source = await repositorySource(
    'experiments/smoosic-mobile/src/seslitab-structural-action-provenance.js',
  )
  const start = source.indexOf('const sourceDurationValue')
  assert.notEqual(start, -1)
  const snippet = source.slice(start, start + 260)
  assert.match(snippet, /:\s*Number\.NaN\b/)
  assert.doesNotMatch(snippet, /:\s*NaN\b/)
})
