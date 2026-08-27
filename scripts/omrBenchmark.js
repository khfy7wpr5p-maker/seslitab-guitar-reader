// Package 2E — deterministic OMR benchmark contract.
//
// This benchmark measures only evidence that exists in the repository's
// reviewed real-Audiveris MusicXML regression corpus. It deliberately does not
// claim recognition accuracy because no aligned musical ground-truth score is
// part of this package.

import { createHash } from 'node:crypto'

import { parseMusicXmlWithStructure } from '../musicXmlParser.js'
import { buildMusicXmlQualityErrorReport } from '../src/services/musicXmlQualityReport.js'

export const OMR_BENCHMARK_SCHEMA_VERSION = 1
export const OMR_BENCHMARK_KIND = 'reviewed-output-diagnostic'

export const REVIEWED_OMR_FIXTURE_NAMES = Object.freeze([
  'django-clean.xml',
  'fikriminincegulu-clean.xml',
  'fug1001-clean.xml',
  'gesi-clean.xml',
  'karayip-korsanlari-clean.xml',
  'samanyolu-clean.xml',
  'shostywaltz-clean.xml',
])

export const OMR_BENCHMARK_TRUTH_DOMAIN = Object.freeze({
  fixtureProvenance: 'reviewed-real-audiveris-musicxml-regression-corpus',
  musicalGroundTruthAvailable: false,
  recognitionAccuracyAvailable: false,
  recognitionAccuracy: null,
  comparisonTarget: 'parser-structural-quality-consistency',
  limitation: 'No aligned source-score ground truth is included, so note, rhythm, symbol, or page recognition accuracy must not be inferred from this benchmark.',
})

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function sortedCountObject(values) {
  const counts = new Map()
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1)
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))))
}

function findingCodeCounts(findings) {
  return sortedCountObject((findings || []).map((finding) => finding.errorCode))
}

function primaryVoiceMetrics(notes) {
  const voices = [...new Set((notes || []).map((note) => note.voice))]
    .sort((a, b) => Number(a) - Number(b))

  const voicesByMeasure = new Map()
  for (const note of notes || []) {
    if (!voicesByMeasure.has(note.measureKey)) voicesByMeasure.set(note.measureKey, new Set())
    voicesByMeasure.get(note.measureKey).add(note.voice)
  }

  return {
    voices,
    multiVoiceMeasures: [...voicesByMeasure.values()].filter((set) => set.size > 1).length,
  }
}

function partFingerprint(parts) {
  return (parts || []).map((part) => ({
    partId: part.partId ?? null,
    measureCount: part.measureCount ?? null,
    pitchedNoteCount: part.pitchedNoteCount ?? null,
    restCount: part.restCount ?? null,
  }))
}

function benchmarkFixture(fileName, xml) {
  if (!REVIEWED_OMR_FIXTURE_NAMES.includes(fileName)) {
    throw new Error(`unapproved-omr-benchmark-fixture:${fileName}`)
  }
  if (typeof xml !== 'string' || xml.trim() === '') {
    throw new Error(`invalid-omr-benchmark-xml:${fileName}`)
  }

  const structured = parseMusicXmlWithStructure(xml)
  if (!structured || structured.error) {
    throw new Error(`omr-benchmark-parse-failed:${fileName}`)
  }

  const qualityResult = buildMusicXmlQualityErrorReport(xml)
  if (!qualityResult?.ok || !qualityResult.report) {
    throw new Error(`omr-benchmark-quality-report-failed:${fileName}`)
  }

  const primaryPartId = structured.primaryPartId ?? null
  const primaryNotes = (structured.notes || []).filter((note) => note.partId === primaryPartId)
  const pitchedNotes = primaryNotes.filter((note) => !note.isRest)
  const rests = primaryNotes.filter((note) => note.isRest)
  const primaryMeasureCount = (structured.measureMetadata || []).filter(
    (measure) => measure.partId === primaryPartId,
  ).length
  const backupEvents = (structured.measureEvents || []).filter(
    (event) => event.partId === primaryPartId && event.type === 'backup',
  ).length
  const voiceMetrics = primaryVoiceMetrics(primaryNotes)
  const report = qualityResult.report

  return deepFreeze({
    fileName,
    inputSha256: sha256(xml),
    reviewBasis: 'repository-regression-fixture',
    primaryPartId,
    parts: partFingerprint(structured.parts),
    metrics: {
      partCount: (structured.parts || []).length,
      primaryMeasureCount,
      structuredNoteCount: (structured.notes || []).length,
      primaryNoteCount: primaryNotes.length,
      pitchedNoteCount: pitchedNotes.length,
      restCount: rests.length,
      voices: voiceMetrics.voices,
      chordContinuations: primaryNotes.filter((note) => note.isChordNote).length,
      multiVoiceMeasures: voiceMetrics.multiVoiceMeasures,
      backupEvents,
    },
    quality: {
      qualityState: report.qualityState,
      structurallyValid: report.structurallyValid,
      sourceVerified: report.sourceVerified,
      reviewRequired: report.reviewRequired,
      reliable: report.reliable,
      automaticPlaybackAllowed: report.automaticPlaybackAllowed,
      findingSummary: {
        ...report.summary,
        byErrorCode: findingCodeCounts(report.findings),
      },
    },
    truth: OMR_BENCHMARK_TRUTH_DOMAIN,
  })
}

