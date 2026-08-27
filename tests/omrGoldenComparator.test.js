import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { OMR_BENCHMARK_MEASUREMENT_STATE } from '../scripts/omrBenchmark.js'
import { OMR_BENCHMARK_GOLDEN_REFERENCES } from '../scripts/omrBenchmarkFixtureInventory.js'
import {
  OMR_GOLDEN_COMPARISON_KIND,
  compareGeneratedMusicXmlToGolden,
} from '../scripts/omrGoldenComparator.js'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(testDir, '..')
const referenceId = 'plan0-cc0-4measure'
const reference = OMR_BENCHMARK_GOLDEN_REFERENCES.find((item) => item.fixtureId === referenceId)
const goldenPath = path.join(repoRoot, reference.expectedMusicXml)
const goldenXml = readFileSync(goldenPath, 'utf8')

function replaceFirst(text, before, after) {
  const index = text.indexOf(before)
  assert.notEqual(index, -1, `fixture text not found: ${before}`)
  return `${text.slice(0, index)}${after}${text.slice(index + before.length)}`
}

function replaceLast(text, before, after) {
  const index = text.lastIndexOf(before)
  assert.notEqual(index, -1, `fixture text not found: ${before}`)
  return `${text.slice(0, index)}${after}${text.slice(index + before.length)}`
}

function removeLastNoteFromMeasure4(xml) {
  return xml.replace(/(<measure number="4">[\s\S]*)(<note>[\s\S]*?<\/note>)([\s\S]*?<barline location="right">)/u, '$1$3')
}

function duplicateLastNoteBeforeBarline(xml) {
  const measureMatch = xml.match(/<measure number="4">([\s\S]*?)<barline location="right">/u)
  assert.ok(measureMatch)
  const notes = [...measureMatch[1].matchAll(/<note>[\s\S]*?<\/note>/gu)]
  assert.ok(notes.length > 0)
  const lastNote = notes.at(-1)[0]
  return xml.replace('<barline location="right">', `${lastNote}\n      <barline location="right">`)
}

function createAmbiguousFirstOnset(xml) {
  const firstNote = `<note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>`
  const replacement = `<note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
      <backup><duration>1</duration></backup>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>`
  return replaceFirst(xml, firstNote, replacement)
}

