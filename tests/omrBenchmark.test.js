import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import '../scripts/runOmrQualityReport.js'
import {
  OMR_BENCHMARK_KIND,
  OMR_BENCHMARK_SCHEMA_VERSION,
  OMR_BENCHMARK_TRUTH_DOMAIN,
  REVIEWED_OMR_FIXTURE_NAMES,
  benchmarkReviewedOmrCorpus,
} from '../scripts/omrBenchmark.js'

const fixtureDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'real-omr',
)

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

describe('Package 2E reviewed OMR benchmark contract', () => {
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

  test('benchmark never fabricates musical ground truth or recognition accuracy', () => {
    const report = benchmarkReviewedOmrCorpus(corpusEntries())

    assert.equal(report.schemaVersion, OMR_BENCHMARK_SCHEMA_VERSION)
    assert.equal(report.benchmarkKind, OMR_BENCHMARK_KIND)
    assert.equal(report.truth, OMR_BENCHMARK_TRUTH_DOMAIN)
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

  test('benchmark metrics stay aligned with the reviewed real-OMR regression fingerprints', () => {
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

  test('input order does not change deterministic benchmark output', () => {
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

  test('empty or malformed reviewed fixture fails closed without partial benchmark output', () => {
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

  test('benchmark is read-only and deeply freezes its result contract', () => {
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