function validateCorpusEntries(entries) {
  if (!Array.isArray(entries)) throw new TypeError('OMR benchmark corpus must be an array.')

  const byName = new Map()
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new TypeError('OMR benchmark corpus entries must be objects.')
    }
    const { fileName, xml } = entry
    if (!REVIEWED_OMR_FIXTURE_NAMES.includes(fileName)) {
      throw new Error(`unapproved-omr-benchmark-fixture:${fileName}`)
    }
    if (byName.has(fileName)) throw new Error(`duplicate-omr-benchmark-fixture:${fileName}`)
    if (typeof xml !== 'string' || xml.trim() === '') {
      throw new Error(`invalid-omr-benchmark-xml:${fileName}`)
    }
    byName.set(fileName, xml)
  }

  const missing = REVIEWED_OMR_FIXTURE_NAMES.filter((fileName) => !byName.has(fileName))
  if (missing.length > 0) throw new Error(`missing-omr-benchmark-fixture:${missing.join(',')}`)
  if (byName.size !== REVIEWED_OMR_FIXTURE_NAMES.length) {
    throw new Error('invalid-omr-benchmark-corpus-size')
  }

  return byName
}

function aggregateBenchmarks(fixtures) {
  const qualityStates = sortedCountObject(fixtures.map((fixture) => fixture.quality.qualityState))
  const findingCodes = []
  let totalFindings = 0
  let totalErrors = 0
  let totalWarnings = 0

  for (const fixture of fixtures) {
    const summary = fixture.quality.findingSummary
    totalFindings += summary.totalFindings
    totalErrors += summary.errors
    totalWarnings += summary.warnings
    for (const [code, count] of Object.entries(summary.byErrorCode)) {
      for (let i = 0; i < count; i++) findingCodes.push(code)
    }
  }

  return {
    fixtureCount: fixtures.length,
    structurallyValidFixtures: fixtures.filter((fixture) => fixture.quality.structurallyValid).length,
    sourceVerifiedFixtures: fixtures.filter((fixture) => fixture.quality.sourceVerified).length,
    reviewRequiredFixtures: fixtures.filter((fixture) => fixture.quality.reviewRequired).length,
    automaticPlaybackAllowedFixtures: fixtures.filter((fixture) => fixture.quality.automaticPlaybackAllowed).length,
    primaryMeasures: fixtures.reduce((sum, fixture) => sum + fixture.metrics.primaryMeasureCount, 0),
    structuredNotes: fixtures.reduce((sum, fixture) => sum + fixture.metrics.structuredNoteCount, 0),
    primaryNotes: fixtures.reduce((sum, fixture) => sum + fixture.metrics.primaryNoteCount, 0),
    pitchedNotes: fixtures.reduce((sum, fixture) => sum + fixture.metrics.pitchedNoteCount, 0),
    rests: fixtures.reduce((sum, fixture) => sum + fixture.metrics.restCount, 0),
    chordContinuations: fixtures.reduce((sum, fixture) => sum + fixture.metrics.chordContinuations, 0),
    multiVoiceMeasures: fixtures.reduce((sum, fixture) => sum + fixture.metrics.multiVoiceMeasures, 0),
    backupEvents: fixtures.reduce((sum, fixture) => sum + fixture.metrics.backupEvents, 0),
    totalFindings,
    totalErrors,
    totalWarnings,
    qualityStates,
    findingsByErrorCode: sortedCountObject(findingCodes),
  }
}

/**
 * Benchmark the exact reviewed real-OMR corpus. Input order does not affect
 * output order or content. Missing, duplicate, or unapproved fixtures fail
 * closed rather than silently changing the benchmark population.
 */
export function benchmarkReviewedOmrCorpus(entries) {
  const byName = validateCorpusEntries(entries)
  const fixtures = REVIEWED_OMR_FIXTURE_NAMES.map((fileName) =>
    benchmarkFixture(fileName, byName.get(fileName)),
  )

  return deepFreeze({
    schemaVersion: OMR_BENCHMARK_SCHEMA_VERSION,
    benchmarkKind: OMR_BENCHMARK_KIND,
    corpus: {
      name: 'seslitab-reviewed-real-omr-v1',
      fixtureNames: [...REVIEWED_OMR_FIXTURE_NAMES],
      fixedPopulation: true,
    },
    truth: OMR_BENCHMARK_TRUTH_DOMAIN,
    aggregate: aggregateBenchmarks(fixtures),
    fixtures,
  })
}
