import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import '../scripts/runOmrQualityReport.js'
import {
  OMR_BENCHMARK_KIND,
  OMR_BENCHMARK_MEASUREMENT_STATE,
  OMR_BENCHMARK_SCHEMA_VERSION,
  OMR_BENCHMARK_TRUTH_DOMAIN,
  OMR_BENCHMARK_VARIANT_KIND,
  OMR_COMPARATIVE_BENCHMARK_KIND,
  REVIEWED_OMR_FIXTURE_NAMES,
  benchmarkReviewedOmrCorpus,
  createComparativeOmrBenchmarkReport,
  createOmrVariantRecord,
} from '../scripts/omrBenchmark.js'
import {
  OMR_BENCHMARK_FIXTURE_INVENTORY,
  OMR_BENCHMARK_GOLDEN_REFERENCES,
  OMR_BENCHMARK_REGRESSION_OUTPUTS,
  OMR_FIXTURE_EVIDENCE_STATE,
  OMR_FIXTURE_ROLE,
} from '../scripts/omrBenchmarkFixtureInventory.js'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(testDir, '..')
const fixtureDir = path.join(testDir, 'fixtures', 'real-omr')

const expectedMetrics = Object.freeze({
  'django-clean.xml': {
    primaryMeasureCount: 38,
    structuredNoteCount: 225,
    primaryNoteCount: 225,
    pitchedNoteCount: 209,
    restCount: 16,
    voices: [1],
    chordContinuations: 0,
    multiVoiceMeasures: 0,
    backupEvents: 0,
  },
  'fikriminincegulu-clean.xml': {
    primaryMeasureCount: 24,
    structuredNoteCount: 71,
    primaryNoteCount: 71,
    pitchedNoteCount: 69,
    restCount: 2,
    voices: [1, 2],
    chordContinuations: 0,
    multiVoiceMeasures: 1,
    backupEvents: 1,
  },
  'fug1001-clean.xml': {
    primaryMeasureCount: 94,
    structuredNoteCount: 1745,
    primaryNoteCount: 1745,
    pitchedNoteCount: 1566,
    restCount: 179,
    voices: [1, 2, 3, 4, 5, 6, 7],
    chordContinuations: 186,
    multiVoiceMeasures: 62,
    backupEvents: 166,
  },
  'gesi-clean.xml': {
    primaryMeasureCount: 26,
    structuredNoteCount: 112,
    primaryNoteCount: 112,
    pitchedNoteCount: 104,
    restCount: 8,
    voices: [1, 2, 3, 4, 5],
    chordContinuations: 15,
    multiVoiceMeasures: 4,
    backupEvents: 33,
  },
  'karayip-korsanlari-clean.xml': {
    primaryMeasureCount: 64,
    structuredNoteCount: 196,
    primaryNoteCount: 179,
    pitchedNoteCount: 157,
    restCount: 22,
    voices: [1, 2],
    chordContinuations: 0,
    multiVoiceMeasures: 2,
    backupEvents: 24,
  },
  'samanyolu-clean.xml': {
    primaryMeasureCount: 24,
    structuredNoteCount: 41,
    primaryNoteCount: 41,
    pitchedNoteCount: 41,
    restCount: 0,
    voices: [1],
    chordContinuations: 0,
    multiVoiceMeasures: 0,
    backupEvents: 0,
  },
  'shostywaltz-clean.xml': {
    primaryMeasureCount: 211,
    structuredNoteCount: 618,
    primaryNoteCount: 618,
    pitchedNoteCount: 546,
    restCount: 72,
    voices: [1],
    chordContinuations: 5,
    multiVoiceMeasures: 0,
    backupEvents: 2,
  },
})

function corpusEntries() {
  return REVIEWED_OMR_FIXTURE_NAMES.map((fileName) => ({
    fileName,
    xml: readFileSync(path.join(fixtureDir, fileName), 'utf8'),
  }))
}

function basicVariant(variantId, variantKind = OMR_BENCHMARK_VARIANT_KIND.ORIGINAL_PDF) {
  return {
    variantId,
    variantKind,
    inputMetadata: { source: 'fixture.pdf', page: 1 },
    preprocessingSettings: {},
    audiverisSettings: { profile: 'default' },
    generatedMusicXml: null,
    validatorFindings: [],
  }
}

const comparisonMetricNames = [
  'missingNotes',
  'extraNotes',
  'pitchErrors',
  'durationErrors',
  'voiceErrors',
  'fullyCorrectMeasureRate',
]

