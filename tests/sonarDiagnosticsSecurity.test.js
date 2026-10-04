import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const script = resolve('scripts/sonarDiagnostics.mjs')
const repository = 'owner/repository'
const workflow = { id: 41, name: 'Regression Quality', path: '.github/workflows/regression-quality.yml' }
const trustedRun = () => ({ id: 123, workflow_id: 41, path: workflow.path, name: workflow.name,
  event: 'push', status: 'completed', conclusion: 'success', head_branch: 'main',
  repository: { full_name: repository, fork: false }, head_repository: { full_name: repository, fork: false } })

async function harness(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'seslitab-sonar-security-'))
  const requests = []
  let analysisReads = 0
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    requests.push({ path: url.pathname, query: url.searchParams, authorization: req.headers.authorization })
    if (options.redirect && url.pathname === '/api/ce/task') {
      res.writeHead(302, { location: options.redirect }).end(); return
    }
    if (options.ceHttp && url.pathname === '/api/ce/task') { res.writeHead(options.ceHttp).end('{}'); return }
    let body
    if (url.pathname.endsWith('/actions/workflows/regression-quality.yml')) body = options.workflow ?? workflow
    else if (url.pathname.endsWith('/actions/runs/123')) body = options.run ?? trustedRun()
    else if (url.pathname === '/api/ce/task') body = options.ceResponse ?? { task: { id: 'task_123', componentKey: 'project:key',
      status: 'SUCCESS', analysisId: 'analysis_123', ...options.task } }
    else if (url.pathname === '/api/project_analyses/search') {
      const key = options.analysisKeys?.[analysisReads++] ?? 'analysis_123'
      body = { analyses: [{ key }] }
    } else if (url.pathname === '/api/issues/search') {
      const page = url.searchParams.get('p')
      body = { paging: { total: options.paginated ? 2 : 1, pageSize: options.paginated ? 1 : 500 },
        issues: [{ key: `${url.searchParams.get('impactSoftwareQualities')}-${page}`, rule: 'rule', severity: 'MAJOR', message: 'fixture' }],
        components: [{ key: `component-${page}` }], rules: [{ key: `rule-${page}` }] }
    }
    else if (url.pathname === '/api/qualitygates/project_status') body = { projectStatus: { status: 'OK' } }
    else { res.writeHead(404).end(); return }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body))
  })
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const host = `http://127.0.0.1:${server.address().port}`
  await mkdir(join(directory, 'artifacts/sonar-report-task'), { recursive: true })
  await writeFile(join(directory, 'sonar-project.properties'), 'sonar.projectKey=project:key\n')
  await writeFile(join(directory, 'artifacts/sonar-report-task/report-task.txt'),
    options.report ?? `projectKey=project:key\nserverUrl=${host}\nceTaskId=task_123\n`)
  const env = { ...process.env, GITHUB_REPOSITORY: repository, GITHUB_API_URL: host,
    GITHUB_TOKEN: 'local-github-fixture', SONAR_TOKEN: 'local-sonar-fixture',
    SONAR_HOST_URL: options.configHost ?? host, SONAR_ORGANIZATION: 'fixture-org',
    GITHUB_EVENT_NAME: options.event ?? 'workflow_dispatch', MANUAL_RUN_ID: '123', WORKFLOW_RUN_ID: '123',
    GITHUB_OUTPUT: join(directory, 'outputs') }
  t.after(async () => {
    await new Promise((resolveClose) => { server.closeAllConnections(); server.close(resolveClose) })
    await rm(directory, { recursive: true, force: true })
  })
  async function run(command) {
    const child = spawn(process.execPath, [script, command], { cwd: directory, env })
    let stdout = '', stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    const status = await new Promise((resolveExit, reject) => {
      child.once('error', reject); child.once('exit', resolveExit)
    })
    assert.ok(!stdout.includes(env.SONAR_TOKEN) && !stderr.includes(env.SONAR_TOKEN))
    return { status, stdout, stderr }
  }
  return { directory, requests, env, host, run }
}

for (const event of ['workflow_dispatch', 'workflow_run']) {
  test(`validates the exact trusted successful push before download for ${event}`, async (t) => {
    const h = await harness(t, { event })
    const result = await h.run('verify-source')
    assert.equal(result.status, 0, result.stderr)
    assert.equal(await readFile(h.env.GITHUB_OUTPUT, 'utf8'), 'run_id=123\n')
    assert.equal(h.requests.length, 2)
  })
}

