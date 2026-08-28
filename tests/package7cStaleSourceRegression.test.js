import test from 'node:test'
import assert from 'node:assert/strict'

import { prepareMusicXmlQualityGate } from '../src/services/appQualityGate.js'
import {
  CHORD_SOURCE_CONSUMER_STATE,
  buildRegisteredChordSourceConsumer,
} from '../src/services/chordSourceConsumer.js'
import {
  clearMusicXmlSourceForNotes,
  registerMusicXmlSourceForNotes,
  resolveMusicXmlSourceForNotes,
} from '../src/services/musicXmlSourceRegistry.js'

const OLD_XML = '<score-partwise version="4.0"><part-list/><part id="P1"><measure number="1"/></part></score-partwise>'

test('Package 7C review regression: failed new gate preparation clears stale MusicXML source for the same exact array', () => {
  const notes = [{ noteName: 'Do' }]
  registerMusicXmlSourceForNotes(notes, OLD_XML)
  assert.equal(resolveMusicXmlSourceForNotes(notes)?.musicXml, OLD_XML)

  const report = prepareMusicXmlQualityGate(notes, '   ')
  assert.equal(report.reliable, false)
  assert.equal(report.structurallyValid, false)
  assert.equal(resolveMusicXmlSourceForNotes(notes), null)

  const chord = buildRegisteredChordSourceConsumer(notes)
  assert.equal(chord.state, CHORD_SOURCE_CONSUMER_STATE.NO_SOURCE)
  assert.equal(chord.displayText, '')
  assert.equal(chord.spokenText, '')
})

test('Package 7C source invalidation remains exact-array scoped', () => {
  const first = [{ noteName: 'Do' }]
  const second = [{ noteName: 'Re' }]
  registerMusicXmlSourceForNotes(first, OLD_XML)
  registerMusicXmlSourceForNotes(second, OLD_XML)

  assert.equal(clearMusicXmlSourceForNotes(first), true)
  assert.equal(resolveMusicXmlSourceForNotes(first), null)
  assert.equal(resolveMusicXmlSourceForNotes(second)?.notes, second)
})
