import {
  PIECE_ASSIGNMENT_STATE,
  isPieceAssignment,
} from '../../../src/services/pieceAssignment.js'
import {
  createInitialPieceLifecycleRecord,
  isPieceAssignmentLifecycleRecord,
} from '../../../src/services/pieceAssignmentLifecycleRecord.js'
import {
  STUDENT_WORK_REQUEST_STATE,
} from '../../../src/services/studentWorkRequest.js'
import {
  normalizeRequiredId,
} from '../../../src/services/teacherDeliveryContractValidation.js'

const PENDING_ACTIONS = Object.freeze({
  PLACE_IN_ACTIVE: 'PLACE_IN_ACTIVE',
  PLACE_IN_REPERTOIRE: 'PLACE_IN_REPERTOIRE',
  REJECT: 'REJECT',
})

function requireMethod(value, method, label) {
  if (!value || typeof value[method] !== 'function') {
    throw new TypeError(`${label} must provide ${method}().`)
  }
}

function rosterMap(rows) {
  if (!Array.isArray(rows)) throw new Error('teacher-roster-read-invalid')
  return new Map(
    rows
      .filter((row) => row?.active === true)
      .map((row) => [row.studentId, row]),
  )
}

function requireRosterEntry(map, studentId) {
  const entry = map.get(studentId)
  if (!entry) throw new Error('roster-authority-mismatch')
  return entry
}

function pieceDto(piece, lifecycle, rosterEntry) {
  return Object.freeze({
    actionKey: piece.pieceAssignmentId,
    title: piece.title,
    displayNameOrNickname: rosterEntry.displayNameOrNickname,
    state: lifecycle.state,
    revoked: lifecycle.revokedAt !== null,
    assignedAt: piece.assignedAt,
    contentSummary: Object.freeze({
      score: piece.contentRefs.scoreAssignmentId !== null,
      chordCount: piece.contentRefs.chordAssignmentIds.length,
    }),
  })
}

function requestDto(request, rosterEntry) {
  return Object.freeze({
    actionKey: request.requestId,
    title: request.title,
    displayNameOrNickname: rosterEntry.displayNameOrNickname,
    state: request.state,
    revoked: request.state === STUDENT_WORK_REQUEST_STATE.REVOKED,
    requestedAt: request.requestedAt,
    contentSummary: null,
  })
}

function conversionDto(request, rosterEntry) {
  return Object.freeze({
    title: request.title,
    displayNameOrNickname: rosterEntry.displayNameOrNickname,
    state: request.state,
    revoked: request.state === STUDENT_WORK_REQUEST_STATE.REVOKED,
    targetState: request.targetState,
    updatedAt: request.updatedAt,
  })
}

function normalizePieceInput(piece) {
  if (!piece || typeof piece !== 'object' || Array.isArray(piece)) {
    throw new TypeError('piece must be an object for conversion actions.')
  }
  return {
    pieceAssignmentId: normalizeRequiredId(piece.pieceAssignmentId, 'pieceAssignmentId'),
    pieceId: normalizeRequiredId(piece.pieceId, 'pieceId'),
    arrangementId: normalizeRequiredId(piece.arrangementId, 'arrangementId'),
    teacherNote: typeof piece.teacherNote === 'string' ? piece.teacherNote : '',
    scoreAssignmentId:
      piece.scoreAssignmentId === null
        ? null
        : normalizeRequiredId(piece.scoreAssignmentId, 'scoreAssignmentId'),
    chordAssignmentIds: Array.isArray(piece.chordAssignmentIds)
      ? piece.chordAssignmentIds.map((id) =>
          normalizeRequiredId(id, 'chordAssignmentId'),
        )
      : [],
  }
}

