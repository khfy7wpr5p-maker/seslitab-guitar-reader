import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SmoosicTestDOMParser,
  SmoosicTestXMLSerializer,
} from './support/smoosicXmlDom.js'


import {
  getChordBoardVoicings,
} from '../src/services/chordBoardCatalog.js'
import {
  TEACHER_ASSIGNMENT_DELIVERY_PHASE,
} from '../src/services/teacherAssignmentDeliveryOrchestrator.js'
import {
  createTeacherAssignmentComposerService,
} from '../src/services/teacherAssignmentComposerService.js'


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
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`

function preparedAck(item) {
  return Object.freeze({
    schemaVersion: 1,
    teacherId: 'teacher-a',
    assignment: structuredClone(item.assignment),
    packageId: item.package.packageId,
    packageFingerprint: 'a'.repeat(64),
    preparedAt: '2026-10-01T14:31:00Z',
  })
}

function deliveryAck(item) {
  return Object.freeze({
    schemaVersion: 1,
    deliveryId: item.assignment.assignmentId,
    assignmentId: item.assignment.assignmentId,
    packageId: item.package.packageId,
    teacherId: 'teacher-a',
    studentId: item.assignment.studentId,
    deliveredAt: '2026-10-01T14:32:00Z',
    revokedAt: null,
  })
}

function harness({
  failStudent = null,
  verifyScoreSource = async () => true,
} = {}) {
  const calls = { prepare: [], deliver: [], pieces: [] }
  const secureDeliveryClient = {
    async listTeacherRoster() {
      return Object.freeze([
        Object.freeze({ schemaVersion: 1, studentId: 'student-a', displayNameOrNickname: 'Ada', active: true }),
        Object.freeze({ schemaVersion: 1, studentId: 'student-b', displayNameOrNickname: 'Bora', active: true }),
      ])
    },
    async prepareAssignments(items) {
      calls.prepare.push(items)
      return Object.freeze(items.map(preparedAck))
    },
    async deliverAssignments(ids) {
      calls.deliver.push(ids)
      const items = calls.prepare.at(-1)
      if (failStudent && items?.[0]?.assignment?.studentId === failStudent) {
        throw new Error('provider detail must stay bounded')
      }
      const byId = new Map(items.map((item) => [item.assignment.assignmentId, item]))
      return Object.freeze(ids.map((id) => deliveryAck(byId.get(id))))
    },
    async createTeacherPiece(input) {
      calls.pieces.push(input)
      return Object.freeze({
        schemaVersion: 1,
        pieceAssignmentId: input.pieceAssignmentId,
        pieceId: input.pieceId,
        arrangementId: input.arrangementId,
        studentId: input.studentId,
        title: input.title,
        teacherNote: input.teacherNote,
        state: 'assigned',
        assignedAt: '2026-10-01T14:33:00Z',
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
      secureDeliveryClient,
      verifyScoreSource,
      now: () => '2026-10-01T14:30:00Z',
    }),
  }
}

test('SES-141 fans SCORE + multiple exact CHORD_BOARD selections out as isolated per-student delivery batches', async () => {
  const { service, calls } = harness()
  const roster = await service.loadRoster()
  assert.deepEqual(roster.map((row) => row.studentId), ['student-a', 'student-b'])

  const scoreUpload = await service.prepareScoreUpload({
    musicXml: VALID_XML,
    draftId: 'draft-combined',
  })

  const result = await service.send({
    draftId: 'draft-combined',
    studentIds: ['student-a', 'student-b'],
    title: 'Etüt 1',
    teacherNote: 'Yavaş çalış.',
    scoreUpload,
    chordSnapshots: [
      getChordBoardVoicings('Am')[0],
      getChordBoardVoicings('E')[0],
    ],
  })

  assert.equal(result.ok, true)
  assert.equal(result.recipients.length, 2)
  assert.equal(calls.prepare.length, 2)
  assert.equal(calls.deliver.length, 2)
  assert.equal(calls.pieces.length, 2)

  for (let index = 0; index < 2; index += 1) {
    const studentId = index === 0 ? 'student-a' : 'student-b'
    const prepared = calls.prepare[index]
    assert.equal(prepared.length, 3)
    assert.ok(prepared.every((item) => item.assignment.studentId === studentId))
    assert.equal(
      prepared[0].assignment.sourceRef.readinessRoute,
      'ses141_teacher_export_upload',
    )
    assert.equal(
      prepared[0].assignment.sourceRef.package12Status,
      'teacher_export_exact_source_verified',
    )
    assert.match(
      prepared[0].assignment.sourceRef.qualityEvidenceId,
      /^teacher-export:[0-9a-f]{64}$/,
    )
    assert.equal(
      result.recipients[index].phase,
      TEACHER_ASSIGNMENT_DELIVERY_PHASE.DELIVERED_TO_STUDENT,
    )
    assert.equal(result.recipients[index].pieceLinked, true)
    assert.equal(calls.pieces[index].studentId, studentId)
    assert.equal(calls.pieces[index].chordAssignmentIds.length, 2)
  }
})

test('SES-141 never reports a failed recipient as sent and does not cross-contaminate the other recipient', async () => {
  const { service, calls } = harness({ failStudent: 'student-b' })
  const scoreUpload = await service.prepareScoreUpload({
    musicXml: VALID_XML,
    draftId: 'draft-partial',
  })

  const result = await service.send({
    draftId: 'draft-partial',
    studentIds: ['student-a', 'student-b'],
    title: 'Etüt 2',
    teacherNote: '',
    scoreUpload,
    chordSnapshots: [],
  })

  assert.equal(result.ok, false)
  assert.equal(result.recipients[0].ok, true)
  assert.equal(result.recipients[0].pieceLinked, true)
  assert.equal(result.recipients[1].ok, false)
  assert.notEqual(
    result.recipients[1].phase,
    TEACHER_ASSIGNMENT_DELIVERY_PHASE.DELIVERED_TO_STUDENT,
  )
  assert.equal(calls.pieces.length, 1)
  assert.equal(calls.pieces[0].studentId, 'student-a')
  assert.doesNotMatch(JSON.stringify(result), /provider detail/i)
})


test('SES-141 retry keeps exact assignment payload authority stable for the same draft', async () => {
  const calls = { prepare: [], deliver: [], pieces: [] }
  let tick = 0
  const secureDeliveryClient = {
    async listTeacherRoster() {
      return Object.freeze([
        Object.freeze({ schemaVersion: 1, studentId: 'student-a', displayNameOrNickname: 'Ada', active: true }),
      ])
    },
    async prepareAssignments(items) {
      calls.prepare.push(structuredClone(items))
      return Object.freeze(items.map(preparedAck))
    },
    async deliverAssignments(ids) {
      calls.deliver.push([...ids])
      const items = calls.prepare.length === 1
        ? calls.prepare[0]
        : calls.prepare.at(-1)
      if (calls.deliver.length === 1) {
        throw new Error('first delivery response lost')
      }
      const byId = new Map(items.map((item) => [item.assignment.assignmentId, item]))
      return Object.freeze(ids.map((id) => deliveryAck(byId.get(id))))
    },
    async createTeacherPiece(input) {
      calls.pieces.push(structuredClone(input))
      return Object.freeze({
        ...input,
        schemaVersion: 1,
        state: 'ACTIVE',
        assignedAt: '2026-10-01T14:33:00Z',
        revokedAt: null,
        contentRefs: Object.freeze({
          scoreAssignmentId: input.scoreAssignmentId,
          chordAssignmentIds: Object.freeze([...input.chordAssignmentIds]),
        }),
      })
    },
  }
  const service = createTeacherAssignmentComposerService({
    teacherId: 'teacher-a',
    secureDeliveryClient,
    verifyScoreSource: async () => true,
    now: () => {
      tick += 1
      return `2026-10-01T14:30:0${tick}Z`
    },
  })
  const scoreUpload = await service.prepareScoreUpload({
    musicXml: VALID_XML,
    draftId: 'draft-retry',
  })

  const input = {
    draftId: 'draft-retry',
    studentIds: ['student-a'],
    title: 'Retry Etüdü',
    teacherNote: 'Aynı içerik.',
    scoreUpload,
    chordSnapshots: [getChordBoardVoicings('Am')[0]],
  }

  const first = await service.send(input)
  assert.equal(first.ok, false)
  const second = await service.send(input)
  assert.equal(second.ok, true)

  assert.equal(calls.prepare.length, 2)
  assert.deepEqual(calls.prepare[1], calls.prepare[0])
  assert.deepEqual(calls.deliver[1], calls.deliver[0])
})

test('SES-141 rejects duplicate exact CHORD_BOARD snapshots before Secure Delivery', async () => {
  const { service, calls } = harness()
  const snapshot = getChordBoardVoicings('Am')[0]

  await assert.rejects(
    () => service.send({
      draftId: 'draft-duplicate-chord',
      studentIds: ['student-a'],
      title: 'Akor',
      teacherNote: '',
      scoreUpload: null,
      chordSnapshots: [snapshot, snapshot],
    }),
    /duplicate.*chord|chord.*duplicate/i,
  )

  assert.equal(calls.prepare.length, 0)
  assert.equal(calls.deliver.length, 0)
  assert.equal(calls.pieces.length, 0)
})


test('SES-141 rejects a stale or wrong SCORE export before preparing any assignment', async () => {
  const seen = []
  const { service, calls } = harness({
    verifyScoreSource: async (musicXml) => {
      seen.push(musicXml)
      return false
    },
  })

  await assert.rejects(
    () => service.prepareScoreUpload({
      musicXml: VALID_XML,
      draftId: 'draft-stale-score',
    }),
    /stale-or-wrong-source/i,
  )

  assert.deepEqual(seen, [VALID_XML])
  assert.equal(calls.prepare.length, 0)
  assert.equal(calls.deliver.length, 0)
})
