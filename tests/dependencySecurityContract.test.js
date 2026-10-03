import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
)
const packageLock = JSON.parse(
  readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'),
)
const workflow = readFileSync(
  new URL('../.github/workflows/dependency-security.yml', import.meta.url),
  'utf8',
)
const qualification = readFileSync(
  new URL('../docs/dependency-security-qualification.md', import.meta.url),
  'utf8',
)

test('TD-PROD-15 pins the qualified direct and transitive security versions', () => {
  assert.equal(packageJson.dependencies.multer, '2.4.0')
  assert.equal(packageJson.devDependencies['firebase-tools'], '15.32.0')
  assert.equal(packageJson.overrides?.['@grpc/grpc-js'], '^1.13.6')

  assert.equal(packageLock.packages[''].dependencies.multer, '2.4.0')
  assert.equal(
    packageLock.packages[''].devDependencies['firebase-tools'],
    '15.32.0',
  )
  assert.equal(packageLock.packages['node_modules/multer'].version, '2.4.0')
  assert.equal(
    packageLock.packages['node_modules/firebase-tools'].version,
    '15.32.0',
  )

  const grpcEntries = Object.entries(packageLock.packages)
    .filter(([path]) => path.endsWith('node_modules/@grpc/grpc-js'))

  assert.ok(grpcEntries.length > 0)
  for (const [path, entry] of grpcEntries) {
    const [major, minor, patch] = entry.version
      .split('.')
      .map(value => Number.parseInt(value, 10))
    const isQualified =
      major === 1 &&
      (minor > 13 || (minor === 13 && patch >= 6))

    assert.equal(
      isQualified,
      true,
      `${path} must stay at or above the qualified 1.13.6 security floor within major 1`,
    )
  }
})

test('TD-PROD-15 dependency workflow is read-only and fail-closed', () => {
  assert.match(workflow, /name:\s*Dependency Security/)
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/)
  assert.doesNotMatch(workflow, /contents:\s*write/)
  assert.doesNotMatch(workflow, /git push/)
  assert.doesNotMatch(workflow, /npm audit fix/)
  assert.doesNotMatch(workflow, /--force/)

  assert.match(
    workflow,
    /npm audit --omit=dev --json/,
  )
  assert.match(workflow, /npm audit --json/)
  assert.match(workflow, /dependency-audit-command-failed/)
  assert.match(workflow, /dependency-vulnerability-detected/)
  assert.match(workflow, /invalid-dependency-audit-report/)
  assert.doesNotMatch(workflow, /approvedModerate|allowlist|--audit-level=high/)
  assert.match(workflow, /td-prod-15-npm-audit/)
})

test('TD-PROD-15 preserves historical qualification evidence and documents the zero-finding follow-up', () => {
  assert.match(qualification, /10 moderate, 6 high/)
  assert.match(qualification, /production graph: 2 moderate, 0 high, 0 critical/)
  assert.match(qualification, /full graph: 5 moderate, 0 high, 0 critical/)
  assert.match(qualification, /firebase-admin → optional @google-cloud\/storage/i)
  assert.match(qualification, /no Storage API usage/i)
  assert.match(qualification, /no semver-major transitive override/i)
  assert.match(qualification, /full and production.*0 vulnerabilities/i)
})


function runAuditGate(report, commandStatus = '0') {
  const directory = mkdtempSync(join(tmpdir(), 'seslitab-audit-gate-'))
  try {
    mkdirSync(join(directory, 'artifacts'))
    for (const name of ['production', 'full']) {
      writeFileSync(join(directory, `artifacts/npm-audit-${name}.json`), JSON.stringify(report))
    }
    const code = workflow.match(/node - <<'NODE'\n([\s\S]*?)\n\s*NODE/)[1]
    return spawnSync(process.execPath, ['-'], {
      input: code, cwd: directory, encoding: 'utf8',
      env: { ...process.env, PRODUCTION_STATUS: commandStatus, FULL_STATUS: commandStatus },
    })
  } finally { rmSync(directory, { recursive: true, force: true }) }
}

const cleanAudit = () => ({ metadata: { vulnerabilities: {
  info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0,
} }, vulnerabilities: {} })

test('SES-172 audit gate accepts only complete zero-finding reports and successful audit commands', () => {
  assert.equal(runAuditGate(cleanAudit()).status, 0)
  assert.notEqual(runAuditGate(cleanAudit(), '1').status, 0)
  assert.notEqual(runAuditGate({ error: { code: 'E403' } }).status, 0)
  assert.notEqual(runAuditGate({ vulnerabilities: {} }).status, 0)
  assert.notEqual(runAuditGate({ ...cleanAudit(), vulnerabilities: [] }).status, 0)
})

for (const severity of ['info', 'low', 'moderate', 'high', 'critical']) {
  test(`SES-172 audit gate rejects ${severity} findings, including formerly allowlisted packages`, () => {
    const report = cleanAudit()
    report.metadata.vulnerabilities[severity] = 1
    report.metadata.vulnerabilities.total = 1
    report.vulnerabilities.uuid = { severity }
    assert.notEqual(runAuditGate(report).status, 0)
  })
}

test('SES-172 audit gate rejects inconsistent summary and inventory', () => {
  const report = cleanAudit()
  report.vulnerabilities.uuid = { severity: 'moderate' }
  assert.notEqual(runAuditGate(report).status, 0)
})
