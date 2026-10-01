import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getTeacherWorkspaceApplicableApproval,
} from '../src/services/teacherWorkspaceModel.js'
import {
  prepareTeacherAssignmentScoreUpload,
} from '../src/services/teacherAssignmentComposerScoreUpload.js'

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
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`

test('SES-141 validates and fingerprints the exact uploaded MusicXML as teacher-approved score authority', async () => {
  const upload = await prepareTeacherAssignmentScoreUpload({
    musicXml: VALID_XML,
    teacherId: 'teacher-a',
    draftId: 'draft-a',
    now: () => '2026-10-01T14:30:00Z',
  })

  assert.equal(upload.musicXml, VALID_XML)
  assert.equal(upload.intake.musicXml, VALID_XML)
  assert.match(upload.intake.musicXmlFingerprint, /^[a-f0-9]{64}$/)
  assert.equal(upload.sourceNotes.length, 4)
  assert.equal(upload.semanticNoteCount, 4)
  assert.equal(Object.isFrozen(upload), true)

  const approval = getTeacherWorkspaceApplicableApproval(upload.workspace)
  assert.ok(approval)
  assert.equal(approval.actorId, 'teacher-a')
  assert.equal(approval.approvedRevisionId, upload.intake.revisionId)
})

test('SES-141 rejects invalid or semantically empty MusicXML before assignment creation', async () => {
  for (const musicXml of [
    '<not-musicxml/>',
    '<score-partwise version="4.0"><part-list></part-list></score-partwise>',
  ]) {
    await assert.rejects(
      () => prepareTeacherAssignmentScoreUpload({
        musicXml,
        teacherId: 'teacher-a',
        draftId: 'draft-a',
        now: () => '2026-10-01T14:30:00Z',
      }),
      /assignment-composer-score-upload/i,
    )
  }
})
