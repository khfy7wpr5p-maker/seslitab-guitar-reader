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
  prepareTeacherAssignmentScoreUpload,
} from '../src/services/teacherAssignmentComposerScoreUpload.js'
import {
  createRequestBoundAssignmentComposerService,
} from '../backend/delivery/services/requestBoundAssignmentComposerService.js'

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

function integrationHarness() {
  const calls = {
    prepared: [],
    delivered: [],
    pieces: [],
    lifecycle: [],
    acknowledgements: [],
  }
  const preparedItems = new Map()
  const pieces = new Map()
  const lifecycles = new Map()
  let request = Object.freeze({
    requestId: 'request-a',
    studentId: 'student-b',
    title: 'Sor Etüdü No. 13',
    state: 'PENDING',
    targetState: null,
    pieceAssignmentId: null,
    requestedAt: '2026-10-04T07:30:00Z',
    updatedAt: '2026-10-04T07:30:00Z',
  })

  const roster = Object.freeze([
    Object.freeze({
      schemaVersion: 1,
      studentId: 'student-a',
      displayNameOrNickname: 'Ada',
      active: true,
    }),
    Object.freeze({
      schemaVersion: 1,
      studentId: 'student-b',
      displayNameOrNickname: 'Ada',
      active: true,
    }),
  ])

  const service = createRequestBoundAssignmentComposerService({
    authorization: {
      async resolvePrincipal() {
        return Object.freeze({ teacherId: 'teacher-a' })
      },
    },
    rosterService: {
      async listRoster() {
        return roster
      },
    },
    preparedService: {
      async prepareBatch({ providerSubject, items }) {
        assert.equal(providerSubject, 'uid-teacher-a')
        calls.prepared.push(structuredClone(items))
        for (const item of items) {
          preparedItems.set(item.assignment.assignmentId, item)
        }
        return Object.freeze(items.map((item) => Object.freeze({
          schemaVersion: 1,
          teacherId: 'teacher-a',
          assignment: structuredClone(item.assignment),
          packageId: item.package.packageId,
          packageFingerprint: 'a'.repeat(64),
          preparedAt: '2026-10-04T08:00:01Z',
        })))
      },
    },
    teacherDeliveryService: {
      async deliverBatch({ providerSubject, assignmentIds }) {
        assert.equal(providerSubject, 'uid-teacher-a')
        calls.delivered.push([...assignmentIds])
        return Object.freeze(assignmentIds.map((assignmentId) => {
          const item = preparedItems.get(assignmentId)
          assert.ok(item)
          return Object.freeze({
            schemaVersion: 1,
            deliveryId: assignmentId,
            assignmentId,
            packageId: item.package.packageId,
            teacherId: 'teacher-a',
            studentId: item.assignment.studentId,
            deliveredAt: '2026-10-04T08:00:02Z',
            revokedAt: null,
          })
        }))
      },
    },
    pieceService: {
      async createPiece({ providerSubject, input }) {
        assert.equal(providerSubject, 'uid-teacher-a')
        calls.pieces.push(structuredClone(input))
        const piece = Object.freeze({
          schemaVersion: 1,
          pieceAssignmentId: input.pieceAssignmentId,
          pieceId: input.pieceId,
          arrangementId: input.arrangementId,
          studentId: input.studentId,
          title: input.title,
          teacherNote: input.teacherNote,
          assignedAt: '2026-10-04T08:00:03Z',
          contentRefs: Object.freeze({
            scoreAssignmentId: input.scoreAssignmentId,
            chordAssignmentIds: Object.freeze([...input.chordAssignmentIds]),
          }),
        })
        const existing = pieces.get(input.pieceAssignmentId)
        if (existing) {
          assert.deepEqual(existing, piece)
          return existing
        }
        pieces.set(input.pieceAssignmentId, piece)
        lifecycles.set(input.pieceAssignmentId, 'ACTIVE')
        return piece
      },
      async getPieceForTeacher({ pieceAssignmentId }) {
        const piece = pieces.get(pieceAssignmentId)
        if (!piece) throw new Error('piece-not-found')
        return Object.freeze({
          piece,
          lifecycle: Object.freeze({
            piece,
            state: lifecycles.get(pieceAssignmentId),
            revokedAt: null,
          }),
        })
      },
      async applyPieceAction({ pieceAssignmentId, action }) {
        assert.equal(action, 'PLACE_IN_REPERTOIRE')
        calls.lifecycle.push([pieceAssignmentId, action])
        lifecycles.set(pieceAssignmentId, 'REPERTOIRE')
        return Object.freeze({
          state: 'REPERTOIRE',
          revokedAt: null,
        })
      },
    },
    workRequestService: {
      async getForTeacher() {
        return request
      },
      async acknowledgeConversion(input) {
        calls.acknowledgements.push({ ...input })
        if (request.state === 'CONVERTED') {
          assert.equal(request.pieceAssignmentId, input.pieceAssignmentId)
          assert.equal(request.targetState, input.targetState)
          return request
        }
        request = Object.freeze({
          ...request,
          state: 'CONVERTED',
          targetState: input.targetState,
          pieceAssignmentId: input.pieceAssignmentId,
          updatedAt: '2026-10-04T08:00:04Z',
        })
        return request
      },
    },
    now: () => '2026-10-04T08:00:00Z',
  })

  return { service, calls, pieces }
}

