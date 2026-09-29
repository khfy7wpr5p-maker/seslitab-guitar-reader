#!/usr/bin/env node
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createAudiverisProvider } from '../backend/providers/AudiverisProvider.js'

function messageOf(value) {
  if (value instanceof Error) return value.message
  if (value && typeof value === 'object' && typeof value.message === 'string') return value.message
  return String(value ?? 'unknown Audiveris provider failure')
}

async function main() {
  const [pdfPath, outDir] = process.argv.slice(2)
  if (!pdfPath || !outDir) {
    throw new TypeError('Usage: node scripts/run-local-audiveris-provider.js <source.pdf> <output-dir>')
  }

  const pdfBytes = await fs.readFile(pdfPath)
  if (pdfBytes.subarray(0, 5).toString() !== '%PDF-') {
    throw new TypeError('Source must be a valid PDF.')
  }
  await fs.mkdir(outDir, { recursive: true })

  const command = process.env.AUDIVERIS_COMMAND || '/opt/audiveris/bin/Audiveris'
  const timeoutMs = Number(process.env.AUDIVERIS_TIMEOUT_MS || 110000)
  const provider = createAudiverisProvider({ command, timeoutMs, extraArgs: [] })

  const upload = await provider.uploadPdf(pdfBytes, path.basename(pdfPath))
  if (!upload.success || !upload.providerJobId) {
    throw new Error(`Audiveris upload failed: ${messageOf(upload.error)}`)
  }

  const id = upload.providerJobId
  try {
    const analyzed = await provider.analyzePdf(id)
    if (!analyzed.success) {
      throw new Error(`Audiveris analysis failed: ${messageOf(analyzed.error)}`)
    }

    const xml = await provider.downloadMusicXML(id)
    if (!xml.success || typeof xml.musicXml !== 'string' || xml.musicXml.length === 0) {
      throw new Error(`Audiveris MusicXML download failed: ${messageOf(xml.error)}`)
    }
    await fs.writeFile(path.join(outDir, 'output.musicxml'), xml.musicXml)

    const omr = await provider.downloadOmrArtifact(id)
    if (omr.success && omr.omrBuffer?.length) {
      await fs.writeFile(path.join(outDir, 'project.omr'), omr.omrBuffer)
    }
  } finally {
    await provider.deleteJob(id).catch(() => {})
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`)
  process.exitCode = 1
})
