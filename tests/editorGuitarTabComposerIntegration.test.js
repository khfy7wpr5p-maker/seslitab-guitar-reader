import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SmoosicTestDOMParser,
  SmoosicTestXMLSerializer,
} from './support/smoosicXmlDom.js'
import {
  createTeacherAssignmentComposerService,
} from '../src/services/teacherAssignmentComposerService.js'

globalThis.DOMParser = SmoosicTestDOMParser
globalThis.XMLSerializer = SmoosicTestXMLSerializer

const SCORE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
  </measure></part>
</score-partwise>`

const TAB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar TAB</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes>
      <divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves>
      <clef number="1"><sign>G</sign><line>2</line></clef>
      <clef number="2"><sign>TAB</sign><line>5</line></clef>
      <staff-details number="2" show-frets="numbers"><staff-type>alternate</staff-type><staff-lines>6</staff-lines>
        <staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
        <staff-tuning line="2"><tuning-step>A</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
        <staff-tuning line="3"><tuning-step>D</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
        <staff-tuning line="4"><tuning-step>G</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
        <staff-tuning line="5"><tuning-step>B</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
        <staff-tuning line="6"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning>
      </staff-details>
    </attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    <backup><duration>4</duration></backup>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff><notations><technical><string>2</string><fret>1</fret></technical></notations></note>
    <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff><notations><technical><string>2</string><fret>3</fret></technical></notations></note>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff><notations><technical><string>1</string><fret>0</fret></technical></notations></note>
    <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff><notations><technical><string>1</string><fret>1</fret></technical></notations></note>
  </measure></part>
</score-partwise>`

const MULTIPART_SCORE_XML = SCORE_XML
  .replace('</part-list>', '<score-part id="P2"><part-name>Second Guitar</part-name></score-part></part-list>')
  .replace('  </measure></part>\n</score-partwise>', '  </measure></part>\n  <part id="P2"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff><type>quarter</type></note><note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff><type>quarter</type></note><note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff><type>quarter</type></note><note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff><type>quarter</type></note></measure></part>\n</score-partwise>')
  .replace(/<voice>1<\/voice>(?!<staff>)/gu, '<voice>1</voice><staff>1</staff>')

function harness() {
  const calls = { prepared: [] }
  const client = {
    async listTeacherRoster() {
      return Object.freeze([
        Object.freeze({
          schemaVersion: 1,
          studentId: 'student-a',
          displayNameOrNickname: 'Ada',
          active: true,
        }),
      ])
    },
    async prepareAssignments(items) {
      calls.prepared.push(items)
      return Object.freeze(items.map((item) => Object.freeze({
        schemaVersion: 1,
        teacherId: 'teacher-a',
        assignment: structuredClone(item.assignment),
        packageId: item.package.packageId,
        packageFingerprint: 'a'.repeat(64),
        preparedAt: '2026-10-04T10:01:00Z',
      })))
    },
    async deliverAssignments(ids) {
      const items = calls.prepared.at(-1)
      const byId = new Map(items.map((item) => [item.assignment.assignmentId, item]))
      return Object.freeze(ids.map((id) => {
        const item = byId.get(id)
        return Object.freeze({
          schemaVersion: 1,
          deliveryId: id,
          assignmentId: id,
          packageId: item.package.packageId,
          teacherId: 'teacher-a',
          studentId: item.assignment.studentId,
          deliveredAt: '2026-10-04T10:02:00Z',
          revokedAt: null,
        })
      }))
    },
    async createTeacherPiece(input) {
      return Object.freeze({
        schemaVersion: 1,
        ...input,
        state: 'assigned',
        assignedAt: '2026-10-04T10:03:00Z',
        contentRefs: Object.freeze({
          scoreAssignmentId: input.scoreAssignmentId,
          chordAssignmentIds: Object.freeze([...input.chordAssignmentIds]),
        }),
      })
    },
  }
  return {
    calls,
    service: createTeacherAssignmentComposerService({
      teacherId: 'teacher-a',
      secureDeliveryClient: client,
      now: () => '2026-10-04T10:00:00Z',
    }),
  }
}

async function prepare(service, draftId = 'draft-tab', { musicXml = SCORE_XML, targetSelection = null } = {}) {
  const scoreUpload = await service.prepareScoreUpload({
    musicXml,
    draftId,
  })
  const guitarTabUpload = await service.prepareGuitarTabUpload({
    scoreUpload,
    guitarTabMusicXml: TAB_XML,
    draftId,
    targetSelection,
  })
  return { scoreUpload, guitarTabUpload }
}

