// Audiveris runtime preflight — safe, non-destructive checks for the health endpoint.
//
// Verifies that the Audiveris executable exists, is executable, and responds to
// a headless `-version` invocation, without running a full transcription.
// Exposes only safe information (no env vars, no process stderr beyond the
// version output).

import { promises as fs } from 'node:fs'
import { spawn } from 'node:child_process'
import os from 'node:os'
import { parseConfig } from '../providers/AudiverisProvider.js'
import { GATEWAY_CONFIG } from '../config/gatewayConfig.js'

const PREFLIGHT_TIMEOUT_MS = 8000
const BATCH_VERSION_TIMEOUT_MS = 30000

let cachedResult = null

function safeError(category, message) {
  const err = new Error(message)
  err.code = category
  return err
}

async function checkTempWritable() {
  const base = GATEWAY_CONFIG.tempDir || os.tmpdir()
  const dir = `${base}/seslitab_preflight_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  try {
    await fs.mkdir(dir, { recursive: true })
    const testFile = `${dir}/test.tmp`
    await fs.writeFile(testFile, 'ok')
    await fs.unlink(testFile)
    await fs.rmdir(dir)
    return true
  } catch {
    return false
  }
}

async function checkExecutable(command) {
  let exists = false
  let executable = false
  try {
    const stat = await fs.stat(command)
    exists = stat.isFile()
    executable = exists && Boolean(stat.mode & 0o111)
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { ok: false, code: 'EXECUTABLE_NOT_FOUND', exists: false, executable: false }
    }
    return { ok: false, code: 'SPAWN_ERROR', exists: false, executable: false }
  }
  if (!exists) return { ok: false, code: 'EXECUTABLE_NOT_FOUND', exists: false, executable: false }
  if (!executable) return { ok: false, code: 'EXECUTABLE_NOT_FOUND', exists: true, executable: false }
  return { ok: true, exists: true, executable: true }
}

function runBatchVersion(command, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false
    let stdout = ''
    let stderr = ''
    const child = spawn(command, ['-version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, HOME: process.env.HOME || '/var/lib/audiveris' },
    })
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        try { child.kill('SIGKILL') } catch {}
        resolve({ ok: false, code: 'TIMEOUT', stdout, stderr })
      }
    }, timeoutMs)

    child.stdout?.on('data', (d) => { stdout += d.toString() })
    child.stderr?.on('data', (d) => { stderr += d.toString() })
    child.on('error', (err) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        resolve({ ok: false, code: 'SPAWN_ERROR', stdout, stderr, error: err.message })
      }
    })
    child.on('close', (exitCode) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        if (exitCode === 0) {
          resolve({ ok: true, stdout, stderr })
        } else {
          resolve({ ok: false, code: 'RUNTIME_ERROR', exitCode, stdout, stderr })
        }
      }
    })
  })
}

async function runAudiverisPreflight(config = parseConfig()) {
  const { command, timeoutMs } = config

  if (cachedResult) return cachedResult

  if (!command) {
    return {
      available: false,
      audiverisCommand: '',
      exists: false,
      executable: false,
      versionCheck: false,
      versionOutput: '',
      error: safeError('MISSING_CONFIG', 'Audiveris komutu yapılandırılmamış.'),
    }
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return {
      available: false,
      audiverisCommand: command,
      exists: false,
      executable: false,
      versionCheck: false,
      versionOutput: '',
      error: safeError('INVALID_TIMEOUT', 'Audiveris zaman aşımı yapılandırması geçersiz.'),
    }
  }

  const execResult = await checkExecutable(command)
  if (!execResult.ok) {
    const msg = execResult.code === 'EXECUTABLE_NOT_FOUND'
      ? (execResult.exists === false
          ? `Audiveris çalıştırılabilir dosyası bulunamadı: ${command}`
          : `Audiveris dosyası mevcut ancak çalıştırılabilir değil: ${command}`)
      : execResult.code === 'SPAWN_ERROR'
        ? 'Audiveris dosya durumu kontrol edilemedi.'
        : 'Audiveris süreci başlatılamadı.'
    return {
      available: false,
      audiverisCommand: command,
      exists: execResult.exists ?? false,
      executable: execResult.executable ?? false,
      versionCheck: false,
      versionOutput: '',
      error: safeError(execResult.code, msg),
    }
  }

  const tempOk = await checkTempWritable()
  if (!tempOk) {
    return {
      available: false,
      audiverisCommand: command,
      exists: true,
      executable: true,
      versionCheck: false,
      versionOutput: '',
      error: safeError('TMP_NOT_WRITABLE', 'Geçici dizin yazılabilir değil.'),
    }
  }

  const batchTimeout = Math.min(
    Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : BATCH_VERSION_TIMEOUT_MS,
    BATCH_VERSION_TIMEOUT_MS,
  )
  const batchResult = await runBatchVersion(command, batchTimeout)
  if (!batchResult.ok) {
    const msg = batchResult.code === 'TIMEOUT'
      ? 'Audiveris -version zaman aşımına uğradı.'
      : batchResult.code === 'SPAWN_ERROR'
        ? `Audiveris süreci başlatılamadı: ${batchResult.error || ''}`
        : `Audiveris -version başarısız (çıkış kodu ${batchResult.exitCode}).`
    return {
      available: false,
      audiverisCommand: command,
      exists: true,
      executable: true,
      versionCheck: false,
      versionOutput: (batchResult.stdout || '').trim(),
      error: safeError(batchResult.code, msg),
    }
  }

  const result = {
    available: true,
    audiverisCommand: command,
    exists: true,
    executable: true,
    versionCheck: true,
    versionOutput: (batchResult.stdout || '').trim(),
  }
  cachedResult = result
  return result
}

function safePreflightResponse(result) {
  return {
    audiverisAvailable: result.available,
    audiverisCommand: result.audiverisCommand,
    exists: result.exists ?? false,
    executable: result.executable ?? false,
    versionCheck: result.versionCheck ?? false,
    versionOutput: result.versionOutput ?? '',
    error: result.available ? undefined : { code: result.error.code, message: result.error.message },
  }
}

function clearPreflightCache() {
  cachedResult = null
}

export {
  runAudiverisPreflight,
  safePreflightResponse,
  checkExecutable,
  checkTempWritable,
  runBatchVersion,
  clearPreflightCache,
}
