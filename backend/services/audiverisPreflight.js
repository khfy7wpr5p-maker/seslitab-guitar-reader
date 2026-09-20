// Audiveris runtime preflight — safe, non-destructive checks for the health endpoint.
//
// Verifies that the Audiveris executable exists, is executable, and responds to
// a headless `-version` invocation, without running a full transcription.
// Exposes only safe information (no env vars, no process stderr beyond the
// version output).

import { promises as fs } from 'node:fs'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
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

function resolveTempDir() {
  const env = process.env.TMPDIR
  if (env && env.trim()) return env.trim()
  const cfg = GATEWAY_CONFIG.tempDir
  if (cfg && cfg.trim()) return cfg.trim()
  return os.tmpdir()
}

async function probeTempWritable() {
  const base = resolveTempDir()
  const stamp = `${Date.now()}_${randomBytes(3).toString('hex')}`
  const dir = path.join(base, `seslitab_preflight_${stamp}`)
  let created = false
  const testFile = path.join(dir, 'probe.tmp')
  try {
    await fs.mkdir(dir, { recursive: true })
    created = true
    const payload = `seslitab-probe-${stamp}`
    await fs.writeFile(testFile, payload, { mode: 0o600 })
    const readBack = await fs.readFile(testFile, 'utf8')
    if (readBack !== payload) {
      throw Object.assign(new Error('Yazılan veri geri okunamadı.'), { code: 'ECONTENT' })
    }
    const stat = await fs.stat(testFile)
    if (!stat.isFile() || stat.size !== Buffer.byteLength(payload)) {
      throw Object.assign(new Error('Geçici dosya boyutu uyuşmuyor.'), { code: 'ESIZE' })
    }
    return { ok: true, tempDir: base, probeDir: dir }
  } catch (err) {
    return {
      ok: false,
      tempDir: base,
      testedPath: dir,
      syscall: err.code || err.syscall || 'UNKNOWN',
      message: err.message || 'Geçici dizin yazılabilir değil.',
    }
  } finally {
    if (created) {
      try { await fs.unlink(testFile).catch(() => {}) } catch {}
      try { await fs.rmdir(dir).catch(() => {}) } catch {}
    }
  }
}

function resolveStorageDir() {
  const env = process.env.SESLITAB_MUSICXML_DIR
  if (env && env.trim()) return env.trim()
  const cfg = GATEWAY_CONFIG.storagePath
  if (cfg && cfg.trim()) return cfg.trim()
  return ''
}

async function probeStorageWritable() {
  const base = resolveStorageDir()
  if (!base) {
    return { ok: false, storageDir: '', testedPath: '', syscall: 'ENOCONFIG', message: 'Storage dizini yapılandırılmamış.' }
  }
  const stamp = `${Date.now()}_${randomBytes(3).toString('hex')}`
  const dir = path.join(base, `seslitab_storage_probe_${stamp}`)
  let created = false
  const testFile = path.join(dir, 'probe.tmp')
  try {
    await fs.mkdir(base, { recursive: true })
    await fs.mkdir(dir, { recursive: true })
    created = true
    const payload = `seslitab-storage-probe-${stamp}`
    await fs.writeFile(testFile, payload, { mode: 0o600 })
    const readBack = await fs.readFile(testFile, 'utf8')
    if (readBack !== payload) {
      throw Object.assign(new Error('Yazılan depolama verisi geri okunamadı.'), { code: 'ECONTENT' })
    }
    const stat = await fs.stat(testFile)
    if (!stat.isFile() || stat.size !== Buffer.byteLength(payload)) {
      throw Object.assign(new Error('Depolama dosyası boyutu uyuşmuyor.'), { code: 'ESIZE' })
    }
    return { ok: true, storageDir: base, probeDir: dir }
  } catch (err) {
    return {
      ok: false,
      storageDir: base,
      testedPath: dir,
      syscall: err.code || err.syscall || 'UNKNOWN',
      message: err.message || 'Depolama dizini yazılabilir değil.',
    }
  } finally {
    if (created) {
      try { await fs.unlink(testFile).catch(() => {}) } catch {}
      try { await fs.rmdir(dir).catch(() => {}) } catch {}
    }
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

function runBatchVersion(command, timeoutMs, spawnImpl = spawn) {
  return new Promise((resolve) => {
    let settled = false
    let stdout = ''
    let stderr = ''
    const child = spawnImpl(command, ['-version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        HOME: process.env.HOME || '/var/lib/audiveris',
        TMPDIR: process.env.TMPDIR || os.tmpdir(),
      },
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
  const { command, timeoutMs, spawnImpl = spawn } = config

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

  const tempProbe = await probeTempWritable()
  if (!tempProbe.ok) {
    return {
      available: false,
      audiverisCommand: command,
      exists: true,
      executable: true,
      versionCheck: false,
      versionOutput: '',
      tempDir: tempProbe.tempDir,
      tempWritable: false,
      tempProbeError: {
        testedPath: tempProbe.testedPath,
        syscall: tempProbe.syscall,
        message: tempProbe.message,
      },
      error: safeError('TMP_NOT_WRITABLE', 'Geçici dizin yazılabilir değil.'),
    }
  }

  const storageProbe = await probeStorageWritable()
  if (!storageProbe.ok) {
    return {
      available: false,
      audiverisCommand: command,
      exists: true,
      executable: true,
      versionCheck: false,
      versionOutput: '',
      tempDir: tempProbe.tempDir,
      tempWritable: true,
      storageDir: storageProbe.storageDir,
      storageWritable: false,
      storageProbeError: {
        testedPath: storageProbe.testedPath,
        syscall: storageProbe.syscall,
        message: storageProbe.message,
      },
      error: safeError('STORAGE_NOT_WRITABLE', 'Depolama dizini yazılabilir değil.'),
    }
  }

  const batchTimeout = Math.min(
    Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : BATCH_VERSION_TIMEOUT_MS,
    BATCH_VERSION_TIMEOUT_MS,
  )
  const batchResult = await runBatchVersion(command, batchTimeout, spawnImpl)
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
      tempDir: tempProbe.tempDir,
      tempWritable: true,
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
    tempDir: tempProbe.tempDir,
    tempWritable: true,
    storageDir: storageProbe.storageDir,
    storageWritable: true,
  }
  cachedResult = result
  return result
}

function safePreflightResponse(result) {
  // The full preflight result is useful for server-side diagnostics,
  // but command paths, directories, process output and detailed error
  // messages must never cross the public health-response boundary.
  const response = {
    audiverisAvailable: result.available === true,
    versionCheck: result.versionCheck === true,
    tempWritable: result.tempWritable === true,
    storageWritable: result.storageWritable === true,
  }

  if (!result.available) {
    response.error = {
      code: result.error?.code || 'RUNTIME_UNAVAILABLE',
    }
  }

  return response
}

function clearPreflightCache() {
  cachedResult = null
}

async function checkTempWritable() {
  const probe = await probeTempWritable()
  return probe.ok
}

async function checkStorageWritable() {
  const probe = await probeStorageWritable()
  return probe.ok
}

export {
  runAudiverisPreflight,
  safePreflightResponse,
  checkExecutable,
  checkTempWritable,
  checkStorageWritable,
  probeTempWritable,
  probeStorageWritable,
  resolveTempDir,
  resolveStorageDir,
  runBatchVersion,
  clearPreflightCache,
}
