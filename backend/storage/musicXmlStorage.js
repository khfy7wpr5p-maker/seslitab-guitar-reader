// MusicXML Storage — persists job files to disk.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { GATEWAY_CONFIG } from '../config/gatewayConfig.js'
import { StorageError } from '../utils/errors.js'

const ROOT = GATEWAY_CONFIG.storagePath
const jobDir = (id) => path.join(ROOT, id)

async function ensureDir(dir) {
  try { await fs.mkdir(dir, { recursive: true }) }
  catch (e) { throw new StorageError(`Dizin oluşturulamadı: ${dir}`, { cause: e.message }) }
}

export async function writePdf(jobId, buf) {
  await ensureDir(jobDir(jobId))
  await fs.writeFile(path.join(jobDir(jobId), 'input.pdf'), buf)
}

export async function writeMusicXml(jobId, xml) {
  if (!xml?.length) throw new StorageError('MusicXML boş.', { jobId })
  if (Buffer.byteLength(xml) > GATEWAY_CONFIG.maxMusicXmlSizeBytes) throw new StorageError('MusicXML çok büyük.', { jobId })
  await ensureDir(jobDir(jobId))
  await fs.writeFile(path.join(jobDir(jobId), 'output.musicxml'), xml, 'utf8')
}

export async function writeOmr(jobId, buf) {
  if (!buf?.length) throw new StorageError('.omr dosyası boş.', { jobId })
  await ensureDir(jobDir(jobId))
  await fs.writeFile(path.join(jobDir(jobId), 'project.omr'), buf)
}

export async function readOmr(jobId) {
  try { return await fs.readFile(path.join(jobDir(jobId), 'project.omr')) }
  catch (e) { if (e.code === 'ENOENT') return null; throw new StorageError(`Okunamadı: ${jobId}`, { cause: e.message }) }
}

export async function writeMetadata(jobId, meta) {
  await ensureDir(jobDir(jobId))
  await fs.writeFile(path.join(jobDir(jobId), 'metadata.json'), JSON.stringify(meta, null, 2), 'utf8')
}

export async function readMusicXml(jobId) {
  try { return await fs.readFile(path.join(jobDir(jobId), 'output.musicxml'), 'utf8') }
  catch (e) { if (e.code === 'ENOENT') return null; throw new StorageError(`Okunamadı: ${jobId}`, { cause: e.message }) }
}

export async function readMetadata(jobId) {
  try { return JSON.parse(await fs.readFile(path.join(jobDir(jobId), 'metadata.json'), 'utf8')) }
  catch (e) { if (e.code === 'ENOENT') return null; throw new StorageError(`Metadata: ${jobId}`, { cause: e.message }) }
}

export async function exists(jobId) {
  try { await fs.access(jobDir(jobId)); return true } catch { return false }
}

export async function deleteJob(jobId) {
  await fs.rm(jobDir(jobId), { recursive: true, force: true })
}

export async function listJobs() {
  try { return (await fs.readdir(ROOT, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name) }
  catch (e) { if (e.code === 'ENOENT') return []; throw new StorageError('Storage listelenemedi.', { cause: e.message }) }
}
