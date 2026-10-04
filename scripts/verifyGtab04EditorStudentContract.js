import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  SmoosicTestDOMParser,
  SmoosicTestXMLSerializer,
} from '../tests/support/smoosicXmlDom.js'
import {
  prepareTeacherAssignmentScoreUpload,
} from '../src/services/teacherAssignmentComposerScoreUpload.js'
import {
  prepareEditorGuitarTabHandoff,
} from '../src/services/editorGuitarTabHandoff.js'
import {
  createStudentPrivatePracticePackageV1,
} from '../src/services/studentPracticePackageV1.js'

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

const SOURCE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>1</beats><beat-type>4</beat-type></time></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    <backup><duration>1</duration></backup>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type></note>
    <backup><duration>1</duration></backup>
    <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>3</voice><type>quarter</type></note>
    <backup><duration>1</duration></backup>
    <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>4</voice><type>quarter</type></note>
  </measure></part>
</score-partwise>`

const POSITION_BY_MIDI = new Map([
  [60, { string: 2, fret: 1 }],
  [64, { string: 1, fret: 0 }],
  [67, { string: 4, fret: 17 }],
  [71, { string: 3, fret: 16 }],
])

const sourceSession = editor.createSourceSession(SOURCE_XML)
assert.equal(sourceSession.events.length, 4)
assert.deepEqual(
  [...new Set(sourceSession.events.map((event) => event.voice))].sort((left, right) => Number(left) - Number(right)),
  ['1', '2', '3', '4'],
)
assert.equal(sourceSession.groups.length, 1)
assert.equal(sourceSession.groups[0].sourceEventIds.length, 4)

const document = editor.createTabAssignmentDocument(sourceSession)
for (const event of sourceSession.events) {
  const position = POSITION_BY_MIDI.get(event.pitch.midi)
  assert.ok(position, `qualification position missing for MIDI ${event.pitch.midi}`)
  document.assignPosition(event.sourceEventId, position)
}
assert.equal(document.canExport(), true)

const guitarTabMusicXml = editor.serializeGuitarTabMusicXml({
  sourceSession,
  document,
})
assert.match(guitarTabMusicXml, /<staff-lines>6<\/staff-lines>/u)
assert.match(guitarTabMusicXml, /<voice>1<\/voice>/u)
assert.match(guitarTabMusicXml, /<voice>2<\/voice>/u)
assert.match(guitarTabMusicXml, /<voice>3<\/voice>/u)
assert.match(guitarTabMusicXml, /<voice>4<\/voice>/u)
assert.match(guitarTabMusicXml, /<fret>17<\/fret>/u)
assert.match(guitarTabMusicXml, /<fret>16<\/fret>/u)

const scoreUpload = await prepareTeacherAssignmentScoreUpload({
  musicXml: SOURCE_XML,
  teacherId: 'gtab04-teacher',
  draftId: 'gtab04-draft',
  now: () => '2026-10-04T10:00:00Z',
})

const handoff = await prepareEditorGuitarTabHandoff({
  scoreUpload,
  guitarTabMusicXml,
  draftId: 'gtab04-draft',
})
assert.equal(handoff.guitarTabMusicXml, guitarTabMusicXml)
assert.equal(handoff.pitchedEventCount, 4)

const pkg = createStudentPrivatePracticePackageV1({
  packageId: 'gtab04-package',
  workId: 'gtab04-work',
  title: 'GTAB-04 Voice 1–4 Etüdü',
  revisionId: 'gtab04-revision',
  approvedAt: '2026-10-04T10:01:00Z',
  studentId: 'gtab04-student',
  musicXml: SOURCE_XML,
  guitarTabMusicXml: handoff.guitarTabMusicXml,
  canonicalEvents: [],
  practice: {},
})

const consumerValidation = studentContract.validatePracticePackage(pkg)
assert.deepEqual(consumerValidation, { ok: true, errors: [] })

const workspace = studentWorkspace.createPracticeWorkspace({
  deliveryItem: {
    package: pkg,
    accessRef: {
      kind: 'SECURE_DELIVERY',
      deliveryId: 'gtab04-delivery',
    },
  },
  notationRuntimeAvailable: true,
  playbackPort: null,
})

assert.equal(workspace.renderSource.musicXml, SOURCE_XML)
assert.equal(workspace.tabRenderSource.kind, 'musicxml')
assert.equal(workspace.tabRenderSource.musicXml, guitarTabMusicXml)
assert.equal(workspace.tabRenderSource.sourceId, 'gtab04-package:guitar-tab')
assert.equal(workspace.viewModel.capabilities.guitarTab, 'AVAILABLE')

console.log(JSON.stringify({
  ok: true,
  editorEventCount: sourceSession.events.length,
  editorVoices: ['1', '2', '3', '4'],
  exactTeacherFrets: [1, 0, 17, 16],
  studentGuitarTabCapability: workspace.viewModel.capabilities.guitarTab,
  studentTabBytesPreserved: workspace.tabRenderSource.musicXml === guitarTabMusicXml,
}, null, 2))
