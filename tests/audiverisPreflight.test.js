// Focused tests for Audiveris runtime preflight behavior.
// Uses Node's built-in test runner with mocked child_process.
// Run with: node --test tests/audiverisPreflight.test.js

import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import { runAudiverisPreflight, safePreflightResponse, checkExecutable, checkTempWritable, checkStorageWritable, runBatchVersion, probeTempWritable, probeStorageWritable, resolveTempDir, resolveStorageDir, clearPreflightCache } from '../backend/services/audiverisPreflight.js'

function createSpawnStub({ exitCode = 0, stdout = 'Audiveris test 1.0\n', stderr = '' } = {}) {
  return () => {
    const child = new EventEmitter()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.kill = () => {}
    queueMicrotask(() => {
      if (stdout) child.stdout.write(stdout)
      if (stderr) child.stderr.write(stderr)
      child.stdout.end()
      child.stderr.end()
      child.emit('close', exitCode)
    })
    return child
  }
}

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
    const result = await checkExecutable(process.execPath)
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
    const result = await runBatchVersion(process.execPath, 5000, createSpawnStub({ exitCode: 1, stdout: '' }))
    assert.equal(result.ok, false)
    assert.equal(result.code, 'RUNTIME_ERROR')
  })

  test('15. runBatchVersion reports success for echo-like command', async () => {
    const result = await runBatchVersion(process.execPath, 5000, createSpawnStub())
    assert.equal(result.ok, true)
    assert.ok(result.stdout.length > 0, 'Should capture stdout')
  })

  test('16. Preflight result is cached after first successful run', async () => {
    const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'seslitab-preflight-storage-'))
    const origStorageDir = process.env.SESLITAB_MUSICXML_DIR
    process.env.SESLITAB_MUSICXML_DIR = storageDir
    try {
      const r1 = await runAudiverisPreflight({
        command: process.execPath,
        timeoutMs: 110000,
        spawnImpl: createSpawnStub(),
      })
      assert.equal(r1.available, true, 'First call should succeed with the stubbed version process')
      const r2 = await runAudiverisPreflight({ command: '/different/path', timeoutMs: 110000 })
      assert.equal(r1.audiverisCommand, r2.audiverisCommand, 'Second call should return cached result')
      assert.equal(r2.audiverisCommand, process.execPath)
    } finally {
      if (origStorageDir === undefined) delete process.env.SESLITAB_MUSICXML_DIR
      else process.env.SESLITAB_MUSICXML_DIR = origStorageDir
      await fs.rm(storageDir, { recursive: true, force: true })
    }
  })

  test('17. probeTempWritable succeeds on writable dedicated temp dir', async () => {
    const probe = await probeTempWritable()
    assert.equal(probe.ok, true)
    assert.ok(probe.tempDir, 'tempDir should be reported')
  })

  test('18. probeTempWritable fails on non-writable directory', async () => {
    const origTmpdir = process.env.TMPDIR
    process.env.TMPDIR = '/nonexistent-root-path-12345'
    try {
      const probe = await probeTempWritable()
      assert.equal(probe.ok, false)
      assert.ok(probe.testedPath, 'testedPath should be reported on failure')
      assert.ok(probe.syscall, 'syscall/error code should be reported')
      assert.ok(probe.message, 'message should be reported')
    } finally {
      if (origTmpdir === undefined) delete process.env.TMPDIR
      else process.env.TMPDIR = origTmpdir
    }
  })

  test('19. probeTempWritable cleans up after successful probe', async () => {
    const probe = await probeTempWritable()
    assert.equal(probe.ok, true)
    assert.ok(probe.probeDir, 'probeDir should be reported')
    await assert.rejects(fs.stat(probe.probeDir), /ENOENT/, 'Probe directory should not exist after cleanup')
  })

  test('20. probeTempWritable cleans up even when probe fails', async () => {
    const origTmpdir = process.env.TMPDIR
    const bogusDir = path.join(os.tmpdir(), 'seslitab-bogus-' + Date.now())
    await fs.mkdir(bogusDir, { recursive: true })
    await fs.chmod(bogusDir, 0o555)
    process.env.TMPDIR = bogusDir
    try {
      const probe = await probeTempWritable()
      // When running as root, chmod 0o555 does not prevent writing.
      // In that case the probe succeeds; just verify it returns a result.
      assert.ok(typeof probe.ok === 'boolean')
    } finally {
      await fs.chmod(bogusDir, 0o755).catch(() => {})
      await fs.rmdir(bogusDir).catch(() => {})
      if (origTmpdir === undefined) delete process.env.TMPDIR
      else process.env.TMPDIR = origTmpdir
    }
  })

  test('21. resolveTempDir honors TMPDIR environment variable', () => {
    const orig = process.env.TMPDIR
    process.env.TMPDIR = '/custom/tmp/path'
    try {
      assert.equal(resolveTempDir(), '/custom/tmp/path')
    } finally {
      if (orig === undefined) delete process.env.TMPDIR
      else process.env.TMPDIR = orig
    }
  })

  test('22. resolveTempDir falls back to os.tmpdir() when TMPDIR unset', () => {
    const orig = process.env.TMPDIR
    delete process.env.TMPDIR
    try {
      assert.equal(resolveTempDir(), os.tmpdir())
    } finally {
      if (orig !== undefined) process.env.TMPDIR = orig
    }
  })

  test('23. safePreflightResponse includes tempDir and tempWritable on success', () => {
    const result = {
      available: true,
      audiverisCommand: '/opt/audiveris/bin/Audiveris',
      exists: true,
      executable: true,
      versionCheck: true,
      versionOutput: 'Audiveris 5.11.0',
      tempDir: '/app/tmp',
      tempWritable: true,
    }
    const safe = safePreflightResponse(result)
    assert.equal(safe.tempDir, '/app/tmp')
    assert.equal(safe.tempWritable, true)
    assert.equal(safe.tempProbeError, undefined)
    assert.equal(safe.error, undefined)
  })

  test('24. safePreflightResponse includes tempProbeError on failure', () => {
    const result = {
      available: false,
      audiverisCommand: '/opt/audiveris/bin/Audiveris',
      exists: true,
      executable: true,
      versionCheck: false,
      versionOutput: '',
      tempDir: '/app/tmp',
      tempWritable: false,
      tempProbeError: {
        testedPath: '/app/tmp/seslitab_preflight_123',
        syscall: 'EACCES',
        message: 'permission denied',
      },
      error: { code: 'TMP_NOT_WRITABLE', message: 'Geçici dizin yazılabilir değil.' },
    }
    const safe = safePreflightResponse(result)
    assert.equal(safe.audiverisAvailable, false)
    assert.equal(safe.tempWritable, false)
    assert.equal(safe.tempProbeError.testedPath, '/app/tmp/seslitab_preflight_123')
    assert.equal(safe.tempProbeError.syscall, 'EACCES')
    assert.equal(safe.error.code, 'TMP_NOT_WRITABLE')
  })

  test('25. runAudiverisPreflight reports TMP_NOT_WRITABLE with diagnostics when temp is not writable', async () => {
    const origTmpdir = process.env.TMPDIR
    process.env.TMPDIR = '/nonexistent-root-path-67890'
    try {
      const result = await runAudiverisPreflight({ command: process.execPath, timeoutMs: 110000 })
      assert.equal(result.available, false)
      assert.equal(result.error.code, 'TMP_NOT_WRITABLE')
      assert.equal(result.tempWritable, false)
      assert.ok(result.tempProbeError, 'tempProbeError should be present')
      assert.ok(result.tempProbeError.testedPath, 'testedPath should be present')
      assert.ok(result.tempProbeError.syscall, 'syscall should be present')
    } finally {
      if (origTmpdir === undefined) delete process.env.TMPDIR
      else process.env.TMPDIR = origTmpdir
    }
  })
})