for (const [label, patch] of [
  ['fork', { head_repository: { full_name: repository, fork: true } }],
  ['PR event', { event: 'pull_request' }], ['failed run', { conclusion: 'failure' }],
  ['incomplete run', { status: 'in_progress' }], ['wrong workflow ID', { workflow_id: 42 }],
  ['wrong workflow path', { path: '.github/workflows/evil.yml' }],
  ['wrong repository', { repository: { full_name: 'attacker/repository', fork: false } }],
  ['wrong source repository', { head_repository: { full_name: 'attacker/repository', fork: false } }],
  ['non-main', { head_branch: 'feature' }],
]) {
  test(`rejects ${label} without downloading/using Sonar authority`, async (t) => {
    const h = await harness(t, { run: { ...trustedRun(), ...patch } })
    const result = await h.run('verify-source')
    assert.notEqual(result.status, 0)
    await assert.rejects(access(h.env.GITHUB_OUTPUT))
    assert.ok(h.requests.every((req) => !req.path.startsWith('/api/')))
  })
}

test('rejects a substituted workflow definition', async (t) => {
  const h = await harness(t, { workflow: { ...workflow, path: '.github/workflows/evil.yml' } })
  assert.notEqual((await h.run('verify-source')).status, 0)
})

test('accepts the configured host/project and binds export and gate to the exact CE analysis', async (t) => {
  const h = await harness(t)
  const result = await h.run('export')
  assert.equal(result.status, 0, result.stderr)
  const gate = h.requests.find((req) => req.path === '/api/qualitygates/project_status')
  assert.equal(gate.query.get('analysisId'), 'analysis_123')
  assert.equal(h.requests.filter((req) => req.path === '/api/project_analyses/search').length, 2)
  const manifest = JSON.parse(await readFile(join(h.directory, 'artifacts/sonarqube-diagnostics/issues.json')))
  assert.equal(manifest.analysisId, 'analysis_123')
  assert.equal(manifest.security.total, 1)
  assert.ok(h.requests.every((req) => req.authorization === 'Basic ' + Buffer.from('local-sonar-fixture:').toString('base64')))
})

for (const [label, report] of [
  ['foreign host', 'projectKey=project:key\nserverUrl=http://127.0.0.1:1\nceTaskId=task_123\n'],
  ['wrong project', 'projectKey=evil\nserverUrl=HOST\nceTaskId=task_123\n'],
  ['whitespace host', 'projectKey=project:key\nserverUrl=HOST \nceTaskId=task_123\n'],
  ['newline host', 'projectKey=project:key\nserverUrl=HOST\nserverUrl=http://attacker.invalid\nceTaskId=task_123\n'],
  ['task output injection', 'projectKey=project:key\nserverUrl=HOST\nceTaskId=task_123$(touch injected)\n'],
  ['project output injection', 'projectKey=project:key$(touch injected)\nserverUrl=HOST\nceTaskId=task_123\n'],
]) {
  test(`rejects ${label} before sending SONAR_TOKEN anywhere`, async (t) => {
    const h = await harness(t)
    await writeFile(join(h.directory, 'artifacts/sonar-report-task/report-task.txt'), report.replaceAll('HOST', h.host))
    assert.notEqual((await h.run('export')).status, 0)
    assert.equal(h.requests.length, 0)
    await assert.rejects(access(join(h.directory, 'artifacts/sonarqube-diagnostics')))
  })
}

for (const host of [' https://sonarcloud.io', 'https://sonarcloud.io\n', 'https://user@sonarcloud.io', 'https://sonarcloud.io?host=evil']) {
  test(`rejects malformed configured host ${JSON.stringify(host)}`, async (t) => {
    const h = await harness(t, { configHost: host })
    assert.notEqual((await h.run('export')).status, 0)
    assert.equal(h.requests.length, 0)
  })
}

for (const keys of [['older_analysis'], ['analysis_123', 'newer_analysis']]) {
  test(`rejects stale/changed main analysis (${keys.join(' → ')}) without publishing issues`, async (t) => {
    const h = await harness(t, { analysisKeys: keys })
    assert.notEqual((await h.run('export')).status, 0)
    await assert.rejects(access(join(h.directory, 'artifacts/sonarqube-diagnostics')))
    if (keys.length === 1) assert.ok(!h.requests.some((req) => req.path === '/api/issues/search'))
    else assert.ok(h.requests.some((req) => req.path === '/api/issues/search'))
  })
}

test('rejects CE task for a different project even when report metadata is trusted', async (t) => {
  const h = await harness(t, { task: { componentKey: 'other-project' } })
  assert.notEqual((await h.run('export')).status, 0)
  assert.ok(!h.requests.some((req) => req.path === '/api/issues/search'))
})


async function attackerEndpoint(t) {
  const requests = []
  const server = createServer((req, res) => {
    requests.push({ authorization: req.headers.authorization })
    res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
  })
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  t.after(() => new Promise((resolveClose) => { server.closeAllConnections(); server.close(resolveClose) }))
  return { host: `http://127.0.0.1:${server.address().port}`, requests }
}

