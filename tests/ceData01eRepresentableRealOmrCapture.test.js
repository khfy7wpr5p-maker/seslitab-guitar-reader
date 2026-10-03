import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const execFileAsync = promisify(execFile)

test('SES-97 evidence workflow is local-only and cannot manufacture teacher decisions', async () => {
  const workflow = await readFile(new URL('../.github/workflows/ce-data-01e-representable-real-omr.yml', import.meta.url), 'utf8')

  assert.ok(workflow.includes('SchbAvMaSample.pdf'))
  assert.ok(workflow.includes('Audiveris/audiveris/5.10.2/data/examples/SchbAvMaSample.pdf'))
  assert.ok(workflow.includes('b2db823d96c5dce1880f5bc869af9f874f2ac99a1bff761bb3ac2f8a2a4ee896'))
  assert.ok(workflow.includes('wpmedia.musicxml.com/wp-content/uploads/2021/06/SchbAvMaSample.musicxml'))
  assert.ok(workflow.includes('ARG AUDIVERIS_VERSION=5.11.0'))
  assert.ok(workflow.includes('scripts/run-local-audiveris-provider.js'))
  assert.ok(workflow.includes('scripts/compare-existing-musicxml-events.py'))
  assert.ok(workflow.includes('PENDING_TEACHER_REVIEW'))
  assert.ok(workflow.includes('REFERENCE_HASH_DISCOVERY_ONLY'))
  assert.equal(workflow.includes('seslitab-omr.onrender.com'), false)
  assert.equal(workflow.includes('teacherDecision'), false)
  assert.equal(workflow.includes('correctionNeeded'), false)
  assert.equal(workflow.includes('correctionSafe'), false)
  assert.equal(workflow.includes('teacherGoldValue'), false)
})

test('SES-97 comparator finds a unique representable pitch substitution', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ses-97-pitch-'))
  const referencePath = path.join(root, 'reference.musicxml')
  const outputPath = path.join(root, 'output.musicxml')
  const reportPath = path.join(root, 'report.json')

  const reference = `<?xml version="1.0"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
</measure></part></score-partwise>`
  const output = reference.replace('<step>C</step><octave>4</octave>', '<step>C</step><alter>1</alter><octave>4</octave>')

  await writeFile(referencePath, reference)
  await writeFile(outputPath, output)
  try {
    await execFileAsync('python3', [
      new URL('../scripts/compare-existing-musicxml-events.py', import.meta.url).pathname,
      referencePath,
      outputPath,
      reportPath,
    ])
    const report = JSON.parse(await readFile(reportPath, 'utf8'))
    assert.equal(report.reviewState, 'PENDING_TEACHER_REVIEW')
    assert.equal(report.candidates.length, 1)
    assert.equal(report.candidates[0].errorClass, 'PITCH')
    assert.equal(report.candidates[0].observedValue, 'C#4')
    assert.equal(report.candidates[0].referenceValue, 'C4')
    assert.equal(Object.hasOwn(report.candidates[0], 'teacherDecision'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('SES-97 comparator does not coerce missing events into a representable correction class', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ses-97-missing-'))
  const referencePath = path.join(root, 'reference.musicxml')
  const outputPath = path.join(root, 'output.musicxml')
  const reportPath = path.join(root, 'report.json')

  const reference = `<?xml version="1.0"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
<note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
</measure></part></score-partwise>`
  const output = `<?xml version="1.0"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
</measure></part></score-partwise>`

  await writeFile(referencePath, reference)
  await writeFile(outputPath, output)
  try {
    await execFileAsync('python3', [
      new URL('../scripts/compare-existing-musicxml-events.py', import.meta.url).pathname,
      referencePath,
      outputPath,
      reportPath,
    ])
    const report = JSON.parse(await readFile(reportPath, 'utf8'))
    assert.equal(report.candidates.length, 0)
    assert.equal(report.referenceEventCount, 2)
    assert.equal(report.observedEventCount, 1)
    assert.equal(report.eventCountDelta, -1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
