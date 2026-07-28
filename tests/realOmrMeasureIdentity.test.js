// Regression coverage for the clean Audiveris fixtures supplied for SesliTab.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The diagnostic runner installs the same minimal DOMParser used by the
// repository's existing Node tests.
import { runQualityReport } from '../scripts/runOmrQualityReport.js'
import { parseMusicXmlWithStructure } from '../musicXmlParser.js'
import { buildMeasureTimeline } from '../src/services/musicXmlMeasureTimeline.js'
import { parseMusicXmlToNotes } from '../src/services/musicEngine.js'
import { resolveBeats } from '../noteTheory.js'

const fixtureDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'real-omr'
)

function fixturePath(fileName) {
  return path.join(fixtureDir, fileName)
}

describe('Real OMR measure identity regressions', () => {
  test('parallel rest-only part is not added to the primary Karayip timeline', () => {
    const report = runQualityReport(fixturePath('karayip-korsanlari-clean.xml'))

    assert.equal(report.primaryPartId, 'P1')
    assert.equal(report.validatedPartId, 'P1')
    assert.deepEqual(report.ignoredPartIds, ['P2'])
    assert.equal(report.totalMeasures, 64)

    const xml = readFileSync(fixturePath('karayip-korsanlari-clean.xml'), 'utf8')
    const playback = parseMusicXmlToNotes(xml)
    assert.ok(playback.notes.length > 0)
    assert.ok(playback.notes.every((note) => note.partId === 'P1'))
  })

  test('repeated displayed measure numbers stay as separate Shostakovich measures', () => {
    const xml = readFileSync(fixturePath('shostywaltz-clean.xml'), 'utf8')
    const structured = parseMusicXmlWithStructure(xml)
    const timeline = buildMeasureTimeline(structured)
    const report = runQualityReport(fixturePath('shostywaltz-clean.xml'))

    assert.equal(structured.measureMetadata.length, 211)
    assert.equal(timeline.measures.length, 211)
    assert.equal(report.totalMeasures, 211)

    for (const displayedNumber of [33, 37, 176, 203]) {
      const duplicates = timeline.measures.filter(
        (measure) => measure.partId === 'P1' && measure.measureNumber === displayedNumber
      )
      assert.equal(duplicates.length, 2)
      assert.notEqual(duplicates[0].measureKey, duplicates[1].measureKey)
    }
  })

  test('durationless Fug grace note is valid and consumes zero measure time', () => {
    const xml = readFileSync(fixturePath('fug1001-clean.xml'), 'utf8')
    const structured = parseMusicXmlWithStructure(xml)
    const graceNotes = structured.notes.filter((note) => note.isGrace)
    const graceEvents = structured.measureEvents.filter((event) => event.isGrace)
    const timeline = buildMeasureTimeline(structured)

    assert.equal(graceNotes.length, 1)
    assert.equal(graceEvents.length, 1)
    assert.equal(graceNotes[0].durationValue, null)
    assert.equal(resolveBeats(graceNotes[0]), 0)

    const graceMeasure = timeline.measures.find(
      (measure) => measure.measureKey === graceNotes[0].measureKey
    )
    assert.ok(graceMeasure)
    assert.ok(
      !graceMeasure.warnings.some((warning) => warning.includes('no valid duration'))
    )

    const timedGrace = graceMeasure.events.find((event) => event.isGrace)
    assert.equal(timedGrace.durationDivisions, 0)
  })
})
