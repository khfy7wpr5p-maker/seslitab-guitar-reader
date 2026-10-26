import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const runId = Number(process.env.GITHUB_RUN_ID)
const runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT)
if (!Number.isSafeInteger(runId) || runId < 1 || !Number.isSafeInteger(runAttempt) || runAttempt < 1 ||
    !/^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA ?? '')) throw new Error('Invalid scanner run provenance')
let report = null
try { report = await readFile('.scannerwork/report-task.txt') } catch (error) { if (error.code !== 'ENOENT') throw error }
await mkdir('.scannerwork', { recursive: true })
await writeFile('.scannerwork/run-provenance.json', JSON.stringify({ schemaVersion: 1,
  repository: process.env.GITHUB_REPOSITORY, workflowPath: '.github/workflows/regression-quality.yml',
  workflowRef: process.env.GITHUB_WORKFLOW_REF, event: process.env.GITHUB_EVENT_NAME,
  branch: process.env.GITHUB_REF_NAME, headSha: process.env.GITHUB_SHA, runId, runAttempt,
  scanOutcome: process.env.SONAR_SCAN_OUTCOME,
  reportSha256: report ? createHash('sha256').update(report).digest('hex') : null }), { mode: 0o600 })
