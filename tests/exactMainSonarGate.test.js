import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'

const script = resolve('scripts/verifyExactMainSonar.mjs')
const stamp = resolve('scripts/writeSonarRunProvenance.mjs')
const sha = 'a'.repeat(40)
const repository = 'owner/repository'
async function harness(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'exact-main-sonar-'))
  const requests = []
  let analysisReads = 0
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    requests.push({ path: url.pathname, query: url.searchParams, auth: req.headers.authorization })
    if (options.redirect && url.pathname === '/api/ce/task') { res.writeHead(302, { location: options.redirect }).end(); return }
    if (options.httpError) { res.writeHead(options.httpError).end('{}'); return }
    let body
    if (url.pathname === '/api/ce/task') body = { task: { id: 'task_1', componentKey: 'project:key', branch: 'main',
      status: 'SUCCESS', analysisId: 'analysis_1', ...options.task } }
    else if (url.pathname === '/api/project_analyses/search') body = { analyses: [
      options.analyses?.[analysisReads++] ?? { key: 'analysis_1', revision: sha } ] }
    else if (url.pathname === '/api/qualitygates/project_status') body = { projectStatus: { status: 'OK', ignoredConditions: false,
      conditions: ['new_security_rating', 'new_reliability_rating'].map((metricKey) => ({ metricKey, status: 'OK', comparator: 'GT',
        errorThreshold: '1', actualValue: '1' })), ...options.gate } }
    else { res.writeHead(404).end(); return }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body))
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const host = `http://127.0.0.1:${server.address().port}`
  const report = options.report ?? `projectKey=project:key\nserverUrl=${host}\nceTaskId=task_1\n`
  await mkdir(join(directory, 'artifacts/sonar-report-task'), { recursive: true })
  await writeFile(join(directory, 'sonar-project.properties'), 'sonar.projectKey=project:key\n')
  await writeFile(join(directory, 'artifacts/sonar-report-task/report-task.txt'), report)
  await writeFile(join(directory, 'artifacts/github-gate-input.json'), JSON.stringify({ gate: 'PENDING_SONAR', branch: 'main',
    headSha: sha, repository, artifactName: 'sonar-task-777-2', regressionQuality: { runId: 777, runAttempt: 2 } }))
  await writeFile(join(directory, 'artifacts/sonar-report-task/run-provenance.json'), JSON.stringify({ schemaVersion: 1, repository,
    workflowPath: '.github/workflows/regression-quality.yml', workflowRef: `${repository}/.github/workflows/regression-quality.yml@refs/heads/main`,
    event: 'push', branch: 'main', headSha: sha, runId: 777, runAttempt: 2, scanOutcome: 'success',
    reportSha256: createHash('sha256').update(report).digest('hex'), ...options.proof }))
  // A prior acceptance artifact must disappear on every rejected CLI invocation.
  await writeFile(join(directory, 'artifacts/production-sonar-evidence.json'), '{"old":"PASS"}')
  const env = { ...process.env, SONAR_HOST_URL: options.host ?? host, SONAR_TOKEN: 'private-fixture-token', SONAR_ORGANIZATION: 'org' }
  async function run(pending = false) {
    const args = pending ? ['--input-type=module', '-e',
      `import {verifyExactMainSonar} from ${JSON.stringify(new URL('../scripts/verifyExactMainSonar.mjs', import.meta.url).href)}; await verifyExactMainSonar(process.env,{maxAttempts:1,delayMs:0});`] : [script]
    const child = spawn(process.execPath, args, { cwd: directory, env })
    let stderr = ''
    child.stderr.on('data', (data) => { stderr += data })
    const status = await new Promise((done, reject) => { child.once('error', reject); child.once('close', done) })
    assert.ok(!stderr.includes(env.SONAR_TOKEN))
    return { status, stderr }
  }
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((done) => server.close(done))
    await rm(directory, { recursive: true, force: true })
  })
  return { directory, requests, run }
}

test('actual CLI binds authenticated CE, exact gate, before/after main revision and rerun metadata', async (t) => {
  const h = await harness(t)
  assert.equal((await h.run()).status, 0)
  const evidence = JSON.parse(await readFile(join(h.directory, 'artifacts/production-sonar-evidence.json'), 'utf8'))
  assert.equal(evidence.runAttempt, 2)
  assert.equal(evidence.analysisRevision, sha)
  assert.equal(evidence.qualityGate, 'OK')
  assert.equal(h.requests.filter((r) => r.path === '/api/project_analyses/search').length, 2)
  assert.equal(h.requests.find((r) => r.path === '/api/qualitygates/project_status').query.get('analysisId'), 'analysis_1')
  assert.ok(h.requests.every((r) => r.auth === 'Basic ' + Buffer.from('private-fixture-token:').toString('base64')))
})

