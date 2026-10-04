import { writeStudentFixture } from './studentFixtureOutput.js'

import {
  buildTdProd10QualificationFixture,
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
  '\n'

await writeStudentFixture(outputPath, source)
