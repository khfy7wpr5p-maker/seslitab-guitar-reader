import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SmoosicTestDOMParser,
  SmoosicTestXMLSerializer,
} from './support/smoosicXmlDom.js'
import { prepareTeacherAssignmentScoreUpload } from '../src/services/teacherAssignmentComposerScoreUpload.js'
import { prepareEditorGuitarTabHandoff } from '../src/services/editorGuitarTabHandoff.js'

globalThis.DOMParser = SmoosicTestDOMParser
globalThis.XMLSerializer = SmoosicTestXMLSerializer

const SOURCE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Three Staff Source</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><staves>3</staves></attributes>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>
      <backup><duration>1</duration></backup>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>2</staff></note>
      <backup><duration>1</duration></backup>
      <note><pitch><step>E</step><octave>3</octave></pitch><duration>1</duration><voice>1</voice><staff>3</staff></note>
    </measure>
  </part>
</score-partwise>`

const TAB = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar TAB</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>TAB</sign><line>5</line></clef>
        <staff-details number="2" show-frets="numbers">
          <staff-type>alternate</staff-type>
          <staff-lines>6</staff-lines>
          <staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
          <staff-tuning line="2"><tuning-step>A</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
          <staff-tuning line="3"><tuning-step>D</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="4"><tuning-step>G</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="5"><tuning-step>B</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="6"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning>
        </staff-details>
        <transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>
      </attributes>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>
      <backup><duration>1</duration></backup>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>2</staff><notations><technical><string>3</string><fret>2</fret></technical></notations></note>
    </measure>
  </part>
</score-partwise>`

async function scoreUpload(musicXml, draftId) {
  return prepareTeacherAssignmentScoreUpload({
    musicXml,
    teacherId: 'teacher-a',
    draftId,
    now: () => '2026-10-09T11:00:00Z',
  })
}

test('GTAB-OCTAVE-02 validates physical TAB against sounding pitch for a selected staff in a 3-staff source', async () => {
  const upload = await scoreUpload(SOURCE, 'three-staff-octave')

  const result = await prepareEditorGuitarTabHandoff({
    scoreUpload: upload,
    guitarTabMusicXml: TAB,
    draftId: 'three-staff-octave',
    targetSelection: { partId: 'P1', partIndex: 0, staff: 1, voice: 1 },
  })

  assert.equal(result.pitchedEventCount, 1)
  assert.deepEqual(result.targetSelection, { partId: 'P1', partIndex: 0, staff: 1, voice: 1 })
})

test('GTAB-OCTAVE-02 rejects a concert-pitch fingering when octave transposition is declared', async () => {
  const upload = await scoreUpload(SOURCE, 'wrong-octave-position')
  const wrongTab = TAB.replace('<string>3</string><fret>2</fret>', '<string>1</string><fret>5</fret>')

  await assert.rejects(
    prepareEditorGuitarTabHandoff({
      scoreUpload: upload,
      guitarTabMusicXml: wrongTab,
      draftId: 'wrong-octave-position',
      targetSelection: { partId: 'P1', partIndex: 0, staff: 1, voice: 1 },
    }),
    /technical-position-pitch-mismatch/u,
  )
})

test('GTAB-OCTAVE-02 keeps first-measure transpose active in later measures', async () => {
  const sourceTwoMeasures = SOURCE.replace(
    '    </measure>\n  </part>',
    '    </measure>\n    <measure number="2"><note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note></measure>\n  </part>',
  )
  const tabTwoMeasures = TAB.replace(
    '    </measure>\n  </part>',
    '    </measure>\n    <measure number="2"><note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note><backup><duration>1</duration></backup><note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>2</staff><notations><technical><string>3</string><fret>2</fret></technical></notations></note></measure>\n  </part>',
  )
  const upload = await scoreUpload(sourceTwoMeasures, 'persistent-octave')

  const result = await prepareEditorGuitarTabHandoff({
    scoreUpload: upload,
    guitarTabMusicXml: tabTwoMeasures,
    draftId: 'persistent-octave',
    targetSelection: { partId: 'P1', partIndex: 0, staff: 1, voice: 1 },
  })

  assert.equal(result.pitchedEventCount, 2)
})
