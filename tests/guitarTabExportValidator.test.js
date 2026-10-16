import assert from 'node:assert/strict'
import test from 'node:test'

import { SmoosicTestDOMParser } from './support/smoosicXmlDom.js'
import { validateGuitarTabExport } from '../src/services/guitarTabExportValidator.js'
import { GUITAR_TAB_PITCH_POLICY } from '../src/services/guitarTabPitchPolicy.js'

const TARGET = Object.freeze({ partId: 'P1', partIndex: 0, staff: 1, voice: 1 })

function source(note = '<note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>') {
  return `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Source</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><clef><sign>G</sign><line>2</line></clef></attributes>${note}</measure></part></score-partwise>`
}

function tab({ string = 3, fret = 2, technical = null, secondChord = '', transpose = '', tabVoice = 5, notationClef = '<clef number="1"><sign>G</sign><line>2</line></clef>' } = {}) {
  const tech = technical ?? `<notations><technical><string>${string}</string><fret>${fret}</fret></technical></notations>`
  return `<?xml version="1.0"?><score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Source</part-name></score-part></part-list>
    <part id="P1"><measure number="1"><attributes><divisions>1</divisions><staves>2</staves>${transpose}
      ${notationClef}<clef number="2"><sign>TAB</sign><line>5</line></clef>
      <staff-details number="2"><staff-type>alternate</staff-type><staff-lines>6</staff-lines>
        <staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
        <staff-tuning line="2"><tuning-step>A</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
        <staff-tuning line="3"><tuning-step>D</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
        <staff-tuning line="4"><tuning-step>G</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
        <staff-tuning line="5"><tuning-step>B</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
        <staff-tuning line="6"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning>
      </staff-details>
    </attributes>
    <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>${secondChord}
    <backup><duration>1</duration></backup>
    <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>${tabVoice}</voice><staff>2</staff>${tech}</note>${secondChord ? secondChord.replace('<voice>1</voice>', `<voice>${tabVoice}</voice>`).replace('<staff>1</staff>', '<staff>2</staff>').replace('</note>', `${tech}</note>`) : ''}
    </measure></part></score-partwise>`
}

function validate(
  scoreMusicXml,
  guitarTabMusicXml,
  targetSelection = TARGET,
  guitarPitchPolicy = GUITAR_TAB_PITCH_POLICY.SOURCE_SOUNDING,
) {
  return validateGuitarTabExport({
    scoreMusicXml,
    guitarTabMusicXml,
    targetSelection,
    guitarPitchPolicy,
    DOMParserCtor: SmoosicTestDOMParser,
  })
}

test('SES-227 accepts plain written A4 with physical A3 string 3 fret 2 without synthetic transpose', () => {
  const scoreXml = source()
  const result = validate(
    scoreXml,
    tab(),
    TARGET,
    GUITAR_TAB_PITCH_POLICY.STANDARD_GUITAR_WRITTEN,
  )
  assert.equal(result.ok, true)
  assert.equal(result.category, null)
  assert.equal(result.code, null)
  assert.equal(result.facts.scoreEventCount, 1)
  assert.equal(scoreXml, source())
})

test('rejects a notation and TAB cross-staff voice collision', () => {
  const result = validate(source(), tab({ tabVoice: 1 }))
  assert.deepEqual({ ok: result.ok, category: result.category, code: result.code }, {
    ok: false,
    category: 'TAB_SHAPE',
    code: 'TAB_VOICE_NAMESPACE_COLLISION',
  })
})

test('rejects a disjoint TAB voice outside the renderer second-staff range', () => {
  const result = validate(source(), tab({ tabVoice: 2 }))
  assert.deepEqual({ ok: result.ok, category: result.category, code: result.code }, {
    ok: false,
    category: 'TAB_SHAPE',
    code: 'TAB_VOICE_STAFF_RANGE_INVALID',
  })
})

test('SES-220 source-sounding policy preserves C-sharp 4 despite octave clef notation context', () => {
  const scoreXml = source().replace(
    '<clef><sign>G</sign><line>2</line></clef>',
    '<clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>',
  ).replaceAll('<step>A</step><octave>4</octave>', '<step>C</step><alter>1</alter><octave>4</octave>')
  const tabXml = tab({
    string: 2,
    fret: 2,
    notationClef: '<clef number="1"><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>',
  })
    .replaceAll('<step>A</step><octave>4</octave>', '<step>C</step><alter>1</alter><octave>4</octave>')

  assert.equal(validate(scoreXml, tabXml).ok, true)
  const wrong = tabXml.replace('<string>2</string><fret>2</fret>', '<string>5</string><fret>4</fret>')
  assert.deepEqual(
    (({ ok, category, code }) => ({ ok, category, code }))(validate(scoreXml, wrong)),
    { ok: false, category: 'PHYSICAL', code: 'TECHNICAL_POSITION_PITCH_MISMATCH' },
  )
})

