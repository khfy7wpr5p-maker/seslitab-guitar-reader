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
import {
  mountTeacherAssignmentComposerUi,
} from '../src/teacherAssignmentComposerUi.js'
import {
  createFakeDocument,
} from './support/fakeTeacherPoolDom.js'

globalThis.DOMParser = SmoosicTestDOMParser
globalThis.XMLSerializer = SmoosicTestXMLSerializer

const PIANO_TWO_STAFF_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <staves>2</staves>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>5</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff>
      </note>
      <backup><duration>1</duration></backup>
      <note>
        <pitch><step>C</step><octave>3</octave></pitch>
        <duration>1</duration><voice>2</voice><type>quarter</type><staff>2</staff>
      </note>
    </measure>
  </part>
</score-partwise>`

const SAFE_TIMEWISE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-timewise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Imported score</part-name></score-part>
  </part-list>
  <measure number="1">
    <part id="P1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
    </part>
  </measure>
</score-timewise>`

function preparedAck(item) {
  return Object.freeze({
    schemaVersion: 1,
    teacherId: 'teacher-a',
    assignment: structuredClone(item.assignment),
    packageId: item.package.packageId,
    packageFingerprint: 'a'.repeat(64),
    preparedAt: '2026-10-02T01:31:00Z',
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
    deliveredAt: '2026-10-02T01:32:00Z',
    revokedAt: null,
  })
}

function harness({ verifyScoreSource = async () => false } = {}) {
  const calls = {
    verify: 0,
    prepare: [],
    deliver: [],
    pieces: [],
  }
  const secureDeliveryClient = {
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
      calls.prepare.push(items)
      return Object.freeze(items.map(preparedAck))
    },
    async deliverAssignments(ids) {
      calls.deliver.push(ids)
      const items = calls.prepare.at(-1)
      const byId = new Map(
        items.map((item) => [
          item.assignment.assignmentId,
          item,
        ]),
      )
      return Object.freeze(
        ids.map((id) => deliveryAck(byId.get(id))),
      )
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
        assignedAt: '2026-10-02T01:33:00Z',
        contentRefs: Object.freeze({
          scoreAssignmentId: input.scoreAssignmentId,
          chordAssignmentIds: Object.freeze([
            ...input.chordAssignmentIds,
          ]),
        }),
      })
    },
  }

  return {
    calls,
    service: createTeacherAssignmentComposerService({
      teacherId: 'teacher-a',
      secureDeliveryClient,
      async verifyScoreSource(musicXml) {
        calls.verify += 1
        return verifyScoreSource(musicXml)
      },
      now: () => '2026-10-02T01:30:00Z',
    }),
  }
}

test('SES-153 accepts safe teacher-selected non-Smoosic MusicXML without consulting editor source equality', async () => {
  const { service, calls } = harness({
    verifyScoreSource: async () => false,
  })

  const upload = await service.prepareScoreUpload({
    musicXml: PIANO_TWO_STAFF_XML,
    draftId: 'ses153-piano',
  })

  assert.equal(calls.verify, 0)
  assert.equal(upload.musicXml, PIANO_TWO_STAFF_XML)
  assert.match(upload.musicXmlFingerprint, /^[0-9a-f]{64}$/u)
  assert.equal(upload.draftId, 'ses153-piano')
})

test('SES-153 safe MusicXML remains deliverable when semantic/canonical parsing is unavailable', async () => {
  const { service, calls } = harness({
    verifyScoreSource: async () => true,
  })

  const upload = await service.prepareScoreUpload({
    musicXml: SAFE_TIMEWISE_XML,
    draftId: 'ses153-timewise',
  })

  const result = await service.send({
    draftId: 'ses153-timewise',
    studentIds: ['student-a'],
    title: 'Imported score',
    teacherNote: '',
    scoreUpload: upload,
    chordSnapshots: [],
  })

  assert.equal(result.ok, true)
  assert.equal(calls.prepare.length, 1)
  assert.equal(calls.prepare[0].length, 1)
  assert.equal(
    calls.prepare[0][0].package.content.score.data,
    SAFE_TIMEWISE_XML,
  )
  assert.deepEqual(
    calls.prepare[0][0].package.content.canonicalEvents,
    [],
  )
  assert.deepEqual(
    result.recipients[0].deliveredContentTypes,
    ['SCORE'],
  )
})

