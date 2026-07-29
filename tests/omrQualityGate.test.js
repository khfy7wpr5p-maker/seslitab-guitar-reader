import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

// Installs the repository's minimal DOMParser for Node tests.
import '../scripts/runOmrQualityReport.js'
import {
  assessMusicXmlQuality,
  buildOmrQualityNotice,
} from '../src/services/omrQualityGate.js'

function scoreXml(measureBody, time = '<time><beats>4</beats><beat-type>4</beat-type></time>') {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
    <part id="P1">
      <measure number="1">
        <attributes><divisions>1</divisions>${time}</attributes>
        ${measureBody}
      </measure>
    </part>
  </score-partwise>`
}

const quarter = `
  <note>
    <pitch><step>E</step><octave>4</octave></pitch>
    <duration>1</duration><voice>1</voice><type>quarter</type>
  </note>`

describe('OMR quality gate notice mapping', () => {
  test('good results are reported without blocking playback', () => {
    const notice = buildOmrQualityNotice({
      qualityStatus: 'good',
      totalMeasures: 4,
      warningMeasures: 0,
      errorMeasures: 0,
    })

    assert.equal(notice.level, 'good')
    assert.equal(notice.blocksPlayback, false)
    assert.match(notice.message, /Kalite kontrolü başarılı/)
  })

  test('review_required asks for teacher review without blocking playback', () => {
    const notice = buildOmrQualityNotice({
      qualityStatus: 'review_required',
      totalMeasures: 8,
      warningMeasures: 1,
      errorMeasures: 2,
    })

    assert.equal(notice.level, 'warning')
    assert.equal(notice.blocksPlayback, false)
    assert.match(notice.message, /Öğretmen kontrolü önerilir/)
    assert.match(notice.message, /3 şüpheli ölçü/)
  })

  test('unreliable warns clearly but leaves playback available', () => {
    const notice = buildOmrQualityNotice({
      qualityStatus: 'unreliable',
      totalMeasures: 10,
      warningMeasures: 1,
      errorMeasures: 4,
    })

    assert.equal(notice.level, 'error')
    assert.equal(notice.blocksPlayback, false)
    assert.match(notice.message, /güvenilir görünmüyor/)
  })
})

describe('MusicXML quality assessment', () => {
  test('a complete 4/4 measure is good', () => {
    const assessment = assessMusicXmlQuality(scoreXml(quarter.repeat(4)))

    assert.equal(assessment.report.qualityStatus, 'good')
    assert.equal(assessment.notice.level, 'good')
    assert.equal(assessment.notice.blocksPlayback, false)
  })

  test('an incomplete 4/4 measure requests review', () => {
    const assessment = assessMusicXmlQuality(scoreXml(quarter.repeat(3)))

    assert.notEqual(assessment.report.qualityStatus, 'good')
    assert.equal(assessment.notice.blocksPlayback, false)
    assert.match(assessment.notice.message, /kontrol/)
  })

  test('invalid XML returns a safe warning and never throws', () => {
    const assessment = assessMusicXmlQuality('<not-musicxml>')

    assert.equal(assessment.notice.level, 'warning')
    assert.equal(assessment.notice.blocksPlayback, false)
    assert.match(assessment.notice.message, /tamamlanamadı/)
  })
})
