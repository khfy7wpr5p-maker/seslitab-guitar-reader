import {
  PIECE_ASSIGNMENT_STATE,
} from '../../../src/services/pieceAssignment.js'
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
  if (!Array.isArray(rows)) {
    throw new Error('teacher-roster-read-invalid')
  }
  return new Map(
    rows
      .filter((row) => row?.active === true)
      .map((row) => [row.studentId, row]),
  )
}

function pieceDto(piece, lifecycle, rosterEntry) {
  return Object.freeze({
    actionKey: piece.pieceAssignmentId,
    title: piece.title,
    displayNameOrNickname:
      rosterEntry.displayNameOrNickname,
    state: lifecycle.state,
    revoked: lifecycle.revokedAt !== null,
    assignedAt: piece.assignedAt,
    contentSummary: Object.freeze({
      score:
        piece.contentRefs.scoreAssignmentId !==
        null,
      chordCount:
        piece.contentRefs.chordAssignmentIds
          .length,
    }),
  })
}

function requestDto(request, rosterEntry) {
  return Object.freeze({
    actionKey: request.requestId,
    title: request.title,
    displayNameOrNickname:
      rosterEntry.displayNameOrNickname,
    state: request.state,
    revoked: request.state === 'REVOKED',
    requestedAt: request.requestedAt,
    contentSummary: null,
  })
}

function conversionDto(request, rosterEntry) {
  return Object.freeze({
    title: request.title,
    displayNameOrNickname:
      rosterEntry.displayNameOrNickname,
    state: request.state,
    revoked: request.state === 'REVOKED',
    targetState: request.targetState,
    updatedAt: request.updatedAt,
  })
}

function requireRosterEntry(map, studentId) {
  const entry = map.get(studentId)
  if (!entry) {
    throw new Error('roster-authority-mismatch')
  }
  return entry
}

function normalizePieceInput(piece) {
  if (!piece || typeof piece !== 'object' || Array.isArray(piece)) {
    throw new TypeError('piece must be an object for conversion actions.')
  }
  return {
    pieceAssignmentId: normalizeRequiredId(
      piece.pieceAssignmentId,
      'pieceAssignmentId',
    ),
    pieceId: normalizeRequiredId(piece.pieceId, 'pieceId'),
    arrangementId: normalizeRequiredId(
      piece.arrangementId,
      'arrangementId',
    ),
    teacherNote:
      typeof piece.teacherNote === 'string'
        ? piece.teacherNote
        : '',
    scoreAssignmentId:
      piece.scoreAssignmentId === null
        ? null
        : normalizeRequiredId(
            piece.scoreAssignmentId,
            'scoreAssignmentId',
          ),
    chordAssignmentIds: Array.isArray(
      piece.chordAssignmentIds,
    )
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
  requireMethod(
    store,
    'listPieceAssignmentsForStudent',
    'store',
  )
  for (const method of [
    'getPieceForTeacher',
    'createPiece',
    'applyPieceAction',
  ]) {
    requireMethod(pieceService, method, 'pieceService')
  }
  for (const method of [
    'listPendingForTeacher',
    'revokePending',
    'acknowledgeConversion',
  ]) {
    requireMethod(
      workRequestService,
      method,
      'workRequestService',
    )
  }

  async function currentRoster(providerSubject) {
    return rosterMap(
      await rosterService.listRoster({
        providerSubject,
      }),
    )
  }

  async function listPieces({ providerSubject } = {}) {
    const roster = await currentRoster(providerSubject)
    const rows = []

    for (const entry of roster.values()) {
      const pieces =
        await store.listPieceAssignmentsForStudent(
          entry.studentId,
        )
      if (!Array.isArray(pieces)) {
        throw new Error('piece-read-model-invalid')
      }

      for (const piece of pieces) {
        const context =
          await pieceService.getPieceForTeacher({
            providerSubject,
            pieceAssignmentId:
              piece.pieceAssignmentId,
          })
        if (
          context.lifecycle.state !==
            PIECE_ASSIGNMENT_STATE.ACTIVE &&
          context.lifecycle.state !==
            PIECE_ASSIGNMENT_STATE.COMPLETED &&
          context.lifecycle.state !==
            PIECE_ASSIGNMENT_STATE.REPERTOIRE
        ) {
          throw new Error('piece-read-model-state-invalid')
        }
        if (context.lifecycle.revokedAt !== null) {
          continue
        }
        rows.push(
          pieceDto(
            context.piece,
            context.lifecycle,
            entry,
          ),
        )
      }
    }

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
      workRequestService.listPendingForTeacher({
        providerSubject,
      }),
    ])
    if (!Array.isArray(requests)) {
      throw new Error('work-request-read-model-invalid')
    }
    return { roster, requests }
  }

  async function listPendingRequests({
    providerSubject,
  } = {}) {
    const { roster, requests } =
      await pendingContext(providerSubject)
    return Object.freeze(
      requests.map((request) =>
        requestDto(
          request,
          requireRosterEntry(
            roster,
            request.studentId,
          ),
        ),
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

    const requestId = normalizeRequiredId(
      actionKey,
      'actionKey',
    )
    const { roster, requests } =
      await pendingContext(providerSubject)
    const request = requests.find(
      (candidate) =>
        candidate.requestId === requestId,
    )
    if (!request) {
      throw new Error('work-request-not-found')
    }
    const rosterEntry = requireRosterEntry(
      roster,
      request.studentId,
    )

    if (action === PENDING_ACTIONS.REJECT) {
      const revoked =
        await workRequestService.revokePending({
          providerSubject,
          requestId,
        })
      return conversionDto(revoked, rosterEntry)
    }

    const normalizedPiece = normalizePieceInput(piece)
    const created = await pieceService.createPiece({
      providerSubject,
      input: {
        ...normalizedPiece,
        studentId: request.studentId,
        title: request.title,
      },
    })

    let targetState = PIECE_ASSIGNMENT_STATE.ACTIVE
    if (
      action ===
      PENDING_ACTIONS.PLACE_IN_REPERTOIRE
    ) {
      const lifecycle =
        await pieceService.applyPieceAction({
          providerSubject,
          pieceAssignmentId:
            created.pieceAssignmentId,
          action: 'PLACE_IN_REPERTOIRE',
        })
      if (
        lifecycle.state !==
          PIECE_ASSIGNMENT_STATE.REPERTOIRE ||
        lifecycle.revokedAt !== null
      ) {
        throw new Error('piece-conversion-state-mismatch')
      }
      targetState = PIECE_ASSIGNMENT_STATE.REPERTOIRE
    }

    const converted =
      await workRequestService.acknowledgeConversion({
        providerSubject,
        requestId,
        pieceAssignmentId:
          created.pieceAssignmentId,
        targetState,
      })

    return conversionDto(
      converted,
      rosterEntry,
    )
  }

  return Object.freeze({
    listPieces,
    listPendingRequests,
    applyPendingRequestAction,
  })
}
