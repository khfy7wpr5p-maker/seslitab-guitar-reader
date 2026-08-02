// MusicXML Storage — persists job files and validated metadata.
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { GATEWAY_CONFIG } from '../config/gatewayConfig.js'
import { StorageError } from '../utils/errors.js'

export const METADATA_SCHEMA_VERSION = 1
const RETENTION = new Set(['runtime', 'protected', 'teacher_approved', 'unknown'])

export function createMusicXmlStorage(root) {
  const ROOT = path.resolve(root)
  const jobDir = (id) => path.join(ROOT, id)
  const ensureInside = (p) => p === ROOT || p.startsWith(`${ROOT}${path.sep}`)
  const ensureJobId = (id) => {
    if (!/^job_\d{10}_[a-z0-9]{6}$/.test(id)) throw new StorageError('Geçersiz jobId.', { jobId: id })
    const dir = path.resolve(ROOT, id)
    if (!ensureInside(dir)) throw new StorageError('Storage yolu güvenli değil.', { jobId: id })
    return dir
  }
  async function ensureDir(dir) { try { await fs.mkdir(dir, { recursive: true }) } catch (e) { throw new StorageError(`Dizin oluşturulamadı: ${dir}`, { cause: e.message }) } }
  async function writeFile(id, name, data, encoding) { const dir = ensureJobId(id); await ensureDir(dir); await fs.writeFile(path.join(dir, name), data, encoding) }
  async function readFile(id, name, encoding) { try { return await fs.readFile(path.join(ensureJobId(id), name), encoding) } catch (e) { if (e.code === 'ENOENT') return null; throw new StorageError(`Okunamadı: ${id}`, { cause: e.message }) } }

  function validateMetadata(directoryJobId, meta) {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return { ok: false, code: 'MALFORMED_METADATA' }
    if (meta.schemaVersion !== METADATA_SCHEMA_VERSION) return { ok: false, code: 'UNSUPPORTED_METADATA_SCHEMA' }
    if (meta.jobId !== directoryJobId) return { ok: false, code: 'METADATA_JOB_ID_MISMATCH' }
    if (typeof meta.status !== 'string' || typeof meta.fileName !== 'string' || typeof meta.provider !== 'string') return { ok: false, code: 'MALFORMED_METADATA' }
    for (const key of ['inputPath', 'musicXmlPath']) {
      if (meta[key] == null) continue
      if (path.isAbsolute(meta[key]) || meta[key].includes('..') || path.dirname(meta[key]) !== '.') return { ok: false, code: 'UNSAFE_METADATA_PATH' }
    }
    if (!RETENTION.has(meta.retentionClass)) return { ok: false, code: 'INVALID_RETENTION_CLASS' }
    return { ok: true, metadata: meta }
  }

  return {
    root: ROOT,
    async initialize() { await ensureDir(ROOT) },
    async writePdf(id, buf) { await writeFile(id, 'input.pdf', buf) },
    async writeMusicXml(id, xml) { if (!xml?.length) throw new StorageError('MusicXML boş.', { jobId: id }); if (Buffer.byteLength(xml) > GATEWAY_CONFIG.maxMusicXmlSizeBytes) throw new StorageError('MusicXML çok büyük.', { jobId: id }); await writeFile(id, 'output.musicxml', xml, 'utf8') },
    async writeOmr(id, buf) { if (!buf?.length) throw new StorageError('.omr dosyası boş.', { jobId: id }); await writeFile(id, 'project.omr', buf) },
    async readOmr(id) { return readFile(id, 'project.omr') },
    async readMusicXml(id) { return readFile(id, 'output.musicxml', 'utf8') },
    async exists(id) { try { await fs.access(ensureJobId(id)); return true } catch { return false } },
    async inputExists(id) { try { const s = await fs.stat(path.join(ensureJobId(id), 'input.pdf')); return s.isFile() } catch { return false } },
    async deleteJob(id) { await fs.rm(ensureJobId(id), { recursive: true, force: true }) },
    async listJobs() { try { return (await fs.readdir(ROOT, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort() } catch (e) { if (e.code === 'ENOENT') return []; throw new StorageError('Storage listelenemedi.', { cause: e.message }) } },
    validateMetadata,
    async writeMetadata(id, meta) {
      const dir = ensureJobId(id); await ensureDir(dir)
      const checked = validateMetadata(id, meta)
      if (!checked.ok) throw new StorageError(`Metadata geçersiz: ${checked.code}`, { jobId: id, code: checked.code })
      const tmp = path.join(dir, `.metadata.${id}.${process.pid}.${Date.now()}.tmp`)
      const canonical = path.join(dir, 'metadata.json')
      try { await fs.writeFile(tmp, JSON.stringify(meta, null, 2), 'utf8'); await fs.rename(tmp, canonical) }
      catch (e) { try { await fs.rm(tmp, { force: true }) } catch {}; throw new StorageError('Metadata atomik yazılamadı.', { jobId: id, cause: e.message }) }
    },
    async readMetadata(id) {
      let raw
      try { raw = await fs.readFile(path.join(ensureJobId(id), 'metadata.json'), 'utf8') } catch (e) { if (e.code === 'ENOENT') return { ok: false, code: 'METADATA_MISSING' }; return { ok: false, code: 'METADATA_READ_FAILED' } }
      let meta; try { meta = JSON.parse(raw) } catch { return { ok: false, code: 'MALFORMED_METADATA' } }
      return validateMetadata(id, meta)
    },
  }
}

const defaultStorage = createMusicXmlStorage(GATEWAY_CONFIG.storagePath)
export const initialize = (...a) => defaultStorage.initialize(...a)
export const writePdf = (...a) => defaultStorage.writePdf(...a)
export const writeMusicXml = (...a) => defaultStorage.writeMusicXml(...a)
export const writeOmr = (...a) => defaultStorage.writeOmr(...a)
export const readOmr = (...a) => defaultStorage.readOmr(...a)
export const readMusicXml = (...a) => defaultStorage.readMusicXml(...a)
export const exists = (...a) => defaultStorage.exists(...a)
export const inputExists = (...a) => defaultStorage.inputExists(...a)
export const deleteJob = (...a) => defaultStorage.deleteJob(...a)
export const listJobs = (...a) => defaultStorage.listJobs(...a)
export const writeMetadata = (...a) => defaultStorage.writeMetadata(...a)
export const readMetadata = (...a) => defaultStorage.readMetadata(...a)
export const validateMetadata = (...a) => defaultStorage.validateMetadata(...a)
export { defaultStorage }
