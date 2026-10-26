import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { selectPostMergeGitHubEvidence, evaluatePostMergeProductionGate } from '../scripts/postMergeProductionGate.js'

const repository = 'owner/repository'
const sha = 'a'.repeat(40)
const source = { full_name: repository, fork: false }
function ciRun(overrides = {}) { return { id: 1440, workflow_id: 10, name: 'CI', path: '.github/workflows/ci.yml', event: 'push',
  head_branch: 'main', head_sha: sha, repository: source, head_repository: source,
  status: 'completed', conclusion: 'success', run_attempt: 1, ...overrides } }
function regressionRun(overrides = {}) { return { ...ciRun(), id: 777, run_number: 777, workflow_id: 20,
  name: 'Regression Quality', path: '.github/workflows/regression-quality.yml', ...overrides } }
function input(overrides = {}) { return { repository, triggerRun: ciRun(), regressionRuns: [regressionRun()], currentMainSha: sha,
  workflowIds: { ci: 10, regression: 20 }, verifiedAt: '2026-10-04T05:00:00Z', projectKey: 'project:key',
  sonarEvidence: { projectKey: 'project:key', taskId: 'task_1', analysisId: 'analysis_1', branch: 'main', headSha: sha,
    analysisRevision: sha, runId: 777, runAttempt: 1, ceStatus: 'SUCCESS', qualityGate: 'OK', newSecurityRating: 1,
    newReliabilityRating: 1, verifiedAt: '2026-10-04T05:00:00Z' }, ...overrides } }

test('TD-PROD-14 exact-main GitHub success alone is pending; CE and A ratings are mandatory', () => {
  assert.equal(selectPostMergeGitHubEvidence(input()).gate, 'PENDING_SONAR')
  assert.throws(() => evaluatePostMergeProductionGate(input({ sonarEvidence: undefined })), /exact-sonar-acceptance/)
  const accepted = evaluatePostMergeProductionGate(input())
  assert.equal(accepted.schemaVersion, 2)
  assert.equal(accepted.gate, 'PASS')
  assert.equal(accepted.sonar.analysisId, 'analysis_1')
  assert.equal(accepted.requirements.length, 6)
})

test('TD-PROD-14 rejects stale main, failed/retried CI and untrusted source/workflow', () => {
  for (const changes of [{ event: 'pull_request' }, { head_branch: 'feature' }, { run_attempt: 2 }, { conclusion: 'failure' },
    { head_sha: 'bad' }, { repository: { ...source, fork: true } }, { head_repository: { full_name: 'evil/fork', fork: true } },
    { workflow_id: 99 }, { path: '.github/workflows/evil.yml' }]) {
    assert.throws(() => evaluatePostMergeProductionGate(input({ triggerRun: ciRun(changes) })), /production-gate-/)
  }
  assert.throws(() => evaluatePostMergeProductionGate(input({ currentMainSha: 'b'.repeat(40) })), /main-advanced/)
})

test('TD-PROD-14 rejects missing/pending/failed/foreign Regression and does not fall back to older green run', () => {
  assert.throws(() => evaluatePostMergeProductionGate(input({ regressionRuns: [] })), /regression-missing/)
  for (const changes of [{ status: 'in_progress' }, { conclusion: 'failure' }, { head_sha: 'b'.repeat(40) },
    { repository: { ...source, fork: true } }, { head_repository: { full_name: 'evil/fork', fork: false } },
    { workflow_id: 99 }, { path: '.github/workflows/evil.yml' }]) {
    assert.throws(() => evaluatePostMergeProductionGate(input({ regressionRuns: [regressionRun(changes)] })), /production-gate-/)
  }
  assert.throws(() => evaluatePostMergeProductionGate(input({ regressionRuns: [regressionRun(),
    regressionRun({ id: 778, run_number: 778, conclusion: 'failure' })] })), /regression-success-required/)
})

test('TD-PROD-14 accepts Regression rerun only with exact latest attempt CE evidence', () => {
  const evidence = input().sonarEvidence
  assert.throws(() => evaluatePostMergeProductionGate(input({ regressionRuns: [regressionRun({ run_attempt: 2 })] })), /exact-sonar/)
  const accepted = evaluatePostMergeProductionGate(input({ regressionRuns: [regressionRun({ run_attempt: 2 })],
    sonarEvidence: { ...evidence, runAttempt: 2 } }))
  assert.equal(accepted.artifactName, 'sonar-task-777-2')
})

test('TD-PROD-14 rejects foreign/stale/pending/missing/failing Sonar evidence', () => {
  const evidence = input().sonarEvidence
  for (const changes of [{ ceStatus: 'PENDING' }, { ceStatus: 'FAILED' }, { qualityGate: 'ERROR' }, { newSecurityRating: 3 },
    { newReliabilityRating: 3 }, { analysisId: undefined }, { projectKey: 'foreign' }, { analysisRevision: 'b'.repeat(40) },
    { runId: 999 }, { runAttempt: 2 }, { branch: 'feature' }, { verifiedAt: '2026-09-30T00:00:00Z' }]) {
    assert.throws(() => evaluatePostMergeProductionGate(input({ sonarEvidence: { ...evidence, ...changes } })), /exact-sonar/)
  }
})