describe('Package 2E reviewed OMR benchmark diagnostic', () => {
  test('fixed corpus contains every reviewed real-OMR fixture exactly once', () => {
    assert.deepEqual(REVIEWED_OMR_FIXTURE_NAMES, [
      'django-clean.xml',
      'fikriminincegulu-clean.xml',
      'fug1001-clean.xml',
      'gesi-clean.xml',
      'karayip-korsanlari-clean.xml',
      'samanyolu-clean.xml',
      'shostywaltz-clean.xml',
    ])
    assert.equal(new Set(REVIEWED_OMR_FIXTURE_NAMES).size, 7)
  })

  test('diagnostic never fabricates musical ground truth or recognition accuracy', () => {
    const report = benchmarkReviewedOmrCorpus(corpusEntries())

    assert.equal(report.schemaVersion, OMR_BENCHMARK_SCHEMA_VERSION)
    assert.equal(report.benchmarkKind, OMR_BENCHMARK_KIND)
    assert.equal(report.truth, OMR_BENCHMARK_TRUTH_DOMAIN)
    assert.equal(report.truth.scope, 'reviewed-output-diagnostic-only')
    assert.equal(report.truth.musicalGroundTruthAvailable, false)
    assert.equal(report.truth.recognitionAccuracyAvailable, false)
    assert.equal(report.truth.recognitionAccuracy, null)
    assert.match(report.truth.limitation, /must not be inferred/i)
  })

  test('all reviewed raw Audiveris MusicXML remains source-unverified and non-definitive', () => {
    const report = benchmarkReviewedOmrCorpus(corpusEntries())

    assert.equal(report.aggregate.fixtureCount, 7)
    assert.equal(report.aggregate.sourceVerifiedFixtures, 0)
    assert.equal(report.aggregate.automaticPlaybackAllowedFixtures, 0)
    assert.ok(report.fixtures.every((fixture) => fixture.quality.sourceVerified === false))
    assert.ok(report.fixtures.every((fixture) => fixture.quality.automaticPlaybackAllowed === false))
    assert.ok(report.fixtures.every((fixture) => fixture.truth.recognitionAccuracy === null))
  })

  test('diagnostic metrics stay aligned with reviewed real-OMR regression fingerprints', () => {
    const report = benchmarkReviewedOmrCorpus(corpusEntries())

    for (const fixture of report.fixtures) {
      const expected = expectedMetrics[fixture.fileName]
      assert.ok(expected, `${fixture.fileName}: missing reviewed metric expectation`)
      for (const [key, value] of Object.entries(expected)) {
        assert.deepEqual(fixture.metrics[key], value, `${fixture.fileName}: ${key}`)
      }
      assert.match(fixture.inputSha256, /^[a-f0-9]{64}$/)
      assert.equal(fixture.reviewBasis, 'repository-regression-fixture')
    }
  })

  test('aggregate counts are derived from the fixed reviewed population', () => {
    const report = benchmarkReviewedOmrCorpus(corpusEntries())

    assert.equal(report.aggregate.primaryMeasures, 481)
    assert.equal(report.aggregate.structuredNotes, 3008)
    assert.equal(report.aggregate.primaryNotes, 2991)
    assert.equal(report.aggregate.pitchedNotes, 2692)
    assert.equal(report.aggregate.rests, 299)
    assert.equal(report.aggregate.chordContinuations, 206)
    assert.equal(report.aggregate.multiVoiceMeasures, 69)
    assert.equal(report.aggregate.backupEvents, 226)
    assert.equal(
      report.aggregate.totalFindings,
      report.aggregate.totalErrors + report.aggregate.totalWarnings,
    )
  })

  test('input order does not change deterministic diagnostic output', () => {
    const entries = corpusEntries()
    const forward = benchmarkReviewedOmrCorpus(entries)
    const reverse = benchmarkReviewedOmrCorpus([...entries].reverse())

    assert.deepEqual(reverse, forward)
    assert.deepEqual(
      forward.fixtures.map((fixture) => fixture.fileName),
      REVIEWED_OMR_FIXTURE_NAMES,
    )
  })

  test('missing, duplicate and unapproved corpus members fail closed', () => {
    const entries = corpusEntries()

    assert.throws(
      () => benchmarkReviewedOmrCorpus(entries.slice(1)),
      /missing-omr-benchmark-fixture/,
    )
    assert.throws(
      () => benchmarkReviewedOmrCorpus([...entries, entries[0]]),
      /duplicate-omr-benchmark-fixture/,
    )
    assert.throws(
      () => benchmarkReviewedOmrCorpus([
        ...entries.slice(0, -1),
        { fileName: 'unknown.xml', xml: entries.at(-1).xml },
      ]),
      /unapproved-omr-benchmark-fixture/,
    )
  })

  test('empty or malformed reviewed fixture fails closed without partial output', () => {
    const entries = corpusEntries()
    const empty = entries.map((entry) => ({ ...entry }))
    empty[0].xml = ''
    assert.throws(
      () => benchmarkReviewedOmrCorpus(empty),
      /invalid-omr-benchmark-xml/,
    )

    const malformed = entries.map((entry) => ({ ...entry }))
    malformed[0].xml = '<score-partwise><part>'
    assert.throws(
      () => benchmarkReviewedOmrCorpus(malformed),
      /omr-benchmark-parse-failed/,
    )
  })

  test('diagnostic is read-only and deeply freezes its result contract', () => {
    const entries = corpusEntries()
    const before = entries.map((entry) => ({ ...entry }))
    const report = benchmarkReviewedOmrCorpus(entries)

    assert.deepEqual(entries, before)
    assert.equal(Object.isFrozen(report), true)
    assert.equal(Object.isFrozen(report.fixtures), true)
    assert.equal(Object.isFrozen(report.fixtures[0].metrics), true)
    assert.equal(Object.isFrozen(report.fixtures[0].quality.findingSummary.byErrorCode), true)
  })
})

