import {
  DELIVERY_MAX_DISPLAY_NAME_LENGTH,
  assertStrictInputObject,
  isStrictFrozenRecord,
  normalizeOptionalText,
  normalizeRequiredId,
  normalizeRequiredText,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

export const PIECE_ASSIGNMENT_SCHEMA_VERSION = '1.0.0'
export const PIECE_ASSIGNMENT_MAX_TEACHER_NOTE_LENGTH = 2000

export const PIECE_ASSIGNMENT_STATE = Object.freeze({
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  REPERTOIRE: 'REPERTOIRE',
})

const INPUT_FIELDS = Object.freeze([
  'pieceAssignmentId',
  'pieceId',
  'arrangementId',
  'studentId',
  'title',
  'teacherNote',
  'assignedAt',
  'contentRefs',
])

const RECORD_FIELDS = Object.freeze([
  'schemaVersion',
  'pieceAssignmentId',
  'pieceId',
  'arrangementId',
  'studentId',
  'title',
  'teacherNote',
  'state',
  'assignedAt',
  'revokedAt',
  'contentRefs',
])

const CONTENT_REF_FIELDS = Object.freeze([
  'scoreAssignmentId',
  'chordAssignmentIds',
])

const ALLOWED_TRANSITIONS = Object.freeze({
  [PIECE_ASSIGNMENT_STATE.ACTIVE]: Object.freeze([
    PIECE_ASSIGNMENT_STATE.COMPLETED,
  ]),
  [PIECE_ASSIGNMENT_STATE.COMPLETED]: Object.freeze([
    PIECE_ASSIGNMENT_STATE.REPERTOIRE,
  ]),
  [PIECE_ASSIGNMENT_STATE.REPERTOIRE]: Object.freeze([]),
})

function normalizeContentRefs(value) {
  assertStrictInputObject(
    value,
    CONTENT_REF_FIELDS,
    'PieceAssignment contentRefs',
  )

  const scoreAssignmentId =
    value.scoreAssignmentId === null
      ? null
      : normalizeRequiredId(
          value.scoreAssignmentId,
          'contentRefs.scoreAssignmentId',
        )

  if (!Array.isArray(value.chordAssignmentIds)) {
    throw new TypeError(
      'contentRefs.chordAssignmentIds must be an array.',
    )
  }

  const chordAssignmentIds = value.chordAssignmentIds.map(
    (assignmentId) =>
      normalizeRequiredId(
        assignmentId,
        'contentRefs.chordAssignmentIds[]',
      ),
  )

  if (
    new Set(chordAssignmentIds).size !==
    chordAssignmentIds.length
  ) {
    throw new Error(
      'duplicate Piece chord assignment authority.',
    )
  }

  if (
    scoreAssignmentId !== null &&
    chordAssignmentIds.includes(
      scoreAssignmentId,
    )
  ) {
    throw new Error(
      'duplicate Piece child assignment authority.',
    )
  }

  if (
    scoreAssignmentId === null &&
    chordAssignmentIds.length === 0
  ) {
    throw new Error(
      'Piece must reference at least one supported child.',
    )
  }

  return Object.freeze({
    scoreAssignmentId,
    chordAssignmentIds:
      Object.freeze(chordAssignmentIds),
  })
}

function isContentRefs(value) {
  try {
    if (
      !isStrictFrozenRecord(
        value,
        CONTENT_REF_FIELDS,
      ) ||
      !Array.isArray(
        value.chordAssignmentIds,
      ) ||
      !Object.isFrozen(
        value.chordAssignmentIds,
      )
    ) {
      return false
    }

    const scoreAssignmentId =
      value.scoreAssignmentId === null
        ? null
        : normalizeRequiredId(
            value.scoreAssignmentId,
            'contentRefs.scoreAssignmentId',
          )

    if (
      scoreAssignmentId !==
      value.scoreAssignmentId
    ) {
      return false
    }

    const chordAssignmentIds =
      value.chordAssignmentIds.map(
        (assignmentId) =>
          normalizeRequiredId(
            assignmentId,
            'contentRefs.chordAssignmentIds[]',
          ),
      )

    if (
      chordAssignmentIds.some(
        (assignmentId, index) =>
          assignmentId !==
          value.chordAssignmentIds[index],
      ) ||
      new Set(chordAssignmentIds).size !==
        chordAssignmentIds.length ||
      (
        scoreAssignmentId !== null &&
        chordAssignmentIds.includes(
          scoreAssignmentId,
        )
      ) ||
      (
        scoreAssignmentId === null &&
        chordAssignmentIds.length === 0
      )
    ) {
      return false
    }

    return true
  } catch {
    return false
  }
}

export function isAllowedPieceAssignmentTransition(
  fromState,
  toState,
) {
  return Boolean(
    ALLOWED_TRANSITIONS[fromState]?.includes(
      toState,
    ),
  )
}

export function createPieceAssignment(
  input = {},
) {
  assertStrictInputObject(
    input,
    INPUT_FIELDS,
    'PieceAssignment',
  )

  return Object.freeze({
    schemaVersion:
      PIECE_ASSIGNMENT_SCHEMA_VERSION,
    pieceAssignmentId:
      normalizeRequiredId(
        input.pieceAssignmentId,
        'pieceAssignmentId',
      ),
    pieceId: normalizeRequiredId(
      input.pieceId,
      'pieceId',
    ),
    arrangementId:
      normalizeRequiredId(
        input.arrangementId,
        'arrangementId',
      ),
    studentId: normalizeRequiredId(
      input.studentId,
      'studentId',
    ),
    title: normalizeRequiredText(
      input.title,
      'title',
      DELIVERY_MAX_DISPLAY_NAME_LENGTH,
    ),
    teacherNote: normalizeOptionalText(
      input.teacherNote,
      'teacherNote',
      PIECE_ASSIGNMENT_MAX_TEACHER_NOTE_LENGTH,
    ),
    state: PIECE_ASSIGNMENT_STATE.ACTIVE,
    assignedAt:
      normalizeRequiredTimestamp(
        input.assignedAt,
        'assignedAt',
      ),
    revokedAt: null,
    contentRefs: normalizeContentRefs(
      input.contentRefs,
    ),
  })
}

export function isPieceAssignment(value) {
  try {
    if (
      value?.schemaVersion !==
        PIECE_ASSIGNMENT_SCHEMA_VERSION ||
      !isStrictFrozenRecord(
        value,
        RECORD_FIELDS,
      ) ||
      value.state !==
        PIECE_ASSIGNMENT_STATE.ACTIVE ||
      value.revokedAt !== null ||
      !isContentRefs(value.contentRefs)
    ) {
      return false
    }

    if (
      normalizeRequiredId(
        value.pieceAssignmentId,
        'pieceAssignmentId',
      ) !== value.pieceAssignmentId ||
      normalizeRequiredId(
        value.pieceId,
        'pieceId',
      ) !== value.pieceId ||
      normalizeRequiredId(
        value.arrangementId,
        'arrangementId',
      ) !== value.arrangementId ||
      normalizeRequiredId(
        value.studentId,
        'studentId',
      ) !== value.studentId ||
      normalizeRequiredText(
        value.title,
        'title',
        DELIVERY_MAX_DISPLAY_NAME_LENGTH,
      ) !== value.title ||
      normalizeOptionalText(
        value.teacherNote,
        'teacherNote',
        PIECE_ASSIGNMENT_MAX_TEACHER_NOTE_LENGTH,
      ) !== value.teacherNote ||
      normalizeRequiredTimestamp(
        value.assignedAt,
        'assignedAt',
      ) !== value.assignedAt
    ) {
      return false
    }

    return true
  } catch {
    return false
  }
}
