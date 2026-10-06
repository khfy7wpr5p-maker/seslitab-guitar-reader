import assert from 'node:assert/strict'
import test from 'node:test'
import { DOMParser } from '@xmldom/xmldom'

import {
  prepareTeacherAssignmentScoreUpload,
} from '../../teacher/src/services/teacherAssignmentComposerScoreUpload.js'
import {
  compileApproximateMusicXmlPlayback,
} from '../src/playback/musicXmlApproximatePlayback.js'

const RAW_SMOOSIC_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <identification>
    <encoding>
      <software>Some pre-release version of Smoosic</software>
    </encoding>
  </identification>
  <part-list>
    <score-part id="P0"><part-name>piano</part-name></score-part>
    <score-part id="P1"><part-name>piano</part-name></score-part>
  </part-list>
  <part id="P0">
    <measure number="1">
      <attributes>
        <divisions>4096</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>1</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>16384</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
  <part id="P1">
    <measure number="1">
      <attributes>
        <staves>1</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>16384</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`

const parser = Object.freeze({
  parse(xml) {
    return new DOMParser().parseFromString(
      xml,
      'application/xml',
    )
  },
})

function pkg(musicXml) {
  return Object.freeze({
    schemaVersion: '1.0.0',
    packageId: 'smpb-02-package',
    content: Object.freeze({
      score: Object.freeze({
        format: 'musicxml',
        data: musicXml,
      }),
      canonicalEvents: Object.freeze([]),
    }),
    practice: Object.freeze({
      tempoBpm: 80,
    }),
  })
}

test('SMPB-02 real Student compiler rejects raw Smoosic timing gap and accepts normalized direct upload', async () => {
  const rawPlan =
    compileApproximateMusicXmlPlayback(
      pkg(RAW_SMOOSIC_XML),
      { parser },
    )
  assert.equal(rawPlan, null)

  const upload =
    await prepareTeacherAssignmentScoreUpload({
      musicXml: RAW_SMOOSIC_XML,
      teacherId: 'smpb-02-teacher',
      draftId: 'smpb-02-draft',
      now: () =>
        '2026-10-06T09:30:00Z',
    })

  assert.notEqual(
    upload.musicXml,
    RAW_SMOOSIC_XML,
  )
  assert.equal(
    (upload.musicXml.match(
      /<divisions>4096<\/divisions>/g,
    ) ?? []).length,
    2,
  )

  const normalizedPlan =
    compileApproximateMusicXmlPlayback(
      pkg(upload.musicXml),
      { parser },
    )

  assert.ok(normalizedPlan)
  assert.equal(
    normalizedPlan.quality,
    'APPROXIMATE',
  )
  assert.equal(
    normalizedPlan.notes.length,
    2,
  )
  assert.deepEqual(
    normalizedPlan.notes.map(
      ({ midi, startBeat, durationBeats }) => ({
        midi,
        startBeat,
        durationBeats,
      }),
    ),
    [
      {
        midi: 60,
        startBeat: 0,
        durationBeats: 4,
      },
      {
        midi: 64,
        startBeat: 0,
        durationBeats: 4,
      },
    ],
  )
})
