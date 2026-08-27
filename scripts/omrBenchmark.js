// Package 2E — deterministic, read-only OMR benchmark contracts.
//
// This module intentionally separates two evidence domains:
// 1) the existing reviewed real-OMR MusicXML regression corpus, which is useful
//    for deterministic structural diagnostics but is not musical ground truth;
// 2) the comparative-variant contract, which records preprocessing/Audiveris
//    experiment evidence without inventing accuracy when comparison has not run.
//
// It never invokes or changes the production OMR pipeline.

import { createHash } from 'node:crypto'

import { parseMusicXmlWithStructure } from '../musicXmlParser.js'
import { buildMusicXmlQualityErrorReport } from '../src/services/musicXmlQualityReport.js'
import {
  OMR_BENCHMARK_GOLDEN_REFERENCES,
} from './omrBenchmarkFixtureInventory.js'

export const OMR_BENCHMARK_SCHEMA_VERSION = 1
export const OMR_BENCHMARK_KIND = 'reviewed-output-diagnostic'
export const OMR_COMPARATIVE_BENCHMARK_KIND = 'comparative-variant-contract'

export const OMR_BENCHMARK_MEASUREMENT_STATE = Object.freeze({
  MEASURED: 'MEASURED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  NOT_MEASURED: 'NOT_MEASURED',
  UNKNOWN: 'UNKNOWN',
})

export const OMR_BENCHMARK_VARIANT_KIND = Object.freeze({
  ORIGINAL_PDF: 'original_pdf',
  ORIGINAL_PAGE_IMAGE: 'original_page_image',
  PNG: 'png',
  HIGH_QUALITY_JPG: 'high_quality_jpg',
  DESKEWED_IMAGE: 'deskewed_image',
  CROPPED_IMAGE: 'cropped_image',
  ADAPTIVE_BINARIZATION: 'adaptive_binarization',
  UPSCALE_DENOISE: 'upscale_denoise',
})

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
  scope: 'reviewed-output-diagnostic-only',
  fixtureProvenance: 'reviewed-real-audiveris-musicxml-regression-corpus',
  musicalGroundTruthAvailable: false,
  recognitionAccuracyAvailable: false,
  recognitionAccuracy: null,
  comparisonTarget: 'parser-structural-quality-consistency',
  limitation: 'No aligned source-score ground truth is attached to this seven-file regression corpus, so note, rhythm, symbol, or page recognition accuracy must not be inferred from this diagnostic.',
})

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
}

