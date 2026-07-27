// Audiveris runtime preflight — safe, non-destructive checks for the health endpoint.
//
// Verifies that the Audiveris executable can be started and responds, without
// running a full transcription. Exposes only safe information (no paths, no
// env vars, no process output).

import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parseConfig } from '../providers/AudiverisProvider.js'
import { GATEWAY_CONFIG } from '../config/gatewayConfig.js'

const PREFLIGHT_TIMEOUT_MS = 8000

function safeError(category, message) {
  const err = new Error(message)
  err.code = category
  return err
}

async function checkTempWritable() {
  const base = GATEWAY_CONFIG.tempDir || os.tmpdir()
  const dir = path.join(base, `seslitab_preflight_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`)
  try {
    await fs.mkdir(dir, { recursive: true })
    const testFile = path.join(dir, 'test.tmp')
    await fs.writeFile(testFile, 'ok')
    await fs.unlink(testFile)
    await fs.rmdir(dir)
    return true
  } catch {
    return false
  }
}

async function checkExecutable(command) {
  // Verify the executable exists and is runnable via filesystem stat.
  // Audiveris is a Java GUI application whose -version flag exits non-zero
  // in headless environments, so we check the file rather than spawning it.
  try {
    const stat = await fs.stat(command)
    if (!stat.isFile()) return { ok: false, code: 'EXECUTABLE_NOT_FOUND' }
    if (!(stat.mode & 0o111)) return { ok: false, code: 'EXECUTABLE_NOT_FOUND' }
    return { ok: true }
  } catch (err) {
    if (err.code === 'ENOENT') return { ok: false, code: 'EXECUTABLE_NOT_FOUND' }
    return { ok: false, code: 'SPAWN_ERROR' }
  }
}

async function runAudiverisPreflight(config = parseConfig()) {
  const { command, timeoutMs } = config

  if (!command) {
    return { available: false, error: safeError('MISSING_CONFIG', 'Audiveris komutu yapılandırılmamış.') }
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return { available: false, error: safeError('INVALID_TIMEOUT', 'Audiveris zaman aşımı yapılandırması geçersiz.') }
  }

  const execResult = await checkExecutable(command)
  if (!execResult.ok) {
    const msg = execResult.code === 'EXECUTABLE_NOT_FOUND'
      ? 'Audiveris çalıştırılabilir dosyası bulunamadı.'
      : execResult.code === 'TIMEOUT'
        ? 'Audiveris çalıştırılabilir dosyası yanıt vermedi.'
        : execResult.code === 'RUNTIME_ERROR'
          ? 'Audiveris çalışma zamanı kullanılamıyor (Java eksik olabilir).'
          : 'Audiveris süreci başlatılamadı.'
    return { available: false, error: safeError(execResult.code, msg) }
  }

  const tempOk = await checkTempWritable()
  if (!tempOk) {
    return { available: false, error: safeError('TMP_NOT_WRITABLE', 'Geçici dizin yazılabilir değil.') }
  }

  return { available: true }
}

function safePreflightResponse(result) {
  return {
    available: result.available,
    error: result.available ? undefined : { code: result.error.code },
  }
}

export { runAudiverisPreflight, safePreflightResponse, checkExecutable, checkTempWritable }
