import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { captureLocalAudiverisEvidence } from '../scripts/local-audiveris-evidence-capture.js'

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function withFakeGateway(run) {
  const musicXml = Buffer.from('<?xml version="1.0"?><score-partwise version="4.0"><part-list/><part id="P1"><measure number="1"><note><rest/><duration>1</duration></note></measure></part></score-partwise>')
  const omr = Buffer.from('fake-omr-bytes')
  let deleted = false

  const server = createServer((req, res) => {
    const sendJson = (status, value) => {
      res.statusCode = status
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(value))
    }

    if (req.method === 'GET' && req.url === '/health') {
      sendJson(200, {
        success: true,
        data: {
          status: 'ok',
          provider: 'audiveris',
          runtime: { audiverisAvailable: true, versionCheck: true },
        },
      })
      return
    }

    if (req.method === 'POST' && req.url === '/api/jobs') {
      req.resume()
      req.on('end', () => sendJson(201, { success: true, data: { jobId: 'job-1' } }))
      return
    }

    if (req.method === 'GET' && req.url === '/api/jobs/job-1/status') {
      sendJson(200, { success: true, data: { status: 'completed', progress: 100 } })
      return
    }

    if (req.method === 'GET' && req.url === '/api/jobs/job-1/musicxml') {
      res.statusCode = 200
      res.setHeader('content-type', 'application/xml')
      res.end(musicXml)
      return
    }

    if (req.method === 'GET' && req.url === '/api/jobs/job-1/omr') {
      res.statusCode = 200
      res.setHeader('content-type', 'application/octet-stream')
      res.end(omr)
      return
    }

    if (req.method === 'DELETE' && req.url === '/api/jobs/job-1') {
      deleted = true
      sendJson(200, { success: true, data: { deleted: true } })
      return
    }

    sendJson(404, { success: false })
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  try {
    return await run({
      gatewayUrl: `http://127.0.0.1:${address.port}`,
      musicXml,
      omr,
      wasDeleted: () => deleted,
    })
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

test('captures exact local Audiveris evidence without manufacturing teacher decisions', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ce-data-01b-'))
  const pdfPath = path.join(root, 'source.pdf')
  const referencePath = path.join(root, 'reference.musicxml')
  const outDir = path.join(root, 'capture')
  const pdf = Buffer.from('%PDF-1.4\nrights-safe test source\n%%EOF\n')
  const reference = Buffer.from('<?xml version="1.0"?><score-partwise version="4.0"/>')
  await writeFile(pdfPath, pdf)
  await writeFile(referencePath, reference)

  try {
    await withFakeGateway(async ({ gatewayUrl, musicXml, omr, wasDeleted }) => {
      const result = await captureLocalAudiverisEvidence({
        pdfPath,
        referencePath,
        outDir,
        gatewayUrl,
        engineVersion: '5.11.0',
        engineVersionOutput: 'Audiveris 5.11.0',
        pollIntervalMs: 1,
        maxPollAttempts: 2,
      })

      const manifest = JSON.parse(await readFile(path.join(outDir, 'evidence.json'), 'utf8'))
      assert.equal(result.manifestPath, path.join(outDir, 'evidence.json'))
      assert.equal(manifest.documentType, 'CeData01bLocalAudiverisEvidence')
      assert.equal(manifest.contractVersion, '1.0.0')
      assert.equal(manifest.evidenceClass, 'REAL_OMR_CAPTURE_PRELABEL')
      assert.equal(manifest.reviewState, 'PENDING_TEACHER_REVIEW')
      assert.deepEqual(manifest.source, {
        fileName: 'source.pdf',
        sha256: sha256(pdf),
        byteLength: pdf.byteLength,
      })
      assert.deepEqual(manifest.reference, {
        fileName: 'reference.musicxml',
        sha256: sha256(reference),
        byteLength: reference.byteLength,
      })
      assert.equal(manifest.engine.id, 'audiveris')
      assert.equal(manifest.engine.version, '5.11.0')
      assert.equal(manifest.musicXml.sha256, sha256(musicXml))
      assert.equal(manifest.musicXml.byteLength, musicXml.byteLength)
      assert.equal(manifest.omr.sha256, sha256(omr))
      assert.equal(manifest.omr.byteLength, omr.byteLength)
      assert.equal(Object.hasOwn(manifest, 'teacherDecision'), false)
      assert.equal(Object.hasOwn(manifest, 'correctionNeeded'), false)
      assert.equal(Object.hasOwn(manifest, 'correctionSafe'), false)
      assert.equal(Object.hasOwn(manifest, 'teacherGoldValue'), false)
      assert.equal(wasDeleted(), true)
      assert.deepEqual(await readFile(path.join(outDir, 'output.musicxml')), musicXml)
      assert.deepEqual(await readFile(path.join(outDir, 'project.omr')), omr)
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('refuses any non-loopback gateway before evidence capture starts', async () => {
  await assert.rejects(
    () => captureLocalAudiverisEvidence({
      pdfPath: '/tmp/unused.pdf',
      outDir: '/tmp/unused-output',
      gatewayUrl: 'https://seslitab-omr.onrender.com',
      engineVersion: '5.11.0',
      engineVersionOutput: 'Audiveris 5.11.0',
    }),
    /loopback/i,
  )
})

test('fails closed when runtime version evidence does not contain the pinned engine version', async () => {
  await assert.rejects(
    () => captureLocalAudiverisEvidence({
      pdfPath: '/tmp/unused.pdf',
      outDir: '/tmp/unused-output',
      gatewayUrl: 'http://127.0.0.1:8080',
      engineVersion: '5.11.0',
      engineVersionOutput: 'Audiveris 5.10.0',
    }),
    /version evidence/i,
  )
})
