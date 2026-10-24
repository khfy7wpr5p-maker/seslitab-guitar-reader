import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import * as qualification from '../scripts/tdProd10TeacherStudentFixture.js'
import { prepareStaffToPartSplit } from '../src/services/musicXmlStaffToPartSplit.js'
import { prepareTeacherAssignmentScoreUpload } from '../src/services/teacherAssignmentComposerScoreUpload.js'

test('PDF-corrected SES-248 pilot survives Teacher upload, authorized delivery and Student read unchanged', async () => {
  const source = await readFile(new URL('./fixtures/ses248/pilot-pdf-corrected.musicxml', import.meta.url), 'utf8')
  assert.equal(createHash('sha256').update(source).digest('hex'), '13eb00cd10cee8a1f216c194b2fb605e1b0beecbb4880be0d92affeded747975')
  const preview = await prepareStaffToPartSplit({ musicXml: source })
  assert.equal(preview.measureCount, 24)
  assert.deepEqual(preview.parts.map(part => part.noteCount), [69, 120])
  const upload = await prepareTeacherAssignmentScoreUpload({ musicXml: preview.derivedMusicXml,
    teacherId: 'td-prod-10-teacher-a', draftId: 'ses248-pilot', now: () => '2026-10-23T00:00:00Z' })
  assert.equal(upload.musicXml, preview.derivedMusicXml)
  assert.equal(typeof qualification.buildSes248StudentQualificationFixture, 'function')
  const fixture = await qualification.buildSes248StudentQualificationFixture({ musicXml: upload.musicXml })
  assert.equal(fixture.package.content.score.data, preview.derivedMusicXml)
  assert.equal(fixture.item.package.content.score.data, preview.derivedMusicXml)
  assert.equal(fixture.package.content.guitarTab, null)
  assert.equal(fixture.package.playbackInstrument, 'VIOLIN')
  assert.deepEqual(fixture.package.content.violin, { schemaVersion: 1, targetPartId: 'P1', position: 1 })
  assert.equal(fixture.package.publication.recipientStudentId, 'td-prod-10-student-a')
  assert.equal(fixture.assignmentId, 'ses248-score-only-a')
})
