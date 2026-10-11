import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const releaseGate = await import(
  '../scripts/gtabRt01gReleaseGate.js'
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
  ]

  for (const mutate of mutations) {
    const evidence = structuredClone(validEvidence())
    mutate(evidence)
    const report = qualify(evidence)
    assert.equal(report.status, 'FAIL')
    assert.ok(report.diagnostics.length > 0)
  }
})

test('SES-225 workflow pins every cross-app dependency and runs required release proofs', async () => {
  const workflow = await readFile(
    new URL(
      '../.github/workflows/gtab-rt-01g-release-gate.yml',
      import.meta.url,
    ),
    'utf8',
  ).catch(() => '')

  assert.match(workflow, /GTAB_EDITOR_SHA:\s*4eb479bc84b12c6deefb289d03c933ce9980bc9f/u)
  assert.match(workflow, /STUDENT_APP_SHA:\s*70042d2314c005e71de80094363ba66faa795456/u)
  assert.match(workflow, /SEMANTIC_ENGINE_SHA:\s*ef305f45ff90d940ac6c51a0c46c4fac006d7c5c/u)
  assert.match(workflow, /STUDENT_RENDERER_SHA:\s*13aa0843158257a207afe062879743d58048cc6d/u)
  assert.match(workflow, /verifyGtabRt01gCrossAppRelease\.js/u)
  assert.match(workflow, /verifyGtab10cSemanticParity\.js/u)
  assert.match(workflow, /verifySes222SmoosicGuitarTabRendererBrowser\.js/u)
  assert.match(
    workflow,
    /env -u GITHUB_SHA[\s\S]*GTAB10C_SESILITAB_SHA="\$SES225_TEACHER_SHA"/u,
  )
  assert.doesNotMatch(workflow, /render\.com|firebase deploy|SECURE_DELIVERY_TEACHER_WRITES_ACTIVATION:\s*true/u)

  const crossAppProof = await readFile(
    new URL(
      '../scripts/verifyGtabRt01gCrossAppRelease.js',
      import.meta.url,
    ),
    'utf8',
  )
  assert.match(
    crossAppProof,
    /vendor\/st-score-runtime\/runtime-manifest\.json/u,
  )
})