for (const [name, options] of [
  ['failed CE', { task: { status: 'FAILED', errorMessage: 'private upstream details' } }],
  ['canceled CE', { task: { status: 'CANCELED' } }],
  ['unknown CE', { task: { status: 'ODD' } }],
  ['foreign project', { task: { componentKey: 'foreign' } }],
  ['foreign branch', { task: { branch: 'feature' } }],
  ['wrong CE task', { task: { id: 'other_task' } }],
  ['missing analysis', { task: { analysisId: undefined } }],
  ['stale analysis before gate', { analyses: [{ key: 'old', revision: sha }] }],
  ['stale revision', { analyses: [{ key: 'analysis_1', revision: 'b'.repeat(40) }] }],
  ['analysis changed during gate read', { analyses: [{ key: 'analysis_1', revision: sha }, { key: 'new', revision: sha }] }],
  ['red gate', { gate: { status: 'ERROR' } }],
  ['ignored conditions', { gate: { ignoredConditions: true } }],
  ['missing A conditions', { gate: { conditions: [] } }],
  ['C rating', { gate: { conditions: [{ metricKey: 'new_security_rating', status: 'ERROR', comparator: 'GT', errorThreshold: '1', actualValue: '3' }] } }],
  ['weakened threshold', { gate: { conditions: [{ metricKey: 'new_security_rating', status: 'OK', comparator: 'GT', errorThreshold: '3', actualValue: '1' }] } }],
  ['old attempt artifact', { proof: { runAttempt: 1 } }],
  ['foreign run artifact', { proof: { runId: 888 } }],
  ['PR artifact', { proof: { event: 'pull_request' } }],
  ['foreign SHA artifact', { proof: { headSha: 'b'.repeat(40) } }],
  ['failed scan artifact', { proof: { scanOutcome: 'failure' } }],
  ['modified report', { proof: { reportSha256: 'bad' } }],
  ['foreign host', { report: 'projectKey=project:key\nserverUrl=http://attacker.invalid\nceTaskId=task_1\n' }],
  ['newline host', { report: 'projectKey=project:key\nserverUrl=http://attacker.invalid\nevil=value\nceTaskId=task_1\n' }],
  ['foreign artifact project', { report: 'projectKey=other\nserverUrl=http://attacker.invalid\nceTaskId=task_1\n' }],
  ['HTTP denied', { httpError: 403 }],
]) {
  test(`CLI fails closed without stale success artifact: ${name}`, async (t) => {
    const h = await harness(t, options)
    const result = await h.run()
    assert.equal(result.status, 1)
    assert.ok(!result.stderr.includes('private upstream details'))
    await assert.rejects(access(join(h.directory, 'artifacts/production-sonar-evidence.json')))
    if (options.proof || options.report) assert.equal(h.requests.length, 0, 'reject untrusted metadata before any authenticated request')
  })
}

test('pending CE exhausts bounded attempts and never becomes success', async (t) => {
  const h = await harness(t, { task: { status: 'PENDING' } })
  const result = await h.run(true)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /ce-pending-timeout/)
  assert.equal(h.requests.length, 1)
})

test('redirect cannot send Sonar token to an attacker', async (t) => {
  let received = 0
  const attacker = createServer((_req, res) => { received++; res.end('{}') })
  await new Promise((done) => attacker.listen(0, '127.0.0.1', done))
  t.after(() => new Promise((done) => attacker.close(done)))
  const h = await harness(t, { redirect: `http://127.0.0.1:${attacker.address().port}/steal` })
  assert.equal((await h.run()).status, 1)
  assert.equal(received, 0)
})

test('scanner provenance CLI publishes failed scan metadata and binds successful report to attempt', async (t) => {
  const h = await harness(t)
  const env = { ...process.env, GITHUB_RUN_ID: '777', GITHUB_RUN_ATTEMPT: '2', GITHUB_SHA: sha,
    GITHUB_REPOSITORY: repository, GITHUB_EVENT_NAME: 'push', GITHUB_REF_NAME: 'main',
    GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/regression-quality.yml@refs/heads/main`, SONAR_SCAN_OUTCOME: 'failure' }
  async function invoke() {
    const child = spawn(process.execPath, [stamp], { cwd: h.directory, env, stdio: 'ignore' })
    return new Promise((done) => child.once('close', done))
  }
  assert.equal(await invoke(), 0)
  let proof = JSON.parse(await readFile(join(h.directory, '.scannerwork/run-provenance.json'), 'utf8'))
  assert.equal(proof.scanOutcome, 'failure')
  assert.equal(proof.reportSha256, null)
  await writeFile(join(h.directory, '.scannerwork/report-task.txt'), 'exact report')
  env.SONAR_SCAN_OUTCOME = 'success'
  assert.equal(await invoke(), 0)
  proof = JSON.parse(await readFile(join(h.directory, '.scannerwork/run-provenance.json'), 'utf8'))
  assert.equal(proof.runAttempt, 2)
  assert.equal(proof.reportSha256, createHash('sha256').update('exact report').digest('hex'))
})