test('SES-153 combined send reports the actual SCORE and CHORD_BOARD content types', async () => {
  const { service } = harness()

  const upload = await service.prepareScoreUpload({
    musicXml: PIANO_TWO_STAFF_XML,
    draftId: 'ses153-combined',
  })

  const result = await service.send({
    draftId: 'ses153-combined',
    studentIds: ['student-a'],
    title: 'Combined',
    teacherNote: '',
    scoreUpload: upload,
    chordSnapshots: [
      getChordBoardVoicings('Am')[0],
    ],
  })

  assert.equal(
    result.recipients[0].phase,
    TEACHER_ASSIGNMENT_DELIVERY_PHASE
      .DELIVERED_TO_STUDENT,
  )
  assert.deepEqual(
    result.recipients[0].deliveredContentTypes,
    ['SCORE', 'CHORD_BOARD'],
  )
})

test('SES-153 rejects unsafe XML but never uses semantic complexity as send authority', async () => {
  const { service } = harness()

  await assert.rejects(
    () => service.prepareScoreUpload({
      musicXml:
        '<!DOCTYPE score-partwise [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><score-partwise>&xxe;</score-partwise>',
      draftId: 'ses153-unsafe',
    }),
    /invalid|unsafe|doctype|entity/i,
  )
})

test('SES-153 bounds teacher SCORE intake below the Firestore single-document ceiling', async () => {
  const { service } = harness()
  const padding = 'x'.repeat(930 * 1024)
  const oversizedForDelivery =
    `<score-partwise version="4.0"><!--${padding}--><part-list></part-list></score-partwise>`

  await assert.rejects(
    () => service.prepareScoreUpload({
      musicXml: oversizedForDelivery,
      draftId: 'ses153-firestore-bound',
    }),
    /large|size|too-large|invalid/i,
  )
})

async function settle() {
  await new Promise((resolve) => setImmediate(resolve))
}

test('SES-153 UI does not silently downgrade a selected SCORE to CHORD_BOARD-only after SCORE preparation fails', async () => {
  const root = createFakeDocument()
  const host = root.createElement('div')
  const calls = { send: 0 }
  const service = {
    async loadRoster() {
      return Object.freeze([
        Object.freeze({
          studentId: 'student-a',
          displayNameOrNickname: 'Ada',
        }),
      ])
    },
    async prepareScoreUpload() {
      throw new Error('score rejected')
    },
    async send() {
      calls.send += 1
      return Object.freeze({
        ok: true,
        recipients: Object.freeze([]),
      })
    },
  }

  const handle = mountTeacherAssignmentComposerUi({
    root,
    host,
    service,
    createDraftId: () => 'ses153-ui',
  })
  await settle()

  const fileInput = host.querySelector(
    'input[name="scoreMusicXml"]',
  )
  fileInput.files = [{
    name: 'teacher.musicxml',
    size: 100,
    async text() {
      return PIANO_TWO_STAFF_XML
    },
  }]
  await fileInput.dispatchEventAsync({
    type: 'change',
  })

  const symbol = host.querySelector(
    'select[name="chordSymbol"]',
  )
  const voicing = host.querySelector(
    'select[name="chordVoicing"]',
  )
  symbol.value = 'Am'
  symbol.dispatchEvent({ type: 'change' })
  voicing.value =
    getChordBoardVoicings('Am')[0]
      .voicingFingerprint
  const add = host
    .querySelectorAll('button')
    .find((button) =>
      button.textContent === 'Akoru Ekle')
  add.dispatchEvent({ type: 'click' })

  const student = host.querySelector(
    'input[name="studentId"]',
  )
  student.checked = true
  host.querySelector(
    'input[name="assignmentTitle"]',
  ).value = 'Teacher authority'

  await host.querySelector('form')
    .dispatchEventAsync({
      type: 'submit',
      preventDefault() {},
    })

  assert.equal(calls.send, 0)
  assert.match(
    host.querySelector(
      '.teacher-assignment-composer__status',
    ).textContent,
    /MusicXML.*hazır|MusicXML.*düzelt|dosya/i,
  )

  handle.destroy()
})