test('SES-227 standard-guitar-written target remains based on written pitch when source transpose exists', () => {
  const scoreXml = source().replace(
    '<divisions>1</divisions>',
    '<divisions>1</divisions><transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose>',
  )
  const transpose = '<transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose>'
  const tabXml = tab({ string: 3, fret: 2, transpose })

  assert.equal(validate(
    scoreXml,
    tabXml,
    TARGET,
    GUITAR_TAB_PITCH_POLICY.STANDARD_GUITAR_WRITTEN,
  ).ok, true)
  const wrong = tabXml.replace('<string>3</string><fret>2</fret>', '<string>3</string><fret>0</fret>')
  assert.deepEqual(
    (({ ok, category, code }) => ({ ok, category, code }))(validate(
      scoreXml,
      wrong,
      TARGET,
      GUITAR_TAB_PITCH_POLICY.STANDARD_GUITAR_WRITTEN,
    )),
    { ok: false, category: 'PHYSICAL', code: 'TECHNICAL_POSITION_PITCH_MISMATCH' },
  )
})

test('SES-227 preserves trusted source technical position instead of re-fingering it', () => {
  const technical = '<notations><technical><string>1</string><fret>0</fret></technical></notations>'
  const scoreXml = source(`<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff>${technical}</note>`)
  const tabXml = tab({ string: 1, fret: 0 })
    .replaceAll('<step>A</step><octave>4</octave>', '<step>E</step><octave>4</octave>')
    .replace('</staff></note>', `</staff>${technical}</note>`)

  assert.equal(validate(
    scoreXml,
    tabXml,
    TARGET,
    GUITAR_TAB_PITCH_POLICY.STANDARD_GUITAR_WRITTEN,
  ).ok, true)
})

test('preserves distinct trusted physical authority across renderer-remapped unison voices', () => {
  const sourceXml = source(`
    <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff><notations><technical><string>3</string><fret>2</fret></technical></notations></note>
    <backup><duration>1</duration></backup>
    <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>2</voice><staff>1</staff><notations><technical><string>1</string><fret>5</fret></technical></notations></note>
  `)
  const tabXml = `<?xml version="1.0"?><score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Source</part-name></score-part></part-list>
    <part id="P1"><measure number="1"><attributes><divisions>1</divisions><staves>2</staves>
      <clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>TAB</sign><line>5</line></clef>
      <staff-details number="2"><staff-type>alternate</staff-type><staff-lines>6</staff-lines>
        <staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
        <staff-tuning line="2"><tuning-step>A</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
        <staff-tuning line="3"><tuning-step>D</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
        <staff-tuning line="4"><tuning-step>G</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
        <staff-tuning line="5"><tuning-step>B</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
        <staff-tuning line="6"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning>
      </staff-details>
    </attributes>
    <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff><notations><technical><string>3</string><fret>2</fret></technical></notations></note>
    <backup><duration>1</duration></backup>
    <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>2</voice><staff>1</staff><notations><technical><string>1</string><fret>5</fret></technical></notations></note>
    <backup><duration>1</duration></backup>
    <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>5</voice><staff>2</staff><notations><technical><string>3</string><fret>2</fret></technical></notations></note>
    <backup><duration>1</duration></backup>
    <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>6</voice><staff>2</staff><notations><technical><string>1</string><fret>5</fret></technical></notations></note>
    </measure></part></score-partwise>`

  const result = validate(
    sourceXml,
    tabXml,
    null,
    GUITAR_TAB_PITCH_POLICY.STANDARD_GUITAR_WRITTEN,
  )
  assert.deepEqual(
    { ok: result.ok, category: result.category, code: result.code },
    { ok: true, category: null, code: null },
  )
})

test('rejects a physically wrong octave/string position with PHYSICAL code', () => {
  const result = validate(
    source(),
    tab({ string: 1, fret: 5 }),
    TARGET,
    GUITAR_TAB_PITCH_POLICY.STANDARD_GUITAR_WRITTEN,
  )
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
  const result = validate(source(), changed, TARGET, GUITAR_TAB_PITCH_POLICY.STANDARD_GUITAR_WRITTEN)
  assert.equal(result.ok, false)
  assert.equal(result.category, 'SEMANTIC')
  assert.match(result.code, /SEMANTIC_MISMATCH/u)
})

test('SES-233 rejects an export that preserves only the selected voice instead of the full target staff', () => {
  const scoreXml = source(`
    <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>
    <backup><duration>1</duration></backup>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>2</voice><staff>1</staff></note>
  `)
  const result = validate(
    scoreXml,
    tab(),
    TARGET,
    GUITAR_TAB_PITCH_POLICY.STANDARD_GUITAR_WRITTEN,
  )

  assert.deepEqual(
    { ok: result.ok, category: result.category, code: result.code },
    { ok: false, category: 'SEMANTIC', code: 'SOURCE_SCORE_SEMANTIC_MISMATCH' },
  )
})