export function createTeacherPieceManagementService({
  rosterService,
  store,
  pieceService,
  workRequestService,
} = {}) {
  requireMethod(rosterService, 'listRoster', 'rosterService')
  requireMethod(store, 'listPieceAssignmentsForStudent', 'store')
  for (const method of ['createPiece', 'applyPieceAction']) {
    requireMethod(pieceService, method, 'pieceService')
  }
  if (
    typeof pieceService.getPieceForTeacher !== 'function' &&
    typeof store.getPieceLifecycle !== 'function'
  ) {
    throw new TypeError(
      'pieceService.getPieceForTeacher() or store.getPieceLifecycle() is required.',
    )
  }
  for (const method of [
    'listPendingForTeacher',
    'getForTeacher',
    'revokePending',
    'acknowledgeConversion',
  ]) {
    requireMethod(workRequestService, method, 'workRequestService')
  }

  async function currentRoster(providerSubject) {
    return rosterMap(await rosterService.listRoster({ providerSubject }))
  }

  async function readPieceContext(piece, providerSubject) {
    if (!isPieceAssignment(piece)) throw new Error('piece-read-model-invalid')

    if (typeof pieceService.getPieceForTeacher === 'function') {
      const context = await pieceService.getPieceForTeacher({
        providerSubject,
        pieceAssignmentId: piece.pieceAssignmentId,
      })
      if (
        !context ||
        !isPieceAssignment(context.piece) ||
        !isPieceAssignmentLifecycleRecord(context.lifecycle) ||
        JSON.stringify(context.piece) !== JSON.stringify(piece)
      ) {
        throw new Error('piece-lifecycle-authority-mismatch')
      }
      return context
    }

    const stored = await store.getPieceLifecycle(piece.pieceAssignmentId)
    const lifecycle = stored ?? createInitialPieceLifecycleRecord(piece)
    if (
      !isPieceAssignmentLifecycleRecord(lifecycle) ||
      lifecycle.piece.pieceAssignmentId !== piece.pieceAssignmentId ||
      JSON.stringify(lifecycle.piece) !== JSON.stringify(piece)
    ) {
      throw new Error('piece-lifecycle-authority-mismatch')
    }
    return Object.freeze({ piece, lifecycle })
  }

  async function pieceRow(entry, piece, providerSubject) {
    if (piece?.studentId !== entry.studentId) {
      throw new Error('piece-student-authority-mismatch')
    }
    const context = await readPieceContext(piece, providerSubject)
    const lifecycle = context.lifecycle
    if (
      ![
        PIECE_ASSIGNMENT_STATE.ACTIVE,
        PIECE_ASSIGNMENT_STATE.COMPLETED,
        PIECE_ASSIGNMENT_STATE.REPERTOIRE,
      ].includes(lifecycle.state)
    ) {
      throw new Error('piece-read-model-state-invalid')
    }
    return lifecycle.revokedAt === null
      ? pieceDto(context.piece, lifecycle, entry)
      : null
  }

  async function listPieces({ providerSubject } = {}) {
    const roster = await currentRoster(providerSubject)
    const groups = await Promise.all(
      [...roster.values()].map(async (entry) => {
        const pieces = await store.listPieceAssignmentsForStudent(entry.studentId)
        if (!Array.isArray(pieces)) throw new Error('piece-read-model-invalid')
        return Promise.all(
          pieces.map((piece) =>
            pieceRow(entry, piece, providerSubject),
          ),
        )
      }),
    )
    const rows = groups.flat().filter((row) => row !== null)
    rows.sort((left, right) =>
      left.assignedAt === right.assignedAt
        ? left.actionKey.localeCompare(right.actionKey)
        : right.assignedAt.localeCompare(left.assignedAt),
    )
    return Object.freeze(rows)
  }

  async function pendingContext(providerSubject) {
    const [roster, requests] = await Promise.all([
      currentRoster(providerSubject),
      workRequestService.listPendingForTeacher({ providerSubject }),
    ])
    if (!Array.isArray(requests)) throw new Error('work-request-read-model-invalid')
    return { roster, requests }
  }

  async function listPendingRequests({ providerSubject } = {}) {
    const { roster, requests } = await pendingContext(providerSubject)
    return Object.freeze(
      requests.map((request) =>
        requestDto(request, requireRosterEntry(roster, request.studentId)),
      ),
    )
  }

  async function applyPendingRequestAction({
    providerSubject,
    actionKey,
    action,
    piece,
  } = {}) {
    if (!Object.values(PENDING_ACTIONS).includes(action)) {
      throw new TypeError(
        'action must be PLACE_IN_ACTIVE, PLACE_IN_REPERTOIRE or REJECT.',
      )
    }
    const requestId = normalizeRequiredId(actionKey, 'actionKey')
    const [roster, request] = await Promise.all([
      currentRoster(providerSubject),
      workRequestService.getForTeacher({ providerSubject, requestId }),
    ])
    const rosterEntry = requireRosterEntry(roster, request.studentId)

    if (action === PENDING_ACTIONS.REJECT) {
      if (request.state === STUDENT_WORK_REQUEST_STATE.REVOKED) {
        return conversionDto(request, rosterEntry)
      }
      if (request.state !== STUDENT_WORK_REQUEST_STATE.PENDING) {
        throw new Error('work-request-state-conflict')
      }
      const revoked = await workRequestService.revokePending({
        providerSubject,
        requestId,
      })
      return conversionDto(revoked, rosterEntry)
    }

    const normalizedPiece = normalizePieceInput(piece)
    const targetState = action === PENDING_ACTIONS.PLACE_IN_REPERTOIRE
      ? PIECE_ASSIGNMENT_STATE.REPERTOIRE
      : PIECE_ASSIGNMENT_STATE.ACTIVE

    if (request.state === STUDENT_WORK_REQUEST_STATE.CONVERTED) {
      if (
        request.pieceAssignmentId !== normalizedPiece.pieceAssignmentId ||
        request.targetState !== targetState
      ) {
        throw new Error('work-request-idempotency-conflict')
      }
      const converted = await workRequestService.acknowledgeConversion({
        providerSubject,
        requestId,
        pieceAssignmentId: normalizedPiece.pieceAssignmentId,
        targetState,
      })
      return conversionDto(converted, rosterEntry)
    }

    if (request.state !== STUDENT_WORK_REQUEST_STATE.PENDING) {
      throw new Error('work-request-state-conflict')
    }

    const created = await pieceService.createPiece({
      providerSubject,
      input: {
        ...normalizedPiece,
        studentId: request.studentId,
        title: request.title,
      },
    })

    if (action === PENDING_ACTIONS.PLACE_IN_REPERTOIRE) {
      const lifecycle = await pieceService.applyPieceAction({
        providerSubject,
        pieceAssignmentId: created.pieceAssignmentId,
        action: 'PLACE_IN_REPERTOIRE',
      })
      if (
        lifecycle.state !== PIECE_ASSIGNMENT_STATE.REPERTOIRE ||
        lifecycle.revokedAt !== null
      ) {
        throw new Error('piece-conversion-state-mismatch')
      }
    }

    const converted = await workRequestService.acknowledgeConversion({
      providerSubject,
      requestId,
      pieceAssignmentId: created.pieceAssignmentId,
      targetState,
    })
    return conversionDto(converted, rosterEntry)
  }

  return Object.freeze({
    listPieces,
    listPendingRequests,
    applyPendingRequestAction,
  })
}