describe('Package 2E fixture inventory provenance', () => {
  test('inventory separates two teacher-verified golden references from seven regression-only outputs', () => {
    assert.equal(OMR_BENCHMARK_FIXTURE_INVENTORY.length, 9)
    assert.equal(OMR_BENCHMARK_GOLDEN_REFERENCES.length, 2)
    assert.equal(OMR_BENCHMARK_REGRESSION_OUTPUTS.length, 7)

    assert.ok(OMR_BENCHMARK_GOLDEN_REFERENCES.every(
      (fixture) => fixture.role === OMR_FIXTURE_ROLE.GOLDEN_REFERENCE &&
        fixture.evidenceState === OMR_FIXTURE_EVIDENCE_STATE.TEACHER_VERIFIED &&
        fixture.sourcePdf && fixture.expectedMusicXml,
    ))
    assert.ok(OMR_BENCHMARK_REGRESSION_OUTPUTS.every(
      (fixture) => fixture.role === OMR_FIXTURE_ROLE.REGRESSION_OUTPUT_ONLY &&
        fixture.evidenceState === OMR_FIXTURE_EVIDENCE_STATE.REVIEW_REQUIRED &&
        fixture.sourcePdf === null && fixture.expectedMusicXml === null,
    ))
  })

  test('every inventoried repository artifact path exists', () => {
    for (const fixture of OMR_BENCHMARK_FIXTURE_INVENTORY) {
      for (const key of ['sourcePdf', 'expectedMusicXml', 'omrArtifact', 'approvalRecord', 'integrityManifest', 'regressionMusicXml']) {
        const relativePath = fixture[key]
        if (relativePath) assert.doesNotThrow(() => readFileSync(path.join(repoRoot, relativePath)), `${fixture.fixtureId}:${key}`)
      }
    }
  })
})

