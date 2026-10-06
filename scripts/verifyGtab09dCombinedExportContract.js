import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  SmoosicTestDOMParser,
  SmoosicTestXMLSerializer,
} from '../tests/support/smoosicXmlDom.js'
import { prepareEditorGuitarTabHandoff } from '../src/services/editorGuitarTabHandoff.js'
import { createStudentPrivatePracticePackageV1 } from '../src/services/studentPracticePackageV1.js'
import { prepareTeacherAssignmentScoreUpload } from '../src/services/teacherAssignmentComposerScoreUpload.js'

globalThis.DOMParser = SmoosicTestDOMParser
globalThis.XMLSerializer = SmoosicTestXMLSerializer

const editorRoot = process.env.GTAB_EDITOR_ROOT
const studentRoot = process.env.STUDENT_APP_ROOT
if (!editorRoot || !studentRoot) {
  throw new Error('GTAB_EDITOR_ROOT and STUDENT_APP_ROOT are required.')
}

async function importFrom(root, relative) {
  return import(pathToFileURL(path.resolve(root, relative)).href)
}

const editor = await importFrom(editorRoot, 'src/index.js')
const studentContract = await importFrom(studentRoot, 'src/contracts/practicePackage.js')
const studentWorkspace = await importFrom(studentRoot, 'src/practice/practiceWorkspace.js')

const fixtureCases = [
  {
    id: 'audiveris-like',
    path: 'tests/fixtures/gtab09d/audiveris-like.musicxml',
    softwarePattern: /Audiveris/u,
    expectedVoices: ['1'],
    positionByMidi: new Map([
      [64, { string: 1, fret: 0 }],
      [67, { string: 1, fret: 3 }],
    ]),
  },
  {
    id: 'smoosic-like',
    path: 'tests/fixtures/gtab09d/smoosic-like.musicxml',
    softwarePattern: /Smoosic/u,
    expectedVoices: ['1', '2', '3', '4'],
    positionByMidi: new Map([
      [60, { string: 2, fret: 1 }],
      [64, { string: 1, fret: 0 }],
      [55, { string: 3, fret: 0 }],
      [52, { string: 4, fret: 2 }],
    ]),
  },
]

const results = []

for (const fixture of fixtureCases) {
  const sourceXml = await readFile(path.resolve(fixture.path), 'utf8')
  const originalBytes = Buffer.from(sourceXml, 'utf8')
  assert.match(sourceXml, fixture.softwarePattern)

  const sourceSession = editor.createSourceSession(sourceXml)
  assert.ok(sourceSession.events.length > 0)
  assert.deepEqual(
    [...new Set(sourceSession.events.map((event) => String(event.voice)))].sort(
      (left, right) => Number(left) - Number(right),
    ),
    fixture.expectedVoices,
  )

  const document = editor.createTabAssignmentDocument(sourceSession)
  for (const event of sourceSession.events) {
    const position = fixture.positionByMidi.get(event.pitch.midi)
    assert.ok(position, `${fixture.id}: position missing for MIDI ${event.pitch.midi}`)
    document.assignPosition(event.sourceEventId, position)
  }
  assert.equal(document.canExport(), true)

  const guitarTabMusicXml = editor.serializeGuitarTabMusicXml({ sourceSession, document })
  assert.match(guitarTabMusicXml, /<staves>2<\/staves>/u)
  assert.match(guitarTabMusicXml, /<clef number="2">[\s\S]*?<sign>TAB<\/sign>/u)
  assert.match(guitarTabMusicXml, /<staff-lines>6<\/staff-lines>/u)
  assert.equal((guitarTabMusicXml.match(/<staff-tuning line=/gu) ?? []).length, 6)
  assert.match(guitarTabMusicXml, /<technical>[\s\S]*?<string>[1-6]<\/string>[\s\S]*?<fret>\d+<\/fret>[\s\S]*?<\/technical>/u)
  assert.deepEqual(Buffer.from(sourceXml, 'utf8'), originalBytes)

  const draftId = `gtab09d-${fixture.id}`
  const scoreUpload = await prepareTeacherAssignmentScoreUpload({
    musicXml: sourceXml,
    teacherId: 'gtab09d-teacher',
    draftId,
    now: () => '2026-10-06T09:00:00Z',
  })
  assert.equal(scoreUpload.musicXml, sourceXml)

  const handoff = await prepareEditorGuitarTabHandoff({
    scoreUpload,
    guitarTabMusicXml,
    draftId,
  })
  assert.equal(handoff.guitarTabMusicXml, guitarTabMusicXml)
  assert.equal(handoff.pitchedEventCount, sourceSession.events.length)
  await assert.rejects(
    prepareEditorGuitarTabHandoff({
      scoreUpload,
      guitarTabMusicXml,
      draftId: `${draftId}-stale`,
    }),
    /editor-guitar-tab-handoff-draft-mismatch/u,
  )

  const pkg = createStudentPrivatePracticePackageV1({
    packageId: `${fixture.id}-package`,
    workId: `${fixture.id}-work`,
    title: `GTAB-09D ${fixture.id}`,
    revisionId: `${fixture.id}-revision`,
    approvedAt: '2026-10-06T09:01:00Z',
    studentId: 'gtab09d-student',
    musicXml: sourceXml,
    guitarTabMusicXml: handoff.guitarTabMusicXml,
    canonicalEvents: [],
    practice: {},
  })

  assert.deepEqual(studentContract.validatePracticePackage(pkg), { ok: true, errors: [] })
  const workspace = studentWorkspace.createPracticeWorkspace({
    deliveryItem: {
      package: pkg,
      accessRef: { kind: 'SECURE_DELIVERY', deliveryId: `${fixture.id}-delivery` },
    },
    notationRuntimeAvailable: true,
    playbackPort: null,
  })

  assert.equal(workspace.renderSource.musicXml, sourceXml)
  assert.equal(workspace.tabRenderSource.kind, 'musicxml')
  assert.equal(workspace.tabRenderSource.musicXml, guitarTabMusicXml)
  assert.equal(workspace.viewModel.capabilities.guitarTab, 'AVAILABLE')

  results.push({
    fixture: fixture.id,
    eventCount: sourceSession.events.length,
    voices: fixture.expectedVoices,
    studentGuitarTabCapability: workspace.viewModel.capabilities.guitarTab,
    sourceBytesPreserved: Buffer.compare(Buffer.from(sourceXml, 'utf8'), originalBytes) === 0,
  })
}

console.log(JSON.stringify({ ok: true, qualifications: results }, null, 2))