const workflow = parse(readFileSync(new URL('../.github/workflows/production-gate.yml', import.meta.url), 'utf8'))
const steps = workflow.jobs['exact-main-production-gate'].steps
async function precheckout(eventRun, apiRun = eventRun, mainSha = sha, workflowChanges = {}) {
  const outputs = []
  const github = { rest: { actions: {
    getWorkflow: async () => ({ data: { id: 10, name: 'CI', path: '.github/workflows/ci.yml', ...workflowChanges } }),
    getWorkflowRun: async () => ({ data: apiRun }),
  }, repos: { getBranch: async () => ({ data: { commit: { sha: mainSha } } }) } } }
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  await new AsyncFunction('github', 'context', 'core', steps[0].with.script)(github,
    { repo: { owner: 'owner', repo: 'repository' }, payload: { workflow_run: eventRun } },
    { setOutput: (...args) => outputs.push(args) })
  return outputs
}

test('workflow actual pre-checkout script authorizes only verified same-repo push/main/first-attempt CI', async () => {
  assert.deepEqual(await precheckout(ciRun()), [['sha', sha]])
  for (const changes of [{ event: 'pull_request' }, { head_branch: 'feature' }, { run_attempt: 2 }, { conclusion: 'failure' },
    { repository: { ...source, fork: true } }, { head_repository: { full_name: 'evil/fork', fork: true } },
    { workflow_id: 99 }, { path: '.github/workflows/evil.yml' }]) {
    await assert.rejects(precheckout(ciRun(changes)), /untrusted-ci-source/)
    await assert.rejects(precheckout(ciRun(), ciRun(changes)), /untrusted-ci-source/)
  }
  await assert.rejects(precheckout(ciRun(), ciRun({ head_sha: 'b'.repeat(40) })), /source-drift/)
  await assert.rejects(precheckout(ciRun(), ciRun(), 'b'.repeat(40)), /source-drift/)
  await assert.rejects(precheckout(ciRun(), ciRun(), sha, { path: 'evil' }), /workflow-invalid/)
  assert.ok(steps.findIndex((step) => step.uses === 'actions/checkout@v4') > 0)
  assert.match(steps[1].if, /head_repository.fork == false/)
  assert.deepEqual(workflow.permissions, { actions: 'read', contents: 'read' })
})

test('actual selection workflow rejects ambiguous/expired/foreign artifacts before download', async () => {
  const selected = selectPostMergeGitHubEvidence(input())
  const artifact = { name: selected.artifactName, expired: false, workflow_run: { id: 777, head_sha: sha } }
  const script = steps.find((step) => step.id === 'evidence').with.script
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  for (const artifacts of [[artifact], [], [artifact, artifact], [{ ...artifact, expired: true }],
    [{ ...artifact, workflow_run: { id: 999, head_sha: sha } }], [{ ...artifact, name: 'sonar-report-task' }]]) {
    const writes = []
    const github = { rest: { actions: {
      getWorkflow: async ({ workflow_id }) => ({ data: workflow_id === 'ci.yml' ?
        { id: 10, path: '.github/workflows/ci.yml', name: 'CI' } :
        { id: 20, path: '.github/workflows/regression-quality.yml', name: 'Regression Quality' } }),
      getWorkflowRun: async () => ({ data: ciRun() }),
      listWorkflowRunsForRepo: async () => ({ data: { workflow_runs: [regressionRun()] } }),
      listWorkflowRunArtifacts: async () => ({ data: { artifacts } }),
    }, repos: { getBranch: async () => ({ data: { commit: { sha } } }) } } }
    const requireMock = (id) => id === 'node:fs' ? { mkdirSync() {}, writeFileSync: (...args) => writes.push(args) } :
      id === 'node:url' ? { pathToFileURL: (path) => new URL(`file://${path}`) } : null
    const execute = new AsyncFunction('require', 'github', 'context', 'core', 'process', script)
    const promise = execute(requireMock, github, { repo: { owner: 'owner', repo: 'repository' }, payload: { workflow_run: ciRun() } },
      { setOutput() {} }, { env: { GITHUB_WORKSPACE: new URL('..', import.meta.url).pathname.replace(/\/$/, '') } })
    if (artifacts.length === 1 && artifacts[0] === artifact) {
      await promise
      assert.equal(JSON.parse(writes[0][1]).gate, 'PENDING_SONAR')
    } else {
      await assert.rejects(promise, /attempt-artifact-invalid/)
      assert.equal(writes.length, 0)
    }
  }
})
