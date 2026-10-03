import { readFile, appendFile, mkdir, mkdtemp, writeFile, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const WORKFLOW_PATH = '.github/workflows/regression-quality.yml'
const ID = /^[A-Za-z0-9_-]{1,200}$/
const PROJECT = /^[A-Za-z0-9_.:-]{1,400}$/

function requireValue(value, label) {
  if (typeof value !== 'string' || !value) throw new Error(`${label} is required`)
  return value
}

// Same Server/Cloud selection as regression-quality: repository host secret
// takes precedence; otherwise a configured organization selects SonarCloud.
function configuredHost(env) {
  const raw = env.SONAR_HOST_URL || (env.SONAR_ORGANIZATION?.trim() ? 'https://sonarcloud.io' : '')
  return trustedUrl(requireValue(raw, 'Sonar host configuration'))
}

function trustedUrl(raw) {
  if (/[\s\\\x00-\x1f\x7f]/.test(raw)) throw new Error('Invalid configured host')
  let url
  try { url = new URL(raw) } catch { throw new Error('Invalid configured host') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Invalid configured host')
  }
  const host = raw.replace(/\/$/, '')
  if (host !== url.origin + url.pathname.replace(/\/$/, '')) throw new Error('Noncanonical configured host')
  return host
}

async function requestJson(host, path, query, authorization) {
  const url = new URL(host + path)
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value)
  let response
  try {
    response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000),
      headers: { authorization, accept: 'application/json' } })
  } catch { throw new Error('API request failed') }
  if (!response.ok) throw new Error(`API request rejected: HTTP ${response.status}`)
  try { return await response.json() } catch { throw new Error('Invalid API JSON response') }
}

async function verifySource(env) {
  const repository = requireValue(env.GITHUB_REPOSITORY, 'Repository')
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid repository')
  let id
  if (env.GITHUB_EVENT_NAME === 'workflow_run') id = env.WORKFLOW_RUN_ID
  else if (env.GITHUB_EVENT_NAME === 'workflow_dispatch') id = env.MANUAL_RUN_ID
  else throw new Error('Unsupported diagnostics event')
  if (!/^[1-9][0-9]{0,19}$/.test(id ?? '')) throw new Error('Invalid source run ID')
  const host = trustedUrl(env.GITHUB_API_URL || 'https://api.github.com')
  const authorization = `Bearer ${requireValue(env.GITHUB_TOKEN, 'GitHub read token')}`
  const workflow = await requestJson(host, `/repos/${repository}/actions/workflows/regression-quality.yml`, {}, authorization)
  if (workflow.path !== WORKFLOW_PATH || workflow.name !== 'Regression Quality' ||
      !/^[1-9][0-9]*$/.test(String(workflow.id))) throw new Error('Unexpected Regression Quality workflow')
  const run = await requestJson(host, `/repos/${repository}/actions/runs/${id}`, {}, authorization)
  const allowedPaths = [WORKFLOW_PATH, `${WORKFLOW_PATH}@main`, `${WORKFLOW_PATH}@refs/heads/main`]
  if (String(run.id) !== id || String(run.workflow_id) !== String(workflow.id) ||
      !allowedPaths.includes(run.path) || run.name !== workflow.name ||
      run.status !== 'completed' || run.conclusion !== 'success' || run.event !== 'push' ||
      run.head_branch !== 'main' || run.repository?.full_name !== repository || run.repository?.fork !== false ||
      run.head_repository?.full_name !== repository || run.head_repository?.fork !== false) {
    throw new Error('Source run is not a trusted successful Regression Quality main push')
  }
  await appendFile(requireValue(env.GITHUB_OUTPUT, 'GitHub output file'), `run_id=${id}\n`)
}

function parseReport(text) {
  const fields = Object.create(null)
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue
    const match = /^([A-Za-z][A-Za-z0-9]*)=([^\x00-\x1f\x7f]*)$/.exec(line)
    if (!match || Object.hasOwn(fields, match[1])) throw new Error('Malformed or duplicate task metadata')
    fields[match[1]] = match[2]
  }
  return fields
}

async function metadata(env) {
  const host = configuredHost(env)
  const properties = await readFile('sonar-project.properties', 'utf8')
  const matches = [...properties.matchAll(/^sonar\.projectKey=(.*)$/gm)]
  if (matches.length !== 1 || !PROJECT.test(matches[0][1])) throw new Error('Invalid configured project key')
  const project = matches[0][1]
  const report = parseReport(await readFile('artifacts/sonar-report-task/report-task.txt', 'utf8'))
  // Artifact URLs are never request destinations. All metadata checks finish
  // before Sonar authority is read or any authenticated Sonar request is made.
  if (report.serverUrl !== host || report.projectKey !== project || !ID.test(report.ceTaskId ?? '')) {
    throw new Error('Task metadata does not match trusted host/project or has an invalid task ID')
  }
  return { host, project, taskId: report.ceTaskId }
}

