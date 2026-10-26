import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { spawnSync } from 'node:child_process'

const releaseGate = await import(
  '../scripts/gtabRt01gReleaseGate.js'
).catch(() => ({}))
const studentRendererIntegrity = await import(
  '../scripts/studentRendererRuntimeIntegrity.js'
).catch(() => ({}))

const REVISIONS = Object.freeze({
  teacher: 'a'.repeat(40),
  editor: 'b'.repeat(40),
  student: 'c'.repeat(40),
  semanticEngine: 'd'.repeat(40),
  studentRenderer: 'e'.repeat(40),
})

function sha256(value) {
  return createHash('sha256')
    .update(value)
    .digest('hex')
}

function validEvidence() {
  const sourceMusicXml = '<score-partwise>audiveris-source</score-partwise>'
  const finalScoreMusicXml = '<score-partwise>smoosic-final-c-sharp-4</score-partwise>'
  const guitarTabMusicXml = '<score-partwise>string-2-fret-2</score-partwise>'
  return {
    revisions: REVISIONS,
    expectedRevisions: REVISIONS,
    source: {
      beforeSha256: sha256(sourceMusicXml),
      afterSha256: sha256(sourceMusicXml),
      provenanceSourceSha256: sha256(sourceMusicXml),
      workingSha256: sha256('derived-smoosic-working-copy'),
    },
    finalPair: {
      scoreSha256: sha256(finalScoreMusicXml),
      handoffScoreSha256: sha256(finalScoreMusicXml),
      packageScoreSha256: sha256(finalScoreMusicXml),
      tabSha256: sha256(guitarTabMusicXml),
      handoffTabSha256: sha256(guitarTabMusicXml),
      packageTabSha256: sha256(guitarTabMusicXml),
    },
    music: {
      guitarPitchPolicy: 'source-sounding',
      writtenMidi: 61,
      soundingMidi: 61,
      string: 2,
      fret: 2,
      studentPlaybackMidi: 61,
    },
    checks: {
      roundTrip: 'PASS',
      sourceImmutable: 'PASS',
      editorRuntime: 'PASS',
      composerBinding: 'PASS',
      stalePairRejected: 'PASS',
      studentContract: 'PASS',
      studentWorkspace: 'PASS',
      studentPlayback: 'PASS',
      studentRendererArtifact: 'PASS',
      studentRendererRender: 'PASS',
    },
  }
}

function qualify(evidence) {
  assert.equal(
    typeof releaseGate.qualifyGtabRt01gReleaseEvidence,
    'function',
    'SES-225 release evidence qualifier is required',
  )
  return releaseGate.qualifyGtabRt01gReleaseEvidence(evidence)
}

test('SES-225 accepts one exact-head Audiveris to Student evidence chain', () => {
  const report = qualify(validEvidence())

  assert.equal(report.status, 'PASS')
  assert.deepEqual(report.diagnostics, [])
  assert.deepEqual(report.revisions, REVISIONS)
})

test('SES-225 fails closed for revision, lineage, pair, pitch, or gate drift', () => {
  const mutations = [
    (evidence) => {
      evidence.revisions = {
        ...evidence.revisions,
        editor: 'f'.repeat(40),
      }
    },
    (evidence) => {
      evidence.source.afterSha256 = '0'.repeat(64)
    },
    (evidence) => {
      evidence.finalPair.packageTabSha256 = '0'.repeat(64)
    },
    (evidence) => {
      evidence.music.studentPlaybackMidi = 49
    },
    (evidence) => {
      evidence.checks.studentWorkspace = 'FAIL'
    },
    (evidence) => {
      evidence.checks.studentRendererRender = 'FAIL'
    },
  ]

  for (const mutate of mutations) {
    const evidence = structuredClone(validEvidence())
    mutate(evidence)
    const report = qualify(evidence)
    assert.equal(report.status, 'FAIL')
    assert.ok(report.diagnostics.length > 0)
  }
})