function cloneDeterministic(value, label = 'benchmark-value') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${label} must contain only finite numbers.`)
    return value
  }
  if (Array.isArray(value)) return value.map((item, index) => cloneDeterministic(item, `${label}[${index}]`))
  if (typeof value !== 'object') throw new TypeError(`${label} must contain only JSON-like values.`)

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must contain only plain objects.`)
  }

  const clone = {}
  for (const key of Object.keys(value).sort()) {
    clone[key] = cloneDeterministic(value[key], `${label}.${key}`)
  }
  return clone
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

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} must be a non-empty string.`)
  return value.trim()
}

function resolveGoldenReference(goldenReferenceId) {
  if (goldenReferenceId === null || goldenReferenceId === undefined) return null
  const id = requireNonEmptyString(goldenReferenceId, 'goldenReferenceId')
  const reference = OMR_BENCHMARK_GOLDEN_REFERENCES.find((fixture) => fixture.fixtureId === id)
  if (!reference) throw new Error(`unknown-omr-golden-reference:${id}`)
  return reference
}

function notMeasuredMetric() {
  return {
    state: OMR_BENCHMARK_MEASUREMENT_STATE.NOT_MEASURED,
    value: null,
  }
}

export function createUnmeasuredGoldenComparison(goldenReferenceId = null) {
  const reference = resolveGoldenReference(goldenReferenceId)
  const reason = reference
    ? 'Golden reference is identified, but the Package 2E-A comparator has not measured this variant yet.'
    : 'No golden MusicXML comparison was supplied; accuracy metrics are not measured.'

  return deepFreeze({
    state: OMR_BENCHMARK_MEASUREMENT_STATE.NOT_MEASURED,
    reference: reference
      ? {
          fixtureId: reference.fixtureId,
          evidenceState: reference.evidenceState,
          expectedMusicXml: reference.expectedMusicXml,
        }
      : null,
    missingNotes: notMeasuredMetric(),
    extraNotes: notMeasuredMetric(),
    pitchErrors: notMeasuredMetric(),
    durationErrors: notMeasuredMetric(),
    voiceErrors: notMeasuredMetric(),
    fullyCorrectMeasureRate: notMeasuredMetric(),
    musicalCorrectness: {
      state: OMR_BENCHMARK_MEASUREMENT_STATE.REVIEW_REQUIRED,
      value: null,
    },
    reason,
  })
}

export function createOmrVariantRecord({
  variantId,
  variantKind,
  inputMetadata = {},
  preprocessingSettings = {},
  audiverisSettings = {},
  generatedMusicXml = null,
  validatorFindings = [],
  goldenReferenceId = null,
} = {}) {
  const normalizedId = requireNonEmptyString(variantId, 'variantId')
  const allowedKinds = Object.values(OMR_BENCHMARK_VARIANT_KIND)
  if (!allowedKinds.includes(variantKind)) throw new Error(`unsupported-omr-benchmark-variant:${variantKind}`)
  if (!Array.isArray(validatorFindings)) throw new TypeError('validatorFindings must be an array.')

  return deepFreeze({
    variantId: normalizedId,
    variantKind,
    inputMetadata: cloneDeterministic(inputMetadata, 'inputMetadata'),
    preprocessingSettings: cloneDeterministic(preprocessingSettings, 'preprocessingSettings'),
    audiverisSettings: cloneDeterministic(audiverisSettings, 'audiverisSettings'),
    generatedMusicXml: cloneDeterministic(generatedMusicXml, 'generatedMusicXml'),
    validatorFindings: cloneDeterministic(validatorFindings, 'validatorFindings'),
    comparison: createUnmeasuredGoldenComparison(goldenReferenceId),
    sourceVerification: {
      state: OMR_BENCHMARK_MEASUREMENT_STATE.REVIEW_REQUIRED,
      definitive: false,
    },
  })
}

export function createComparativeOmrBenchmarkReport({
  benchmarkId,
  goldenReferenceId = null,
  variants,
} = {}) {
  const normalizedBenchmarkId = requireNonEmptyString(benchmarkId, 'benchmarkId')
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new TypeError('variants must be a non-empty array.')
  }

  const seenIds = new Set()
  const records = variants.map((variant) => {
    const record = createOmrVariantRecord({ ...variant, goldenReferenceId })
    if (seenIds.has(record.variantId)) throw new Error(`duplicate-omr-benchmark-variant:${record.variantId}`)
    seenIds.add(record.variantId)
    return record
  }).sort((a, b) => a.variantId.localeCompare(b.variantId))

  const reference = resolveGoldenReference(goldenReferenceId)

  return deepFreeze({
    schemaVersion: OMR_BENCHMARK_SCHEMA_VERSION,
    benchmarkKind: OMR_COMPARATIVE_BENCHMARK_KIND,
    benchmarkId: normalizedBenchmarkId,
    goldenReference: reference
      ? {
          fixtureId: reference.fixtureId,
          evidenceState: reference.evidenceState,
          sourcePdf: reference.sourcePdf,
          expectedMusicXml: reference.expectedMusicXml,
        }
      : null,
    variants: records,
    recommendation: {
      state: OMR_BENCHMARK_MEASUREMENT_STATE.NOT_MEASURED,
      variantId: null,
      reason: 'Package 2E-A records evidence only. A best complete result cannot be selected until golden comparison metrics are actually measured.',
    },
  })
}

/**
 * Benchmark the exact reviewed real-OMR corpus. Input order does not affect
 * output order or content. Missing, duplicate, or unapproved fixtures fail
 * closed rather than silently changing the diagnostic population.
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
