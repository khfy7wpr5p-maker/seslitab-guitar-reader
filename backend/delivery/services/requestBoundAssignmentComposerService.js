import {
  createTeacherAssignmentComposerService,
} from '../../../src/services/teacherAssignmentComposerService.js'
import {
  STUDENT_WORK_REQUEST_STATE,
  STUDENT_WORK_REQUEST_TARGET,
} from '../../../src/services/studentWorkRequest.js'
import {
  assertStrictInputObject,
  normalizeRequiredId,
} from '../../../src/services/teacherDeliveryContractValidation.js'

const COMPOSER_DRAFT_FIELDS = Object.freeze([
  'teacherNote',
  'scoreUpload',
  'guitarTabUpload',
  'chordSnapshots',
])

function assertMethod(value, method, label) {
  if (typeof value?.[method] !== 'function') {
    throw new TypeError(`${label} must provide ${method}().`)
  }
}

function normalizeTarget(value) {
  if (!Object.values(STUDENT_WORK_REQUEST_TARGET).includes(value)) {
    throw new TypeError('targetState must be ACTIVE or REPERTOIRE.')
  }
  return value
}

function normalizeComposerDraft(value) {
  assertStrictInputObject(
    value,
    COMPOSER_DRAFT_FIELDS,
    'composer draft',
  )
  return value
}

function rebindDraft(value, serverDraftId) {
  if (value === null || value === undefined) return null
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('composer draft upload must be an object.')
  }
  return Object.freeze({
    ...value,
    draftId: serverDraftId,
  })
}

function hasContentEvidence(piece) {
  const scoreAssignmentId =
    piece?.contentRefs?.scoreAssignmentId ?? null
  const chordAssignmentIds =
    piece?.contentRefs?.chordAssignmentIds
  return (
    typeof scoreAssignmentId === 'string' &&
    scoreAssignmentId.trim() !== ''
  ) || (
    Array.isArray(chordAssignmentIds) &&
    chordAssignmentIds.length > 0
  )
}

function deterministicPieceAssignmentId(requestId, studentId) {
  return [
    'ses141',
    `ses189:${requestId}`,
    'piece-assignment',
    studentId,
  ].join(':')
}

