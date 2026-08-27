import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import '../scripts/runOmrQualityReport.js'
import {
  CANONICAL_NOTE_SCHEMA_VERSION,
  CANONICAL_VERIFICATION_STATUS,
} from '../noteTheory.js'
import {
  QUALITY_GATE_USER_MESSAGE,
  prepareMusicXmlQualityGate,
  qualityGateUserMessage,
  resolveAppPlaybackGate,
  resolveAppTtsGate,
} from '../src/services/appQualityGate.js'

const VALID_4_4_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`

function verifiedState() {
  return {
    schemaVersion: CANONICAL_NOTE_SCHEMA_VERSION,
    status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
    pitch: {
      valid: true,
      status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
    },
    time: {
      valid: true,
      status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
    },
  }
}

function verifiedNotes() {
  return ['Do', 'Re', 'Mi', 'Fa'].map((noteName, index) => ({
    partId: 'P1',
    measureNumber: 1,
    measureKey: 'P1:0',
    measureIndex: 0,
    voice: 1,
    staff: 1,
    startBeat: index,
    beats: 1,
    noteName,
    sourceVerificationState: verifiedState(),
  }))
}

describe('Package 2D app quality-gate adapter', () => {
  test('verified canonical notes plus structurally valid MusicXML ACCEPT TTS and playback', () => {
    const notes = verifiedNotes()
    const report = prepareMusicXmlQualityGate(notes, VALID_4_4_XML)

    assert.equal(report.structurallyValid, true)
    assert.equal(report.sourceVerified, true)
    assert.equal(report.automaticPlaybackAllowed, true)
    assert.equal(resolveAppTtsGate(notes).decision, 'ACCEPT')
    assert.equal(resolveAppPlaybackGate(notes).decision, 'ACCEPT')
  })

  test('source-unverified notes remain REVIEW and cannot become definitive', () => {
    const notes = verifiedNotes().map(({ sourceVerificationState, ...note }) => note)
    const report = prepareMusicXmlQualityGate(notes, VALID_4_4_XML)

    assert.equal(report.structurallyValid, true)
    assert.equal(report.sourceVerified, false)
    assert.equal(report.automaticPlaybackAllowed, false)
    assert.equal(resolveAppTtsGate(notes).decision, 'REVIEW')
    assert.equal(resolveAppPlaybackGate(notes).decision, 'REVIEW')
    assert.equal(
      qualityGateUserMessage(resolveAppTtsGate(notes)),
      QUALITY_GATE_USER_MESSAGE.REVIEW,
    )
  })

  test('malformed or missing MusicXML fails closed as BLOCK', () => {
    for (const xml of ['', '<score-partwise>']) {
      const notes = verifiedNotes()
      const report = prepareMusicXmlQualityGate(notes, xml)

      assert.equal(report.reliable, false)
      assert.equal(report.automaticPlaybackAllowed, false)
      assert.equal(resolveAppTtsGate(notes).decision, 'BLOCK')
      assert.equal(resolveAppPlaybackGate(notes).decision, 'BLOCK')
      assert.equal(
        qualityGateUserMessage(resolveAppPlaybackGate(notes)),
        QUALITY_GATE_USER_MESSAGE.BLOCK,
      )
    }
  })

  test('report registration is bound to the exact NoteObject[] identity', () => {
    const notes = verifiedNotes()
    prepareMusicXmlQualityGate(notes, VALID_4_4_XML)

    assert.equal(resolveAppTtsGate(notes).decision, 'ACCEPT')
    assert.equal(resolveAppTtsGate([...notes]).decision, 'REVIEW')
  })

  test('adapter never mutates notes or MusicXML input', () => {
    const notes = verifiedNotes()
    const before = structuredClone(notes)
    const xmlBefore = VALID_4_4_XML

    prepareMusicXmlQualityGate(notes, VALID_4_4_XML)

    assert.deepEqual(notes, before)
    assert.equal(VALID_4_4_XML, xmlBefore)
  })
})

describe('Package 2D production wiring source contract', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8')

  test('MusicXML-backed results prepare the gate on the same parsed note array', () => {
    assert.match(source, /prepareMusicXmlQualityGate\(parsedNotes, xmlString\)/)
  })

  test('TTS resolves the gate before generating spoken text', () => {
    const gateIndex = source.indexOf('resolveAppTtsGate(parsedNotes)')
    const textIndex = source.indexOf('notesToSpokenText(parsedNotes)')
    assert.ok(gateIndex >= 0)
    assert.ok(textIndex > gateIndex)
  })

  test('rhythm playback resolves the gate before calling playRhythm', () => {
    const gateIndex = source.indexOf('resolveAppPlaybackGate(parsedNotes)')
    const playbackIndex = source.indexOf('await playRhythm(parsedNotes')
    assert.ok(gateIndex >= 0)
    assert.ok(playbackIndex > gateIndex)
  })
})
