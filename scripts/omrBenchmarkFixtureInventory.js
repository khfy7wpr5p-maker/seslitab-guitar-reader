// Package 2E — read-only benchmark fixture inventory.
//
// This inventory separates teacher-approved comparison references from
// regression-only real-OMR MusicXML outputs. A regression output is useful for
// deterministic diagnostics, but it is not musical ground truth by itself.

export const OMR_FIXTURE_EVIDENCE_STATE = Object.freeze({
  TEACHER_VERIFIED: 'TEACHER_VERIFIED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
})

export const OMR_FIXTURE_ROLE = Object.freeze({
  GOLDEN_REFERENCE: 'GOLDEN_REFERENCE',
  REGRESSION_OUTPUT_ONLY: 'REGRESSION_OUTPUT_ONLY',
})

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
}

const goldenReferences = [
  {
    fixtureId: 'plan0-cc0-4measure',
    role: OMR_FIXTURE_ROLE.GOLDEN_REFERENCE,
    evidenceState: OMR_FIXTURE_EVIDENCE_STATE.TEACHER_VERIFIED,
    sourcePdf: 'tests/fixtures/golden-reference/plan0-cc0-4measure/plan0-cc0-4measure-source.pdf',
    expectedMusicXml: 'tests/fixtures/golden-reference/plan0-cc0-4measure/plan0-cc0-4measure-expected.musicxml',
    omrArtifact: null,
    approvalRecord: 'docs/package-status.md',
    integrityManifest: 'tests/fixtures/golden-reference/plan0-cc0-4measure/plan0-cc0-4measure-sha256.txt',
    benchmarkUse: 'SOURCE_PDF_TO_GOLDEN_MUSICXML_COMPARISON',
    limitation: 'The preserved historical Audiveris attempt is not classified as a successful reproduction of this golden reference.',
  },
  {
    fixtureId: 'plan0-owner-approved-3-8',
    role: OMR_FIXTURE_ROLE.GOLDEN_REFERENCE,
    evidenceState: OMR_FIXTURE_EVIDENCE_STATE.TEACHER_VERIFIED,
    sourcePdf: 'tests/fixtures/golden-reference/plan0-owner-approved-3-8/source.pdf',
    expectedMusicXml: 'tests/fixtures/golden-reference/plan0-owner-approved-3-8/expected.musicxml',
    omrArtifact: 'tests/fixtures/golden-reference/plan0-owner-approved-3-8/project.omr',
    approvalRecord: 'tests/fixtures/golden-reference/plan0-owner-approved-3-8/APPROVAL.md',
    integrityManifest: 'tests/fixtures/golden-reference/plan0-owner-approved-3-8/sha256.txt',
    benchmarkUse: 'SOURCE_PDF_TO_GOLDEN_MUSICXML_COMPARISON',
    limitation: null,
  },
]

const regressionOutputs = [
  'django-clean.xml',
  'fikriminincegulu-clean.xml',
  'fug1001-clean.xml',
  'gesi-clean.xml',
  'karayip-korsanlari-clean.xml',
  'samanyolu-clean.xml',
  'shostywaltz-clean.xml',
].map((fileName) => ({
  fixtureId: `real-omr-${fileName.replace(/-clean\.xml$/u, '').replace(/\.xml$/u, '')}`,
  role: OMR_FIXTURE_ROLE.REGRESSION_OUTPUT_ONLY,
  evidenceState: OMR_FIXTURE_EVIDENCE_STATE.REVIEW_REQUIRED,
  sourcePdf: null,
  expectedMusicXml: null,
  omrArtifact: null,
  approvalRecord: null,
  integrityManifest: null,
  regressionMusicXml: `tests/fixtures/real-omr/${fileName}`,
  benchmarkUse: 'DETERMINISTIC_OUTPUT_DIAGNOSTIC_ONLY',
  limitation: 'Source/license/teacher-approval evidence is incomplete for use as musical ground truth.',
}))

export const OMR_BENCHMARK_FIXTURE_INVENTORY = deepFreeze([
  ...goldenReferences,
  ...regressionOutputs,
])

export const OMR_BENCHMARK_GOLDEN_REFERENCES = deepFreeze(
  OMR_BENCHMARK_FIXTURE_INVENTORY.filter(
    (fixture) => fixture.role === OMR_FIXTURE_ROLE.GOLDEN_REFERENCE,
  ),
)

export const OMR_BENCHMARK_REGRESSION_OUTPUTS = deepFreeze(
  OMR_BENCHMARK_FIXTURE_INVENTORY.filter(
    (fixture) => fixture.role === OMR_FIXTURE_ROLE.REGRESSION_OUTPUT_ONLY,
  ),
)
