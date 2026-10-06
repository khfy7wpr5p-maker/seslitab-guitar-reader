import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import {
  normalizeSmoosicDirectUploadTiming,
} from '../src/services/smoosicDirectUploadTimingNormalization.js'
import {
  prepareTeacherAssignmentScoreUpload,
} from '../src/services/teacherAssignmentComposerScoreUpload.js'

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
      <note><rest/><duration>16384</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
  <part id="P1">
    <measure number="1">
      <attributes>
        <staves>1</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><rest/><duration>16384</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`

const NORMALIZED_SMOOSIC_XML = RAW_SMOOSIC_XML.replace(
  `      <attributes>\n        <staves>1</staves>`,
  `      <attributes><divisions>4096</divisions>\n        <staves>1</staves>`,
)

function sha256(value) {
  return createHash('sha256')
    .update(value, 'utf8')
    .digest('hex')
}

test('SMPB-02 repairs only the proven Smoosic later-part missing divisions shape', () => {
  const normalized =
    normalizeSmoosicDirectUploadTiming(
      RAW_SMOOSIC_XML,
    )

  assert.equal(
    normalized,
    NORMALIZED_SMOOSIC_XML,
  )
  assert.equal(
    (normalized.match(
      /<divisions>4096<\/divisions>/g,
    ) ?? []).length,
    2,
  )
  assert.equal(
    (normalized.match(
      /<duration>16384<\/duration>/g,
    ) ?? []).length,
    2,
  )
})

test('SMPB-02 direct teacher upload fingerprints the accepted normalized bytes', async () => {
  const upload =
    await prepareTeacherAssignmentScoreUpload({
      musicXml: RAW_SMOOSIC_XML,
      teacherId: 'teacher-smpb-02',
      draftId: 'draft-smpb-02',
      now: () =>
        '2026-10-06T09:25:00Z',
    })

  assert.equal(
    upload.musicXml,
    NORMALIZED_SMOOSIC_XML,
  )
  assert.equal(
    upload.musicXmlFingerprint,
    sha256(NORMALIZED_SMOOSIC_XML),
  )
  assert.notEqual(
    upload.musicXmlFingerprint,
    sha256(RAW_SMOOSIC_XML),
  )
  assert.deepEqual(
    upload.canonicalEvents,
    [],
  )
})

test('SMPB-02 does not mutate non-Smoosic, unproven, malformed or already-valid timing', () => {
  const cases = [
    RAW_SMOOSIC_XML.replace(
      'Some pre-release version of Smoosic',
      'MuseScore 4',
    ),
    RAW_SMOOSIC_XML.replace(
      '<divisions>4096</divisions>',
      '<divisions>2</divisions>',
    ),
    RAW_SMOOSIC_XML.replace(
      '        <staves>1</staves>\n        <clef number="1"><sign>G</sign><line>2</line></clef>\n      </attributes>\n      <note><rest/><duration>16384</duration>',
      '        <divisions>bad</divisions>\n        <staves>1</staves>\n        <clef number="1"><sign>G</sign><line>2</line></clef>\n      </attributes>\n      <note><rest/><duration>16384</duration>',
    ),
    NORMALIZED_SMOOSIC_XML,
  ]

  for (const musicXml of cases) {
    assert.equal(
      normalizeSmoosicDirectUploadTiming(
        musicXml,
      ),
      musicXml,
    )
  }
})

test('SMPB-02 refuses to invent an attributes insertion point', () => {
  const withoutSecondPartAttributes =
    RAW_SMOOSIC_XML.replace(
      `      <attributes>\n        <staves>1</staves>\n        <clef number="1"><sign>G</sign><line>2</line></clef>\n      </attributes>\n`,
      '',
    )

  assert.equal(
    normalizeSmoosicDirectUploadTiming(
      withoutSecondPartAttributes,
    ),
    withoutSecondPartAttributes,
  )
})
