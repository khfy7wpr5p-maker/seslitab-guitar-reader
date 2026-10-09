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

test('GTAB-OCTAVE-02 validates physical TAB against sounding pitch for a selected staff in a 3-staff source', async () => {
  const scoreUpload = await prepareTeacherAssignmentScoreUpload({
    musicXml: SOURCE,
    teacherId: 'teacher-a',
    draftId: 'three-staff-octave',
    now: () => '2026-10-09T11:00:00Z',
  })

  const result = await prepareEditorGuitarTabHandoff({
    scoreUpload,
    guitarTabMusicXml: TAB,
    draftId: 'three-staff-octave',
    targetSelection: { partId: 'P1', partIndex: 0, staff: 1, voice: 1 },
  })

  assert.equal(result.pitchedEventCount, 1)
  assert.deepEqual(result.targetSelection, { partId: 'P1', partIndex: 0, staff: 1, voice: 1 })
})
