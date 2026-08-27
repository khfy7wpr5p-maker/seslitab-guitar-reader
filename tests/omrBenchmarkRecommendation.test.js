import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  OMR_BENCHMARK_MEASUREMENT_STATE,
  OMR_BENCHMARK_VARIANT_KIND,
} from '../scripts/omrBenchmark.js'
import {
  OMR_BENCHMARK_RECOMMENDATION_STATE,
  recommendOmrBenchmarkVariant,
} from '../scripts/omrBenchmarkRecommendation.js'

const KINDS = Object.values(OMR_BENCHMARK_VARIANT_KIND)

function measured(value) {
  return { state: OMR_BENCHMARK_MEASUREMENT_STATE.MEASURED, value }
}

function evidence({
  missingNotes = 0,
  extraNotes = 0,
  pitchErrors = 0,
  durationErrors = 0,
  voiceErrors = 0,
  fullyCorrectMeasureRate = 1,
  comparisonState = OMR_BENCHMARK_MEASUREMENT_STATE.MEASURED,
} = {}) {
  return {
    comparison: {
      state: comparisonState,
      missingNotes: measured(missingNotes),
      extraNotes: measured(extraNotes),
      pitchErrors: measured(pitchErrors),
      durationErrors: measured(durationErrors),
      voiceErrors: measured(voiceErrors),
      fullyCorrectMeasureRate: measured(fullyCorrectMeasureRate),
    },
  }
}

function variant(index, metricOverrides = {}, overrides = {}) {
  return {
    variantId: `v${index + 1}`,
    variantKind: KINDS[index],
    executionState: OMR_BENCHMARK_MEASUREMENT_STATE.MEASURED,
    evidence: evidence(metricOverrides),
    ...overrides,
  }
}

function completeExperiment(variants) {
  return {
    benchmarkId: 'recommendation-test',
    goldenReferenceId: 'plan0-cc0-4measure',
    variants,
  }
}

function clearWinnerVariants() {
  return KINDS.map((_, index) => index === 0
    ? variant(index)
    : variant(index, {
        missingNotes: 1 + index,
        extraNotes: 1,
        pitchErrors: 1,
        durationErrors: 1,
        voiceErrors: 1,
        fullyCorrectMeasureRate: 0.5,
      }))
}

test('Package 2E-E recommends only one universal Pareto dominator', () => {
  const result = recommendOmrBenchmarkVariant(completeExperiment(clearWinnerVariants()))

  assert.equal(result.state, OMR_BENCHMARK_RECOMMENDATION_STATE.RECOMMENDED)
  assert.equal(result.variantId, 'v1')
  assert.equal(result.variantKind, KINDS[0])
  assert.equal(result.evidence.missingNotes, 0)
  assert.equal(result.evidence.fullyCorrectMeasureRate, 1)
  assert.equal(result.accuracyPercentage, null)
  assert.deepEqual(result.paretoFrontier.map((item) => item.variantId), ['v1'])
})

test('Package 2E-E refuses recommendation without teacher-verified golden identity', () => {
  const experiment = completeExperiment(clearWinnerVariants())
  experiment.goldenReferenceId = null

  const result = recommendOmrBenchmarkVariant(experiment)
  assert.equal(result.state, OMR_BENCHMARK_RECOMMENDATION_STATE.REVIEW_REQUIRED)
  assert.equal(result.variantId, null)
  assert.match(result.reason, /golden reference/i)
  assert.equal(result.accuracyPercentage, null)
})

test('Package 2E-E requires the complete eight-variant set', () => {
  const result = recommendOmrBenchmarkVariant(completeExperiment(clearWinnerVariants().slice(0, 7)))
  assert.equal(result.state, OMR_BENCHMARK_RECOMMENDATION_STATE.REVIEW_REQUIRED)
  assert.equal(result.variantId, null)
  assert.match(result.reason, /eight-variant/i)
})

test('Package 2E-E fails closed when one variant execution is NOT_MEASURED', () => {
  const variants = clearWinnerVariants()
  variants[7] = variant(7, {}, {
    executionState: OMR_BENCHMARK_MEASUREMENT_STATE.NOT_MEASURED,
    evidence: null,
  })

  const result = recommendOmrBenchmarkVariant(completeExperiment(variants))
  assert.equal(result.state, OMR_BENCHMARK_RECOMMENDATION_STATE.REVIEW_REQUIRED)
  assert.equal(result.variantId, null)
  assert.match(result.limitation, /variant-not-measured/i)
})

