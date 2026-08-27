import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

// Reuse the repository's deterministic DOMParser test harness.
import '../scripts/runOmrQualityReport.js'
import {
  QUALITY_ERROR_CODE,
  QUALITY_STATE,
} from '../src/services/qualityErrorReport.js'
import { buildMusicXmlQualityErrorReport } from '../src/services/musicXmlQualityReport.js'

function score(measures) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">${measures}</part>
</score-partwise>`
}

function quarter(step = 'C', extra = '') {
  return `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff>${extra}</note>`
}

const validFourFour = score(`
  <measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    ${quarter('C')}${quarter('D')}${quarter('E')}${quarter('F')}
  </measure>`)

const underfilledFourFour = score(`
  <measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    ${quarter('C')}
  </measure>`)

const duplicateVisibleMeasures = score(`
  <measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    ${quarter('C')}
  </measure>
  <measure number="1">
    ${quarter('D')}
  </measure>`)

const invalidDivisionsAndTuplet = score(`
  <measure number="1">
    <attributes><divisions>0</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    <note>
      <pitch><step>C</step><octave>4</octave></pitch>
      <duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff>
      <time-modification><actual-notes>3</actual-notes><normal-notes>0</normal-notes></time-modification>
    </note>
  </measure>`)

describe('Package 2C MusicXML quality report adapter', () => {
  test('structurally valid raw MusicXML remains source-unverified and review-required', () => {
    const result = buildMusicXmlQualityErrorReport(validFourFour)

    assert.equal(result.ok, true)
    assert.equal(result.report.structurallyValid, true)
    assert.equal(result.report.structuralState, QUALITY_STATE.STRUCTURALLY_VALID)
    assert.equal(result.report.sourceVerified, false)
    assert.equal(result.report.sourceState, QUALITY_STATE.SOURCE_UNVERIFIED)
    assert.equal(result.report.qualityState, QUALITY_STATE.REVIEW_REQUIRED)
    assert.equal(result.report.automaticPlaybackAllowed, false)
    assert.ok(result.report.findings.some((finding) =>
      finding.errorCode === QUALITY_ERROR_CODE.SOURCE_NOT_VERIFIED
    ))
  })

  test('separate note-array input cannot erase source-unverified findings', () => {
    const result = buildMusicXmlQualityErrorReport(validFourFour, { notes: [] })

    assert.equal(result.ok, true)
    assert.equal(result.report.sourceVerified, false)
    assert.equal(result.report.qualityState, QUALITY_STATE.REVIEW_REQUIRED)
    assert.equal(
      result.report.findings.filter((finding) =>
        finding.errorCode === QUALITY_ERROR_CODE.SOURCE_NOT_VERIFIED
      ).length,
      4,
    )
  })

  test('real MusicXML underfill maps through Package 2B into both required 2C findings', () => {
    const result = buildMusicXmlQualityErrorReport(underfilledFourFour)

    assert.equal(result.ok, true)
    assert.equal(result.report.structurallyValid, false)
    assert.equal(result.report.qualityState, QUALITY_STATE.UNRELIABLE)

    const mismatch = result.report.findings.find((finding) =>
      finding.errorCode === QUALITY_ERROR_CODE.MEASURE_DURATION_MISMATCH
    )
    const suspectedMissing = result.report.findings.find((finding) =>
      finding.errorCode === QUALITY_ERROR_CODE.OMR_NOTE_MISSING_SUSPECTED
    )

    assert.ok(mismatch)
    assert.ok(suspectedMissing)
    assert.equal(mismatch.partId, 'P1')
    assert.equal(mismatch.measureKey, 'P1:0')
    assert.equal(mismatch.visibleMeasureNumber, 1)
    assert.equal(mismatch.expected, 4)
    assert.equal(mismatch.actual, 1)
    assert.equal(suspectedMissing.automaticPlaybackAllowed, false)
    assert.match(suspectedMissing.explanation, /suspicion, not proof/i)
  })

  test('duplicate visible measure numbers keep distinct measureKey values in the final report', () => {
    const result = buildMusicXmlQualityErrorReport(duplicateVisibleMeasures)
    assert.equal(result.ok, true)

    const mismatches = result.report.findings.filter((finding) =>
      finding.errorCode === QUALITY_ERROR_CODE.MEASURE_DURATION_MISMATCH
    )

    assert.equal(mismatches.length, 2)
    assert.deepEqual(mismatches.map((finding) => finding.visibleMeasureNumber), [1, 1])
    assert.deepEqual(mismatches.map((finding) => finding.measureKey), ['P1:0', 'P1:1'])
  })

  test('multiple independent defects in one MusicXML measure remain separate', () => {
    const result = buildMusicXmlQualityErrorReport(invalidDivisionsAndTuplet)
    assert.equal(result.ok, true)

    const codes = new Set(result.report.findings.map((finding) => finding.errorCode))
    assert.ok(codes.has(QUALITY_ERROR_CODE.INVALID_DIVISIONS))
    assert.ok(codes.has(QUALITY_ERROR_CODE.TUPLET_INCOMPLETE))

    const sameMeasure = result.report.findings.filter((finding) => finding.measureKey === 'P1:0')
    assert.ok(sameMeasure.length >= 2)
    assert.ok(sameMeasure.every((finding) => finding.visibleMeasureNumber === 1))
  })

  test('same MusicXML produces the same report and input text is never rewritten', () => {
    const before = validFourFour
    const first = buildMusicXmlQualityErrorReport(validFourFour)
    const second = buildMusicXmlQualityErrorReport(validFourFour)

    assert.deepEqual(first, second)
    assert.equal(validFourFour, before)
  })

  test('empty or malformed MusicXML fails closed without inventing a quality finding', () => {
    const empty = buildMusicXmlQualityErrorReport('')
    assert.equal(empty.ok, false)
    assert.equal(empty.report, null)

    const malformed = buildMusicXmlQualityErrorReport('<score-partwise><part>')
    assert.equal(malformed.ok, false)
    assert.equal(malformed.report, null)
  })
})
