import {
  isAssignmentLifecycleRecord,
} from '../../../src/services/assignmentLifecycleRecord.js'
import {
  isDeliveryRecord,
} from '../../../src/services/deliveryRecord.js'
import {
  PIECE_ASSIGNMENT_STATE,
  createPieceAssignment,
  isPieceAssignment,
} from '../../../src/services/pieceAssignment.js'
import {
  createInitialPieceLifecycleRecord,
  isPieceAssignmentLifecycleRecord,
  revokePieceLifecycleRecord,
  transitionPieceLifecycleRecord,
} from '../../../src/services/pieceAssignmentLifecycleRecord.js'
import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
} from '../../../src/services/privateAssignment.js'
import {
  isPreparedAssignmentRecord,
} from '../../../src/services/preparedAssignmentRecord.js'
import {
  assertStrictInputObject,
  normalizeRequiredId,
  normalizeRequiredTimestamp,
} from '../../../src/services/teacherDeliveryContractValidation.js'
import {
  assertSecureDeliveryStore,
} from '../repositories/secureDeliveryStore.js'

const CREATE_FIELDS = Object.freeze([
  'pieceAssignmentId',
  'pieceId',
  'arrangementId',
  'studentId',
  'title',
  'teacherNote',
  'scoreAssignmentId',
  'chordAssignmentIds',
])

const ACTIONS = Object.freeze({
  COMPLETE: 'COMPLETE',
  MOVE_TO_REPERTOIRE:
    'MOVE_TO_REPERTOIRE',
  REVOKE: 'REVOKE',
})

function same(left, right) {
  return (
    JSON.stringify(left) ===
    JSON.stringify(right)
  )
}

function childAuthorityError() {
  return new Error(
    'piece-child-authority-mismatch',
  )
}

