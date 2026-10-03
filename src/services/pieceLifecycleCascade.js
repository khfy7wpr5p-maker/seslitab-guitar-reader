import {
  createInitialAssignmentLifecycleRecord,
  isAssignmentLifecycleRecord,
  revokeAssignmentLifecycleRecord,
  transitionAssignmentLifecycleRecord,
} from './assignmentLifecycleRecord.js'
import {
  isDeliveryRecord,
  revokeDeliveryRecord,
} from './deliveryRecord.js'
import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  PRIVATE_ASSIGNMENT_STATE,
} from './privateAssignment.js'
import {
  isPreparedAssignmentRecord,
} from './preparedAssignmentRecord.js'
import {
  normalizeRequiredId,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

export const PIECE_LIFECYCLE_ACTION = Object.freeze({
  COMPLETE: 'COMPLETE',
  MOVE_TO_REPERTOIRE: 'MOVE_TO_REPERTOIRE',
  REVOKE: 'REVOKE',
})

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function authorityError() {
  return new Error('piece-child-authority-mismatch')
}

function validateExpectedPracticeType(value) {
  if (
    value !== PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE &&
    value !== PRIVATE_ASSIGNMENT_PRACTICE_TYPE.CHORD_BOARD
  ) {
    throw new TypeError(
      'expectedPracticeType must be SCORE or CHORD_BOARD.',
    )
  }
  return value
}

export function buildPieceChildCascadeMutation({
  prepared,
  delivery,
  lifecycle,
  assignmentId,
  expectedPracticeType,
  teacherId,
  studentId,
  action,
  changedAt,
} = {}) {
  const id = normalizeRequiredId(
    assignmentId,
    'assignmentId',
  )
  const teacher = normalizeRequiredId(
    teacherId,
    'teacherId',
  )
  const student = normalizeRequiredId(
    studentId,
    'studentId',
  )
  const timestamp = normalizeRequiredTimestamp(
    changedAt,
    'changedAt',
  )
  const practiceType =
    validateExpectedPracticeType(
      expectedPracticeType,
    )

  if (
    !Object.values(PIECE_LIFECYCLE_ACTION)
      .includes(action)
  ) {
    throw new TypeError(
      'action must be COMPLETE, MOVE_TO_REPERTOIRE or REVOKE.',
    )
  }

  if (
    !isPreparedAssignmentRecord(prepared) ||
    prepared.teacherId !== teacher ||
    prepared.assignment.assignmentId !== id ||
    prepared.assignment.studentId !== student ||
    prepared.assignment.practiceType !== practiceType
  ) {
    throw authorityError()
  }

  if (
    !isDeliveryRecord(delivery) ||
    delivery.assignmentId !== id ||
    delivery.deliveryId !== id ||
    delivery.teacherId !== teacher ||
    delivery.studentId !== student ||
    delivery.packageId !== prepared.packageId
  ) {
    throw authorityError()
  }

  const currentLifecycle =
    lifecycle === null
      ? createInitialAssignmentLifecycleRecord(
          prepared.assignment,
        )
      : lifecycle

  if (
    !isAssignmentLifecycleRecord(
      currentLifecycle,
    ) ||
    !same(
      currentLifecycle.assignment,
      prepared.assignment,
    )
  ) {
    throw authorityError()
  }

  const lifecycleRevoked =
    currentLifecycle.revokedAt !== null
  const deliveryRevoked =
    delivery.revokedAt !== null

  if (lifecycleRevoked !== deliveryRevoked) {
    throw authorityError()
  }

  if (lifecycleRevoked) {
    return Object.freeze({
      currentLifecycle,
      nextLifecycle: currentLifecycle,
      deliveryBefore: delivery,
      deliveryAfter: delivery,
      changed: false,
    })
  }

  let nextLifecycle = currentLifecycle
  let deliveryAfter = delivery

  if (action === PIECE_LIFECYCLE_ACTION.REVOKE) {
    nextLifecycle =
      revokeAssignmentLifecycleRecord(
        currentLifecycle,
        timestamp,
      )
    deliveryAfter = revokeDeliveryRecord(
      delivery,
      timestamp,
    )
  } else if (
    action === PIECE_LIFECYCLE_ACTION.COMPLETE
  ) {
    if (
      currentLifecycle.state ===
      PRIVATE_ASSIGNMENT_STATE.ACTIVE
    ) {
      nextLifecycle =
        transitionAssignmentLifecycleRecord(
          currentLifecycle,
          PRIVATE_ASSIGNMENT_STATE.COMPLETED,
          timestamp,
        )
    }
  } else if (
    currentLifecycle.state ===
    PRIVATE_ASSIGNMENT_STATE.ACTIVE
  ) {
    const completed =
      transitionAssignmentLifecycleRecord(
        currentLifecycle,
        PRIVATE_ASSIGNMENT_STATE.COMPLETED,
        timestamp,
      )
    nextLifecycle =
      transitionAssignmentLifecycleRecord(
        completed,
        PRIVATE_ASSIGNMENT_STATE.REPERTOIRE,
        timestamp,
      )
  } else if (
    currentLifecycle.state ===
    PRIVATE_ASSIGNMENT_STATE.COMPLETED
  ) {
    nextLifecycle =
      transitionAssignmentLifecycleRecord(
        currentLifecycle,
        PRIVATE_ASSIGNMENT_STATE.REPERTOIRE,
        timestamp,
      )
  }

  return Object.freeze({
    currentLifecycle,
    nextLifecycle,
    deliveryBefore: delivery,
    deliveryAfter,
    changed:
      !same(currentLifecycle, nextLifecycle) ||
      !same(delivery, deliveryAfter),
  })
}
