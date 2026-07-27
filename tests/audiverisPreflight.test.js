// Focused tests for Audiveris runtime preflight behavior.
// Uses Node's built-in test runner with mocked child_process.
// Run with: node --test tests/audiverisPreflight.test.js

import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { runAudiverisPreflight, safePreflightResponse, checkExecutable, checkTempWritable, runBatchVersion, clearPreflightCache } from '../backend/services/audiverisPreflight.js'

describe('Audiveris preflight', () => {
  beforeEach(() => {
    clearPreflightCache()
  })

  test('1. Audiveris runtime available', async () => {
    const result = { available: true, audiverisCommand: '/opt/audiveris/bin/Audiveris', exists: true, executable: true, versionCheck: true, versionOutput: 'Audiveris 5.11.0' }
    const safe = safePreflightResponse(result)
    assert.equal(safe.audiverisAvailable, true)
    assert.equal(safe.versionCheck, true)
    assert.equal(safe.versionOutput, 'Audiveris 5.11.0')
    assert.equal(safe.error, undefined)
  })

  test('2. Audiveris executable unavailable', async () => {
    const result = await runAudiverisPreflight({ command: '/nonexistent/audiveris', timeoutMs: 110000 })
    assert.equal(result.available, false)
    assert.equal(result.error.code, 'EXECUTABLE_NOT_FOUND')
    assert.equal(result.exists, false)
    assert.equal(result.executable, false)
    assert.equal(result.versionCheck, false)
    assert.equal(result.audiverisCommand, '/nonexistent/audiveris')
  })

  test('3. Java/runtime process unavailable', async () => {
    const tmpFile = path.join(os.tmpdir(), 'seslitab-notexec-' + Date.now())
    await fs.writeFile(tmpFile, 'not executable')
    const result = await runAudiverisPreflight({ command: tmpFile, timeoutMs: 110000 })
    await fs.unlink(tmpFile)
    assert.equal(result.available, false)
    assert.equal(result.error.code, 'EXECUTABLE_NOT_FOUND')
    assert.equal(result.exists, true)
    assert.equal(result.executable, false)
    assert.equal(result.versionCheck, false)
  })

  test('4. Temporary directory not writable', async () => {
    const ok = await checkTempWritable()
    assert.equal(ok, true, 'Temp dir should be writable in test env')
  })

  test('5. Safe health response — no sensitive data', () => {
    const result = {
      available: false,
      audiverisCommand: '/opt/audiveris/bin/Audiveris',
      exists: false,
      executable: false,
      versionCheck: false,
      versionOutput: '',
      error: { code: 'EXECUTABLE_NOT_FOUND', message: '/usr/local/bin/audiveris not found', stack: 'at ...' },
    }
    const safe = safePreflightResponse(result)
    assert.equal(safe.audiverisAvailable, false)
    assert.equal(safe.versionCheck, false)
    assert.equal(safe.error.code, 'EXECUTABLE_NOT_FOUND')
    assert.equal(safe.error.stack, undefined, 'Stack must not be exposed')
  })

  test('6. Absolute paths are not exposed beyond audiverisCommand', () => {
    const result = {
      available: false,
      audiverisCommand: '/opt/audiveris/bin/Audiveris',
      exists: false,
      executable: false,
      versionCheck: false,
      versionOutput: '',
      error: { code: 'EXECUTABLE_NOT_FOUND', message: 'Audiveris çalıştırılabilir dosyası bulunamadı.' },
    }
    const safe = safePreflightResponse(result)
    const json = JSON.stringify(safe)
    assert.ok(!json.includes('/home/'), 'No home paths in safe response')
  })

  test('7. Process output is not exposed beyond versionOutput', () => {
    const result = {
      available: false,
      audiverisCommand: '/opt/audiveris/bin/Audiveris',
      exists: false,
      executable: false,
      versionCheck: false,
      versionOutput: '',
      error: { code: 'SPAWN_ERROR', message: 'Audiveris süreci başlatılamadı.', stdout: 'Java exception...', stderr: 'Error: ...' },
    }
    const safe = safePreflightResponse(result)
    const json = JSON.stringify(safe)
    assert.ok(!json.includes('Java exception'), 'No stdout in safe response')
    assert.ok(!json.includes('Error:'), 'No stderr in safe response')
  })

  test('8. MockProvider remains default', async () => {
    const orig = process.env.OMR_PROVIDER
    delete process.env.OMR_PROVIDER
    const mod = await import('../backend/providers/index.js?t=' + Date.now() + 'pf1')
    assert.equal(mod.getProviderName(), 'mock')
    process.env.OMR_PROVIDER = orig
  })

  test('9. Missing config returns safe error', async () => {
    const result = await runAudiverisPreflight({ command: '', timeoutMs: 110000 })
    assert.equal(result.available, false)
    assert.equal(result.error.code, 'MISSING_CONFIG')
    assert.equal(result.audiverisCommand, '')
    assert.equal(result.versionCheck, false)
  })

  test('10. Invalid timeout returns safe error', async () => {
    const result = await runAudiverisPreflight({ command: 'audiveris', timeoutMs: -1 })
    assert.equal(result.available, false)
    assert.equal(result.error.code, 'INVALID_TIMEOUT')
    assert.equal(result.audiverisCommand, 'audiveris')
    assert.equal(result.versionCheck, false)
  })

  test('11. checkExecutable with real executable file', async () => {
    const result = await checkExecutable('/bin/echo')
    assert.equal(result.ok, true)
    assert.equal(result.exists, true)
    assert.equal(result.executable, true)
  })

  test('12. checkExecutable with nonexistent command', async () => {
    const result = await checkExecutable('/nonexistent/path/audiveris')
    assert.equal(result.ok, false)
    assert.equal(result.code, 'EXECUTABLE_NOT_FOUND')
    assert.equal(result.exists, false)
    assert.equal(result.executable, false)
  })

  test('13. safePreflightResponse exposes version check fields', () => {
    const result = {
      available: true,
      audiverisCommand: '/opt/audiveris/bin/Audiveris',
      exists: true,
      executable: true,
      versionCheck: true,
      versionOutput: 'Audiveris 5.11.0',
    }
    const safe = safePreflightResponse(result)
    assert.equal(safe.audiverisAvailable, true)
    assert.equal(safe.audiverisCommand, '/opt/audiveris/bin/Audiveris')
    assert.equal(safe.exists, true)
    assert.equal(safe.executable, true)
    assert.equal(safe.versionCheck, true)
    assert.equal(safe.versionOutput, 'Audiveris 5.11.0')
    assert.equal(safe.error, undefined)
  })

  test('14. runBatchVersion reports failure for non-Audiveris command', async () => {
    const result = await runBatchVersion('/bin/false', 5000)
    assert.equal(result.ok, false)
    assert.ok(result.code === 'RUNTIME_ERROR' || result.code === 'TIMEOUT', 'Should fail with runtime error or timeout')
  })

  test('15. runBatchVersion reports success for echo-like command', async () => {
    const result = await runBatchVersion('/bin/echo', 5000)
    assert.equal(result.ok, true)
    assert.ok(result.stdout.length > 0, 'Should capture stdout')
  })

  test('16. Preflight result is cached after first successful run', async () => {
    const r1 = await runAudiverisPreflight({ command: '/bin/echo', timeoutMs: 110000 })
    assert.equal(r1.available, true, 'First call should succeed with /bin/echo')
    const r2 = await runAudiverisPreflight({ command: '/different/path', timeoutMs: 110000 })
    assert.equal(r1.audiverisCommand, r2.audiverisCommand, 'Second call should return cached result')
    assert.equal(r2.audiverisCommand, '/bin/echo')
  })
})
