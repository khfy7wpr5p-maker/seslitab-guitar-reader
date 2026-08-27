// Package 2E-E — deterministic evidence-only benchmark recommendation.
//
// Selects a preprocessing/OMR variant only when the experiment is complete,
// every required golden-comparison metric is actually measured, and one
// variant Pareto-dominates every other variant. No weighted score, guessed
// accuracy percentage, or production OMR behavior is introduced here.

import {
  OMR_BENCHMARK_MEASUREMENT_STATE,
  OMR_BENCHMARK_VARIANT_KIND,
} from './omrBenchmark.js'

export const OMR_BENCHMARK_RECOMMENDATION_SCHEMA_VERSION = 1
export const OMR_BENCHMARK_RECOMMENDATION_KIND = 'evidence-only-variant-recommendation'

export const OMR_BENCHMARK_RECOMMENDATION_STATE = Object.freeze({
  RECOMMENDED: 'RECOMMENDED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  UNKNOWN: 'UNKNOWN',
})

const REQUIRED_ERROR_METRICS = Object.freeze([
  'missingNotes',
  'extraNotes',
  'pitchErrors',
  'durationErrors',
  'voiceErrors',
])

const RATE_METRIC = 'fullyCorrectMeasureRate'
const APPROVED_VARIANT_KINDS = Object.freeze(Object.values(OMR_BENCHMARK_VARIANT_KIND))

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
}

function reviewRequired(reason, details = {}) {
  return deepFreeze({
    schemaVersion: OMR_BENCHMARK_RECOMMENDATION_SCHEMA_VERSION,
    recommendationKind: OMR_BENCHMARK_RECOMMENDATION_KIND,
    state: OMR_BENCHMARK_RECOMMENDATION_STATE.REVIEW_REQUIRED,
    variantId: null,
    variantKind: null,
    reason,
    accuracyPercentage: null,
    ...details,
  })
}

function unknown(reason) {
  return deepFreeze({
    schemaVersion: OMR_BENCHMARK_RECOMMENDATION_SCHEMA_VERSION,
    recommendationKind: OMR_BENCHMARK_RECOMMENDATION_KIND,
    state: OMR_BENCHMARK_RECOMMENDATION_STATE.UNKNOWN,
    variantId: null,
    variantKind: null,
    reason,
    accuracyPercentage: null,
    paretoFrontier: [],
  })
}

function metricValue(metric, name, { rate = false } = {}) {
  if (!metric || metric.state !== OMR_BENCHMARK_MEASUREMENT_STATE.MEASURED) {
    throw new Error(`benchmark-metric-not-measured:${name}`)
  }
  if (!Number.isFinite(metric.value)) throw new Error(`benchmark-metric-invalid:${name}`)

  if (rate) {
    if (metric.value < 0 || metric.value > 1) throw new Error(`benchmark-rate-out-of-range:${name}`)
  } else if (!Number.isInteger(metric.value) || metric.value < 0) {
    throw new Error(`benchmark-count-invalid:${name}`)
  }

  return metric.value
}

function extractMeasuredVector(variant) {
  if (variant?.executionState !== OMR_BENCHMARK_MEASUREMENT_STATE.MEASURED) {
    throw new Error('benchmark-variant-not-measured')
  }
  if (!variant.evidence || typeof variant.evidence !== 'object') {
    throw new Error('benchmark-variant-evidence-missing')
  }

  const comparison = variant.evidence.comparison
  if (!comparison || comparison.state !== OMR_BENCHMARK_MEASUREMENT_STATE.MEASURED) {
    throw new Error('benchmark-golden-comparison-not-measured')
  }

  const errors = {}
  for (const name of REQUIRED_ERROR_METRICS) {
    errors[name] = metricValue(comparison[name], name)
  }
  const fullyCorrectMeasureRate = metricValue(comparison[RATE_METRIC], RATE_METRIC, { rate: true })

  return deepFreeze({
    variantId: variant.variantId,
    variantKind: variant.variantKind,
    errors,
    fullyCorrectMeasureRate,
  })
}

function validatesCompleteVariantSet(variants) {
  if (!Array.isArray(variants) || variants.length !== APPROVED_VARIANT_KINDS.length) return false

  const ids = new Set()
  const kinds = new Set()
  for (const variant of variants) {
    if (!variant || typeof variant !== 'object') return false
    if (typeof variant.variantId !== 'string' || variant.variantId.trim() === '') return false
    if (!APPROVED_VARIANT_KINDS.includes(variant.variantKind)) return false
    if (ids.has(variant.variantId) || kinds.has(variant.variantKind)) return false
    ids.add(variant.variantId)
    kinds.add(variant.variantKind)
  }

  return APPROVED_VARIANT_KINDS.every((kind) => kinds.has(kind))
}

