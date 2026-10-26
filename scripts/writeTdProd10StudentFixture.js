import { writeStudentFixture } from './studentFixtureOutput.js'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { prepareStaffToPartSplit } from '../src/services/musicXmlStaffToPartSplit.js'
import { prepareTeacherAssignmentScoreUpload } from '../src/services/teacherAssignmentComposerScoreUpload.js'
import { preparePartInstrumentAssignment, confirmPartInstrumentAssignment } from '../src/services/musicXmlPartInstrumentAssignment.js'

import {
  buildTdProd10QualificationFixture,
  buildSes248StudentQualificationFixture,
} from './tdProd10TeacherStudentFixture.js'

const outputPath = process.argv[2]

if (
  typeof outputPath !== 'string' ||
  outputPath.trim().length === 0
) {
  throw new Error(
    'TD-PROD-10 output path is required.',
  )
}

const fixture =
  await buildTdProd10QualificationFixture()
const pilotSource = await readFile(new URL('../tests/fixtures/ses248/pilot-pdf-corrected.musicxml', import.meta.url), 'utf8')
if (createHash('sha256').update(pilotSource).digest('hex') !== '13eb00cd10cee8a1f216c194b2fb605e1b0beecbb4880be0d92affeded747975') throw new Error('SES-248 PDF-corrected pilot identity changed')
const split = await prepareStaffToPartSplit({ musicXml: pilotSource })
const upload = await prepareTeacherAssignmentScoreUpload({ musicXml: split.derivedMusicXml,
  teacherId: 'td-prod-10-teacher-a', draftId: 'ses248-pilot', now: () => '2026-10-23T00:00:00Z' })
const pilot = await buildSes248StudentQualificationFixture({ musicXml: upload.musicXml })
// Independently calculated from the PDF-corrected source, never from the splitter.
const pilotEvents = JSON.parse(await readFile(new URL('../tests/fixtures/ses248/pilot-playback-events.json', import.meta.url), 'utf8'))
const valsSource = await readFile(new URL('../tests/fixtures/ses249/vals-original.musicxml', import.meta.url), 'utf8')
const valsPreview = await preparePartInstrumentAssignment({ musicXml: valsSource, assignments: [{ partId: 'P1', instrumentId: 'VIOLIN' }, { partId: 'P2', instrumentId: 'GRAND_PIANO' }] })
const valsXml = await confirmPartInstrumentAssignment({ musicXml: valsSource, preview: valsPreview, confirmed: true })
const vals = await buildSes248StudentQualificationFixture({ musicXml: valsXml, prefix: 'ses249' })

if (
  Object.values(fixture.evidence)
    .some((value) => value !== true)
) {
  throw new Error(
    'TD-PROD-10 negative qualification evidence is incomplete.',
  )
}

const source =
  'export const TD_PROD_10_FIXTURE = ' +
  JSON.stringify(fixture, null, 2) +
  '\nexport const SES248_FIXTURE = ' + JSON.stringify(pilot, null, 2) +
  '\nexport const SES248_EXPECTED_EVENTS = ' + JSON.stringify(pilotEvents) +
  '\nexport const SES249_FIXTURE = ' + JSON.stringify(vals) +
  '\nexport const SES249_SOURCE_XML = ' + JSON.stringify(valsSource) + '\n'

await writeStudentFixture(outputPath, source)
