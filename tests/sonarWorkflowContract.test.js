import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const regressionWorkflow = readFileSync('.github/workflows/regression-quality.yml', 'utf8')
const diagnosticsWorkflow = readFileSync('.github/workflows/sonarqube-diagnostics.yml', 'utf8')

test('Sonar scan waits for server processing and publishes exact CE task metadata', () => {
  assert.match(regressionWorkflow, /-Dsonar\.qualitygate\.wait=true/)
  assert.match(regressionWorkflow, /-Dsonar\.qualitygate\.timeout=600/)
  assert.match(regressionWorkflow, /\.scannerwork\/report-task\.txt/)
  assert.match(regressionWorkflow, /name:\s*sonar-report-task/)
})

test('Sonar diagnostics follows the triggering run exact CE task instead of latest project revision', () => {
  assert.match(diagnosticsWorkflow, /github\.event\.workflow_run\.id/)
  assert.match(diagnosticsWorkflow, /name:\s*sonar-report-task/)
  assert.match(diagnosticsWorkflow, /ceTaskId/)
  assert.match(diagnosticsWorkflow, /\/api\/ce\/task/)
  assert.doesNotMatch(diagnosticsWorkflow, /\/api\/project_analyses\/search/)
  assert.doesNotMatch(diagnosticsWorkflow, /\.analyses\[0\]\.revision/)
})