export function createRequestBoundAssignmentComposerService({
  authorization,
  rosterService,
  preparedService,
  teacherDeliveryService,
  pieceService,
  workRequestService,
  createComposerService = createTeacherAssignmentComposerService,
  now,
} = {}) {
  assertMethod(authorization, 'resolvePrincipal', 'authorization')
  assertMethod(rosterService, 'listRoster', 'rosterService')
  assertMethod(preparedService, 'prepareBatch', 'preparedService')
  assertMethod(
    teacherDeliveryService,
    'deliverBatch',
    'teacherDeliveryService',
  )
  for (const method of [
    'createPiece',
    'getPieceForTeacher',
    'applyPieceAction',
  ]) {
    assertMethod(pieceService, method, 'pieceService')
  }
  for (const method of [
    'getForTeacher',
    'acknowledgeConversion',
  ]) {
    assertMethod(workRequestService, method, 'workRequestService')
  }
  if (typeof createComposerService !== 'function') {
    throw new TypeError('createComposerService must be a function.')
  }
  if (typeof now !== 'function') {
    throw new TypeError('now must be a function.')
  }

  async function exactPieceContext({
    providerSubject,
    pieceAssignmentId,
    studentId,
    targetState,
  }) {
    const context = await pieceService.getPieceForTeacher({
      providerSubject,
      pieceAssignmentId,
    })
    if (
      context?.piece?.pieceAssignmentId !== pieceAssignmentId ||
      context?.piece?.studentId !== studentId ||
      context?.lifecycle?.state !== targetState ||
      context?.lifecycle?.revokedAt !== null ||
      !hasContentEvidence(context?.piece)
    ) {
      throw new Error('request-bound-piece-evidence-mismatch')
    }
    return context
  }

  async function idempotentConvertedRetry({
    providerSubject,
    request,
    targetState,
  }) {
    if (
      request.targetState !== targetState ||
      typeof request.pieceAssignmentId !== 'string' ||
      request.pieceAssignmentId.trim() === ''
    ) {
      throw new Error('work-request-idempotency-conflict')
    }

    await exactPieceContext({
      providerSubject,
      pieceAssignmentId: request.pieceAssignmentId,
      studentId: request.studentId,
      targetState,
    })

    return workRequestService.acknowledgeConversion({
      providerSubject,
      requestId: request.requestId,
      pieceAssignmentId: request.pieceAssignmentId,
      targetState,
    })
  }

  async function convert({
    providerSubject,
    requestId,
    targetState,
    composerDraft,
  } = {}) {
    const normalizedRequestId = normalizeRequiredId(
      requestId,
      'requestId',
    )
    const normalizedTarget = normalizeTarget(targetState)
    const draft = normalizeComposerDraft(composerDraft)

    const principal = await authorization.resolvePrincipal(
      providerSubject,
      'TEACHER',
    )
    const teacherId = normalizeRequiredId(
      principal?.teacherId,
      'teacherId',
    )

    const request = await workRequestService.getForTeacher({
      providerSubject,
      requestId: normalizedRequestId,
    })
    if (
      request?.requestId !== normalizedRequestId ||
      typeof request?.studentId !== 'string'
    ) {
      throw new Error('work-request-authority-invalid')
    }

    if (request.state === STUDENT_WORK_REQUEST_STATE.CONVERTED) {
      return idempotentConvertedRetry({
        providerSubject,
        request,
        targetState: normalizedTarget,
      })
    }
    if (request.state !== STUDENT_WORK_REQUEST_STATE.PENDING) {
      throw new Error('work-request-state-conflict')
    }

    const roster = await rosterService.listRoster({ providerSubject })
    if (!Array.isArray(roster)) {
      throw new Error('request-bound-roster-invalid')
    }
    const authorizedStudent = roster.find(
      (entry) =>
        entry?.studentId === request.studentId &&
        entry?.active === true,
    )
    if (!authorizedStudent) {
      throw new Error('request-bound-roster-authority-mismatch')
    }

    const serverDraftId = `ses189:${normalizedRequestId}`
    const scoreUpload = rebindDraft(
      draft.scoreUpload ?? null,
      serverDraftId,
    )
    const guitarTabUpload = rebindDraft(
      draft.guitarTabUpload ?? null,
      serverDraftId,
    )
    const chordSnapshots = draft.chordSnapshots ?? []

    const secureDeliveryClient = Object.freeze({
      async listTeacherRoster() {
        return rosterService.listRoster({ providerSubject })
      },
      async prepareAssignments(items) {
        return preparedService.prepareBatch({
          providerSubject,
          items,
        })
      },
      async deliverAssignments(assignmentIds) {
        return teacherDeliveryService.deliverBatch({
          providerSubject,
          assignmentIds,
        })
      },
      async createTeacherPiece(input) {
        return pieceService.createPiece({
          providerSubject,
          input,
        })
      },
    })

    const composer = createComposerService({
      teacherId,
      secureDeliveryClient,
      now,
    })
    if (typeof composer?.send !== 'function') {
      throw new TypeError('composer service must provide send().')
    }

    const delivery = await composer.send({
      draftId: serverDraftId,
      studentIds: Object.freeze([request.studentId]),
      title: request.title,
      teacherNote: draft.teacherNote ?? '',
      scoreUpload,
      guitarTabUpload,
      chordSnapshots,
    })
    const recipients = delivery?.recipients
    if (
      delivery?.ok !== true ||
      !Array.isArray(recipients) ||
      recipients.length !== 1 ||
      recipients[0]?.studentId !== request.studentId ||
      recipients[0]?.ok !== true ||
      recipients[0]?.pieceLinked !== true
    ) {
      throw new Error('request-bound-composer-delivery-failed')
    }

    const pieceAssignmentId = deterministicPieceAssignmentId(
      normalizedRequestId,
      request.studentId,
    )

    await exactPieceContext({
      providerSubject,
      pieceAssignmentId,
      studentId: request.studentId,
      targetState: STUDENT_WORK_REQUEST_TARGET.ACTIVE,
    })

    if (normalizedTarget === STUDENT_WORK_REQUEST_TARGET.REPERTOIRE) {
      await pieceService.applyPieceAction({
        providerSubject,
        pieceAssignmentId,
        action: 'PLACE_IN_REPERTOIRE',
      })
      await exactPieceContext({
        providerSubject,
        pieceAssignmentId,
        studentId: request.studentId,
        targetState: STUDENT_WORK_REQUEST_TARGET.REPERTOIRE,
      })
    }

    return workRequestService.acknowledgeConversion({
      providerSubject,
      requestId: normalizedRequestId,
      pieceAssignmentId,
      targetState: normalizedTarget,
    })
  }

  return Object.freeze({ convert })
}
