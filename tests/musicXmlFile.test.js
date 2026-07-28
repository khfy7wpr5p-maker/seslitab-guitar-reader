import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  MAX_MUSIC_XML_FILE_SIZE,
  musicXmlHasRhythm,
  validateMusicXmlFile,
} from '../src/services/musicXmlFile.js'

describe('MusicXML file validation', () => {
  test('missing file is rejected with a Turkish message', () => {
    assert.equal(validateMusicXmlFile(null), 'Lütfen bir MusicXML dosyası seçin.')
  })

  test('.xml file is accepted', () => {
    assert.equal(validateMusicXmlFile({ name: 'fug1001-clean.xml', size: 2048, type: 'application/xml' }), null)
  })

  test('.musicxml file is accepted', () => {
    assert.equal(validateMusicXmlFile({ name: 'score.musicxml', size: 2048, type: 'text/xml' }), null)
  })

  test('uppercase extension from Windows is accepted', () => {
    assert.equal(validateMusicXmlFile({ name: 'SCORE.XML', size: 2048, type: '' }), null)
  })

  test('older-browser text/plain MIME does not reject a valid XML extension', () => {
    assert.equal(validateMusicXmlFile({ name: 'score.xml', size: 2048, type: 'text/plain' }), null)
  })

  test('non-MusicXML extension is rejected', () => {
    assert.match(validateMusicXmlFile({ name: 'score.pdf', size: 2048, type: 'application/pdf' }), /\.xml/)
  })

  test('empty MusicXML file is rejected', () => {
    assert.equal(validateMusicXmlFile({ name: 'score.xml', size: 0, type: 'application/xml' }), 'MusicXML dosyası boş.')
  })

  test('file larger than 10 MB is rejected', () => {
    const error = validateMusicXmlFile({
      name: 'score.xml',
      size: MAX_MUSIC_XML_FILE_SIZE + 1,
      type: 'application/xml',
    })
    assert.equal(error, 'Dosya boyutu 10 MB sınırını aşıyor.')
  })
})

describe('MusicXML rhythm detection', () => {
  test('positive beat duration enables rhythmic playback', () => {
    assert.equal(musicXmlHasRhythm([{ beats: 0 }, { beats: 1 }]), true)
  })

  test('empty, invalid, and grace-only durations do not claim rhythm data', () => {
    assert.equal(musicXmlHasRhythm([]), false)
    assert.equal(musicXmlHasRhythm([{ beats: 0 }, { beats: null }]), false)
    assert.equal(musicXmlHasRhythm(null), false)
  })
})
