import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  collectOmrMusicXmlMetrics,
  evaluateOmrPlaybackSafety,
} from '../src/services/omrPlaybackQualityGate.js'

function scoreWithParts(partOneMeasures, partTwoMeasures = '') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Guitar</part-name></score-part>
    <score-part id="P2"><part-name>TAB</part-name></score-part>
  </part-list>
  <part id="P1">${partOneMeasures}</part>
  <part id="P2">${partTwoMeasures}</part>
</score-partwise>`
}

const validMeasure = `
<measure number="1">
  <attributes>
    <divisions>4</divisions>
    <time><beats>4</beats><beat-type>4</beat-type></time>
  </attributes>
  <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
  <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
  <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
  <note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
</measure>`

describe('OMR playback quality gate', () => {
  test('all unknown measures are unreliable and block automatic playback', () => {
    const xml = scoreWithParts(
      '<measure number="1"><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note></measure>'
    )
    const result = evaluateOmrPlaybackSafety(xml, {
      sourceName: 'guitar-tabs.pdf',
      durationValidation: {
        totalMeasures: 12,
        validMeasures: 0,
        warningMeasures: 0,
        errorMeasures: 0,
        unknownMeasures: 12,
        qualityStatus: 'unreliable',
      },
    })

    assert.equal(result.level, 'unreliable')
    assert.equal(result.autoPlaybackAllowed, false)
    assert.equal(result.manualOverrideAllowed, true)
    assert.ok(result.reasons.some((reason) => reason.code === 'all_measure_durations_unknown'))
  })

  test('known-good validation stays reliable', () => {
    const result = evaluateOmrPlaybackSafety(scoreWithParts(validMeasure), {
      sourceName: 'clean-score.pdf',
      durationValidation: {
        totalMeasures: 1,
        validMeasures: 1,
        warningMeasures: 0,
        errorMeasures: 0,
        unknownMeasures: 0,
        qualityStatus: 'good',
      },
    })

    assert.equal(result.level, 'reliable')
    assert.equal(result.autoPlaybackAllowed, true)
    assert.equal(result.reasons.length, 0)
  })

  test('review-required result remains playable but shows a warning', () => {
    const result = evaluateOmrPlaybackSafety(scoreWithParts(validMeasure), {
      durationValidation: {
        totalMeasures: 10,
        validMeasures: 8,
        warningMeasures: 2,
        errorMeasures: 0,
        unknownMeasures: 0,
        qualityStatus: 'review_required',
      },
    })

    assert.equal(result.level, 'review_required')
    assert.equal(result.autoPlaybackAllowed, true)
    assert.equal(result.manualOverrideAllowed, false)
    assert.ok(result.reasons.some((reason) => reason.code === 'duration_validation_review'))
  })

  test('dense rhythm collapse plus an empty parallel part is unreliable even without validator data', () => {
    const note = (index) => `
      <note>
        <pitch><step>${index % 2 === 0 ? 'C' : 'D'}</step><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type>${index % 4 === 0 ? '<dot/>' : ''}
      </note>`
    const populatedMeasures = Array.from({ length: 4 }, (_, measureIndex) =>
      `<measure number="${measureIndex + 1}">${Array.from({ length: 16 }, (_, noteIndex) =>
        note(measureIndex * 16 + noteIndex)
      ).join('')}</measure>`
    ).join('')
    const emptyMeasures = Array.from({ length: 4 }, (_, index) =>
      `<measure number="${index + 1}"></measure>`
    ).join('')
    const xml = scoreWithParts(populatedMeasures, emptyMeasures)

    const result = evaluateOmrPlaybackSafety(xml, { sourceName: 'solo-tabs.pdf' })

    assert.equal(result.level, 'unreliable')
    assert.equal(result.autoPlaybackAllowed, false)
    assert.ok(result.reasons.some((reason) => reason.code === 'rhythm_detail_collapse'))
    assert.ok(result.reasons.some((reason) => reason.code === 'empty_parallel_part'))
    assert.ok(result.reasons.some((reason) => reason.code === 'tablature_data_missing'))
  })

  test('part and rhythm metrics do not count score-part declarations as musical parts', () => {
    const metrics = collectOmrMusicXmlMetrics(scoreWithParts(validMeasure))

    assert.equal(metrics.partCount, 2)
    assert.equal(metrics.populatedPartCount, 1)
    assert.equal(metrics.measureCount, 1)
    assert.equal(metrics.noteCount, 4)
    assert.equal(metrics.timeSignatureCount, 1)
  })
})
