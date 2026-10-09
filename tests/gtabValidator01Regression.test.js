import assert from 'node:assert/strict'
import test from 'node:test'

import { validateGuitarTabExport } from '../src/services/guitarTabExportValidator.js'
import { SmoosicTestDOMParser } from './support/smoosicXmlDom.js'

const SOURCE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>
      <backup><duration>1</duration></backup>
      <note><unpitched><display-step>C</display-step><display-octave>4</display-octave></unpitched><duration>1</duration><voice>2</voice><staff>1</staff></note>
      <note><grace/><pitch><step>D</step><octave>4</octave></pitch><voice>3</voice><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`

function tabXml({ string = 2, fret = 1, duplicateTechnical = false } = {}) {
  const technical = duplicateTechnical
    ? `<notations><technical><string>${string}</string><fret>${fret}</fret></technical><technical><string>${string}</string><fret>${fret}</fret></technical></notations>`
    : `<notations><technical><string>${string}</string><fret>${fret}</fret></technical></notations>`
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar TAB</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions><staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>TAB</sign><line>5</line></clef>
        <staff-details number="2">
          <staff-lines>6</staff-lines>
          <staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
          <staff-tuning line="2"><tuning-step>A</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
          <staff-tuning line="3"><tuning-step>D</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="4"><tuning-step>G</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="5"><tuning-step>B</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="6"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning>
        </staff-details>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>
      <backup><duration>1</duration></backup>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>2</staff>${technical}</note>
    </measure>
  </part>
</score-partwise>`
}

const TARGET = Object.freeze({ partId: 'P1', partIndex: 0, staff: 1, voice: 1 })

test('GTAB-VALIDATOR-01 selected voice ignores unsupported events outside target and preserves source bytes', () => {
  const original = SOURCE
  const result = validateGuitarTabExport({
    scoreMusicXml: SOURCE,
    guitarTabMusicXml: tabXml(),
    targetSelection: TARGET,
    DOMParserCtor: SmoosicTestDOMParser,
  })

  assert.equal(result.ok, true)
  assert.equal(result.facts.scoreEventCount, 1)
  assert.equal(SOURCE, original)
})

test('GTAB-VALIDATOR-01 selected grace voice remains fail-closed', () => {
  const result = validateGuitarTabExport({
    scoreMusicXml: SOURCE,
    guitarTabMusicXml: tabXml(),
    targetSelection: { partId: 'P1', partIndex: 0, staff: 1, voice: 3 },
    DOMParserCtor: SmoosicTestDOMParser,
  })

  assert.deepEqual(result, { ok: false, category: 'SEMANTIC', code: 'GRACE_UNSUPPORTED' })
})

test('GTAB-VALIDATOR-01 rejects wrong physical pitch and ambiguous technical evidence', () => {
  const wrongPosition = validateGuitarTabExport({
    scoreMusicXml: SOURCE,
    guitarTabMusicXml: tabXml({ string: 1, fret: 0 }),
    targetSelection: TARGET,
    DOMParserCtor: SmoosicTestDOMParser,
  })
  assert.deepEqual(wrongPosition, { ok: false, category: 'PHYSICAL', code: 'TECHNICAL_POSITION_PITCH_MISMATCH' })

  const ambiguous = validateGuitarTabExport({
    scoreMusicXml: SOURCE,
    guitarTabMusicXml: tabXml({ duplicateTechnical: true }),
    targetSelection: TARGET,
    DOMParserCtor: SmoosicTestDOMParser,
  })
  assert.deepEqual(ambiguous, { ok: false, category: 'PHYSICAL', code: 'TECHNICAL_EVIDENCE_AMBIGUOUS' })
})
