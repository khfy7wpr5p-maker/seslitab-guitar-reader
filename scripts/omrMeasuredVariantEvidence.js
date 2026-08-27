// Package 2E-C — measured variant evidence adapter.
//
// Converts one isolated experiment's generated MusicXML into deterministic
// benchmark evidence. It never invokes Audiveris, preprocessing, the OMR
// gateway/worker/provider, or any production consumer. Raw generated MusicXML
// is hashed and measured but is not retained in the returned evidence record.

import { createHash } from 'node:crypto'

import { buildMusicXmlQualityErrorReport } from '../src/services/musicXmlQualityReport.js'
import {
  OMR_BENCHMARK_MEASUREMENT_STATE,
  createOmrVariantRecord,
} from './omrBenchmark.js'
import {
  compareGeneratedMusicXmlToGolden,
} from './omrGoldenComparator.js'

export const OMR_MEASURED_VARIANT_EVIDENCE_SCHEMA_VERSION = 1
export const OMR_MEASURED_VARIANT_EVIDENCE_KIND = 'measured-variant-evidence'

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function unknownMetric() {
  return {
    state: OMR_BENCHMARK_MEASUREMENT_STATE.UNKNOWN,
    value: null,
  }
}

function normalizeComparison(comparison) {
  if (!comparison) {
    return deepFreeze({
      state: OMR_BENCHMARK_MEASUREMENT_STATE.UNKNOWN,
      reference: null,
      missingNotes: unknownMetric(),
      extraNotes: unknownMetric(),
      pitchErrors: unknownMetric(),
      durationErrors: unknownMetric(),
      voiceErrors: unknownMetric(),
      fullyCorrectMeasureRate: unknownMetric(),
      musicalCorrectness: {
        state: OMR_BENCHMARK_MEASUREMENT_STATE.REVIEW_REQUIRED,
        value: null,
      },
      reason: 'Golden comparison did not return evidence.',
      evidence: null,
    })
  }

  return deepFreeze({
    state: comparison.state,
    reference: comparison.reference,
    missingNotes: comparison.metrics.missingNotes,
    extraNotes: comparison.metrics.extraNotes,
    pitchErrors: comparison.metrics.pitchErrors,
    durationErrors: comparison.metrics.durationErrors,
    voiceErrors: comparison.metrics.voiceErrors,
    fullyCorrectMeasureRate: comparison.metrics.fullyCorrectMeasureRate,
    musicalCorrectness: {
      state: OMR_BENCHMARK_MEASUREMENT_STATE.REVIEW_REQUIRED,
      value: null,
      reason: 'Measured event equality is benchmark evidence, not a complete claim of musical correctness.',
    },
    reason: comparison.reason,
    evidence: {
      comparisonKind: comparison.comparisonKind,
      inputSha256: comparison.inputSha256,
      goldenSha256: comparison.goldenSha256,
      alignment: comparison.alignment,
      measures: comparison.measures,
    },
  })
}

function qualityEvidenceFrom(result) {
  if (!result?.ok || !result.report) {
    return deepFreeze({
      state: OMR_BENCHMARK_MEASUREMENT_STATE.UNKNOWN,
      ok: false,
      qualityState: null,
      structurallyValid: false,
      sourceVerified: false,
      reviewRequired: true,
      reliable: false,
      automaticPlaybackAllowed: false,
      findingCount: 0,
      reason: result?.error || result?.reason || 'MusicXML quality evidence could not be produced.',
    })
  }

  const report = result.report
  return deepFreeze({
    state: OMR_BENCHMARK_MEASUREMENT_STATE.MEASURED,
    ok: true,
    qualityState: report.qualityState,
    structurallyValid: report.structurallyValid,
    sourceVerified: report.sourceVerified,
    reviewRequired: report.reviewRequired,
    reliable: report.reliable,
    automaticPlaybackAllowed: report.automaticPlaybackAllowed,
    findingCount: Array.isArray(report.findings) ? report.findings.length : 0,
    reason: null,
  })
}

/**
 * Attach actually observed MusicXML evidence to one immutable Package 2E
 * variant. A golden reference is optional. Without it, recognition metrics
 * stay NOT_MEASURED even though structural/quality diagnostics are available.
 */
export function measureOmrVariantEvidence({
  variantId,
  variantKind,
  inputMetadata = {},
  preprocessingSettings = {},
  audiverisSettings = {},
  generatedMusicXml,
  goldenReferenceId = null,
} = {}) {
  if (typeof generatedMusicXml !== 'string' || generatedMusicXml.trim() === '') {
    throw new TypeError('generatedMusicXml must be a non-empty string.')
  }

  const artifact = deepFreeze({
    format: 'musicxml',
    byteLength: Buffer.byteLength(generatedMusicXml, 'utf8'),
    sha256: sha256(generatedMusicXml),
  })

  const qualityResult = buildMusicXmlQualityErrorReport(generatedMusicXml)
  const validatorFindings = qualityResult?.ok && qualityResult.report && Array.isArray(qualityResult.report.findings)
    ? qualityResult.report.findings
    : []

  const base = createOmrVariantRecord({
    variantId,
    variantKind,
    inputMetadata,
    preprocessingSettings,
    audiverisSettings,
    generatedMusicXml: artifact,
    validatorFindings,
    goldenReferenceId,
  })

  let comparison = base.comparison
  if (goldenReferenceId !== null && goldenReferenceId !== undefined) {
    comparison = normalizeComparison(compareGeneratedMusicXmlToGolden({
      goldenReferenceId,
      generatedMusicXml,
    }))
  }

  return deepFreeze({
    schemaVersion: OMR_MEASURED_VARIANT_EVIDENCE_SCHEMA_VERSION,
    evidenceKind: OMR_MEASURED_VARIANT_EVIDENCE_KIND,
    variantId: base.variantId,
    variantKind: base.variantKind,
    inputMetadata: base.inputMetadata,
    preprocessingSettings: base.preprocessingSettings,
    audiverisSettings: base.audiverisSettings,
    generatedMusicXml: artifact,
    validatorFindings: base.validatorFindings,
    qualityEvidence: qualityEvidenceFrom(qualityResult),
    comparison,
    sourceVerification: base.sourceVerification,
  })
}
