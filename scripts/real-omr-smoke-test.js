#!/usr/bin/env node
// Real OMR smoke test — uploads a PDF through the Gateway and verifies
// that real Audiveris produced valid MusicXML.
//
// Usage: node scripts/real-omr-smoke-test.js <pdf-path> [--gateway <url>]
//
// This script must NOT be run in the Bolt development environment.
// It requires a running Gateway with OMR_PROVIDER=audiveris.

import { promises as fs } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)

let pdfPath = null
let gatewayUrl = 'http://localhost:3001'

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--gateway') { gatewayUrl = args[++i]; continue }
  if (args[i] === '--help' || args[i] === '-h') {
    console.log('Kullanım: node scripts/real-omr-smoke-test.js <pdf-path> [--gateway <url>]')
    process.exit(0)
  }
  if (!args[i].startsWith('--')) pdfPath = args[i]
}

if (!pdfPath) {
  console.error('HATA: PDF dosya yolu gerekli.')
  console.error('Kullanım: node scripts/real-omr-smoke-test.js <pdf-path> [--gateway <url>]')
  process.exit(1)
}

async function main() {
  // Reject missing files
  try { await fs.access(pdfPath) }
  catch { console.error('HATA: Dosya bulunamadı:', pdfPath); process.exit(1) }

  // Reject non-PDF files
  const ext = path.extname(pdfPath).toLowerCase()
  if (ext !== '.pdf') {
    console.error('HATA: Dosya bir PDF değil. Yalnızca .pdf dosyaları kabul edilir.')
    process.exit(1)
  }

  // Read first bytes to verify PDF magic number
  const fd = await fs.open(pdfPath, 'r')
  const header = Buffer.alloc(5)
  await fd.read(header, 0, 5, 0)
  await fd.close()
  if (header.toString() !== '%PDF-') {
    console.error('HATA: Dosya geçerli bir PDF değil (PDF başlığı bulunamadı).')
    process.exit(1)
  }

  const baseUrl = gatewayUrl.replace(/\/$/, '')

  // Check provider — fail if mock
  const healthRes = await fetch(`${baseUrl}/health`)
  const health = await healthRes.json()
  const provider = health.data?.provider
  if (provider === 'mock') {
    console.error('HATA: Backend MockProvider kullanıyor. Bu test yalnızca OMR_PROVIDER=audiveris ile çalışır.')
    process.exit(1)
  }
  if (provider !== 'audiveris') {
    console.error(`HATA: Beklenmeyen sağlayıcı: ${provider}. Bu test yalnızca audiveris ile çalışır.`)
    process.exit(1)
  }

  console.log(`Sağlayıcı: ${provider}`)
  console.log(`Runtime: ${health.data?.runtime?.available ? 'mevcut' : 'mevcut değil'}`)
  if (!health.data?.runtime?.available) {
    console.error('HATA: Audiveris runtime mevcut değil. Health endpoint kontrol edin.')
    process.exit(1)
  }

  // Upload PDF
  const fileBuffer = await fs.readFile(pdfPath)
  const formData = new FormData()
  formData.append('file', new Blob([fileBuffer]), path.basename(pdfPath))

  const uploadRes = await fetch(`${baseUrl}/api/jobs`, { method: 'POST', body: formData })
  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}))
    console.error('HATA: Yükleme başarısız:', err?.error?.message || uploadRes.status)
    process.exit(1)
  }
  const uploadData = await uploadRes.json()
  const jobId = uploadData.data?.jobId
  if (!jobId) { console.error('HATA: İş kimliği alınamadı.'); process.exit(1) }
  console.log(`İş: ${jobId}`)

  // Poll status
  let status = 'queued'
  let attempts = 0
  const maxAttempts = 120
  while (status !== 'completed' && status !== 'failed' && attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 2000))
    const statusRes = await fetch(`${baseUrl}/api/jobs/${jobId}/status`)
    const statusData = await statusRes.json()
    status = statusData.data?.status || 'unknown'
    attempts++
    if (attempts % 10 === 0) console.log(`Durum: ${status} (${attempts * 2}s)`)
  }

  console.log(`Son durum: ${status}`)

  if (status !== 'completed') {
    console.error('HATA: İş tamamlanmadı.')
    await fetch(`${baseUrl}/api/jobs/${jobId}`, { method: 'DELETE' }).catch(() => {})
    process.exit(1)
  }

  // Download MusicXML
  const xmlRes = await fetch(`${baseUrl}/api/jobs/${jobId}/musicxml`)
  if (!xmlRes.ok) {
    console.error('HATA: MusicXML indirilemedi.')
    await fetch(`${baseUrl}/api/jobs/${jobId}`, { method: 'DELETE' }).catch(() => {})
    process.exit(1)
  }
  const musicXml = await xmlRes.text()

  // Parse MusicXML
  let rootType = 'unknown'
  let partCount = 0
  let measureCount = 0
  let noteCount = 0

  try {
    const match = musicXml.match(/<(score-partwise|score-timewise)[\s>]/)
    if (match) rootType = match[1]
    partCount = (musicXml.match(/<score-part[\s>]/g) || []).length
    measureCount = (musicXml.match(/<measure[\s>]/g) || []).length
    noteCount = (musicXml.match(/<(note|rest)[\s>]/g) || []).length
  } catch { /* best-effort */ }

  console.log('--- Sonuç ---')
  console.log(`MusicXML kök tipi: ${rootType}`)
  console.log(`Part sayısı: ${partCount}`)
  console.log(`Ölçü sayısı: ${measureCount}`)
  console.log(`Nota/dinlenme sayısı: ${noteCount}`)

  // Clean up server-side job
  await fetch(`${baseUrl}/api/jobs/${jobId}`, { method: 'DELETE' }).catch(() => {})
  console.log('İş temizlendi.')
}

main().catch((err) => {
  console.error('HATA:', err.message)
  process.exit(1)
})