test('Package 2E-E fails closed when golden comparison is REVIEW_REQUIRED', () => {
  const variants = clearWinnerVariants()
  variants[3] = variant(3, { comparisonState: OMR_BENCHMARK_MEASUREMENT_STATE.REVIEW_REQUIRED })

  const result = recommendOmrBenchmarkVariant(completeExperiment(variants))
  assert.equal(result.state, OMR_BENCHMARK_RECOMMENDATION_STATE.REVIEW_REQUIRED)
  assert.equal(result.variantId, null)
  assert.match(result.limitation, /golden-comparison-not-measured/i)
})

test('Package 2E-E rejects invalid count or rate evidence instead of normalizing it', () => {
  const invalidCount = clearWinnerVariants()
  invalidCount[2] = variant(2, { pitchErrors: -1 })
  const countResult = recommendOmrBenchmarkVariant(completeExperiment(invalidCount))
  assert.equal(countResult.state, OMR_BENCHMARK_RECOMMENDATION_STATE.REVIEW_REQUIRED)
  assert.match(countResult.limitation, /count-invalid/i)

  const invalidRate = clearWinnerVariants()
  invalidRate[2] = variant(2, { fullyCorrectMeasureRate: 1.01 })
  const rateResult = recommendOmrBenchmarkVariant(completeExperiment(invalidRate))
  assert.equal(rateResult.state, OMR_BENCHMARK_RECOMMENDATION_STATE.REVIEW_REQUIRED)
  assert.match(rateResult.limitation, /rate-out-of-range/i)
})

test('Package 2E-E leaves an exact top tie for human review', () => {
  const variants = clearWinnerVariants()
  variants[1] = variant(1)

  const result = recommendOmrBenchmarkVariant(completeExperiment(variants))
  assert.equal(result.state, OMR_BENCHMARK_RECOMMENDATION_STATE.REVIEW_REQUIRED)
  assert.equal(result.variantId, null)
  assert.match(result.reason, /exact tie/i)
  assert.deepEqual(result.paretoFrontier.map((item) => item.variantId), ['v1', 'v2'])
})

test('Package 2E-E leaves metric trade-offs for review instead of inventing weights', () => {
  const variants = KINDS.map((_, index) => variant(index, {
    missingNotes: 3,
    extraNotes: 3,
    pitchErrors: 3,
    durationErrors: 3,
    voiceErrors: 3,
    fullyCorrectMeasureRate: 0.5,
  }))
  variants[0] = variant(0, { missingNotes: 0, pitchErrors: 1, fullyCorrectMeasureRate: 0.9 })
  variants[1] = variant(1, { missingNotes: 1, pitchErrors: 0, fullyCorrectMeasureRate: 0.9 })

  const result = recommendOmrBenchmarkVariant(completeExperiment(variants))
  assert.equal(result.state, OMR_BENCHMARK_RECOMMENDATION_STATE.REVIEW_REQUIRED)
  assert.equal(result.variantId, null)
  assert.match(result.reason, /trade-off/i)
  assert.deepEqual(result.paretoFrontier.map((item) => item.variantId), ['v1', 'v2'])
  assert.equal(result.accuracyPercentage, null)
})

test('Package 2E-E output is deterministic regardless of variant input order', () => {
  const forward = recommendOmrBenchmarkVariant(completeExperiment(clearWinnerVariants()))
  const reversed = recommendOmrBenchmarkVariant(completeExperiment(clearWinnerVariants().reverse()))
  assert.deepEqual(reversed, forward)
})

test('Package 2E-E recommendation result is deeply frozen and does not mutate input', () => {
  const input = completeExperiment(clearWinnerVariants())
  const before = JSON.stringify(input)
  const result = recommendOmrBenchmarkVariant(input)

  assert.equal(JSON.stringify(input), before)
  assert.equal(Object.isFrozen(result), true)
  assert.equal(Object.isFrozen(result.evidence), true)
  assert.equal(Object.isFrozen(result.paretoFrontier), true)
})

test('Package 2E-E malformed top-level input is UNKNOWN, never a guessed recommendation', () => {
  const result = recommendOmrBenchmarkVariant(null)
  assert.equal(result.state, OMR_BENCHMARK_RECOMMENDATION_STATE.UNKNOWN)
  assert.equal(result.variantId, null)
  assert.equal(result.accuracyPercentage, null)
})

test('Package 2E-E source has no production OMR imports, filesystem writes, or score weights', () => {
  const source = readFileSync(new URL('../scripts/omrBenchmarkRecommendation.js', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /backend\/|src\/services\/omr|AudiverisProvider|gatewayProvider|omrWorker/u)
  assert.doesNotMatch(source, /writeFile|appendFile|rename|copyFile|rm\(/u)
  assert.doesNotMatch(source, /weight\s*[:=]|compositeScore|accuracyPercentage\s*:\s*[^n]/iu)
})
