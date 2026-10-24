import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { preparePartInstrumentAssignment, confirmPartInstrumentAssignment, readMusicXmlPartInstrumentMap } from '../src/services/musicXmlPartInstrumentAssignment.js'
import { prepareTeacherAssignmentScoreUpload } from '../src/services/teacherAssignmentComposerScoreUpload.js'
import { buildSes248StudentQualificationFixture } from '../scripts/tdProd10TeacherStudentFixture.js'
import { validateStudentPracticePackageV1 } from '../src/services/studentPracticePackageV1.js'

test('Vals approved instruments survive actual upload, authorized prepare/delivery and isolated Student read under schema 1.0.0', async () => {
  const source = await readFile(new URL('./fixtures/ses249/vals-original.musicxml', import.meta.url), 'utf8')
  const preview = await preparePartInstrumentAssignment({ musicXml: source, assignments: [{ partId: 'P1', instrumentId: 'VIOLIN' }, { partId: 'P2', instrumentId: 'GRAND_PIANO' }] })
  const musicXml = await confirmPartInstrumentAssignment({ musicXml: source, preview, confirmed: true })
  const upload = await prepareTeacherAssignmentScoreUpload({ musicXml, teacherId: 'td-prod-10-teacher-a', draftId: 'ses249', now: () => '2026-10-24T00:00:00Z' })
  const fixture = await buildSes248StudentQualificationFixture({ musicXml: upload.musicXml, prefix: 'ses249' })
  assert.equal(fixture.assignmentId, 'ses249-score-only-a')
  assert.equal(fixture.package.schemaVersion, '1.0.0')
  assert.equal(validateStudentPracticePackageV1(fixture.package).ok, true)
  assert.equal(fixture.package.content.score.data, musicXml)
  assert.deepEqual(readMusicXmlPartInstrumentMap(fixture.package.content.score.data), { P1: 'VIOLIN', P2: 'GRAND_PIANO' })
  assert.deepEqual(fixture.package.content.violin, { schemaVersion: 1, targetPartId: 'P1', position: 1 })
  assert.equal(Object.hasOwn(fixture.package, 'partInstruments'), false)
})
