import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function repositorySource(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('Sonar S1143 regression: production acceptance defers cleanup failures outside finally', async () => {
  const source = await repositorySource(
    'backend/delivery/production/secureDeliveryProductionAcceptance.js',
  )

  assert.match(
    source,
    /identityCleanupFailure\s*=\s*new Error\(\s*'secure-delivery-production-acceptance-failure-cleanup-identity-conflict'/,
  )
  assert.match(
    source,
    /identityCleanupFailure\s*=\s*new Error\(\s*'secure-delivery-production-acceptance-failure-cleanup-identity-state-invalid'/,
  )
  assert.doesNotMatch(
    source,
    /throw new Error\(\s*'secure-delivery-production-acceptance-failure-cleanup-identity-(?:conflict|state-invalid)'/,
  )
  assert.match(
    source,
    /\n  \}\n\n  if \(\n    identityCleanupFailure !== null\n  \) \{\n    throw new Error\(\n      'secure-delivery-production-acceptance-failure-cleanup-failed'/,
    'identity cleanup failure must be thrown only after finally exits',
  )
  assert.match(
    source,
    /\n  \}\n\n  if \(\n    identityCleanupFailure !== null[\s\S]*?secure-delivery-production-acceptance-cleanup-failed/,
    'ordinary cleanup failure decision must also occur after finally exits',
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
