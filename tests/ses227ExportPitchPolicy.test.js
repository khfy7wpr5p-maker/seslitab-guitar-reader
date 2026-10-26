import assert from 'node:assert/strict'
import test from 'node:test'

import { validateGuitarTabExport } from '../src/services/guitarTabExportValidator.js'
import { SmoosicTestDOMParser } from './support/smoosicXmlDom.js'

const TARGET = Object.freeze({ partId: 'P1', partIndex: 0, staff: 1, voice: 1 })

function source() {
  return '<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Source</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note></measure></part></score-partwise>'
}

function tab({ string, fret }) {
  return `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Source</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><staves>2</staves><clef number="2"><sign>TAB</sign><line>5</line></clef><staff-details number="2"><staff-lines>6</staff-lines><staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>2</tuning-octave></staff-tuning><staff-tuning line="2"><tuning-step>A</tuning-step><tuning-octave>2</tuning-octave></staff-tuning><staff-tuning line="3"><tuning-step>D</tuning-step><tuning-octave>3</tuning-octave></staff-tuning><staff-tuning line="4"><tuning-step>G</tuning-step><tuning-octave>3</tuning-octave></staff-tuning><staff-tuning line="5"><tuning-step>B</tuning-step><tuning-octave>3</tuning-octave></staff-tuning><staff-tuning line="6"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning></staff-details></attributes><note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note><backup><duration>1</duration></backup><note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>5</voice><staff>2</staff><notations><technical><string>${string}</string><fret>${fret}</fret></technical></notations></note></measure></part></score-partwise>`
}

function validate(guitarPitchPolicy, position) {
  return validateGuitarTabExport({
    scoreMusicXml: source(),
    guitarTabMusicXml: tab(position),
    targetSelection: TARGET,
    guitarPitchPolicy,
    DOMParserCtor: SmoosicTestDOMParser,
  })
}

test('SES-227 source-sounding policy preserves concert A4 position', () => {
  assert.equal(validate('source-sounding', { string: 1, fret: 5 }).ok, true)
  const wrongOctave = validate('source-sounding', { string: 3, fret: 2 })
  assert.deepEqual(
    { ok: wrongOctave.ok, category: wrongOctave.category, code: wrongOctave.code },
    { ok: false, category: 'PHYSICAL', code: 'TECHNICAL_POSITION_PITCH_MISMATCH' },
  )
})

test('SES-227 standard-guitar-written policy resolves written A4 to physical A3', () => {
  assert.equal(validate('standard-guitar-written', { string: 3, fret: 2 }).ok, true)
  const wrongOctave = validate('standard-guitar-written', { string: 1, fret: 5 })
  assert.deepEqual(
    { ok: wrongOctave.ok, category: wrongOctave.category, code: wrongOctave.code },
    { ok: false, category: 'PHYSICAL', code: 'TECHNICAL_POSITION_PITCH_MISMATCH' },
  )
})

test('SES-227 unknown export pitch policy fails closed', () => {
  const result = validate('guess-from-filename', { string: 3, fret: 2 })
  assert.equal(result.ok, false)
  assert.equal(result.category, 'PHYSICAL')
})
