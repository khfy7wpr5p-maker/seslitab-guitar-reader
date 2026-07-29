// AudiverisProvider — server-side command-line adapter for the Audiveris OMR engine.
//
// Implements the existing IOmrProvider interface. Spawns the Audiveris
// executable as a child process (no shell), reads the generated MusicXML
// (plain or compressed .mxl), validates it, and returns it through the
// standard provider result contract.
//
// This provider is server-side only. No secrets, paths, or process output
// are exposed to the frontend.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import JSZip from 'jszip'
import { assertProvider } from './IOmrProvider.js'
import { validateMusicXml } from './HttpOmrProvider.js'
import { GATEWAY_CONFIG } from '../config/gatewayConfig.js'

const MAX_STDOUT = 512 * 1024
const MAX_STDERR = 256 * 1024
const MAX_UNCOMPRESSED_XML = 10 * 1024 * 1024
const GRACEFUL_KILL_DELAY = 5000
const VALID_EXTENSIONS = ['.mxl', '.musicxml', '.xml']

function parseConfig(env = process.env) {
  const command = (env.AUDIVERIS_COMMAND || 'audiveris').trim()
  const timeoutMs = parseTimeout(env.AUDIVERIS_TIMEOUT_MS)
  const extraArgs = parseExtraArgs(env.AUDIVERIS_EXTRA_ARGS)
  return { command, timeoutMs, extraArgs }
}

function parseTimeout(raw) {
  const DEFAULT = 110000
  if (!raw && raw !== 0) return DEFAULT
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT
  return Math.min(n, 600000)
}