export function createTeacherPieceService({
  authorization,
  store,
  now,
} = {}) {
  if (
    !authorization ||
    typeof authorization !== 'object' ||
    typeof authorization.resolvePrincipal !==
      'function' ||
    typeof authorization.requireTeacherStudent !==
      'function'
  ) {
    throw new TypeError(
      'authorization must provide principal and grant checks.',
    )
  }

  const trustedStore =
    assertSecureDeliveryStore(store)

  if (typeof now !== 'function') {
    throw new TypeError(
      'now must be a function.',
    )
  }

  async function teacherPrincipal(
    providerSubject,
  ) {
    const principal =
      await authorization.resolvePrincipal(
        providerSubject,
        'TEACHER',
      )

    if (
      typeof principal?.teacherId !==
        'string' ||
      principal.teacherId.length === 0
    ) {
      throw new Error(
        'secure-delivery-teacher-identity-missing',
      )
    }

    return principal
  }

  async function requireChild({
    assignmentId,
    expectedPracticeType,
    teacherId,
    studentId,
    allowRevoked = false,
  }) {
    const id = normalizeRequiredId(
      assignmentId,
      'assignmentId',
    )

    const [
      delivery,
      prepared,
      lifecycle,
    ] = await Promise.all([
      trustedStore.getDelivery(id),
      trustedStore.getPreparedAssignment(
        id,
      ),
      trustedStore.getLifecycle(id),
    ])

    if (
      !isDeliveryRecord(delivery) ||
      delivery.assignmentId !== id ||
      delivery.deliveryId !== id ||
      delivery.teacherId !== teacherId ||
      delivery.studentId !== studentId ||
      (
        !allowRevoked &&
        delivery.revokedAt !== null
      )
    ) {
      throw childAuthorityError()
    }

    if (
      !isPreparedAssignmentRecord(
        prepared,
      ) ||
      prepared.teacherId !== teacherId ||
      prepared.packageId !==
        delivery.packageId ||
      prepared.assignment.assignmentId !==
        id ||
      prepared.assignment.studentId !==
        studentId ||
      prepared.assignment.practiceType !==
        expectedPracticeType
    ) {
      throw childAuthorityError()
    }

    if (lifecycle !== null) {
      if (
        !isAssignmentLifecycleRecord(
          lifecycle,
        ) ||
        lifecycle.assignment.assignmentId !==
          id ||
        lifecycle.assignment.studentId !==
          studentId ||
        (
          !allowRevoked &&
          lifecycle.revokedAt !== null
        )
      ) {
        throw childAuthorityError()
      }
    }

    return prepared.assignment
  }

  async function verifyPieceChildren(
    piece,
    teacherId,
    { allowRevoked = false } = {},
  ) {
    await authorization
      .requireTeacherStudent(
        teacherId,
        piece.studentId,
      )

    const scoreId =
      piece.contentRefs
        .scoreAssignmentId

    if (scoreId !== null) {
      await requireChild({
        assignmentId: scoreId,
        expectedPracticeType:
          PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE,
        teacherId,
        studentId: piece.studentId,
        allowRevoked,
      })
    }

    for (
      const assignmentId
      of piece.contentRefs
        .chordAssignmentIds
    ) {
      await requireChild({
        assignmentId,
        expectedPracticeType:
          PRIVATE_ASSIGNMENT_PRACTICE_TYPE.CHORD_BOARD,
        teacherId,
        studentId: piece.studentId,
        allowRevoked,
      })
    }
  }

  async function createPiece({
    providerSubject,
    input,
  } = {}) {
    assertStrictInputObject(
      input,
      CREATE_FIELDS,
      'TeacherPieceCreate',
    )

    const { teacherId } =
      await teacherPrincipal(
        providerSubject,
      )

    const piece = createPieceAssignment({
      pieceAssignmentId:
        input.pieceAssignmentId,
      pieceId: input.pieceId,
      arrangementId:
        input.arrangementId,
      studentId: input.studentId,
      title: input.title,
      teacherNote: input.teacherNote,
      assignedAt:
        normalizeRequiredTimestamp(
          now(),
          'assignedAt',
        ),
      contentRefs: {
        scoreAssignmentId:
          input.scoreAssignmentId,
        chordAssignmentIds:
          input.chordAssignmentIds,
      },
    })

    await verifyPieceChildren(
      piece,
      teacherId,
    )

    const acknowledgement =
      await trustedStore
        .putPieceAssignment(piece)

    if (
      !isPieceAssignment(
        acknowledgement,
      ) ||
      !same(
        acknowledgement,
        piece,
      )
    ) {
      throw new Error(
        'piece-persistence-acknowledgement-mismatch',
      )
    }

    const stored =
      await trustedStore
        .getPieceAssignment(
          piece.pieceAssignmentId,
        )

    if (
      !isPieceAssignment(stored) ||
      !same(stored, piece)
    ) {
      throw new Error(
        'piece-persistence-acknowledgement-mismatch',
      )
    }

    return stored
  }

  async function loadPieceContext({
    providerSubject,
    pieceAssignmentId,
  }) {
    const { teacherId } =
      await teacherPrincipal(
        providerSubject,
      )
    const id = normalizeRequiredId(
      pieceAssignmentId,
      'pieceAssignmentId',
    )

    const piece =
      await trustedStore
        .getPieceAssignment(id)

    if (
      !isPieceAssignment(piece) ||
      piece.pieceAssignmentId !== id
    ) {
      throw new Error(
        'piece-assignment-not-found',
      )
    }

    await verifyPieceChildren(
      piece,
      teacherId,
      { allowRevoked: true },
    )

    const storedLifecycle =
      await trustedStore
        .getPieceLifecycle(id)
    const lifecycle =
      storedLifecycle === null
        ? createInitialPieceLifecycleRecord(
            piece,
          )
        : storedLifecycle

    if (
      !isPieceAssignmentLifecycleRecord(
        lifecycle,
      ) ||
      lifecycle.piece
        .pieceAssignmentId !== id ||
      !same(
        lifecycle.piece,
        piece,
      )
    ) {
      throw new Error(
        'piece-lifecycle-authority-mismatch',
      )
    }

    return Object.freeze({
      piece,
      lifecycle,
    })
  }

  async function applyPieceAction({
    providerSubject,
    pieceAssignmentId,
    action,
  } = {}) {
    if (
      !Object.values(ACTIONS)
        .includes(action)
    ) {
      throw new TypeError(
        'action must be COMPLETE, MOVE_TO_REPERTOIRE or REVOKE.',
      )
    }

    const {
      piece,
      lifecycle: current,
    } = await loadPieceContext({
      providerSubject,
      pieceAssignmentId,
    })

    if (current.revokedAt !== null) {
      if (action === ACTIONS.REVOKE) {
        return current
      }
      throw new Error(
        'piece-lifecycle-revoked',
      )
    }

    let next

    if (action === ACTIONS.REVOKE) {
      next = revokePieceLifecycleRecord(
        current,
        normalizeRequiredTimestamp(
          now(),
          'revokedAt',
        ),
      )
    } else {
      const target =
        action === ACTIONS.COMPLETE
          ? PIECE_ASSIGNMENT_STATE
              .COMPLETED
          : PIECE_ASSIGNMENT_STATE
              .REPERTOIRE

      if (current.state === target) {
        return current
      }

      next =
        transitionPieceLifecycleRecord(
          current,
          target,
          normalizeRequiredTimestamp(
            now(),
            'transitionedAt',
          ),
        )
    }

    const acknowledgement =
      await trustedStore
        .commitPieceLifecycleMutation({
          currentLifecycle: current,
          nextLifecycle: next,
        })

    if (
      !isPieceAssignmentLifecycleRecord(
        acknowledgement,
      ) ||
      !same(acknowledgement, next)
    ) {
      throw new Error(
        'piece-lifecycle-acknowledgement-mismatch',
      )
    }

    const stored =
      await trustedStore
        .getPieceLifecycle(
          piece.pieceAssignmentId,
        )

    if (
      !isPieceAssignmentLifecycleRecord(
        stored,
      ) ||
      !same(stored, next)
    ) {
      throw new Error(
        'piece-lifecycle-acknowledgement-mismatch',
      )
    }

    return stored
  }

  return Object.freeze({
    createPiece,
    applyPieceAction,
  })
}