test('SES-225 verifies every pinned Student renderer artifact byte and digest', async () => {
  assert.equal(
    typeof studentRendererIntegrity.verifyStudentRendererRuntimeIntegrity,
    'function',
    'Student renderer integrity verifier is required',
  )

  const runtimeRoot = await mkdtemp(
    path.join(tmpdir(), 'ses225-student-renderer-'),
  )
  const expectedRendererRevision = 'e'.repeat(40)
  const nested = path.join(runtimeRoot, 'nested')
  const indexBytes = Buffer.from('<html>runtime</html>\n')
  const runtimeBytes = Buffer.from('export const value = 1\n')

  try {
    await mkdir(nested, { recursive: true })
    await writeFile(path.join(runtimeRoot, 'index.html'), indexBytes)
    await writeFile(path.join(nested, 'runtime.js'), runtimeBytes)
    await writeFile(
      path.join(runtimeRoot, 'runtime-manifest.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        rendererSourceRevision: expectedRendererRevision,
        scoreRendererContractVersion: '0.2.0',
        runtimeTarget: 'browser',
        files: [
          {
            path: 'index.html',
            bytes: indexBytes.byteLength,
            sha256: sha256(indexBytes),
          },
          {
            path: 'nested/runtime.js',
            bytes: runtimeBytes.byteLength,
            sha256: sha256(runtimeBytes),
          },
        ],
      }, null, 2)}\n`,
      'utf8',
    )

    const summary =
      await studentRendererIntegrity.verifyStudentRendererRuntimeIntegrity({
        runtimeRoot,
        expectedRendererRevision,
        expectedContractVersion: '0.2.0',
      })
    assert.deepEqual(summary, {
      rendererSourceRevision: expectedRendererRevision,
      scoreRendererContractVersion: '0.2.0',
      verifiedFiles: 2,
    })

    await writeFile(
      path.join(nested, 'runtime.js'),
      Buffer.from('export const value = 2\n'),
    )
    await assert.rejects(
      () =>
        studentRendererIntegrity.verifyStudentRendererRuntimeIntegrity({
          runtimeRoot,
          expectedRendererRevision,
          expectedContractVersion: '0.2.0',
        }),
      /sha256 mismatch.*nested\/runtime\.js/iu,
    )
  } finally {
    await rm(runtimeRoot, { recursive: true, force: true })
  }
})

test('SES-225 browser finalization rejects changed delivered SCORE or TAB bytes', () => {
  const evidence = validEvidence()
  evidence.status = 'PENDING_STUDENT_RENDERER'
  evidence.checks.studentRendererRender = 'PENDING'
  const scoreBytes = Buffer.from('<score-partwise>smoosic-final-c-sharp-4</score-partwise>')
  const tabBytes = Buffer.from('<score-partwise>string-2-fret-2</score-partwise>')
  assert.equal(typeof releaseGate.verifyGtabRt01gStudentRenderInput, 'function')
  const verify = (overrides = {}) => releaseGate.verifyGtabRt01gStudentRenderInput({
    pending: evidence, scoreBytes, tabBytes, revisions: REVISIONS, ...overrides,
  })
  assert.doesNotThrow(() => verify())
  assert.throws(() => verify({ scoreBytes: Buffer.from('changed score') }), /SCORE bytes/)
  assert.throws(() => verify({ tabBytes: Buffer.from('changed tab') }), /TAB bytes/)
  assert.throws(() => verify({ revisions: { ...REVISIONS, student: 'f'.repeat(40) } }), /revision/)
  evidence.checks.sourceImmutable = 'FAIL'
  assert.throws(() => verify(), /preflight/)
})

test('SES-225 rejects a missing or different pitch policy instead of trusting octave coincidence', () => {
  for (const policy of [undefined, 'standard-guitar-written']) {
    const evidence = validEvidence()
    evidence.music.guitarPitchPolicy = policy
    assert.equal(qualify(evidence).status, 'FAIL')
  }
})

test('SES-225 browser prerequisite failure removes stale success evidence', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ses225-stale-proof-'))
  try {
    for (const relative of ['scripts/verifyGtabRt01gStudentRendererBrowser.js',
      'scripts/gtabRt01gReleaseGate.js', 'scripts/studentRendererRuntimeIntegrity.js',
      'tests/support/browserFixture.js']) {
      const target = path.join(directory, relative)
      await mkdir(path.dirname(target), { recursive: true })
      await cp(new URL('../' + relative, import.meta.url), target)
    }
    await writeFile(path.join(directory, 'package.json'), '{"type":"module"}')
    const artifact = path.join(directory, 'artifacts/gtab-rt-01g/release-evidence.json')
    await mkdir(path.dirname(artifact), { recursive: true })
    await writeFile(artifact, '{"status":"PASS"}')
    const env = { ...process.env }
    delete env.STUDENT_APP_ROOT
    const result = spawnSync(process.execPath,
      [path.join(directory, 'scripts/verifyGtabRt01gStudentRendererBrowser.js')], { env, encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /STUDENT_APP_ROOT is required/)
    await assert.rejects(readFile(artifact), { code: 'ENOENT' })
  } finally { await rm(directory, { recursive: true, force: true }) }
})