test('forged artifact cannot send SONAR_TOKEN to a live attacker endpoint', async (t) => {
  const attacker = await attackerEndpoint(t)
  const h = await harness(t, { report: `projectKey=project:key\nserverUrl=${attacker.host}\nceTaskId=task_123\n` })
  assert.notEqual((await h.run('export')).status, 0)
  assert.equal(attacker.requests.length, 0)
  assert.equal(h.requests.length, 0)
})

test('configured server redirect cannot forward SONAR_TOKEN to an attacker', async (t) => {
  const attacker = await attackerEndpoint(t)
  const h = await harness(t, { redirect: attacker.host })
  assert.notEqual((await h.run('export')).status, 0)
  assert.equal(h.requests.length, 1)
  assert.equal(attacker.requests.length, 0)
})

test('Cloud selection does not allow artifact host override when only organization is configured', async (t) => {
  const h = await harness(t)
  h.env.SONAR_HOST_URL = ''
  const result = await h.run('export')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /does not match trusted host\/project/)
  assert.equal(h.requests.length, 0)
})

test('run ID output injection is rejected before any GitHub request or output', async (t) => {
  const h = await harness(t)
  h.env.MANUAL_RUN_ID = '123\nserver_url=http://attacker.invalid'
  assert.notEqual((await h.run('verify-source')).status, 0)
  assert.equal(h.requests.length, 0)
  await assert.rejects(access(h.env.GITHUB_OUTPUT))
})


test('collects every issue page and preserves raw component/rule evidence under the analysis guards', async (t) => {
  const h = await harness(t, { paginated: true })
  const result = await h.run('export')
  assert.equal(result.status, 0, result.stderr)
  const raw = JSON.parse(await readFile(join(h.directory, 'artifacts/sonarqube-diagnostics/security-issues.raw.json')))
  assert.equal(raw.issues.length, 2)
  assert.deepEqual(raw.components.map((entry) => entry.key), ['component-1', 'component-2'])
  assert.deepEqual(raw.rules.map((entry) => entry.key), ['rule-1', 'rule-2'])
})

for (const status of ['FAILED', 'CANCELED', 'UNRECOGNIZED', null]) {
  test(`CE ${JSON.stringify(status)} fails closed with bounded non-private evidence`, async (t) => {
    const h = await harness(t, { task: { status, errorMessage: 'private-score-name local-sonar-fixture\nIllegalStateException: internal data' } })
    const result = await h.run('export')
    assert.notEqual(result.status, 0)
    const failure = JSON.parse(await readFile(join(h.directory, 'artifacts/sonarqube-ce-failure/status.json')))
    assert.equal(failure.taskId, 'task_123')
    assert.equal(failure.status, ['FAILED', 'CANCELED'].includes(status) ? status : 'INVALID_STATUS')
    assert.equal(failure.errorMessagePresent, true)
    assert.equal(failure.errorCategory, 'IllegalStateException')
    assert.ok(!JSON.stringify(failure).includes('private-score-name'))
    assert.ok(!result.stderr.includes('private-score-name'))
    assert.ok(!h.requests.some((req) => req.path === '/api/issues/search'))
    await assert.rejects(access(join(h.directory, 'artifacts/sonarqube-diagnostics')))
  })
}

for (const [label, options, status, reason] of [
  ['missing task', { ceResponse: {} }, 'INVALID_SCHEMA', 'invalid-ce-task-schema'],
  ['wrong identity', { task: { id: 'other-task' } }, 'IDENTITY_MISMATCH', 'ce-task-project-branch-mismatch'],
  ['wrong project', { task: { componentKey: 'other-project' } }, 'IDENTITY_MISMATCH', 'ce-task-project-branch-mismatch'],
  ['missing analysis', { task: { analysisId: '' } }, 'INVALID_SCHEMA', 'invalid-exact-analysis-id'],
  ['unauthorized', { ceHttp: 401 }, 'API_ERROR', 'ce-http-401'],
  ['not found', { ceHttp: 404 }, 'API_ERROR', 'ce-http-404'],
]) {
  test(`CE ${label} is distinguished without issue publication`, async (t) => {
    const h = await harness(t, options)
    assert.notEqual((await h.run('export')).status, 0)
    const failure = JSON.parse(await readFile(join(h.directory, 'artifacts/sonarqube-ce-failure/status.json')))
    assert.equal(failure.status, status)
    assert.equal(failure.reason, reason)
    assert.equal(h.requests.length, 1)
    await assert.rejects(access(join(h.directory, 'artifacts/sonarqube-diagnostics')))
  })
}