function dominates(a, b) {
  const noWorseErrors = REQUIRED_ERROR_METRICS.every((name) => a.errors[name] <= b.errors[name])
  const noWorseMeasureRate = a.fullyCorrectMeasureRate >= b.fullyCorrectMeasureRate
  if (!noWorseErrors || !noWorseMeasureRate) return false

  const strictlyBetterError = REQUIRED_ERROR_METRICS.some((name) => a.errors[name] < b.errors[name])
  const strictlyBetterMeasureRate = a.fullyCorrectMeasureRate > b.fullyCorrectMeasureRate
  return strictlyBetterError || strictlyBetterMeasureRate
}

function sameEvidence(a, b) {
  return REQUIRED_ERROR_METRICS.every((name) => a.errors[name] === b.errors[name]) &&
    a.fullyCorrectMeasureRate === b.fullyCorrectMeasureRate
}

function summarize(vector) {
  return {
    variantId: vector.variantId,
    variantKind: vector.variantKind,
    missingNotes: vector.errors.missingNotes,
    extraNotes: vector.errors.extraNotes,
    pitchErrors: vector.errors.pitchErrors,
    durationErrors: vector.errors.durationErrors,
    voiceErrors: vector.errors.voiceErrors,
    fullyCorrectMeasureRate: vector.fullyCorrectMeasureRate,
  }
}

/**
 * Return a benchmark recommendation without inventing a composite score.
 *
 * A winner exists only if exactly one measured variant Pareto-dominates every
 * other measured variant. Any missing evidence, tie, or trade-off requires
 * review instead of an arbitrary ranking.
 */
export function recommendOmrBenchmarkVariant(experiment) {
  if (!experiment || typeof experiment !== 'object' || Array.isArray(experiment)) {
    return unknown('Benchmark experiment is missing or malformed.')
  }

  if (typeof experiment.goldenReferenceId !== 'string' || experiment.goldenReferenceId.trim() === '') {
    return reviewRequired('No teacher-verified golden reference is attached; a recognition recommendation cannot be made.', {
      paretoFrontier: [],
    })
  }

  if (!validatesCompleteVariantSet(experiment.variants)) {
    return reviewRequired('The complete eight-variant benchmark set is required before recommendation.', {
      paretoFrontier: [],
    })
  }

  let vectors
  try {
    vectors = experiment.variants.map(extractMeasuredVector)
  } catch (error) {
    return reviewRequired('At least one required golden-comparison metric is not safely measured.', {
      paretoFrontier: [],
      limitation: error instanceof Error ? error.message : 'benchmark-evidence-invalid',
    })
  }

  vectors.sort((a, b) => a.variantId.localeCompare(b.variantId))

  const frontier = vectors.filter((candidate) =>
    !vectors.some((other) => other !== candidate && dominates(other, candidate)),
  )

  const universalDominators = vectors.filter((candidate) =>
    vectors.every((other) => other === candidate || dominates(candidate, other)),
  )

  if (universalDominators.length === 1) {
    const winner = universalDominators[0]
    return deepFreeze({
      schemaVersion: OMR_BENCHMARK_RECOMMENDATION_SCHEMA_VERSION,
      recommendationKind: OMR_BENCHMARK_RECOMMENDATION_KIND,
      state: OMR_BENCHMARK_RECOMMENDATION_STATE.RECOMMENDED,
      variantId: winner.variantId,
      variantKind: winner.variantKind,
      reason: 'One fully measured variant is no worse on every approved golden metric and strictly better on at least one metric than every other variant.',
      accuracyPercentage: null,
      evidence: summarize(winner),
      paretoFrontier: frontier.map(summarize),
      limitation: 'This is a benchmark-relative recommendation against the attached teacher-verified golden MusicXML, not a general OMR accuracy percentage or production source-verification claim.',
    })
  }

  const exactTieExists = frontier.some((vector, index) =>
    frontier.some((other, otherIndex) => index !== otherIndex && sameEvidence(vector, other)),
  )

  return reviewRequired(
    exactTieExists
      ? 'Top benchmark evidence contains an exact tie; no arbitrary winner is selected.'
      : 'Benchmark metrics contain a trade-off; no single variant dominates all others.',
    {
      paretoFrontier: frontier.map(summarize),
      limitation: 'No weighted score or guessed accuracy percentage is used to break ties or metric trade-offs.',
    },
  )
}
