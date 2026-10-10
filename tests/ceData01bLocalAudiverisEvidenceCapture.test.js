import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { captureLocalAudiverisEvidence, packageLocalAudiverisEvidence } from '../scripts/local-audiveris-evidence-capture.js'

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
  const reference = Buffer.from('<?xml version="1.0"?><score-partwise version="4.0"><identification><rights>CC0-1.0</rights></identification></score-partwise>')
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


test('Docker smoke workflow captures CE-DATA-01B evidence only through the local container', async () => {
  const workflow = await readFile(new URL('../.github/workflows/audiveris-docker-smoke-test.yml', import.meta.url), 'utf8')
  const evidenceStart = workflow.indexOf('      - name: Start isolated Audiveris container')
  const evidenceEnd = workflow.indexOf('      - name: Upload CE-DATA-01B local evidence')
  assert.ok(evidenceStart >= 0)
  assert.ok(evidenceEnd > evidenceStart)
  const evidenceWorkflow = workflow.slice(evidenceStart, evidenceEnd)
  assert.ok(workflow.includes('actions/setup-node@v4'))
  assert.ok(workflow.includes("      - 'scripts/local-audiveris-evidence-capture.js'"))
  assert.ok(workflow.includes("      - 'scripts/run-local-audiveris-provider.js'"))
  assert.ok(workflow.includes('scripts/local-audiveris-evidence-capture.js'))
  assert.ok(workflow.includes('plan0-cc0-4measure-source.pdf'))
  assert.ok(workflow.includes('plan0-cc0-4measure-expected.musicxml'))
  const runner = await readFile(new URL('../scripts/run-local-audiveris-provider.js', import.meta.url), 'utf8')
  assert.ok(runner.includes('createAudiverisProvider'))
  assert.ok(workflow.includes('scripts/run-local-audiveris-provider.js'))
  assert.ok(workflow.includes('docker exec --user seslitab'))
  assert.ok(workflow.includes('/app/tmp/ce-data-01b/output.musicxml'))
  assert.ok(workflow.includes('--musicxml /tmp/ce-data-01b/output.musicxml'))
  assert.equal(evidenceWorkflow.includes('http://127.0.0.1:8080'), false)
  assert.equal(evidenceWorkflow.includes('/health'), false)
  assert.ok(workflow.includes('ce-data-01b-local-audiveris-capture'))
  assert.ok(workflow.includes('--expected-source-sha256 c6e91647ba9dfcd38094f59848823ce3c92e7f5fe495747e2588ac0120f5bfed'))
  assert.ok(workflow.includes('--expected-reference-sha256 7004b4ac37711cca340c63e2f2436dd70e0f630f4e891cb311caff159b5d9d94'))
  assert.ok(workflow.includes('--source-repository khfy7wpr5p-maker/seslitab-guitar-reader'))
  assert.ok(workflow.includes('--source-revision-id fcfa70da2d81891d98dc1029862671c35217c00f'))
  assert.ok(workflow.includes('--license-id CC0-1.0'))
  assert.ok(workflow.includes('actions/upload-artifact@v4'))
  assert.equal(workflow.includes('seslitab-omr.onrender.com'), false)
})


