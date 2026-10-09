import assert from 'node:assert/strict'
import test from 'node:test'

import { SmoosicTestDOMParser } from './support/smoosicXmlDom.js'
import { validateGuitarTabExport } from '../src/services/guitarTabExportValidator.js'

const TARGET = Object.freeze({ partId: 'P1', partIndex: 0, staff: 1, voice: 1 })

function source(note = '<note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>') {
  return `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Source</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>${note}</measure></part></score-partwise>`
}

function tab({ string = 3, fret = 2, technical = null, secondChord = '' } = {}) {
  const tech = technical ?? `<notations><technical><string>${string}</string><fret>${fret}</fret></technical></notations>`
  return `<?xml version="1.0"?><score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Guitar TAB</part-name></score-part></part-list>
    <part id="P1"><measure number="1"><attributes><divisions>1</divisions><staves>2</staves>
      <clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>TAB</sign><line>5</line></clef>
      <staff-details number="2"><staff-type>alternate</staff-type><staff-lines>6</staff-lines>
        <staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
        <staff-tuning line="2"><tuning-step>A</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
        <staff-tuning line="3"><tuning-step>D</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
        <staff-tuning line="4"><tuning-step>G</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
        <staff-tuning line="5"><tuning-step>B</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
        <staff-tuning line="6"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning>
      </staff-details><transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>
    </attributes>
    <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>${secondChord}
    <backup><duration>1</duration></backup>
    <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>2</staff>${tech}</note>${secondChord ? secondChord.replace('<staff>1</staff>', '<staff>2</staff>').replace('</note>', `${tech}</note>`) : ''}
    </measure></part></score-partwise>`
}

function validate(scoreMusicXml, guitarTabMusicXml, targetSelection = TARGET) {
  return validateGuitarTabExport({ scoreMusicXml, guitarTabMusicXml, targetSelection, DOMParserCtor: SmoosicTestDOMParser })
}

test('accepts exact written A4 while validating physical A3 string 3 fret 2', () => {
  const scoreXml = source()
  const result = validate(scoreXml, tab())
  assert.equal(result.ok, true)
  assert.equal(result.category, null)
  assert.equal(result.code, null)
  assert.equal(result.facts.scoreEventCount, 1)
  assert.equal(scoreXml, source())
})

test('rejects a physically wrong octave/string position with PHYSICAL code', () => {
  const result = validate(source(), tab({ string: 1, fret: 5 }))
  assert.deepEqual({ ok: result.ok, category: result.category, code: result.code }, {
    ok: false, category: 'PHYSICAL', code: 'TECHNICAL_POSITION_PITCH_MISMATCH',
  })
})

test('rejects duplicate technical evidence instead of selecting the first block', () => {
  const duplicate = '<notations><technical><string>3</string><fret>2</fret></technical><technical><string>1</string><fret>5</fret></technical></notations>'
  const result = validate(source(), tab({ technical: duplicate }))
  assert.deepEqual({ ok: result.ok, category: result.category, code: result.code }, {
    ok: false, category: 'PHYSICAL', code: 'TECHNICAL_EVIDENCE_AMBIGUOUS',
  })
})

test('rejects duplicate string or fret evidence inside one technical block', () => {
  for (const technical of [
    '<notations><technical><string>3</string><string>1</string><fret>2</fret></technical></notations>',
    '<notations><technical><string>3</string><fret>2</fret><fret>5</fret></technical></notations>',
  ]) {
    const result = validate(source(), tab({ technical }))
    assert.equal(result.ok, false)
    assert.equal(result.category, 'PHYSICAL')
    assert.equal(result.code, 'TECHNICAL_EVIDENCE_AMBIGUOUS')
  }
})

test('rejects stale Part Staff Voice target identity', () => {
  const result = validate(source(), tab(), { ...TARGET, partIndex: 1 })
  assert.equal(result.ok, false)
  assert.equal(result.category, 'IDENTITY')
  assert.equal(result.code, 'TARGET_PART_MISMATCH')
})

test('rejects written pitch drift even if TAB physical position could be playable', () => {
  const changed = tab().replaceAll('<step>A</step><octave>4</octave>', '<step>G</step><octave>4</octave>')
  const result = validate(source(), changed)
  assert.equal(result.ok, false)
  assert.equal(result.category, 'SEMANTIC')
  assert.match(result.code, /SEMANTIC_MISMATCH/u)
})
