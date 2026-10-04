import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createRequestBoundAssignmentComposerService,
} from '../backend/delivery/services/requestBoundAssignmentComposerService.js'

function pendingRequest(overrides = {}) {
  return Object.freeze({
    requestId: 'request-a',
    teacherId: 'teacher-a',
    studentId: 'student-b',
    title: 'Sor Etüdü No. 13',
    state: 'PENDING',
    requestedAt: '2026-10-04T07:30:00Z',
    updatedAt: '2026-10-04T07:30:00Z',
    targetState: null,
    pieceAssignmentId: null,
    ...overrides,
  })
}

function harness({ request = pendingRequest(), roster } = {}) {
  const calls = []
  const effectiveRoster = roster ?? Object.freeze([
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

  const pieceAssignmentId =
    `ses141:ses189:${request.requestId}:piece-assignment:${request.studentId}`

  const service = createRequestBoundAssignmentComposerService({
    authorization: {
      async resolvePrincipal(providerSubject, role) {
        calls.push(['resolvePrincipal', providerSubject, role])
        return Object.freeze({ teacherId: 'teacher-a' })
      },
    },
    rosterService: {
      async listRoster(input) {
        calls.push(['listRoster', input])
        return effectiveRoster
      },
    },
    preparedService: {
      async prepareBatch(input) {
        calls.push(['prepareBatch', input])
        return Object.freeze([])
      },
    },
    teacherDeliveryService: {
      async deliverBatch(input) {
        calls.push(['deliverBatch', input])
        return Object.freeze([])
      },
    },
    pieceService: {
      async createPiece(input) {
        calls.push(['createPiece', input])
        return Object.freeze(input.input)
      },
      async getPieceForTeacher(input) {
        calls.push(['getPieceForTeacher', input])
        return Object.freeze({
          piece: Object.freeze({
            pieceAssignmentId,
            studentId: request.studentId,
            contentRefs: Object.freeze({
              scoreAssignmentId: 'score-a',
              chordAssignmentIds: Object.freeze([]),
            }),
          }),
          lifecycle: Object.freeze({
            state: request.targetState ?? 'ACTIVE',
            revokedAt: null,
          }),
        })
      },
      async applyPieceAction(input) {
        calls.push(['applyPieceAction', input])
        return Object.freeze({
          state: 'REPERTOIRE',
          revokedAt: null,
        })
      },
    },
    workRequestService: {
      async getForTeacher(input) {
        calls.push(['getForTeacher', input])
        return request
      },
      async acknowledgeConversion(input) {
        calls.push(['acknowledgeConversion', input])
        return Object.freeze({
          ...request,
          state: 'CONVERTED',
          targetState: input.targetState,
          pieceAssignmentId: input.pieceAssignmentId,
          updatedAt: '2026-10-04T09:00:00Z',
        })
      },
    },
    createComposerService({ teacherId, secureDeliveryClient }) {
      calls.push(['createComposerService', teacherId])
      return Object.freeze({
        async send(input) {
          calls.push(['composer.send', input])
          assert.deepEqual(input.studentIds, [request.studentId])
          assert.equal(input.title, request.title)
          assert.equal(input.draftId, `ses189:${request.requestId}`)

          // The production adapter must keep all content persistence server-side.
          await secureDeliveryClient.listTeacherRoster()
          await secureDeliveryClient.prepareAssignments([])
          await secureDeliveryClient.deliverAssignments([])
          await secureDeliveryClient.createTeacherPiece({
            pieceAssignmentId,
          })

          return Object.freeze({
            ok: true,
            recipients: Object.freeze([
              Object.freeze({
                studentId: request.studentId,
                ok: true,
                phase: 'DELIVERED_TO_STUDENT',
                pieceLinked: true,
                deliveredContentTypes: Object.freeze(['SCORE']),
              }),
            ]),
          })
        },
      })
    },
    now: () => '2026-10-04T08:00:00Z',
  })

  return { service, calls, pieceAssignmentId }
}

const COMPOSER_DRAFT = Object.freeze({
  teacherNote: 'Yavaş çalış.',
  scoreUpload: Object.freeze({
    draftId: 'browser-draft-is-not-authority',
    musicXml: '<score-partwise/>',
    musicXmlFingerprint: 'a'.repeat(64),
  }),
  guitarTabUpload: null,
  chordSnapshots: Object.freeze([]),
})

test('SES-189 duplicate display names still bind the request to the exact hidden student id', async () => {
  const { service, calls, pieceAssignmentId } = harness()

  const result = await service.convert({
    providerSubject: 'uid-teacher-a',
    requestId: 'request-a',
    targetState: 'ACTIVE',
    composerDraft: COMPOSER_DRAFT,
  })

  assert.equal(result.state, 'CONVERTED')
  assert.equal(result.studentId, 'student-b')
  assert.equal(result.pieceAssignmentId, pieceAssignmentId)

  const sendCall = calls.find(([name]) => name === 'composer.send')
  assert.deepEqual(sendCall[1].studentIds, ['student-b'])
  assert.equal(
    calls.some((entry) => JSON.stringify(entry).includes('displayNameOrNickname')),
    false,
  )
})

test('SES-189 server adapter forwards the authenticated provider subject to existing delivery services', async () => {
  const { service, calls } = harness()

  await service.convert({
    providerSubject: 'uid-teacher-a',
    requestId: 'request-a',
    targetState: 'ACTIVE',
    composerDraft: COMPOSER_DRAFT,
  })

  assert.deepEqual(
    calls.find(([name]) => name === 'prepareBatch')?.[1],
    { providerSubject: 'uid-teacher-a', items: [] },
  )
  assert.deepEqual(
    calls.find(([name]) => name === 'deliverBatch')?.[1],
    { providerSubject: 'uid-teacher-a', assignmentIds: [] },
  )
})

test('SES-189 roster removal fails closed before composer delivery', async () => {
  const { service, calls } = harness({
    roster: Object.freeze([
      Object.freeze({
        schemaVersion: 1,
        studentId: 'student-a',
        displayNameOrNickname: 'Ada',
        active: true,
      }),
    ]),
  })

  await assert.rejects(
    () => service.convert({
      providerSubject: 'uid-teacher-a',
      requestId: 'request-a',
      targetState: 'ACTIVE',
      composerDraft: COMPOSER_DRAFT,
    }),
    /roster-authority-mismatch/,
  )
  assert.equal(calls.some(([name]) => name === 'composer.send'), false)
})

test('SES-189 direct Repertuar uses server-side Piece lifecycle before exact request acknowledgement', async () => {
  const { service, calls, pieceAssignmentId } = harness()

  const result = await service.convert({
    providerSubject: 'uid-teacher-a',
    requestId: 'request-a',
    targetState: 'REPERTOIRE',
    composerDraft: COMPOSER_DRAFT,
  })

  assert.equal(result.targetState, 'REPERTOIRE')
  const lifecycleIndex = calls.findIndex(([name]) => name === 'applyPieceAction')
  const acknowledgementIndex = calls.findIndex(([name]) => name === 'acknowledgeConversion')
  assert.ok(lifecycleIndex >= 0)
  assert.ok(acknowledgementIndex > lifecycleIndex)
  assert.deepEqual(calls[lifecycleIndex][1], {
    providerSubject: 'uid-teacher-a',
    pieceAssignmentId,
    action: 'PLACE_IN_REPERTOIRE',
  })
})

test('SES-189 converted retry revalidates exact Piece and does not run composer again', async () => {
  const request = pendingRequest({
    state: 'CONVERTED',
    targetState: 'ACTIVE',
    pieceAssignmentId: 'piece-existing',
  })
  const { service, calls } = harness({ request })

  const result = await service.convert({
    providerSubject: 'uid-teacher-a',
    requestId: 'request-a',
    targetState: 'ACTIVE',
    composerDraft: COMPOSER_DRAFT,
  })

  assert.equal(result.pieceAssignmentId, 'piece-existing')
  assert.equal(calls.some(([name]) => name === 'composer.send'), false)
  assert.deepEqual(
    calls.find(([name]) => name === 'acknowledgeConversion')?.[1],
    {
      providerSubject: 'uid-teacher-a',
      requestId: 'request-a',
      pieceAssignmentId: 'piece-existing',
      targetState: 'ACTIVE',
    },
  )
})

test('SES-189 converted retry with a different target fails closed', async () => {
  const request = pendingRequest({
    state: 'CONVERTED',
    targetState: 'ACTIVE',
    pieceAssignmentId: 'piece-existing',
  })
  const { service, calls } = harness({ request })

  await assert.rejects(
    () => service.convert({
      providerSubject: 'uid-teacher-a',
      requestId: 'request-a',
      targetState: 'REPERTOIRE',
      composerDraft: COMPOSER_DRAFT,
    }),
    /work-request-idempotency-conflict/,
  )
  assert.equal(calls.some(([name]) => name === 'composer.send'), false)
})

test('SES-189 rejects browser-invented recipient or Piece authority fields', async () => {
  const { service, calls } = harness()

  for (const invented of [
    { studentId: 'student-a' },
    { pieceAssignmentId: 'piece-fake' },
    { targetState: 'REPERTOIRE' },
  ]) {
    await assert.rejects(
      () => service.convert({
        providerSubject: 'uid-teacher-a',
        requestId: 'request-a',
        targetState: 'ACTIVE',
        composerDraft: {
          ...COMPOSER_DRAFT,
          ...invented,
        },
      }),
      /composer draft.*field|strict|unexpected/i,
    )
  }

  assert.equal(calls.some(([name]) => name === 'composer.send'), false)
})
