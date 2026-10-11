const SHA40 = /^[0-9a-f]{40}$/u
const SHA256 = /^[0-9a-f]{64}$/u

const REVISION_FIELDS = Object.freeze([
  'teacher',
  'editor',
  'student',
  'semanticEngine',
  'studentRenderer',
])

const CHECK_FIELDS = Object.freeze([
  'roundTrip',
  'sourceImmutable',
  'editorRuntime',
  'composerBinding',
  'stalePairRejected',
  'studentContract',
  'studentWorkspace',
  'studentPlayback',
])

function sameSha(values) {
  return values.every(
    (value) =>
      SHA256.test(value ?? '') &&
      value === values[0],
  )
}

export function qualifyGtabRt01gReleaseEvidence(
  evidence,
) {
  const diagnostics = []
  const actual = evidence?.revisions ?? {}
  const expected =
    evidence?.expectedRevisions ?? {}

  for (const field of REVISION_FIELDS) {
    if (
      !SHA40.test(actual[field] ?? '') ||
      !SHA40.test(expected[field] ?? '') ||
      actual[field] !== expected[field]
    ) {
      diagnostics.push({
        code: 'REVISION_MISMATCH',
        field,
      })
    }
  }

  const source = evidence?.source ?? {}
  if (
    !sameSha([
      source.beforeSha256,
      source.afterSha256,
      source.provenanceSourceSha256,
    ]) ||
    !SHA256.test(source.workingSha256 ?? '')
  ) {
    diagnostics.push({
      code: 'SOURCE_LINEAGE_MISMATCH',
    })
  }

  const pair = evidence?.finalPair ?? {}
  if (
    !sameSha([
      pair.scoreSha256,
      pair.handoffScoreSha256,
      pair.packageScoreSha256,
    ]) ||
    !sameSha([
      pair.tabSha256,
      pair.handoffTabSha256,
      pair.packageTabSha256,
    ])
  ) {
    diagnostics.push({
      code: 'FINAL_PAIR_MISMATCH',
    })
  }

  const music = evidence?.music ?? {}
  if (
    music.writtenMidi !== 61 ||
    music.soundingMidi !== 61 ||
    music.string !== 2 ||
    music.fret !== 2 ||
    music.studentPlaybackMidi !== 61
  ) {
    diagnostics.push({
      code: 'CANONICAL_PITCH_MISMATCH',
    })
  }

  const checks = evidence?.checks ?? {}
  for (const field of CHECK_FIELDS) {
    if (checks[field] !== 'PASS') {
      diagnostics.push({
        code: 'REQUIRED_CHECK_FAILED',
        field,
      })
    }
  }

  return Object.freeze({
    schema:
      'gtab-rt-01g-release-evidence-v1',
    status:
      diagnostics.length === 0
        ? 'PASS'
        : 'FAIL',
    diagnostics: Object.freeze(
      diagnostics.map((item) =>
        Object.freeze(item)),
    ),
    revisions: Object.freeze({
      ...actual,
    }),
  })
}
