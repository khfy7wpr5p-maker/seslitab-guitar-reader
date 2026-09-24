import {
  PIECE_ASSIGNMENT_STATE,
  isAllowedPieceAssignmentTransition,
  isPieceAssignment,
} from './pieceAssignment.js'
import {
  isStrictFrozenRecord,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

export const PIECE_ASSIGNMENT_LIFECYCLE_SCHEMA_VERSION = 1

const RECORD_FIELDS = Object.freeze([
  'schemaVersion',
  'piece',
  'state',
  'stateChangedAt',
  'revokedAt',
])

function assertInitialPiece(piece) {
  if (!isPieceAssignment(piece)) {
    throw new TypeError(
      'piece must be a valid immutable initial PieceAssignment.',
    )
  }
  return piece
}

function isSupportedState(state) {
  return Object.values(
    PIECE_ASSIGNMENT_STATE,
  ).includes(state)
}

export function createInitialPieceLifecycleRecord(
  piece,
) {
  const trusted =
    assertInitialPiece(piece)

  return Object.freeze({
    schemaVersion:
      PIECE_ASSIGNMENT_LIFECYCLE_SCHEMA_VERSION,
    piece: trusted,
    state:
      PIECE_ASSIGNMENT_STATE.ACTIVE,
    stateChangedAt: trusted.assignedAt,
    revokedAt: null,
  })
}

export function isPieceAssignmentLifecycleRecord(
  value,
) {
  try {
    if (
      value?.schemaVersion !==
        PIECE_ASSIGNMENT_LIFECYCLE_SCHEMA_VERSION ||
      !isStrictFrozenRecord(
        value,
        RECORD_FIELDS,
      ) ||
      !isPieceAssignment(value.piece) ||
      !isSupportedState(value.state)
    ) {
      return false
    }

    if (
      normalizeRequiredTimestamp(
        value.stateChangedAt,
        'stateChangedAt',
      ) !== value.stateChangedAt
    ) {
      return false
    }

    if (
      value.state ===
        PIECE_ASSIGNMENT_STATE.ACTIVE &&
      value.stateChangedAt !==
        value.piece.assignedAt
    ) {
      return false
    }

    if (
      value.revokedAt !== null &&
      normalizeRequiredTimestamp(
        value.revokedAt,
        'revokedAt',
      ) !== value.revokedAt
    ) {
      return false
    }

    return true
  } catch {
    return false
  }
}

export function transitionPieceLifecycleRecord(
  record,
  toState,
  transitionedAt,
) {
  if (
    !isPieceAssignmentLifecycleRecord(
      record,
    )
  ) {
    throw new TypeError(
      'record must be a valid immutable PieceAssignment lifecycle record.',
    )
  }

  if (record.revokedAt !== null) {
    throw new Error(
      'piece-lifecycle-revoked',
    )
  }

  if (!isSupportedState(toState)) {
    throw new TypeError(
      'toState must be a supported Piece state.',
    )
  }

  if (record.state === toState) {
    return record
  }

  if (
    !isAllowedPieceAssignmentTransition(
      record.state,
      toState,
    )
  ) {
    throw new Error(
      `piece-lifecycle-transition-not-allowed:${record.state}:${toState}`,
    )
  }

  return Object.freeze({
    schemaVersion:
      PIECE_ASSIGNMENT_LIFECYCLE_SCHEMA_VERSION,
    piece: record.piece,
    state: toState,
    stateChangedAt:
      normalizeRequiredTimestamp(
        transitionedAt,
        'transitionedAt',
      ),
    revokedAt: null,
  })
}

export function revokePieceLifecycleRecord(
  record,
  revokedAt,
) {
  if (
    !isPieceAssignmentLifecycleRecord(
      record,
    )
  ) {
    throw new TypeError(
      'record must be a valid immutable PieceAssignment lifecycle record.',
    )
  }

  if (record.revokedAt !== null) {
    return record
  }

  return Object.freeze({
    schemaVersion:
      PIECE_ASSIGNMENT_LIFECYCLE_SCHEMA_VERSION,
    piece: record.piece,
    state: record.state,
    stateChangedAt: record.stateChangedAt,
    revokedAt:
      normalizeRequiredTimestamp(
        revokedAt,
        'revokedAt',
      ),
  })
}
