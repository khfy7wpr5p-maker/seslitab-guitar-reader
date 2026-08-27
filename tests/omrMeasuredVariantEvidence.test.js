import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Established Node-only DOM harness. This is test/diagnostic infrastructure;
// production MusicXML parser code remains unchanged.
import '../scripts/runOmrQualityReport.js'

import {
  OMR_BENCHMARK_MEASUREMENT_STATE,
  OMR_BENCHMARK_VARIANT_KIND,
} from '../scripts/omrBenchmark.js'
import {
  measureOmrVariantEvidence,
  OMR_MEASURED_VARIANT_EVIDENCE_KIND,
} from '../scripts/omrMeasuredVariantEvidence.js'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(testDir, '..')
const goldenReferenceId = 'plan0-cc0-4measure'
const goldenPath = path.join(
  repoRoot,
  'tests/fixtures/golden-reference/plan0-cc0-4measure/plan0-cc0-4measure-expected.musicxml',
)
const goldenXml = readFileSync(goldenPath, 'utf8')

function baseInput(overrides = {}) {
  return {
    variantId: 'original',
    variantKind: OMR_BENCHMARK_VARIANT_KIND.ORIGINAL_PDF,
    inputMetadata: { sourceSha256: 'a'.repeat(64), page: 1 },
    preprocessingSettings: {},
    audiverisSettings: { profile: 'default' },
    generatedMusicXml: goldenXml,
    ...overrides,
  }
}

describe('Package 2E-C measured variant evidence', () => {
  test('teacher-verified golden comparison is attached as measured evidence without claiming source verification', () => {
    const result = measureOmrVariantEvidence(baseInput({ goldenReferenceId }))

    assert.equal(result.evidenceKind, OMR_MEASURED_VARIANT_EVIDENCE_KIND)
    assert.equal(result.variantId, 'original')
    assert.equal(result.comparison.state, OMR_BENCHMARK_MEASUREMENT_STATE.MEASURED)
    assert.equal(result.comparison.fullyCorrectMeasureRate.value, 1)
    assert.equal(result.comparison.pitchErrors.value, 0)
    assert.equal(result.comparison.durationErrors.value, 0)
    assert.equal(result.comparison.voiceErrors.value, 0)
    assert.equal(result.comparison.missingNotes.value, 0)
    assert.equal(result.comparison.extraNotes.value, 0)
    assert.equal(result.sourceVerification.state, OMR_BENCHMARK_MEASUREMENT_STATE.REVIEW_REQUIRED)
    assert.equal(result.sourceVerification.definitive, false)
    assert.equal(result.comparison.musicalCorrectness.state, OMR_BENCHMARK_MEASUREMENT_STATE.REVIEW_REQUIRED)
  })

  test('operation without golden remains explicit NOT_MEASURED even though quality evidence exists', () => {
    const result = measureOmrVariantEvidence(baseInput())

    assert.equal(result.qualityEvidence.ok, true)
    assert.equal(result.comparison.state, OMR_BENCHMARK_MEASUREMENT_STATE.NOT_MEASURED)
    for (const metric of [
      'missingNotes', 'extraNotes', 'pitchErrors', 'durationErrors', 'voiceErrors', 'fullyCorrectMeasureRate',
    ]) {
      assert.equal(result.comparison[metric].state, OMR_BENCHMARK_MEASUREMENT_STATE.NOT_MEASURED)
      assert.equal(result.comparison[metric].value, null)
    }
  })

  test('an unambiguous pitch difference becomes measured comparator evidence', () => {
    const generatedMusicXml = goldenXml.replace('<step>E</step>', '<step>D</step>')
    const result = measureOmrVariantEvidence(baseInput({ goldenReferenceId, generatedMusicXml }))

    assert.equal(result.comparison.pitchErrors.state, OMR_BENCHMARK_MEASUREMENT_STATE.MEASURED)
    assert.equal(result.comparison.pitchErrors.value, 1)
    assert.equal(result.comparison.missingNotes.value, 0)
    assert.equal(result.comparison.extraNotes.value, 0)
    assert.equal(result.comparison.fullyCorrectMeasureRate.value, 0.75)
  })

  test('malformed generated MusicXML fails closed as UNKNOWN quality/comparison evidence', () => {
    const result = measureOmrVariantEvidence(baseInput({
      goldenReferenceId,
      generatedMusicXml: '<score-partwise><part>',
    }))

    assert.equal(result.qualityEvidence.ok, false)
    assert.equal(result.qualityEvidence.state, OMR_BENCHMARK_MEASUREMENT_STATE.UNKNOWN)
    assert.equal(result.comparison.state, OMR_BENCHMARK_MEASUREMENT_STATE.UNKNOWN)
    assert.equal(result.comparison.pitchErrors.state, OMR_BENCHMARK_MEASUREMENT_STATE.UNKNOWN)
    assert.equal(result.comparison.pitchErrors.value, null)
  })

  test('generated MusicXML is represented by deterministic artifact metadata rather than retained raw XML', () => {
    const result = measureOmrVariantEvidence(baseInput())

    assert.match(result.generatedMusicXml.sha256, /^[a-f0-9]{64}$/)
    assert.equal(result.generatedMusicXml.byteLength, Buffer.byteLength(goldenXml, 'utf8'))
    assert.equal(result.generatedMusicXml.format, 'musicxml')
    assert.equal(JSON.stringify(result).includes('<score-partwise'), false)
  })

  test('quality findings are attached read-only and remain source-unverified', () => {
    const result = measureOmrVariantEvidence(baseInput())

    assert.ok(Array.isArray(result.validatorFindings))
    assert.ok(result.validatorFindings.some((finding) => finding.errorCode === 'SOURCE_NOT_VERIFIED'))
    assert.equal(result.qualityEvidence.sourceVerified, false)
    assert.equal(result.qualityEvidence.automaticPlaybackAllowed, false)
  })

  test('same evidence produces the same deeply frozen result without mutating caller input', () => {
    const input = baseInput({ goldenReferenceId })
    const before = structuredClone(input)
    const first = measureOmrVariantEvidence(input)
    const second = measureOmrVariantEvidence(input)

    assert.deepEqual(second, first)
    assert.deepEqual(input, before)
    assert.equal(Object.isFrozen(first), true)
    assert.equal(Object.isFrozen(first.comparison), true)
    assert.equal(Object.isFrozen(first.validatorFindings), true)
  })

  test('empty generated MusicXML and unsupported variant fail closed', () => {
    assert.throws(
      () => measureOmrVariantEvidence(baseInput({ generatedMusicXml: '' })),
      /generatedMusicXml must be a non-empty string/,
    )
    assert.throws(
      () => measureOmrVariantEvidence(baseInput({ variantKind: 'invented_variant' })),
      /unsupported-omr-benchmark-variant/,
    )
  })

  test('2E-C evidence module does not import production OMR integration or write-capable filesystem APIs', () => {
    const source = readFileSync(path.join(repoRoot, 'scripts/omrMeasuredVariantEvidence.js'), 'utf8')
    assert.doesNotMatch(source, /from\s+['"]\.\.\/backend\//u)
    assert.doesNotMatch(source, /from\s+['"]\.\.\/src\/services\/omr/u)
    assert.doesNotMatch(source, /\b(writeFile|writeFileSync|rm|rmSync|unlink|unlinkSync|rename|renameSync|mkdir|mkdirSync)\b/u)
  })
})