async function exportDiagnostics(env) {
  const { host, project, taskId } = await metadata(env)
  const authorization = 'Basic ' + Buffer.from(requireValue(env.SONAR_TOKEN, 'Sonar token') + ':').toString('base64')
  const get = (path, query) => requestJson(host, path, query, authorization)
  let analysisId
  for (let attempt = 0; attempt < 120; attempt++) {
    const { task } = await get('/api/ce/task', { id: taskId })
    if (task?.id !== taskId || task.componentKey !== project || (task.branch && task.branch !== 'main')) {
      throw new Error('CE task identity/project/branch mismatch')
    }
    if (task.status === 'SUCCESS') {
      if (!ID.test(task.analysisId ?? '')) throw new Error('Invalid exact analysis ID')
      analysisId = task.analysisId
      break
    }
    if (!['PENDING', 'IN_PROGRESS'].includes(task.status)) throw new Error('CE task did not succeed')
    if (attempt < 119) await new Promise((resolve) => setTimeout(resolve, 5000))
  }
  if (!analysisId) throw new Error('Exact CE task timed out')
  async function requireCurrentAnalysis() {
    const result = await get('/api/project_analyses/search', { project, branch: 'main', ps: '1' })
    if (result.analyses?.[0]?.key !== analysisId) throw new Error('Main analysis changed or exact analysis is stale')
  }
  await requireCurrentAnalysis()
  const out = 'artifacts/sonarqube-diagnostics'
  await mkdir(dirname(out), { recursive: true })
  const staging = await mkdtemp(join(dirname(out), '.sonar-export-'))
  try {
    async function issues(quality) {
      let result
      let pages = 1
      for (let page = 1; page <= pages; page++) {
        const response = await get('/api/issues/search', { componentKeys: project, branch: 'main',
          impactSoftwareQualities: quality, issueStatuses: 'OPEN,CONFIRMED,ACCEPTED,FALSE_POSITIVE',
          s: 'IMPACT_RANK', ps: '500', p: String(page) })
        const { total, pageSize } = response.paging ?? {}
        if (!Array.isArray(response.issues) || !Number.isInteger(total) || total < 0 ||
            !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500 || total > 50000) {
          throw new Error('Invalid issue page')
        }
        if (!result) {
          result = { ...response, issues: [], components: [], rules: [] }
          pages = Math.max(1, Math.ceil(total / pageSize))
        }
        if (result.paging.total !== total || result.paging.pageSize !== pageSize) throw new Error('Issue paging changed')
        result.issues.push(...response.issues)
        for (const field of ['components', 'rules']) {
          const entries = new Map(result[field].map((entry) => [entry.key, entry]))
          for (const entry of response[field] ?? []) entries.set(entry.key, entry)
          result[field] = [...entries.values()]
        }
      }
      if (result.issues.length !== result.paging.total) throw new Error('Incomplete issue export')
      const compact = { total: result.paging.total, issues: result.issues.map(({ key, rule, severity, status,
        component, line, message, impacts, creationDate, updateDate }) => ({ key, rule, severity, status,
        component, line, message, impacts, creationDate, updateDate })) }
      await writeFile(join(staging, `${quality.toLowerCase()}-issues.raw.json`), JSON.stringify(result))
      await writeFile(join(staging, `${quality.toLowerCase()}-issues.json`), JSON.stringify(compact))
      return compact
    }
    const security = await issues('SECURITY')
    const reliability = await issues('RELIABILITY')
    const gate = await get('/api/qualitygates/project_status', { analysisId })
    await writeFile(join(staging, 'quality-gate.json'), JSON.stringify(gate))
    // Issue search cannot retrieve a historical snapshot. Publish nothing unless
    // main is still at the exact CE analysis on both sides of the entire export.
    await requireCurrentAnalysis()
    await writeFile(join(staging, 'issues.json'), JSON.stringify({ generatedFrom: 'SonarQube Web API',
      branch: 'main', projectKey: project, analysisId, security, reliability }))
    await rename(staging, out)
    console.log('Exact-analysis diagnostics exported')
  } finally { await rm(staging, { recursive: true, force: true }) }
}

try {
  const command = process.argv[2]
  if (command === 'verify-source') await verifySource(process.env)
  else if (command === 'export') await exportDiagnostics(process.env)
  else throw new Error('Unsupported diagnostics command')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