test('SES-233 rejects an export that drops source rests even when pitched notes still match', () => {
  const scoreXml = source(`
    <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>
    <note><rest/><duration>1</duration><voice>1</voice><staff>1</staff></note>
  `)
  const result = validate(
    scoreXml,
    tab(),
    TARGET,
    GUITAR_TAB_PITCH_POLICY.STANDARD_GUITAR_WRITTEN,
  )

  assert.deepEqual(
    { ok: result.ok, category: result.category, code: result.code },
    { ok: false, category: 'SEMANTIC', code: 'SOURCE_SCORE_SEMANTIC_MISMATCH' },
  )
})

test('SES-233 rejects notation exports that drop beam or tuplet semantics', () => {
  const structuredNote = '<note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff><type>eighth</type><beam number="1">begin</beam><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><notations><tuplet type="start" number="1"/></notations></note>'
  const result = validate(
    source(structuredNote),
    tab(),
    TARGET,
    GUITAR_TAB_PITCH_POLICY.STANDARD_GUITAR_WRITTEN,
  )

  assert.deepEqual(
    { ok: result.ok, category: result.category, code: result.code },
    { ok: false, category: 'SEMANTIC', code: 'SOURCE_SCORE_SEMANTIC_MISMATCH' },
  )
})

test('SES-233 rejects exports that drop source key, time, clef, direction, or metadata context', () => {
  const scoreXml = source().replace(
    '<part-list>',
    '<movement-title>Preserved title</movement-title><part-list>',
  ).replace(
    '<divisions>1</divisions>',
    '<divisions>1</divisions><key><fifths>2</fifths></key><time><beats>3</beats><beat-type>4</beat-type></time>',
  ).replace(
    '<note>',
    '<direction><direction-type><words>dolce</words></direction-type></direction><note>',
  )

  const result = validate(
    scoreXml,
    tab(),
    TARGET,
    GUITAR_TAB_PITCH_POLICY.STANDARD_GUITAR_WRITTEN,
  )
  assert.deepEqual(
    { ok: result.ok, category: result.category, code: result.code },
    { ok: false, category: 'SEMANTIC', code: 'SOURCE_SCORE_SEMANTIC_MISMATCH' },
  )
})

test('SES-233 rejects part-list metadata drift', () => {
  const changedPartMetadata = tab().replace('<part-name>Source</part-name>', '<part-name>Changed</part-name>')
  const result = validate(source(), changedPartMetadata)
  assert.deepEqual(
    { ok: result.ok, category: result.category, code: result.code },
    { ok: false, category: 'SEMANTIC', code: 'SOURCE_SCORE_SEMANTIC_MISMATCH' },
  )
})

test('SES-233 rejects source-staff count drift and arbitrary source clef additions', () => {
  const wrongStaffCount = tab().replace('<staves>2</staves>', '<staves>3</staves>')
  const extraSourceClef = tab().replace(
    '<clef number="1"><sign>G</sign><line>2</line></clef>',
    '<clef number="1"><sign>G</sign><line>2</line></clef><clef number="1"><sign>F</sign><line>4</line></clef>',
  )
  for (const changed of [wrongStaffCount, extraSourceClef]) {
    const result = validate(source(), changed)
    assert.equal(result.ok, false)
    assert.ok(['SEMANTIC', 'TAB_SHAPE'].includes(result.category))
    assert.match(result.code, /TAB_(?:STAVES_INVALID|CLEF_REQUIRED)|SOURCE_SCORE_SEMANTIC_MISMATCH/u)
  }
})

test('SES-233 rejects a stale later-measure staves declaration', () => {
  const scoreXml = source().replace(
    '</part>',
    '<measure number="2"><attributes><staves>1</staves></attributes><note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note></measure></part>',
  )
  const tabXml = tab().replace(
    '</part>',
    '<measure number="2"><attributes><staves>1</staves></attributes><note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note><backup><duration>1</duration></backup><note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>5</voice><staff>2</staff><notations><technical><string>3</string><fret>2</fret></technical></notations></note></measure></part>',
  )
  const result = validate(scoreXml, tabXml)
  assert.deepEqual(
    { ok: result.ok, category: result.category, code: result.code },
    { ok: false, category: 'SEMANTIC', code: 'SOURCE_SCORE_SEMANTIC_MISMATCH' },
  )
})

test('SES-233 rejects arbitrary note-level semantic loss such as lyrics and slurs', () => {
  const annotated = '<note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff><notations><slur type="start" number="1"/></notations><lyric number="1"><text>la</text></lyric></note>'
  const result = validate(source(annotated), tab())
  assert.deepEqual(
    { ok: result.ok, category: result.category, code: result.code },
    { ok: false, category: 'SEMANTIC', code: 'SOURCE_SCORE_SEMANTIC_MISMATCH' },
  )
})

test('rejects an unknown guitar pitch policy fail-closed', () => {
  const result = validateGuitarTabExport({
    scoreMusicXml: source(),
    guitarTabMusicXml: tab(),
    targetSelection: TARGET,
    guitarPitchPolicy: 'guess-from-filename',
    DOMParserCtor: SmoosicTestDOMParser,
  })
  assert.deepEqual(
    { ok: result.ok, category: result.category, code: result.code },
    { ok: false, category: 'PHYSICAL', code: 'GUITAR_PITCH_POLICY_INVALID' },
  )
})