describe('Package 2E-A comparative variant contract', () => {
  test('contract enumerates the approved preprocessing input variants without executing them', () => {
    assert.deepEqual(Object.values(OMR_BENCHMARK_VARIANT_KIND), [
      'original_pdf',
      'original_page_image',
      'png',
      'high_quality_jpg',
      'deskewed_image',
      'cropped_image',
      'adaptive_binarization',
      'upscale_denoise',
    ])
  })

  test('operation without golden MusicXML is explicit NOT_MEASURED, never invented accuracy', () => {
    const report = createComparativeOmrBenchmarkReport({
      benchmarkId: 'without-golden',
      variants: [basicVariant('original')],
    })

    assert.equal(report.benchmarkKind, OMR_COMPARATIVE_BENCHMARK_KIND)
    assert.equal(report.goldenReference, null)
    assert.equal(report.recommendation.state, OMR_BENCHMARK_MEASUREMENT_STATE.NOT_MEASURED)
    assert.equal(report.recommendation.variantId, null)
    const variant = report.variants[0]
    assert.equal(variant.comparison.state, OMR_BENCHMARK_MEASUREMENT_STATE.NOT_MEASURED)
    assert.equal(variant.comparison.reference, null)
    for (const metricName of comparisonMetricNames) {
      assert.deepEqual(variant.comparison[metricName], {
        state: OMR_BENCHMARK_MEASUREMENT_STATE.NOT_MEASURED,
        value: null,
      })
    }
    assert.equal(variant.comparison.musicalCorrectness.state, OMR_BENCHMARK_MEASUREMENT_STATE.REVIEW_REQUIRED)
    assert.equal(variant.sourceVerification.definitive, false)
  })

  test('teacher-verified golden identity may be recorded without pretending comparison already ran', () => {
    const report = createComparativeOmrBenchmarkReport({
      benchmarkId: 'approved-reference-not-yet-measured',
      goldenReferenceId: 'plan0-owner-approved-3-8',
      variants: [basicVariant('original')],
    })

    assert.equal(report.goldenReference.fixtureId, 'plan0-owner-approved-3-8')
    assert.equal(report.goldenReference.evidenceState, OMR_FIXTURE_EVIDENCE_STATE.TEACHER_VERIFIED)
    assert.equal(report.variants[0].comparison.reference.fixtureId, 'plan0-owner-approved-3-8')
    assert.equal(report.variants[0].comparison.state, OMR_BENCHMARK_MEASUREMENT_STATE.NOT_MEASURED)
    assert.equal(report.recommendation.variantId, null)
  })

  test('variant records are isolated, deterministic and never share mutable experiment state', () => {
    const sharedMetadata = { nested: { dpi: 300 }, page: 1 }
    const variants = [
      { ...basicVariant('png', OMR_BENCHMARK_VARIANT_KIND.PNG), inputMetadata: sharedMetadata },
      { ...basicVariant('pdf', OMR_BENCHMARK_VARIANT_KIND.ORIGINAL_PDF), inputMetadata: sharedMetadata },
    ]
    const forward = createComparativeOmrBenchmarkReport({ benchmarkId: 'isolation', variants })
    const reverse = createComparativeOmrBenchmarkReport({ benchmarkId: 'isolation', variants: [...variants].reverse() })

    assert.deepEqual(reverse, forward)
    assert.deepEqual(forward.variants.map((variant) => variant.variantId), ['pdf', 'png'])
    assert.notEqual(forward.variants[0].inputMetadata, forward.variants[1].inputMetadata)
    assert.notEqual(forward.variants[0].inputMetadata.nested, forward.variants[1].inputMetadata.nested)
    assert.equal(Object.isFrozen(forward.variants[0]), true)

    sharedMetadata.nested.dpi = 72
    assert.equal(forward.variants[0].inputMetadata.nested.dpi, 300)
    assert.equal(forward.variants[1].inputMetadata.nested.dpi, 300)
    assert.equal('mergedMusicXml' in forward, false)
  })

  test('duplicate IDs, unsupported variants, unknown goldens and non-JSON metadata fail closed', () => {
    assert.throws(
      () => createComparativeOmrBenchmarkReport({
        benchmarkId: 'duplicates',
        variants: [basicVariant('same'), basicVariant('same')],
      }),
      /duplicate-omr-benchmark-variant/,
    )
    assert.throws(
      () => createOmrVariantRecord({ ...basicVariant('bad'), variantKind: 'magic-enhance' }),
      /unsupported-omr-benchmark-variant/,
    )
    assert.throws(
      () => createComparativeOmrBenchmarkReport({
        benchmarkId: 'unknown-golden',
        goldenReferenceId: 'not-a-golden',
        variants: [basicVariant('original')],
      }),
      /unknown-omr-golden-reference/,
    )
    assert.throws(
      () => createOmrVariantRecord({
        ...basicVariant('non-json'),
        inputMetadata: { unsafe: new Date() },
      }),
      /plain objects/,
    )
  })

  test('contract operations do not modify original golden PDF or MusicXML bytes', () => {
    const reference = OMR_BENCHMARK_GOLDEN_REFERENCES.find(
      (fixture) => fixture.fixtureId === 'plan0-owner-approved-3-8',
    )
    const pdfPath = path.join(repoRoot, reference.sourcePdf)
    const xmlPath = path.join(repoRoot, reference.expectedMusicXml)
    const beforePdf = readFileSync(pdfPath)
    const beforeXml = readFileSync(xmlPath)

    createComparativeOmrBenchmarkReport({
      benchmarkId: 'preservation',
      goldenReferenceId: reference.fixtureId,
      variants: [basicVariant('original')],
    })

    assert.deepEqual(readFileSync(pdfPath), beforePdf)
    assert.deepEqual(readFileSync(xmlPath), beforeXml)
  })

  test('2E-A modules have no write-capable filesystem or production OMR imports', () => {
    const paths = [
      'scripts/omrBenchmark.js',
      'scripts/omrBenchmarkFixtureInventory.js',
      'scripts/runOmrBenchmark.js',
    ]

    for (const relativePath of paths) {
      const source = readFileSync(path.join(repoRoot, relativePath), 'utf8')
      assert.doesNotMatch(source, /from\s+['"]\.\.\/backend\//u, `${relativePath}: backend import`)
      assert.doesNotMatch(source, /from\s+['"]\.\.\/src\/app\.js/u, `${relativePath}: app import`)
      assert.doesNotMatch(source, /\b(writeFile|writeFileSync|rm|rmSync|unlink|unlinkSync|rename|renameSync|mkdir|mkdirSync)\b/u, `${relativePath}: write-capable fs API`)
    }
  })
})