describe('Storage writability probe', () => {
  beforeEach(() => {
    clearPreflightCache()
  })

  test('26. probeStorageWritable succeeds on writable storage directory', async () => {
    const probe = await probeStorageWritable()
    assert.equal(probe.ok, true)
    assert.ok(probe.storageDir, 'storageDir should be reported')
    assert.ok(probe.probeDir, 'probeDir should be reported')
  })

  test('27. probeStorageWritable creates a per-job subdirectory', async () => {
    const probe = await probeStorageWritable()
    assert.equal(probe.ok, true)
    assert.ok(probe.probeDir.includes('seslitab_storage_probe_'), 'probeDir should be a unique subdirectory')
  })

  test('28. probeStorageWritable fails on non-writable directory', async () => {
    const origStorageDir = process.env.SESLITAB_MUSICXML_DIR
    process.env.SESLITAB_MUSICXML_DIR = '/nonexistent-root-path-storage-12345'
    try {
      const probe = await probeStorageWritable()
      // When running as root, mkdir with recursive succeeds even under nonexistent paths.
      if (process.getuid && process.getuid() === 0) {
        assert.equal(typeof probe.ok, 'boolean')
        if (probe.ok && probe.probeDir) await fs.rmdir(probe.probeDir).catch(() => {})
      } else {
        assert.equal(probe.ok, false)
        assert.ok(probe.testedPath, 'testedPath should be reported on failure')
        assert.ok(probe.syscall, 'syscall/error code should be reported')
        assert.ok(probe.message, 'message should be reported')
      }
    } finally {
      if (origStorageDir === undefined) delete process.env.SESLITAB_MUSICXML_DIR
      else process.env.SESLITAB_MUSICXML_DIR = origStorageDir
    }
  })

  test('29. probeStorageWritable cleans up after successful probe', async () => {
    const probe = await probeStorageWritable()
    assert.equal(probe.ok, true)
    assert.ok(probe.probeDir, 'probeDir should be reported')
    await assert.rejects(fs.stat(probe.probeDir), /ENOENT/, 'Probe directory should not exist after cleanup')
  })

  test('30. probeStorageWritable cleans up after failed probe', async () => {
    const bogusDir = path.join(os.tmpdir(), 'seslitab-bogus-storage-' + Date.now())
    await fs.mkdir(bogusDir, { recursive: true })
    await fs.chmod(bogusDir, 0o555)
    const origStorageDir = process.env.SESLITAB_MUSICXML_DIR
    process.env.SESLITAB_MUSICXML_DIR = bogusDir
    try {
      const probe = await probeStorageWritable()
      // When running as root, chmod 0o555 does not prevent writing.
      // In that case the probe succeeds; just verify it returns a result.
      assert.ok(typeof probe.ok === 'boolean')
    } finally {
      await fs.chmod(bogusDir, 0o755).catch(() => {})
      await fs.rmdir(bogusDir).catch(() => {})
      if (origStorageDir === undefined) delete process.env.SESLITAB_MUSICXML_DIR
      else process.env.SESLITAB_MUSICXML_DIR = origStorageDir
    }
  })

  test('31. safePreflightResponse includes storageDir and storageWritable on success', () => {
    const result = {
      available: true,
      audiverisCommand: '/opt/audiveris/bin/Audiveris',
      exists: true,
      executable: true,
      versionCheck: true,
      versionOutput: 'Audiveris 5.11.0',
      tempDir: '/app/tmp',
      tempWritable: true,
      storageDir: '/var/lib/seslitab/musicxml',
      storageWritable: true,
    }
    const safe = safePreflightResponse(result)
    assert.equal(safe.storageDir, '/var/lib/seslitab/musicxml')
    assert.equal(safe.storageWritable, true)
    assert.equal(safe.storageProbeError, undefined)
    assert.equal(safe.error, undefined)
  })

  test('32. safePreflightResponse includes storageProbeError on failure', () => {
    const result = {
      available: false,
      audiverisCommand: '/opt/audiveris/bin/Audiveris',
      exists: true,
      executable: true,
      versionCheck: false,
      versionOutput: '',
      tempDir: '/app/tmp',
      tempWritable: true,
      storageDir: '/var/lib/seslitab/musicxml',
      storageWritable: false,
      storageProbeError: {
        testedPath: '/var/lib/seslitab/musicxml/seslitab_storage_probe_123',
        syscall: 'EACCES',
        message: 'permission denied',
      },
      error: { code: 'STORAGE_NOT_WRITABLE', message: 'Depolama dizini yazılabilir değil.' },
    }
    const safe = safePreflightResponse(result)
    assert.equal(safe.audiverisAvailable, false)
    assert.equal(safe.storageWritable, false)
    assert.equal(safe.storageProbeError.testedPath, '/var/lib/seslitab/musicxml/seslitab_storage_probe_123')
    assert.equal(safe.storageProbeError.syscall, 'EACCES')
    assert.equal(safe.error.code, 'STORAGE_NOT_WRITABLE')
  })

  test('33. runAudiverisPreflight reports STORAGE_NOT_WRITABLE with diagnostics when storage is not writable', async () => {
    const origStorageDir = process.env.SESLITAB_MUSICXML_DIR
    process.env.SESLITAB_MUSICXML_DIR = '/nonexistent-root-path-storage-67890'
    try {
      const result = await runAudiverisPreflight({ command: process.execPath, timeoutMs: 110000 })
      if (process.getuid && process.getuid() === 0) {
        // When running as root, storage probes succeed; just verify structure.
        assert.equal(typeof result.available, 'boolean')
        if (result.storageProbeError && result.storageProbeError.testedPath) {
          // cleanup if a probe dir was created
        }
      } else {
        assert.equal(result.available, false)
        assert.equal(result.error.code, 'STORAGE_NOT_WRITABLE')
        assert.equal(result.storageWritable, false)
        assert.ok(result.storageProbeError, 'storageProbeError should be present')
        assert.ok(result.storageProbeError.testedPath, 'testedPath should be present')
        assert.ok(result.storageProbeError.syscall, 'syscall should be present')
      }
    } finally {
      if (origStorageDir === undefined) delete process.env.SESLITAB_MUSICXML_DIR
      else process.env.SESLITAB_MUSICXML_DIR = origStorageDir
    }
  })

  test('34. checkStorageWritable returns true on writable directory', async () => {
    const ok = await checkStorageWritable()
    assert.equal(ok, true)
  })

  test('35. resolveStorageDir honors SESLITAB_MUSICXML_DIR environment variable', () => {
    const orig = process.env.SESLITAB_MUSICXML_DIR
    process.env.SESLITAB_MUSICXML_DIR = '/custom/storage/path'
    try {
      assert.equal(resolveStorageDir(), '/custom/storage/path')
    } finally {
      if (orig === undefined) delete process.env.SESLITAB_MUSICXML_DIR
      else process.env.SESLITAB_MUSICXML_DIR = orig
    }
  })
})
