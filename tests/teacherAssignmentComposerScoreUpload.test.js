import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SmoosicTestDOMParser,
  SmoosicTestXMLSerializer,
} from './support/smoosicXmlDom.js'
import {
  prepareTeacherAssignmentScoreUpload,
} from '../src/services/teacherAssignmentComposerScoreUpload.js'

globalThis.DOMParser = SmoosicTestDOMParser
globalThis.XMLSerializer = SmoosicTestXMLSerializer

const VALID_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`

test('SES-153 validates and fingerprints the exact teacher-selected MusicXML bytes', async () => {
  const upload =
    await prepareTeacherAssignmentScoreUpload({
      musicXml: VALID_XML,
      teacherId: 'teacher-a',
      draftId: 'draft-a',
      now: () =>
        '2026-10-02T01:30:00Z',
    })

  assert.equal(upload.musicXml, VALID_XML)
  assert.equal(upload.draftId, 'draft-a')
  assert.equal(
    upload.createdAt,
    '2026-10-02T01:30:00Z',
  )
  assert.match(
    upload.musicXmlFingerprint,
    /^[a-f0-9]{64}$/,
  )
  assert.deepEqual(upload.canonicalEvents, [])
  assert.equal(
    Object.isFrozen(upload.canonicalEvents),
    true,
  )
  assert.equal(Object.isFrozen(upload), true)
})

test('SES-153 accepts structurally safe MusicXML even when it has no semantic note events', async () => {
  const xml =
    '<score-partwise version="4.0"><part-list></part-list></score-partwise>'
  const upload =
    await prepareTeacherAssignmentScoreUpload({
      musicXml: xml,
      teacherId: 'teacher-a',
      draftId: 'draft-empty-semantic',
      now: () =>
        '2026-10-02T01:30:00Z',
    })

  assert.equal(upload.musicXml, xml)
  assert.deepEqual(upload.canonicalEvents, [])
})

test('SES-153 still rejects non-MusicXML and unsafe XML structures', async () => {
  for (const musicXml of [
    '<not-musicxml/>',
    '<!DOCTYPE score-partwise [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><score-partwise>&xxe;</score-partwise>',
  ]) {
    await assert.rejects(
      () =>
        prepareTeacherAssignmentScoreUpload({
          musicXml,
          teacherId: 'teacher-a',
          draftId: 'draft-invalid',
          now: () =>
            '2026-10-02T01:30:00Z',
        }),
      /assignment-composer-score-upload/i,
    )
  }
})
