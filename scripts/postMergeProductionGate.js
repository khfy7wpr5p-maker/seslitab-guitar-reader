const SHA = /^[0-9a-f]{40}$/
const PROJECT = /^[A-Za-z0-9_.:-]{1,400}$/
const ID = /^[A-Za-z0-9_-]{1,200}$/

function fail(code) { throw new Error(`production-gate-${code}`) }
function trusted(run, repository, name, path, workflowId) {
  if (!run || run.name !== name) fail('workflow-required')
  if (run.repository?.full_name !== repository || run.repository?.fork !== false ||
      run.head_repository?.full_name !== repository || run.head_repository?.fork !== false) fail('source-repository-untrusted')
  if (![path, `${path}@main`, `${path}@refs/heads/main`].includes(run.path) ||
      !Number.isSafeInteger(workflowId) || workflowId < 1 || run.workflow_id !== workflowId) fail('workflow-identity-mismatch')
  if (!Number.isSafeInteger(run.id) || run.id < 1 || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) fail('run-identity-invalid')
}
function evidence(run) {
  return Object.freeze({ workflowName: run.name, workflowId: run.workflow_id, runId: run.id,
    runNumber: run.run_number ?? null, runAttempt: run.run_attempt, event: run.event, branch: run.head_branch,
    headSha: run.head_sha, status: run.status, conclusion: run.conclusion })
}
export function selectPostMergeGitHubEvidence({ repository, triggerRun: ci, regressionRuns, currentMainSha,
  workflowIds, verifiedAt } = {}) {
  if (typeof repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) fail('repository-required')
  if (!ci) fail('ci-run-required')
  if (ci.name !== 'CI') fail('ci-workflow-required')
  if (ci.event !== 'push') fail('ci-push-required')
  if (ci.head_branch !== 'main') fail('ci-main-required')
  if (ci.status !== 'completed') fail('ci-completed-required')
  if (ci.run_attempt !== 1) fail('ci-first-attempt-required')
  if (ci.conclusion !== 'success') fail('ci-success-required')
  if (!SHA.test(ci.head_sha ?? '')) fail('ci-sha-invalid')
  if (!SHA.test(currentMainSha ?? '')) fail('main-sha-invalid')
  if (ci.head_sha !== currentMainSha) fail('main-advanced')
  trusted(ci, repository, 'CI', '.github/workflows/ci.yml', workflowIds?.ci)
  if (!Array.isArray(regressionRuns)) fail('regression-runs-required')
  const exact = regressionRuns.filter((run) => run?.name === 'Regression Quality' && run.event === 'push' &&
    run.head_branch === 'main' && run.head_sha === ci.head_sha)
  if (!exact.length) fail('regression-missing')
  const regression = [...exact].sort((a, b) => Number(b.run_number ?? 0) - Number(a.run_number ?? 0) || b.id - a.id)[0]
  trusted(regression, repository, 'Regression Quality', '.github/workflows/regression-quality.yml', workflowIds?.regression)
  if (regression.status !== 'completed') fail('regression-pending')
  if (regression.conclusion !== 'success') fail('regression-success-required')
  if (typeof verifiedAt !== 'string' || Number.isNaN(Date.parse(verifiedAt))) fail('verified-at-invalid')
  return Object.freeze({ schemaVersion: 2, gate: 'PENDING_SONAR', repository, branch: 'main', headSha: ci.head_sha,
    verifiedAt, ci: evidence(ci), regressionQuality: evidence(regression),
    artifactName: `sonar-task-${regression.id}-${regression.run_attempt}` })
}
export function evaluatePostMergeProductionGate(input = {}) {
  const base = selectPostMergeGitHubEvidence(input)
  const sonar = input.sonarEvidence
  if (!sonar || !PROJECT.test(input.projectKey ?? '') || sonar.projectKey !== input.projectKey ||
      !ID.test(sonar.taskId ?? '') || !ID.test(sonar.analysisId ?? '') || sonar.branch !== 'main' ||
      sonar.headSha !== base.headSha || sonar.analysisRevision !== base.headSha ||
      sonar.runId !== base.regressionQuality.runId || sonar.runAttempt !== base.regressionQuality.runAttempt ||
      sonar.ceStatus !== 'SUCCESS' || sonar.qualityGate !== 'OK' || sonar.newSecurityRating !== 1 ||
      sonar.newReliabilityRating !== 1 || typeof sonar.verifiedAt !== 'string' ||
      !Number.isFinite(Date.parse(sonar.verifiedAt)) ||
      Math.abs(Date.parse(base.verifiedAt) - Date.parse(sonar.verifiedAt)) > 120000) fail('exact-sonar-acceptance-required')
  return Object.freeze({ ...base, gate: 'PASS', sonar: Object.freeze({ ...sonar }), requirements: Object.freeze([
    'exact-current-main-sha', 'ci-push-main-first-attempt-success',
    'regression-quality-push-main-latest-attempt-success', 'attempt-qualified-task-metadata',
    'exact-current-analysis-revision', 'sonar-ce-success-quality-gate-ok-security-a-reliability-a',
  ]) })
}