describe('Package 2E-B teacher-verified golden MusicXML comparator', () => {
  test('identical approved golden is measured deterministically with zero event errors', () => {
    const first = compareGeneratedMusicXmlToGolden({ goldenReferenceId: referenceId, generatedMusicXml: goldenXml })
    const second = compareGeneratedMusicXmlToGolden({ goldenReferenceId: referenceId, generatedMusicXml: goldenXml })

    assert.deepEqual(second, first)
    assert.equal(first.ok, true)
    assert.equal(first.comparisonKind, OMR_GOLDEN_COMPARISON_KIND)
    assert.equal(first.state, OMR_BENCHMARK_MEASUREMENT_STATE.MEASURED)
    for (const metric of ['missingNotes', 'extraNotes', 'pitchErrors', 'durationErrors', 'voiceErrors']) {
      assert.deepEqual(first.metrics[metric], { state: OMR_BENCHMARK_MEASUREMENT_STATE.MEASURED, value: 0 })
    }
    assert.deepEqual(first.metrics.fullyCorrectMeasureRate, {
      state: OMR_BENCHMARK_MEASUREMENT_STATE.MEASURED,
      value: 1,
      correctMeasures: 4,
      totalMeasures: 4,
    })
    assert.equal(Object.isFrozen(first), true)
    assert.equal(Object.isFrozen(first.metrics), true)
  })

  test('both repository teacher-verified golden chains can compare to their own approved XML', () => {
    for (const item of OMR_BENCHMARK_GOLDEN_REFERENCES) {
      const xml = readFileSync(path.join(repoRoot, item.expectedMusicXml), 'utf8')
      const report = compareGeneratedMusicXmlToGolden({ goldenReferenceId: item.fixtureId, generatedMusicXml: xml })
      assert.equal(report.ok, true, item.fixtureId)
      assert.equal(report.metrics.fullyCorrectMeasureRate.value, 1, item.fixtureId)
      assert.equal(report.alignment.ambiguousLocations, 0, item.fixtureId)
    }
  })

  test('one unambiguous pitch substitution is one pitch error, not missing plus extra notes', () => {
    const generated = replaceFirst(goldenXml, '<step>E</step>', '<step>D</step>')
    const report = compareGeneratedMusicXmlToGolden({ goldenReferenceId: referenceId, generatedMusicXml: generated })

    assert.equal(report.metrics.pitchErrors.value, 1)
    assert.equal(report.metrics.missingNotes.value, 0)
    assert.equal(report.metrics.extraNotes.value, 0)
    assert.equal(report.metrics.durationErrors.value, 0)
    assert.equal(report.metrics.voiceErrors.value, 0)
    assert.equal(report.metrics.fullyCorrectMeasureRate.value, 0.75)
  })

  test('one unambiguous final-note duration change is one duration error', () => {
    const generated = replaceLast(goldenXml, '<duration>1</duration>', '<duration>2</duration>')
    const report = compareGeneratedMusicXmlToGolden({ goldenReferenceId: referenceId, generatedMusicXml: generated })

    assert.equal(report.metrics.durationErrors.value, 1)
    assert.equal(report.metrics.pitchErrors.value, 0)
    assert.equal(report.metrics.missingNotes.value, 0)
    assert.equal(report.metrics.extraNotes.value, 0)
    assert.equal(report.metrics.fullyCorrectMeasureRate.value, 0.75)
  })

  test('one unambiguous voice change is one voice error', () => {
    const generated = replaceLast(goldenXml, '<voice>1</voice>', '<voice>2</voice>')
    const report = compareGeneratedMusicXmlToGolden({ goldenReferenceId: referenceId, generatedMusicXml: generated })

    assert.equal(report.metrics.voiceErrors.value, 1)
    assert.equal(report.metrics.pitchErrors.value, 0)
    assert.equal(report.metrics.durationErrors.value, 0)
    assert.equal(report.metrics.fullyCorrectMeasureRate.value, 0.75)
  })

  test('missing and extra notes are counted only when the unmatched location is one-sided', () => {
    const missing = compareGeneratedMusicXmlToGolden({
      goldenReferenceId: referenceId,
      generatedMusicXml: removeLastNoteFromMeasure4(goldenXml),
    })
    assert.equal(missing.metrics.missingNotes.value, 1)
    assert.equal(missing.metrics.extraNotes.value, 0)

    const extra = compareGeneratedMusicXmlToGolden({
      goldenReferenceId: referenceId,
      generatedMusicXml: duplicateLastNoteBeforeBarline(goldenXml),
    })
    assert.equal(extra.metrics.missingNotes.value, 0)
    assert.equal(extra.metrics.extraNotes.value, 1)
  })

  test('visible measure-number changes do not change physical measure identity', () => {
    const generated = replaceFirst(goldenXml, '<measure number="2">', '<measure number="1">')
    const report = compareGeneratedMusicXmlToGolden({ goldenReferenceId: referenceId, generatedMusicXml: generated })

    assert.equal(report.metrics.fullyCorrectMeasureRate.value, 1)
    assert.equal(report.measures[1].goldenVisibleMeasureNumber, 2)
    assert.equal(report.measures[1].generatedVisibleMeasureNumber, 1)
    assert.deepEqual(report.measures[1].measureKey, { partIndex: 0, measureIndex: 1 })
  })

  test('ambiguous alignment never invents detailed pitch/duration/voice/missing/extra counts', () => {
    const generated = createAmbiguousFirstOnset(goldenXml)
    const report = compareGeneratedMusicXmlToGolden({ goldenReferenceId: referenceId, generatedMusicXml: generated })

    assert.equal(report.ok, true)
    assert.equal(report.state, OMR_BENCHMARK_MEASUREMENT_STATE.REVIEW_REQUIRED)
    assert.ok(report.alignment.ambiguousLocations >= 1)
    for (const metric of ['missingNotes', 'extraNotes', 'pitchErrors', 'durationErrors', 'voiceErrors']) {
      assert.equal(report.metrics[metric].state, OMR_BENCHMARK_MEASUREMENT_STATE.REVIEW_REQUIRED)
      assert.equal(report.metrics[metric].value, null)
      assert.equal(typeof report.metrics[metric].observedValue, 'number')
    }
    assert.equal(report.metrics.fullyCorrectMeasureRate.state, OMR_BENCHMARK_MEASUREMENT_STATE.MEASURED)
    assert.equal(report.metrics.fullyCorrectMeasureRate.value, 0.75)
  })

  test('malformed generated MusicXML fails closed with UNKNOWN metrics', () => {
    const report = compareGeneratedMusicXmlToGolden({
      goldenReferenceId: referenceId,
      generatedMusicXml: '<score-partwise><part>',
    })

    assert.equal(report.ok, false)
    assert.equal(report.state, OMR_BENCHMARK_MEASUREMENT_STATE.UNKNOWN)
    assert.equal(report.reason, 'GENERATED_MUSICXML_PARSE_FAILED')
    for (const metric of Object.values(report.metrics)) {
      assert.equal(metric.state, OMR_BENCHMARK_MEASUREMENT_STATE.UNKNOWN)
      assert.equal(metric.value, null)
    }
  })

  test('unknown golden reference fails closed instead of accepting caller-supplied truth', () => {
    assert.throws(
      () => compareGeneratedMusicXmlToGolden({ goldenReferenceId: 'fake-ground-truth', generatedMusicXml: goldenXml }),
      /unknown-omr-golden-reference/,
    )
  })

  test('comparison never changes approved golden bytes', () => {
    const before = readFileSync(goldenPath)
    compareGeneratedMusicXmlToGolden({ goldenReferenceId: referenceId, generatedMusicXml: goldenXml })
    assert.deepEqual(readFileSync(goldenPath), before)
  })

  test('comparator has no production OMR imports or write-capable filesystem APIs', () => {
    const source = readFileSync(path.join(repoRoot, 'scripts/omrGoldenComparator.js'), 'utf8')
    assert.doesNotMatch(source, /from\s+['"]\.\.\/backend\//u)
    assert.doesNotMatch(source, /from\s+['"]\.\.\/src\/app\.js/u)
    assert.doesNotMatch(source, /\b(writeFile|writeFileSync|rm|rmSync|unlink|unlinkSync|rename|renameSync|mkdir|mkdirSync)\b/u)
  })
})
