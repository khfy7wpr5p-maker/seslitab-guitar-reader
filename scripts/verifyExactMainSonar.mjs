import { createHash } from 'node:crypto'
import { readFile, writeFile, rm } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { metadata, requestJson } from './sonarDiagnostics.mjs'

const ID = /^[A-Za-z0-9_-]{1,200}$/
const SHA = /^[0-9a-f]{40}$/
function fail(code) { throw new Error(`production-sonar-${code}`) }

export async function verifyExactMainSonar(env = process.env, { maxAttempts = 60, delayMs = 5000 } = {}) {
  const input = JSON.parse(await readFile('artifacts/github-gate-input.json', 'utf8'))
  const proof = JSON.parse(await readFile('artifacts/sonar-report-task/run-provenance.json', 'utf8'))
  const report = await readFile('artifacts/sonar-report-task/report-task.txt')
  const run = input.regressionQuality
  if (input.gate !== 'PENDING_SONAR' || input.branch !== 'main' || !SHA.test(input.headSha ?? '') ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.repository ?? '') ||
      !Number.isSafeInteger(run?.runId) || run.runId < 1 || !Number.isSafeInteger(run.runAttempt) || run.runAttempt < 1 ||
      input.artifactName !== `sonar-task-${run.runId}-${run.runAttempt}` ||
      proof.schemaVersion !== 1 || proof.repository !== input.repository || proof.event !== 'push' ||
      proof.branch !== 'main' || proof.headSha !== input.headSha || proof.runId !== run.runId ||
      proof.runAttempt !== run.runAttempt || proof.scanOutcome !== 'success' ||
      proof.workflowPath !== '.github/workflows/regression-quality.yml' ||
      proof.workflowRef !== `${input.repository}/.github/workflows/regression-quality.yml@refs/heads/main` ||
      proof.reportSha256 !== createHash('sha256').update(report).digest('hex')) fail('run-provenance-invalid')
  // Resolve configuration and validate the artifact before reading the token.
  const { host, project, taskId } = await metadata(env)
  const authorization = env.SONAR_TOKEN ? 'Basic ' + Buffer.from(env.SONAR_TOKEN + ':').toString('base64') : undefined
  const get = (path, query) => requestJson(host, path, query, authorization)
  let task
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    task = (await get('/api/ce/task', { id: taskId })).task
    if (!task || task.id !== taskId || task.componentKey !== project ||
        (task.branch !== undefined && task.branch !== 'main')) fail('ce-identity-invalid')
    if (task.status === 'SUCCESS') break
    if (!['PENDING', 'IN_PROGRESS'].includes(task.status)) fail('ce-not-successful')
    if (attempt + 1 < maxAttempts) await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  if (task?.status !== 'SUCCESS') fail('ce-pending-timeout')
  if (!ID.test(task.analysisId ?? '')) fail('analysis-id-invalid')
  const analysisId = task.analysisId
  async function assertCurrentAnalysis() {
    const latest = (await get('/api/project_analyses/search', { project, branch: 'main', ps: '1' })).analyses?.[0]
    if (latest?.key !== analysisId || latest?.revision !== input.headSha) fail('main-analysis-stale')
  }
  await assertCurrentAnalysis()
  const gate = (await get('/api/qualitygates/project_status', { analysisId })).projectStatus
  if (gate?.status !== 'OK' || gate.ignoredConditions !== false || !Array.isArray(gate.conditions)) fail('quality-gate-not-ok')
  function rating(metric) {
    const conditions = gate.conditions.filter((condition) => condition.metricKey === metric)
    if (conditions.length !== 1 || conditions[0].status !== 'OK' || conditions[0].comparator !== 'GT' ||
        String(conditions[0].errorThreshold) !== '1' || String(conditions[0].actualValue) !== '1') fail('new-code-rating-not-a')
    return 1
  }
  const newSecurityRating = rating('new_security_rating')
  const newReliabilityRating = rating('new_reliability_rating')
  await assertCurrentAnalysis()
  return { projectKey: project, taskId, analysisId, branch: 'main', headSha: input.headSha,
    analysisRevision: input.headSha, runId: run.runId, runAttempt: run.runAttempt,
    ceStatus: 'SUCCESS', qualityGate: 'OK', newSecurityRating, newReliabilityRating,
    verifiedAt: new Date().toISOString() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await rm('artifacts/production-sonar-evidence.json', { force: true })
  try {
    const evidence = await verifyExactMainSonar()
    await writeFile('artifacts/production-sonar-evidence.json', JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 })
  } catch {
    console.error('Production Sonar evidence rejected; no acceptance artifact produced')
    process.exitCode = 1
  }
}
