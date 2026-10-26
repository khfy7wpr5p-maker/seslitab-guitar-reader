import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

const workflow = readFileSync('.github/workflows/regression-quality.yml', 'utf8')
const block = workflow.split('      - name: Report SonarCloud PR issues\n')[1].split('\n      - name: Upload failed-or-passed')[0]
const script = block.split('        run: |\n')[1].split('\n').map(line => line.slice(10)).join('\n')

test('actual failed-scan diagnostics retain ERROR/FAILED evidence and never send credentials to artifact hosts', () => {
  assert.match(block, /if: always\(\)/)
  for (const scenario of ['gate-error', 'ce-failed', 'evil-host', 'foreign-task']) {
    const directory = mkdtempSync(path.join(tmpdir(), 'gtab10c-pr-diagnostics-'))
    try {
      const bin = path.join(directory, 'bin')
      mkdirSync(bin)
      mkdirSync(path.join(directory, '.scannerwork'))
      const task = { id: 'trusted-task', componentKey: scenario === 'foreign-task' ? 'foreign-project' : 'khfy7wpr5p-maker_seslitab-guitar-reader',
        status: scenario === 'ce-failed' ? 'FAILED' : 'SUCCESS', analysisId: 'exact-analysis' }
      writeFileSync(path.join(directory, '.scannerwork/report-task.txt'), `serverUrl=${scenario === 'evil-host' ? 'https://attacker.invalid' : 'https://sonarcloud.io'}\nprojectKey=khfy7wpr5p-maker_seslitab-guitar-reader\nceTaskId=trusted-task\n`)
      const curl = path.join(bin, 'curl')
      writeFileSync(curl, `#!${process.execPath}\nimport fs from 'node:fs';\nconst args=process.argv.slice(2); const url=args.at(-1);\nfs.appendFileSync(process.env.TEST_CALLS, JSON.stringify({url,redirect:args.includes('--location')})+'\\n');\nif(!url.startsWith('https://sonarcloud.io/api/')) process.exit(91);\nconst data=url.endsWith('/issues/search')?{total:1,issues:[{rule:'proven-rule',component:'file',line:2}]}:url.endsWith('/ce/task')?{task:JSON.parse(process.env.TEST_TASK)}:{projectStatus:{status:'ERROR',conditions:[]}};\nprocess.stdout.write(JSON.stringify(data));\n`)
      chmodSync(curl, 0o755)
      const env = { ...process.env, PATH: bin + ':' + process.env.PATH, SONAR_TOKEN: 'synthetic-local-token', PR_NUMBER: '335',
        TEST_CALLS: path.join(directory, 'calls.jsonl'), TEST_TASK: JSON.stringify(task),
        GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '2', GITHUB_STEP_SUMMARY: path.join(directory, 'summary') }
      const result = spawnSync('/bin/bash', ['-c', script.replaceAll('/tmp/sonar-pr-ce-task.json', path.join(directory, 'ce-response.json'))], { cwd: directory, env, encoding: 'utf8' })
      assert.equal((result.stdout + result.stderr).includes(env.SONAR_TOKEN), false)
      const calls = readFileSync(env.TEST_CALLS, 'utf8').trim().split('\n').map(JSON.parse)
      assert.ok(calls.every(call => call.url.startsWith('https://sonarcloud.io/api/') && !call.redirect))
      const artifacts = path.join(directory, 'artifacts/sonar-pr-diagnostics')
      assert.ok(existsSync(path.join(artifacts, 'issues-current-pr-snapshot.json')))
      if (scenario === 'evil-host' || scenario === 'foreign-task') {
        assert.notEqual(result.status, 0)
        assert.equal(existsSync(path.join(artifacts, 'exact-quality-gate.json')), false)
        assert.equal(existsSync(path.join(artifacts, 'exact-ce-task.json')), false)
      } else {
        assert.equal(result.status, 0, result.stderr)
        const manifest = JSON.parse(readFileSync(path.join(artifacts, 'manifest.json')))
        assert.equal(manifest.ceStatus, task.status)
        assert.equal(manifest.gateStatus, scenario === 'gate-error' ? 'ERROR' : null)
        assert.match(manifest.issuesBinding, /not an immutable historical analysis/)
      }
    } finally { rmSync(directory, { recursive: true, force: true }) }
  }
})
