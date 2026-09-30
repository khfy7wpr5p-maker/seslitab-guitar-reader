const SHA_PATTERN = /^[0-9a-f]{40}$/i

function requireSha(value, errorCode) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!SHA_PATTERN.test(normalized)) {
    throw new Error(errorCode)
  }
  return normalized
}

function requireObject(value, errorCode) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(errorCode)
  }
  return value
}

function freezeEvidence(run, workflowName) {
  return Object.freeze({
    workflowName,
    runId: run.id,
    runNumber: run.run_number ?? null,
    runAttempt: run.run_attempt,
    event: run.event,
    branch: run.head_branch,
    headSha: String(run.head_sha).toLowerCase(),
    status: run.status,
    conclusion: run.conclusion,
  })
}

function newestRun(runs) {
  return [...runs].sort((left, right) => {
    const numberDelta =
      Number(right.run_number ?? 0) -
      Number(left.run_number ?? 0)
    if (numberDelta !== 0) return numberDelta
    return Number(right.id ?? 0) - Number(left.id ?? 0)
  })[0]
}

export function evaluatePostMergeProductionGate({
  repository,
  triggerRun,
  regressionRuns,
  currentMainSha,
  verifiedAt,
} = {}) {
  if (
    typeof repository !== 'string' ||
    repository.trim() === ''
  ) {
    throw new Error('production-gate-repository-required')
  }

  const ci = requireObject(
    triggerRun,
    'production-gate-ci-run-required',
  )

  if (ci.name !== 'CI') {
    throw new Error('production-gate-ci-workflow-required')
  }
  if (ci.event !== 'push') {
    throw new Error('production-gate-ci-push-required')
  }
  if (ci.head_branch !== 'main') {
    throw new Error('production-gate-ci-main-required')
  }
  if (ci.status !== 'completed') {
    throw new Error('production-gate-ci-completed-required')
  }
  if (ci.run_attempt !== 1) {
    throw new Error('production-gate-ci-first-attempt-required')
  }
  if (ci.conclusion !== 'success') {
    throw new Error('production-gate-ci-success-required')
  }

  const ciSha = requireSha(
    ci.head_sha,
    'production-gate-ci-sha-invalid',
  )
  const mainSha = requireSha(
    currentMainSha,
    'production-gate-main-sha-invalid',
  )

  if (ciSha !== mainSha) {
    throw new Error('production-gate-main-advanced')
  }

  if (!Array.isArray(regressionRuns)) {
    throw new Error('production-gate-regression-runs-required')
  }

  const exactRegressionRuns = regressionRuns.filter((run) => (
    run &&
    typeof run === 'object' &&
    run.name === 'Regression Quality' &&
    run.event === 'push' &&
    run.head_branch === 'main' &&
    String(run.head_sha ?? '').trim().toLowerCase() === ciSha
  ))

  if (exactRegressionRuns.length === 0) {
    throw new Error('production-gate-regression-missing')
  }

  const regression = newestRun(exactRegressionRuns)

  if (regression.status !== 'completed') {
    throw new Error('production-gate-regression-pending')
  }
  if (regression.run_attempt !== 1) {
    throw new Error(
      'production-gate-regression-first-attempt-required',
    )
  }
  if (regression.conclusion !== 'success') {
    throw new Error(
      'production-gate-regression-success-required',
    )
  }

  const timestamp = String(verifiedAt ?? '').trim()
  if (timestamp === '' || Number.isNaN(Date.parse(timestamp))) {
    throw new Error('production-gate-verified-at-invalid')
  }

  return Object.freeze({
    schemaVersion: 1,
    gate: 'PASS',
    repository: repository.trim(),
    branch: 'main',
    headSha: ciSha,
    verifiedAt: timestamp,
    ci: freezeEvidence(ci, 'CI'),
    regressionQuality: freezeEvidence(
      regression,
      'Regression Quality',
    ),
    requirements: Object.freeze([
      'exact-current-main-sha',
      'ci-push-main-first-attempt-success',
      'regression-quality-push-main-first-attempt-success',
    ]),
  })
}