test('fails closed before network use when approved source hash drifts', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ce-data-source-hash-'))
  const pdfPath = path.join(root, 'source.pdf')
  const outDir = path.join(root, 'capture')
  await writeFile(pdfPath, Buffer.from('%PDF-1.4\nchanged bytes\n%%EOF\n'))
  try {
    await assert.rejects(
      () => captureLocalAudiverisEvidence({
        pdfPath,
        outDir,
        gatewayUrl: 'http://127.0.0.1:9',
        engineVersion: '5.11.0',
        engineVersionOutput: 'Audiveris 5.11.0',
        expectedSourceSha256: '0'.repeat(64),
      }),
      /source SHA-256 mismatch/i,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('fails closed before network use when approved reference hash drifts', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ce-data-reference-hash-'))
  const pdfPath = path.join(root, 'source.pdf')
  const referencePath = path.join(root, 'reference.musicxml')
  const outDir = path.join(root, 'capture')
  const pdf = Buffer.from('%PDF-1.4\nsource\n%%EOF\n')
  await writeFile(pdfPath, pdf)
  await writeFile(referencePath, Buffer.from('<score-partwise version="4.0"/>'))
  try {
    await assert.rejects(
      () => captureLocalAudiverisEvidence({
        pdfPath,
        referencePath,
        outDir,
        gatewayUrl: 'http://127.0.0.1:9',
        engineVersion: '5.11.0',
        engineVersionOutput: 'Audiveris 5.11.0',
        expectedSourceSha256: sha256(pdf),
        expectedReferenceSha256: '0'.repeat(64),
      }),
      /reference SHA-256 mismatch/i,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('version evidence requires the exact pinned version token', async () => {
  await assert.rejects(
    () => captureLocalAudiverisEvidence({
      pdfPath: '/tmp/unused.pdf',
      outDir: '/tmp/unused-output',
      gatewayUrl: 'http://127.0.0.1:8080',
      engineVersion: '5.11.0',
      engineVersionOutput: 'Audiveris 15.11.0',
    }),
    /version evidence/i,
  )
})

test('manifest hashes the exact persisted Audiveris version evidence bytes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ce-data-version-hash-'))
  const pdfPath = path.join(root, 'source.pdf')
  const outDir = path.join(root, 'capture')
  const pdf = Buffer.from('%PDF-1.4\nsource\n%%EOF\n')
  await writeFile(pdfPath, pdf)
  try {
    await withFakeGateway(async ({ gatewayUrl }) => {
      const result = await captureLocalAudiverisEvidence({
        pdfPath,
        outDir,
        gatewayUrl,
        engineVersion: '5.11.0',
        engineVersionOutput: '  Audiveris 5.11.0  \n',
        expectedSourceSha256: sha256(pdf),
        pollIntervalMs: 1,
        maxPollAttempts: 2,
      })
      const persisted = await readFile(path.join(outDir, 'audiveris-version.txt'))
      assert.equal(result.manifest.engine.versionEvidenceSha256, sha256(persisted))
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('packages direct-container Audiveris outputs as pre-label evidence', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ce-data-direct-package-'))
  const pdfPath = path.join(root, 'source.pdf')
  const referencePath = path.join(root, 'reference.musicxml')
  const musicXmlPath = path.join(root, 'generated.musicxml')
  const omrPath = path.join(root, 'generated.omr')
  const versionPath = path.join(root, 'audiveris-version.txt')
  const outDir = path.join(root, 'capture')
  const pdf = Buffer.from('%PDF-1.4\nsource\n%%EOF\n')
  const reference = Buffer.from('<?xml version="1.0"?><score-partwise version="4.0"><identification><rights>CC0-1.0</rights></identification></score-partwise>')
  const musicXml = Buffer.from('<?xml version="1.0"?><score-partwise version="4.0"><part-list/></score-partwise>')
  const omr = Buffer.from('direct-omr-bytes')
  const version = Buffer.from('Audiveris 5.11.0\n')
  await writeFile(pdfPath, pdf)
  await writeFile(referencePath, reference)
  await writeFile(musicXmlPath, musicXml)
  await writeFile(omrPath, omr)
  await writeFile(versionPath, version)
  try {
    const result = await packageLocalAudiverisEvidence({
      pdfPath, referencePath, musicXmlPath, omrPath, versionPath, outDir,
      engineVersion: '5.11.0',
      sourceRepository: 'khfy7wpr5p-maker/seslitab-guitar-reader',
      sourceRevisionId: 'fcfa70da2d81891d98dc1029862671c35217c00f',
      licenseId: 'CC0-1.0',
      expectedSourceSha256: sha256(pdf),
      expectedReferenceSha256: sha256(reference),
    })
    assert.equal(result.manifest.reviewState, 'PENDING_TEACHER_REVIEW')
    assert.equal(result.manifest.musicXml.sha256, sha256(musicXml))
    assert.equal(result.manifest.omr.sha256, sha256(omr))
    assert.equal(result.manifest.engine.versionEvidenceSha256, sha256(version))
    assert.deepEqual(result.manifest.provenance, {
      sourceRepository: 'khfy7wpr5p-maker/seslitab-guitar-reader',
      sourceRevisionId: 'fcfa70da2d81891d98dc1029862671c35217c00f',
      licenseId: 'CC0-1.0',
      rightsEvidence: {
        kind: 'REFERENCE_RIGHTS_DECLARATION',
        referenceSha256: sha256(reference),
        licenseId: 'CC0-1.0',
      },
    })
    assert.equal(Object.hasOwn(result.manifest, 'teacherDecision'), false)
    assert.deepEqual(await readFile(path.join(outDir, 'output.musicxml')), musicXml)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('direct packaging refuses to manufacture license provenance absent from the pinned reference', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ce-data-license-'))
  const pdfPath = path.join(root, 'source.pdf')
  const referencePath = path.join(root, 'reference.musicxml')
  const musicXmlPath = path.join(root, 'generated.musicxml')
  const versionPath = path.join(root, 'audiveris-version.txt')
  const outDir = path.join(root, 'capture')
  const pdf = Buffer.from('%PDF-1.4\nsource\n%%EOF\n')
  const reference = Buffer.from('<?xml version="1.0"?><score-partwise version="4.0"/>')
  await writeFile(pdfPath, pdf)
  await writeFile(referencePath, reference)
  await writeFile(musicXmlPath, Buffer.from('<?xml version="1.0"?><score-partwise version="4.0"/>'))
  await writeFile(versionPath, Buffer.from('Audiveris 5.11.0\n'))
  try {
    await assert.rejects(
      () => packageLocalAudiverisEvidence({
        pdfPath, referencePath, musicXmlPath, versionPath, outDir,
        engineVersion: '5.11.0',
        sourceRepository: 'khfy7wpr5p-maker/seslitab-guitar-reader',
        sourceRevisionId: 'fcfa70da2d81891d98dc1029862671c35217c00f',
        licenseId: 'CC0-1.0',
        expectedSourceSha256: sha256(pdf),
        expectedReferenceSha256: sha256(reference),
      }),
      /license evidence/i,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})