async function preparedScore() {
  return prepareTeacherAssignmentScoreUpload({
    musicXml: VALID_XML,
    teacherId: 'teacher-a',
    draftId: 'browser-draft',
    now: () => '2026-10-04T07:59:00Z',
  })
}

function draft({ scoreUpload = null, chordSnapshots = [] } = {}) {
  return Object.freeze({
    teacherNote: 'Yavaş çalış.',
    scoreUpload,
    guitarTabUpload: null,
    chordSnapshots: Object.freeze([...chordSnapshots]),
  })
}

test('SES-189 real Composer SCORE-only conversion creates one exact same-student Piece', async () => {
  const { service, calls } = integrationHarness()
  const result = await service.convert({
    providerSubject: 'uid-teacher-a',
    requestId: 'request-a',
    targetState: 'ACTIVE',
    composerDraft: draft({ scoreUpload: await preparedScore() }),
  })

  assert.equal(result.state, 'CONVERTED')
  assert.equal(calls.pieces.length, 1)
  assert.equal(calls.pieces[0].studentId, 'student-b')
  assert.match(calls.pieces[0].scoreAssignmentId, /^ses141:ses189:request-a:score-assignment:student-b$/)
  assert.deepEqual(calls.pieces[0].chordAssignmentIds, [])
})

test('SES-189 real Composer CHORD-only conversion creates one exact same-student Piece', async () => {
  const { service, calls } = integrationHarness()
  const result = await service.convert({
    providerSubject: 'uid-teacher-a',
    requestId: 'request-a',
    targetState: 'ACTIVE',
    composerDraft: draft({
      chordSnapshots: [getChordBoardVoicings('Am')[0]],
    }),
  })

  assert.equal(result.state, 'CONVERTED')
  assert.equal(calls.pieces.length, 1)
  assert.equal(calls.pieces[0].studentId, 'student-b')
  assert.equal(calls.pieces[0].scoreAssignmentId, null)
  assert.deepEqual(calls.pieces[0].chordAssignmentIds, [
    'ses141:ses189:request-a:chord-assignment:student-b:0',
  ])
})

test('SES-189 real Composer SCORE+CHORD keeps all exact delivered child refs and direct Repertuar server lifecycle', async () => {
  const { service, calls } = integrationHarness()
  const result = await service.convert({
    providerSubject: 'uid-teacher-a',
    requestId: 'request-a',
    targetState: 'REPERTOIRE',
    composerDraft: draft({
      scoreUpload: await preparedScore(),
      chordSnapshots: [getChordBoardVoicings('E')[0]],
    }),
  })

  assert.equal(result.targetState, 'REPERTOIRE')
  assert.equal(calls.pieces.length, 1)
  assert.deepEqual(calls.pieces[0].chordAssignmentIds, [
    'ses141:ses189:request-a:chord-assignment:student-b:0',
  ])
  assert.equal(calls.lifecycle.length, 1)
  assert.equal(calls.acknowledgements.length, 1)
})

test('SES-189 exact retry does not prepare, deliver, or create a second child/Piece set', async () => {
  const { service, calls } = integrationHarness()
  const composerDraft = draft({ scoreUpload: await preparedScore() })

  const first = await service.convert({
    providerSubject: 'uid-teacher-a',
    requestId: 'request-a',
    targetState: 'ACTIVE',
    composerDraft,
  })
  const counts = {
    prepared: calls.prepared.length,
    delivered: calls.delivered.length,
    pieces: calls.pieces.length,
  }
  const second = await service.convert({
    providerSubject: 'uid-teacher-a',
    requestId: 'request-a',
    targetState: 'ACTIVE',
    composerDraft,
  })

  assert.equal(second.pieceAssignmentId, first.pieceAssignmentId)
  assert.deepEqual(
    {
      prepared: calls.prepared.length,
      delivered: calls.delivered.length,
      pieces: calls.pieces.length,
    },
    counts,
  )
})