test('GTAB-10B composer carries and revalidates the exact multipart target tuple', async () => {
  const { service, calls } = harness()
  const targetSelection = { partId: 'P2', partIndex: 1, staff: 1, voice: 1 }
  const { scoreUpload, guitarTabUpload } = await prepare(service, 'draft-multipart', {
    musicXml: MULTIPART_SCORE_XML,
    targetSelection,
  })

  assert.deepEqual(guitarTabUpload.targetSelection, targetSelection)
  const result = await service.send({
    draftId: 'draft-multipart',
    studentIds: ['student-a'],
    title: 'Multipart TAB',
    scoreUpload,
    guitarTabUpload,
    chordSnapshots: [],
  })
  assert.equal(result.ok, true)
  assert.equal(calls.prepared[0][0].package.content.guitarTab.data, TAB_XML)

  await assert.rejects(service.send({
    draftId: 'draft-multipart',
    studentIds: ['student-a'],
    title: 'Multipart TAB',
    scoreUpload,
    guitarTabUpload: { ...guitarTabUpload, targetSelection: { ...targetSelection, partId: 'P1', partIndex: 0 } },
    chordSnapshots: [],
  }), /integrity|mismatch/u)
})

test('GTAB-04 composer delivers exact validated TAB bytes inside SCORE package', async () => {
  const { service, calls } = harness()
  const { scoreUpload, guitarTabUpload } = await prepare(service)

  const result = await service.send({
    draftId: 'draft-tab',
    studentIds: ['student-a'],
    title: 'TAB Etüdü',
    scoreUpload,
    guitarTabUpload,
    chordSnapshots: [],
  })

  assert.equal(result.ok, true)
  assert.equal(calls.prepared.length, 1)
  const pkg = calls.prepared[0][0].package
  assert.equal(pkg.content.score.data, SCORE_XML)
  assert.equal(pkg.content.guitarTab.format, 'musicxml')
  assert.equal(pkg.content.guitarTab.data, TAB_XML)
  assert.match(pkg.content.guitarTab.data, /<string>2<\/string><fret>1<\/fret>/u)
})

test('GTAB-04 composer keeps SCORE-only assignment behavior with null guitarTab', async () => {
  const { service, calls } = harness()
  const scoreUpload = await service.prepareScoreUpload({
    musicXml: SCORE_XML,
    draftId: 'draft-score-only',
  })

  const result = await service.send({
    draftId: 'draft-score-only',
    studentIds: ['student-a'],
    title: 'Nota Etüdü',
    scoreUpload,
    chordSnapshots: [],
  })

  assert.equal(result.ok, true)
  assert.equal(calls.prepared[0][0].package.content.guitarTab, null)
})

test('GTAB-04 composer rejects TAB without SCORE and wrong draft/fingerprint authority', async () => {
  const { service } = harness()
  const { scoreUpload, guitarTabUpload } = await prepare(service, 'draft-authority')

  await assert.rejects(
    service.send({
      draftId: 'draft-authority',
      studentIds: ['student-a'],
      title: 'TAB',
      scoreUpload: null,
      guitarTabUpload,
      chordSnapshots: [],
    }),
    /tab.*score|score.*tab/i,
  )

  await assert.rejects(
    service.send({
      draftId: 'draft-other',
      studentIds: ['student-a'],
      title: 'TAB',
      scoreUpload,
      guitarTabUpload,
      chordSnapshots: [],
    }),
    /draft|integrity|mismatch/i,
  )

  await assert.rejects(
    service.send({
      draftId: 'draft-authority',
      studentIds: ['student-a'],
      title: 'TAB',
      scoreUpload,
      guitarTabUpload: {
        ...guitarTabUpload,
        scoreMusicXmlFingerprint: 'b'.repeat(64),
      },
      chordSnapshots: [],
    }),
    /fingerprint|integrity|mismatch/i,
  )
})

test('GTAB-04 composer revalidates TAB bytes before delivery and rejects mutation', async () => {
  const { service, calls } = harness()
  const { scoreUpload, guitarTabUpload } = await prepare(service, 'draft-mutated')
  const mutated = {
    ...guitarTabUpload,
    guitarTabMusicXml: guitarTabUpload.guitarTabMusicXml.replace(
      '<string>2</string><fret>1</fret>',
      '<string>1</string><fret>0</fret>',
    ),
  }

  await assert.rejects(
    service.send({
      draftId: 'draft-mutated',
      studentIds: ['student-a'],
      title: 'TAB',
      scoreUpload,
      guitarTabUpload: mutated,
      chordSnapshots: [],
    }),
    /position|pitch|fingerprint|mismatch|integrity/i,
  )
  assert.equal(calls.prepared.length, 0)
})
