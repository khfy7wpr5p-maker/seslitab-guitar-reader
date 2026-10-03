import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const regressionWorkflow = readFileSync('.github/workflows/regression-quality.yml', 'utf8')
const diagnosticsScript = readFileSync('scripts/sonarDiagnostics.mjs', 'utf8')
const diagnosticsWorkflow = readFileSync('.github/workflows/sonarqube-diagnostics.yml', 'utf8')

test('Sonar scan publishes exact CE task metadata without short-circuiting on quality gate result', () => {
  assert.doesNotMatch(regressionWorkflow, /-Dsonar\.qualitygate\.wait=true/)
  assert.doesNotMatch(regressionWorkflow, /-Dsonar\.qualitygate\.timeout=/)
  assert.match(regressionWorkflow, /\.scannerwork\/report-task\.txt/)
  assert.match(regressionWorkflow, /name:\s*sonar-report-task/)
  assert.match(regressionWorkflow, /path: \.scannerwork\/report-task\.txt\n\s*include-hidden-files: true/)
})

test('Sonar diagnostics follows the triggering run exact CE task instead of latest project revision', () => {
  assert.match(diagnosticsWorkflow, /github\.event\.workflow_run\.id/)
  assert.match(diagnosticsWorkflow, /name:\s*sonar-report-task/)
  assert.match(diagnosticsScript, /ceTaskId/)
  assert.match(diagnosticsScript, /\/api\/ce\/task/)
  assert.match(diagnosticsScript, /qualitygates\/project_status.*analysisId/)
  assert.doesNotMatch(diagnosticsScript, /analyses.*revision/)
  assert.match(diagnosticsWorkflow, /verify-source/)
  assert.ok(diagnosticsWorkflow.indexOf('verify-source') < diagnosticsWorkflow.indexOf('uses: actions\/download-artifact'))
  assert.match(diagnosticsWorkflow, /if: success\(\) && steps\.export\.outcome == 'success'/)
})

test('Sonar diagnostics does not interpolate workflow expressions inside shell control flow', () => {
  assert.doesNotMatch(
    diagnosticsWorkflow,
    /if \[ "\$\{\{\s*github\.event_name\s*\}\}" = "workflow_run" \]; then/,
  )
  assert.match(diagnosticsScript, /env\.GITHUB_EVENT_NAME === 'workflow_run'/)
})
