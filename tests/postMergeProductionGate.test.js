import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const MODULE_URL = new URL('../scripts/postMergeProductionGate.js', import.meta.url)
const WORKFLOW_URL = new URL('../.github/workflows/production-gate.yml', import.meta.url)
const MODULE_EXISTS = existsSync(MODULE_URL)
const WORKFLOW_EXISTS = existsSync(WORKFLOW_URL)

function ciRun(overrides = {}) {
  return {
    id: 1440,
    name: 'CI',
    event: 'push',
    head_branch: 'main',
    head_sha: 'a'.repeat(40),
    status: 'completed',
    conclusion: 'success',
    run_attempt: 1,
    ...overrides,
  }
}

function regressionRun(overrides = {}) {
  return {
    id: 777,
    name: 'Regression Quality',
    event: 'push',
    head_branch: 'main',
    head_sha: 'a'.repeat(40),
    status: 'completed',
    conclusion: 'success',
    run_attempt: 1,
    run_number: 777,
    ...overrides,
  }
}

test('TD-PROD-14 production-gate module and workflow exist', () => {
  assert.equal(MODULE_EXISTS, true)
  assert.equal(WORKFLOW_EXISTS, true)
})

test('TD-PROD-14 accepts only exact current-main first-attempt green evidence', {
  skip: !MODULE_EXISTS,
}, async () => {
  const { evaluatePostMergeProductionGate } = await import(MODULE_URL)
  const sha = 'a'.repeat(40)

  const result = evaluatePostMergeProductionGate({
    repository: 'khfy7wpr5p-maker/seslitab-guitar-reader',
    triggerRun: ciRun({ head_sha: sha }),
    regressionRuns: [regressionRun({ head_sha: sha })],
    currentMainSha: sha,
    verifiedAt: '2026-09-30T20:00:00.000Z',
  })

  assert.equal(result.schemaVersion, 1)
  assert.equal(result.gate, 'PASS')
  assert.equal(result.headSha, sha)
  assert.equal(result.branch, 'main')
  assert.equal(result.ci.runId, 1440)
  assert.equal(result.ci.runAttempt, 1)
  assert.equal(result.regressionQuality.runId, 777)
  assert.equal(result.regressionQuality.runAttempt, 1)
  assert.deepEqual(result.requirements, [
    'exact-current-main-sha',
    'ci-push-main-first-attempt-success',
    'regression-quality-push-main-first-attempt-success',
  ])
})

test('TD-PROD-14 fails closed on CI retry failure drift or stale main', {
  skip: !MODULE_EXISTS,
}, async () => {
  const { evaluatePostMergeProductionGate } = await import(MODULE_URL)
  const sha = 'a'.repeat(40)
  const base = {
    repository: 'khfy7wpr5p-maker/seslitab-guitar-reader',
    regressionRuns: [regressionRun({ head_sha: sha })],
    currentMainSha: sha,
    verifiedAt: '2026-09-30T20:00:00.000Z',
  }

  assert.throws(
    () => evaluatePostMergeProductionGate({
      ...base,
      triggerRun: ciRun({ head_sha: sha, run_attempt: 2 }),
    }),
    /production-gate-ci-first-attempt-required/,
  )
  assert.throws(
    () => evaluatePostMergeProductionGate({
      ...base,
      triggerRun: ciRun({ head_sha: sha, conclusion: 'failure' }),
    }),
    /production-gate-ci-success-required/,
  )
  assert.throws(
    () => evaluatePostMergeProductionGate({
      ...base,
      triggerRun: ciRun({ head_sha: sha, event: 'workflow_dispatch' }),
    }),
    /production-gate-ci-push-required/,
  )
  assert.throws(
    () => evaluatePostMergeProductionGate({
      ...base,
      triggerRun: ciRun({ head_sha: sha, head_branch: 'feature' }),
    }),
    /production-gate-ci-main-required/,
  )
  assert.throws(
    () => evaluatePostMergeProductionGate({
      ...base,
      triggerRun: ciRun({ head_sha: sha }),
      currentMainSha: 'b'.repeat(40),
    }),
    /production-gate-main-advanced/,
  )
})

test('TD-PROD-14 fails closed on missing pending failed retried or mismatched Regression Quality', {
  skip: !MODULE_EXISTS,
}, async () => {
  const { evaluatePostMergeProductionGate } = await import(MODULE_URL)
  const sha = 'a'.repeat(40)
  const base = {
    repository: 'khfy7wpr5p-maker/seslitab-guitar-reader',
    triggerRun: ciRun({ head_sha: sha }),
    currentMainSha: sha,
    verifiedAt: '2026-09-30T20:00:00.000Z',
  }

  assert.throws(
    () => evaluatePostMergeProductionGate({ ...base, regressionRuns: [] }),
    /production-gate-regression-missing/,
  )
  assert.throws(
    () => evaluatePostMergeProductionGate({
      ...base,
      regressionRuns: [regressionRun({ head_sha: sha, status: 'in_progress', conclusion: null })],
    }),
    /production-gate-regression-pending/,
  )
  assert.throws(
    () => evaluatePostMergeProductionGate({
      ...base,
      regressionRuns: [regressionRun({ head_sha: sha, conclusion: 'failure' })],
    }),
    /production-gate-regression-success-required/,
  )
  assert.throws(
    () => evaluatePostMergeProductionGate({
      ...base,
      regressionRuns: [regressionRun({ head_sha: sha, run_attempt: 2 })],
    }),
    /production-gate-regression-first-attempt-required/,
  )
  assert.throws(
    () => evaluatePostMergeProductionGate({
      ...base,
      regressionRuns: [regressionRun({ head_sha: 'b'.repeat(40) })],
    }),
    /production-gate-regression-missing/,
  )
})

test('TD-PROD-14 workflow is exact-main fail-closed and emits attestation', {
  skip: !WORKFLOW_EXISTS,
}, () => {
  const workflow = readFileSync(WORKFLOW_URL, 'utf8')

  assert.match(workflow, /name:\s*Production Gate/)
  assert.match(workflow, /workflow_run:/)
  assert.match(workflow, /workflows:\s*\[["']CI["']\]/)
  assert.match(workflow, /types:\s*\[completed\]/)
  assert.match(workflow, /branches:\s*\[main\]/)
  assert.match(workflow, /actions:\s*read/)
  assert.match(workflow, /contents:\s*read/)
  assert.match(workflow, /github\.event\.workflow_run\.head_sha/)
  assert.match(workflow, /github\.event\.workflow_run\.id/)
  assert.match(workflow, /github\.event\.workflow_run\.event == 'push'/)
  assert.match(workflow, /Regression Quality/)
  assert.match(workflow, /run_attempt/)
  assert.match(workflow, /postMergeProductionGate\.js/)
  assert.match(workflow, /production-gate-attestation/)
  assert.match(workflow, /artifacts\/production-gate\.json/)
})