function parseExtraArgs(raw) {
  if (!raw || typeof raw !== 'string') return []
  return raw
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function safeError(category, message) {
  const err = new Error(message)
  err.code = category
  return err
}

function safeFileName(fileName) {
  const base = path.basename(fileName || 'input.pdf')
  return base.replace(/[^a-zA-Z0-9._-]/g, '_') || 'input.pdf'
}

async function makeTempDir(prefix) {
  const base = GATEWAY_CONFIG.tempDir || os.tmpdir()
  const dir = path.join(base, `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

async function cleanDir(dir) {
  if (!dir) return
  try { await fs.rm(dir, { recursive: true, force: true }) }
  catch { /* best-effort */ }
}

function isPathSafe(entryName) {
  if (entryName.includes('..')) return false
  const resolved = path.normalize(entryName).replace(/\\/g, '/')
  if (resolved.startsWith('../') || resolved.includes('/../') || resolved.startsWith('/')) return false
  return true
}

async function extractMxl(buffer) {
  let zip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw safeError('INVALID_MXL', 'Geçersiz .mxl arşivi.')
  }

  const entries = Object.keys(zip.files)
  const safeEntries = entries.filter((n) => isPathSafe(n) && !zip.files[n].dir)
  if (safeEntries.length === 0) throw safeError('INVALID_MXL', '.mxl arşivi boş veya geçersiz.')

  // Try META-INF/container.xml first
  const containerPath = safeEntries.find((n) => n.toUpperCase() === 'META-INF/CONTAINER.XML')
  let rootFile = null

  if (containerPath) {
    try {
      const containerXml = await zip.files[containerPath].async('string')
      const match = containerXml.match(/<rootfile[^>]*full-path="([^"]+)"/i)
      if (match) {
        const candidate = match[1]
        if (isPathSafe(candidate) && zip.files[candidate]) rootFile = candidate
      }
    } catch { /* fall through to candidate detection */ }
  }

  if (!rootFile) {
    const candidates = safeEntries.filter((n) => {
      const ext = path.extname(n).toLowerCase()
      return ext === '.xml' || ext === '.musicxml'
    })
    if (candidates.length === 0) throw safeError('INVALID_MXL', '.mxl arşivinde MusicXML dosyası bulunamadı.')
    if (candidates.length > 1) throw safeError('AMBIGUOUS_MXL', '.mxl arşivinde birden fazla MusicXML adayı var.')
    rootFile = candidates[0]
  }

  const content = await zip.files[rootFile].async('string')
  if (!content || !content.trim()) throw safeError('EMPTY_MXL', '.mxl içindeki MusicXML boş.')
  if (Buffer.byteLength(content) > MAX_UNCOMPRESSED_XML) throw safeError('OVERSIZED_XML', '.mxl içindeki MusicXML çok büyük.')

  return content
}

async function findOutputFile(outputDir) {
  let files
  try {
    files = await fs.readdir(outputDir)
  } catch (e) {
    if (e.code === 'ENOENT') return null
    throw safeError('TMP_IO_ERROR', 'Çıktı dizini okunamadı.')
  }

  const candidates = []
  for (const f of files) {
    const ext = path.extname(f).toLowerCase()
    if (VALID_EXTENSIONS.includes(ext)) {
      const stat = await fs.stat(path.join(outputDir, f)).catch(() => null)
      if (stat && stat.isFile() && stat.size > 0) candidates.push({ name: f, ext, size: stat.size })
    }
  }

  if (candidates.length === 0) return null
  if (candidates.length > 1) {
    const distinctExts = new Set(candidates.map((c) => c.ext))
    if (distinctExts.size > 1) throw safeError('AMBIGUOUS_OUTPUT', 'Birden fazla belirsiz çıktı dosyası üretildi.')
  }

  candidates.sort((a, b) => b.size - a.size)
  return candidates[0]
}

async function findOmrFile(outputDir) {
  let files
  try {
    files = await fs.readdir(outputDir)
  } catch (e) {
    if (e.code === 'ENOENT') return null
    return null
  }
  for (const f of files) {
    if (path.extname(f).toLowerCase() === '.omr') {
      const stat = await fs.stat(path.join(outputDir, f)).catch(() => null)
      if (stat && stat.isFile() && stat.size > 0) return { name: f, size: stat.size }
    }
  }
  return null
}

async function readOutputFile(outputDir, file) {
  const filePath = path.join(outputDir, file.name)
  if (file.ext === '.mxl') {
    const buf = await fs.readFile(filePath)
    if (buf.length === 0) throw safeError('EMPTY_OUTPUT', 'Çıktı dosyası boş.')
    if (buf.length > MAX_UNCOMPRESSED_XML) throw safeError('OVERSIZED_XML', 'Çıktı dosyası çok büyük.')
    return extractMxl(buf)
  }

  const content = await fs.readFile(filePath, 'utf8')
  if (Buffer.byteLength(content) > MAX_UNCOMPRESSED_XML) throw safeError('OVERSIZED_XML', 'Çıktı dosyası çok büyük.')
  return content
}

function runAudiveris(command, args, timeoutMs, abortSignal) {
  return new Promise((resolve, reject) => {
    // AbortSignal does not replay an abort event to listeners that are added
    // after it has already been aborted. Avoid starting Audiveris in that
    // state, otherwise callers can wait until the full timeout expires.
    if (abortSignal?.aborted) {
      reject(safeError('CANCELED', 'İşlem iptal edildi.'))
      return
    }

    let child
    let settled = false
    let timedOut = false
    let timeoutHandle = null

    const stdoutChunks = []
    let stdoutLen = 0
    const stderrChunks = []
    let stderrLen = 0

    function settle(ok, result) {
      if (settled) return
      settled = true
      if (timeoutHandle) clearTimeout(timeoutHandle)
      if (abortSignal) abortSignal.removeEventListener('abort', onAbort)
      if (child) {
        child.removeAllListeners()
        if (!child.killed && child.exitCode === null) {
          try { child.kill('SIGKILL') } catch { /* best-effort */ }
        }
      }
      ok ? resolve(result) : reject(result)
    }

    function onAbort() {
      if (settled) return
      timedOut = false
      if (child && !child.killed) {
        try { child.kill('SIGTERM') } catch { /* best-effort */ }
        setTimeout(() => {
          if (child && !child.killed && child.exitCode === null) {
            try { child.kill('SIGKILL') } catch { /* best-effort */ }
          }
        }, GRACEFUL_KILL_DELAY)
      }
      settle(false, safeError('CANCELED', 'İşlem iptal edildi.'))
    }

    try {
      child = spawn(command, args, { shell: false })
    } catch (e) {
      settle(false, safeError('SPAWN_ERROR', 'Audiveris süreci başlatılamadı.'))
      return
    }

    child.on('error', (err) => {
      if (settled) return
      if (err.code === 'ENOENT') settle(false, safeError('EXECUTABLE_NOT_FOUND', 'Audiveris çalıştırılabilir dosyası bulunamadı.'))
      else settle(false, safeError('SPAWN_ERROR', 'Audiveris süreci başlatılamadı.'))
    })

    child.stdout.on('data', (chunk) => {
      if (stdoutLen < MAX_STDOUT) { stdoutChunks.push(chunk); stdoutLen += chunk.length }
    })
    child.stderr.on('data', (chunk) => {
      if (stderrLen < MAX_STDERR) { stderrChunks.push(chunk); stderrLen += chunk.length }
    })

    child.on('close', (code) => {
      if (settled) return
      if (timedOut) { settle(false, safeError('TIMEOUT', 'Audiveris işlemi zaman aşımına uğradı.')); return }
      if (code !== 0) {
        settle(false, safeError('NONZERO_EXIT', 'Audiveris işlemi başarısız oldu.'))
        return
      }
      resolve({ stdout: Buffer.concat(stdoutChunks).toString('utf8'), stderr: Buffer.concat(stderrChunks).toString('utf8') })
    })

    if (timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        if (settled) return
        timedOut = true
        if (child && !child.killed) {
          try { child.kill('SIGTERM') } catch { /* best-effort */ }
          setTimeout(() => {
            if (child && !child.killed && child.exitCode === null) {
              try { child.kill('SIGKILL') } catch { /* best-effort */ }
            }
          }, GRACEFUL_KILL_DELAY)
        }
      }, timeoutMs)
    }

    if (abortSignal) abortSignal.addEventListener('abort', onAbort)
  })
}

function mapSpawnError(err) {
  if (err.code === 'NONZERO_EXIT') return safeError('NONZERO_EXIT', 'Audiveris işlemi başarısız oldu.')
  if (err.code === 'EXECUTABLE_NOT_FOUND' || err.code === 'ENOENT') return safeError('EXECUTABLE_NOT_FOUND', 'Audiveris çalıştırılabilir dosyası bulunamadı.')
  if (err.code === 'TIMEOUT') return safeError('TIMEOUT', 'Audiveris işlemi zaman aşımına uğradı.')
  if (err.code === 'CANCELED') return safeError('CANCELED', 'İşlem iptal edildi.')
  return safeError('SPAWN_ERROR', 'Audiveris süreci başlatılamadı.')
}

async function spawnWithTimeout(spawnFn, command, args, timeoutMs, abortController, job) {
  // Cancellation can happen while the temporary input/output files are being
  // prepared. In that case the signal is already aborted before spawnFn gets
  // a chance to register its listener, so stop before launching the process.
  if (job.canceled || abortController.signal.aborted) {
    throw safeError('CANCELED', 'İşlem iptal edildi.')
  }

  let timedOut = false
  const timeoutHandle = setTimeout(() => { timedOut = true; abortController.abort() }, timeoutMs)

  try {
    return await spawnFn(command, args, timeoutMs, abortController.signal)
  } catch (err) {
    if (timedOut) throw safeError('TIMEOUT', 'Audiveris işlemi zaman aşımına uğradı.')
    if (job.canceled || (abortController.signal.aborted && !timedOut)) throw safeError('CANCELED', 'İşlem iptal edildi.')
    throw err
  } finally {
    clearTimeout(timeoutHandle)
  }
}

function createAudiverisProvider(config = parseConfig(), deps = {}) {
  const { command, timeoutMs, extraArgs } = config
  const spawnFn = deps.spawn || runAudiveris
  const jobs = new Map()
  let counter = 0

  const provider = {
    async uploadPdf(pdfBuffer, fileName) {
      if (!pdfBuffer?.length) return { success: false, error: 'PDF boş.', retryable: false }
      if (!command) return { success: false, error: safeError('MISSING_CONFIG', 'Audiveris komutu yapılandırılmamış.'), retryable: false }
      const id = `audiveris_${Date.now()}_${++counter}`
      jobs.set(id, { status: 'uploaded', progress: 0, musicXml: null, fileName: safeFileName(fileName), pdfBuffer, canceled: false, abortController: null, tempDir: null })
      return { success: true, providerJobId: id, status: 'uploaded' }
    },

    async analyzePdf(id) {
      const j = jobs.get(id)
      if (!j) return { success: false, error: 'İş bulunamadı.', retryable: false }
      if (j.canceled) return { success: false, error: safeError('CANCELED', 'İşlem iptal edildi.'), retryable: false }

      j.status = 'processing'
      j.progress = 10

      const abortController = new AbortController()
      j.abortController = abortController

      let tempDir = null
      try {
        tempDir = await makeTempDir('seslitab_audiveris')
        j.tempDir = tempDir

        const inputPath = path.join(tempDir, j.fileName)
        const outputDir = path.join(tempDir, 'output')
        await fs.mkdir(outputDir, { recursive: true })
        await fs.writeFile(inputPath, j.pdfBuffer)

        const args = ['-batch', '-transcribe', '-export', '-save', '-output', outputDir, '--', inputPath, ...extraArgs]

        let result
        try {
          result = await spawnWithTimeout(spawnFn, command, args, timeoutMs, abortController, j)
        } catch (err) {
          if (j.canceled) {
            j.status = 'failed'
            return { success: false, error: safeError('CANCELED', 'İşlem iptal edildi.'), retryable: false }
          }
          if (err.code === 'TIMEOUT') {
            j.status = 'failed'
            return { success: false, error: safeError('TIMEOUT', 'Audiveris işlemi zaman aşımına uğradı.'), retryable: false }
          }
          j.status = 'failed'
          return { success: false, error: mapSpawnError(err), retryable: err.code === 'NONZERO_EXIT' }
        }

        if (j.canceled) {
          j.status = 'failed'
          return { success: false, error: safeError('CANCELED', 'İşlem iptal edildi.'), retryable: false }
        }

        let outputFile
        try {
          outputFile = await findOutputFile(outputDir)
        } catch (findErr) {
          j.status = 'failed'
          return { success: false, error: findErr, retryable: false }
        }

        if (!outputFile) {
          j.status = 'failed'
          return { success: false, error: safeError('NO_OUTPUT', 'Audiveris çıktı dosyası üretmedi.'), retryable: false }
        }

        let xml
        try {
          xml = await readOutputFile(outputDir, outputFile)
        } catch (readErr) {
          j.status = 'failed'
          return { success: false, error: readErr, retryable: false }
        }

        const validation = validateMusicXml(xml)
        if (!validation.ok) {
          j.status = 'failed'
          return { success: false, error: validation.error, retryable: false }
        }

        j.musicXml = xml

        // Preserve the Audiveris .omr project file for diagnostics.
        const omrFile = await findOmrFile(outputDir)
        if (omrFile) {
          j.omrBuffer = await fs.readFile(path.join(outputDir, omrFile.name))
          j.omrFileName = omrFile.name
          console.log(`[AudiverisProvider] .omr artifact found: ${omrFile.name} (${j.omrBuffer.length} bytes) | MusicXML: ${Buffer.byteLength(xml)} bytes | exit: 0 | stdout: ${result.stdout.length} bytes | stderr: ${result.stderr.length} bytes`)
        } else {
          console.log(`[AudiverisProvider] No .omr artifact found in ${outputDir} | MusicXML: ${Buffer.byteLength(xml)} bytes | exit: 0 | stdout: ${result.stdout.length} bytes | stderr: ${result.stderr.length} bytes`)
        }

        j.status = 'completed'
        j.progress = 100
        return { success: true, providerJobId: id, status: 'completed', progress: 100, omrFileName: j.omrFileName || null }
      } catch (err) {
        j.status = 'failed'
        const code = err.code || 'TMP_IO_ERROR'
        return { success: false, error: safeError(code, err.message || 'Geçici dosya işlemi başarısız.'), retryable: false }
      } finally {
        if (tempDir) await cleanDir(tempDir)
        j.pdfBuffer = null
      }
    },

    async getStatus(id) {
      const j = jobs.get(id)
      if (!j) return { success: false, error: 'İş bulunamadı.', retryable: false }
      return { success: true, providerJobId: id, status: j.status, progress: j.progress }
    },

    async downloadMusicXML(id) {
      const j = jobs.get(id)
      if (!j || !j.musicXml) return { success: false, error: 'MusicXML hazır değil.', retryable: false }
      return { success: true, providerJobId: id, status: 'completed', musicXml: j.musicXml }
    },

    async downloadOmrArtifact(id) {
      const j = jobs.get(id)
      if (!j || !j.omrBuffer) return { success: false, error: '.omr dosyası hazır değil.', retryable: false }
      return { success: true, providerJobId: id, status: 'completed', omrBuffer: j.omrBuffer, omrFileName: j.omrFileName }
    },

    async cancelJob(id) {
      const j = jobs.get(id)
      if (!j) return { success: false, error: 'İş bulunamadı.' }
      j.canceled = true
      if (j.abortController) j.abortController.abort()
      j.status = 'failed'
      return { success: true, providerJobId: id, status: 'failed' }
    },

    async deleteJob(id) {
      const j = jobs.get(id)
      if (!j) return { success: false, error: 'İş bulunamadı.' }
      if (j.abortController) j.abortController.abort()
      if (j.tempDir) await cleanDir(j.tempDir)
      j.pdfBuffer = null
      jobs.delete(id)
      return { success: true, providerJobId: id }
    },
  }

  assertProvider(provider, 'audiverisProvider')
  return provider
}

export { createAudiverisProvider, parseConfig, parseTimeout, parseExtraArgs, extractMxl, findOutputFile, isPathSafe, safeFileName, runAudiveris, VALID_EXTENSIONS, MAX_UNCOMPRESSED_XML }
export default createAudiverisProvider()
