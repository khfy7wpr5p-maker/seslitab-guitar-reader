import {
  PRIVATE_ASSIGNMENT_STATE,
  isAllowedTeacherAssignmentTransition,
  isPrivateAssignment,
} from './privateAssignment.js'
import {
  isStrictFrozenRecord,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

export const ASSIGNMENT_LIFECYCLE_SCHEMA_VERSION = 1

const RECORD_FIELDS = Object.freeze([
  'schemaVersion',
  'assignment',
  'state',
  'stateChangedAt',
  'revokedAt',
])

function assertInitialAssignment(assignment) {
  if (!isPrivateAssignment(assignment)) {
    throw new TypeError(
      'assignment must be a valid immutable initial PrivateAssignment.',
    )
  }

  return assignment
}

function isSupportedState(state) {
  return Object.values(PRIVATE_ASSIGNMENT_STATE).includes(state)
}

export function createInitialAssignmentLifecycleRecord(assignment) {
  const trusted = assertInitialAssignment(assignment)

  return Object.freeze({
    schemaVersion: ASSIGNMENT_LIFECYCLE_SCHEMA_VERSION,
    assignment: trusted,
    state: PRIVATE_ASSIGNMENT_STATE.ACTIVE,
    stateChangedAt: trusted.assignedAt,
    revokedAt: null,
  })
}

export function isAssignmentLifecycleRecord(value) {
  try {
    if (
      value?.schemaVersion !== ASSIGNMENT_LIFECYCLE_SCHEMA_VERSION ||
      !isStrictFrozenRecord(value, RECORD_FIELDS) ||
      !isPrivateAssignment(value.assignment) ||
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
      value.state === PRIVATE_ASSIGNMENT_STATE.ACTIVE &&
      value.stateChangedAt !== value.assignment.assignedAt
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

export function transitionAssignmentLifecycleRecord(
  record,
  toState,
  transitionedAt,
) {
  if (!isAssignmentLifecycleRecord(record)) {
    throw new TypeError(
      'record must be a valid immutable AssignmentLifecycleRecord.',
    )
  }
  if (record.revokedAt !== null) {
    throw new Error('assignment-lifecycle-revoked')
  }
  if (!isSupportedState(toState)) {
    throw new TypeError(
      'toState must be a supported assignment state.',
    )
  }
  if (record.state === toState) {
    return record
  }
  if (
    !isAllowedTeacherAssignmentTransition(
      record.state,
      toState,
    )
  ) {
    throw new Error(
      `assignment-lifecycle-transition-not-allowed:${record.state}:${toState}`,
    )
  }

  return Object.freeze({
    schemaVersion: ASSIGNMENT_LIFECYCLE_SCHEMA_VERSION,
    assignment: record.assignment,
    state: toState,
    stateChangedAt: normalizeRequiredTimestamp(
      transitionedAt,
      'transitionedAt',
    ),
    revokedAt: null,
  })
}

export function revokeAssignmentLifecycleRecord(
  record,
  revokedAt,
) {
  if (!isAssignmentLifecycleRecord(record)) {
    throw new TypeError(
      'record must be a valid immutable AssignmentLifecycleRecord.',
    )
  }
  if (record.revokedAt !== null) {
    return record
  }

  return Object.freeze({
    schemaVersion: ASSIGNMENT_LIFECYCLE_SCHEMA_VERSION,
    assignment: record.assignment,
    state: record.state,
    stateChangedAt: record.stateChangedAt,
    revokedAt: normalizeRequiredTimestamp(
      revokedAt,
      'revokedAt',
    ),
  })
}
