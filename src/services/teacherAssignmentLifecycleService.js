import {
  PRIVATE_ASSIGNMENT_STATE,
  isAllowedTeacherAssignmentTransition,
  isPrivateAssignment,
} from './privateAssignment.js'
import {
  createInitialAssignmentLifecycleRecord,
  isAssignmentLifecycleRecord,
} from './assignmentLifecycleRecord.js'
import {
  assertTeacherAssignmentLifecycleRepository,
} from './teacherAssignmentLifecycleRepository.js'
import {
  normalizeRequiredId,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

function assertAssignmentRepository(repository) {
  if (
    !repository ||
    typeof repository !== 'object' ||
    typeof repository.list !== 'function' ||
    typeof repository.getByAssignmentId !== 'function'
  ) {
    throw new TypeError(
      'teacher assignment repository must provide list() and getByAssignmentId().',
    )
  }

  return repository
}

export function createTeacherAssignmentLifecycleService({
  assignmentRepository,
  lifecycleRepository,
  now,
} = {}) {
  const trustedAssignmentRepository =
    assertAssignmentRepository(
      assignmentRepository,
    )
  const trustedLifecycleRepository =
    assertTeacherAssignmentLifecycleRepository(
      lifecycleRepository,
    )

  if (typeof now !== 'function') {
    throw new TypeError('now must be a function.')
  }

  function validatedAssignments() {
    const rows = trustedAssignmentRepository.list()

    if (!Array.isArray(rows)) {
      throw new TypeError(
        'teacher assignment repository list() must return an array.',
      )
    }

    const seen = new Set()
    const validated = []

    for (const row of rows) {
      if (!isPrivateAssignment(row)) {
        throw new TypeError(
          'teacher assignment repository row must be a valid immutable PrivateAssignment.',
        )
      }

      if (seen.has(row.assignmentId)) {
        throw new Error(
          `duplicate assignmentId returned by teacher assignment repository: ${row.assignmentId}`,
        )
      }

      seen.add(row.assignmentId)
      validated.push(row)
    }

    return Object.freeze(validated)
  }

  function validatedLifecycleOverlays(
    assignments,
  ) {
    const rows = trustedLifecycleRepository.list()

    if (!Array.isArray(rows)) {
      throw new TypeError(
        'teacher assignment lifecycle repository list() must return an array.',
      )
    }

    const assignmentsById = new Map(
      assignments.map((assignment) => [
        assignment.assignmentId,
        assignment,
      ]),
    )
    const overlays = new Map()

    for (const row of rows) {
      if (!isAssignmentLifecycleRecord(row)) {
        throw new TypeError(
          'teacher assignment lifecycle repository row must be a valid immutable AssignmentLifecycleRecord.',
        )
      }

      const id = row.assignment.assignmentId
      if (overlays.has(id)) {
        throw new Error(
          `duplicate assignmentId returned by teacher assignment lifecycle repository: ${id}`,
        )
      }

      const original =
        assignmentsById.get(id) ?? null
      if (original === null) {
        throw new Error(
          `teacher assignment lifecycle references unknown assignment: ${id}`,
        )
      }
      if (row.assignment !== original) {
        throw new Error(
          `teacher assignment lifecycle assignment mismatch: ${id}`,
        )
      }

      overlays.set(id, row)
    }

    return overlays
  }

  function resolveAssignmentContext(
    assignmentId,
  ) {
    const id = normalizeRequiredId(
      assignmentId,
      'assignmentId',
    )
    const assignments = validatedAssignments()
    const listed =
      assignments.find(
        (row) => row.assignmentId === id,
      ) ?? null
    const candidate =
      trustedAssignmentRepository
        .getByAssignmentId(id)

    if (listed === null) {
      if (
        candidate !== null &&
        candidate !== undefined
      ) {
        throw new Error(
          `teacher-assignment-lookup-mismatch:${id}`,
        )
      }

      throw new Error(
        `teacher-assignment-not-found:${id}`,
      )
    }

    if (!isPrivateAssignment(candidate)) {
      throw new TypeError(
        'teacher assignment repository lookup must return a valid immutable PrivateAssignment.',
      )
    }
    if (
      candidate.assignmentId !== id ||
      candidate !== listed
    ) {
      throw new Error(
        `teacher-assignment-identity-mismatch:${id}`,
      )
    }

    return Object.freeze({
      id,
      assignment: listed,
      assignments,
    })
  }

  function resolveCurrent(
    assignment,
    assignments,
  ) {
    const overlays =
      validatedLifecycleOverlays(assignments)
    const listed =
      overlays.get(
        assignment.assignmentId,
      ) ?? null
    const candidate =
      trustedLifecycleRepository
        .getByAssignmentId(
          assignment.assignmentId,
        )

    if (
      candidate === null ||
      candidate === undefined
    ) {
      if (listed !== null) {
        throw new Error(
          'teacher assignment lifecycle lookup mismatch.',
        )
      }

      return createInitialAssignmentLifecycleRecord(
        assignment,
      )
    }

    if (
      !isAssignmentLifecycleRecord(candidate) ||
      candidate.assignment !== assignment ||
      candidate !== listed
    ) {
      throw new Error(
        'teacher assignment lifecycle lookup mismatch.',
      )
    }

    return candidate
  }

  function assertLifecycleAcknowledgement(
    acknowledgement,
    assignment,
    {
      state,
      stateChangedAt,
      revokedAt,
    },
  ) {
    if (
      !isAssignmentLifecycleRecord(
        acknowledgement,
      )
    ) {
      throw new Error(
        'teacher assignment lifecycle repository acknowledgement is invalid.',
      )
    }

    if (
      acknowledgement.assignment !== assignment ||
      acknowledgement.assignment.assignmentId !==
        assignment.assignmentId ||
      acknowledgement.assignment.studentId !==
        assignment.studentId ||
      acknowledgement.assignment.sourceRef !==
        assignment.sourceRef ||
      acknowledgement.state !== state ||
      acknowledgement.stateChangedAt !==
        stateChangedAt ||
      acknowledgement.revokedAt !== revokedAt
    ) {
      throw new Error(
        'teacher assignment lifecycle repository acknowledgement mismatch.',
      )
    }

    return acknowledgement
  }

  function listAssignments() {
    const assignments = validatedAssignments()
    const overlays =
      validatedLifecycleOverlays(assignments)

    return Object.freeze(
      assignments.map(
        (assignment) =>
          overlays.get(
            assignment.assignmentId,
          ) ??
          createInitialAssignmentLifecycleRecord(
            assignment,
          ),
      ),
    )
  }

  function transitionTo(
    assignmentId,
    toState,
  ) {
    const {
      assignment,
      assignments,
    } = resolveAssignmentContext(
      assignmentId,
    )
    const current = resolveCurrent(
      assignment,
      assignments,
    )

    if (current.revokedAt !== null) {
      throw new Error(
        `teacher-assignment-lifecycle-revoked:${assignment.assignmentId}`,
      )
    }

    if (current.state === toState) {
      return current
    }

    if (
      !isAllowedTeacherAssignmentTransition(
        current.state,
        toState,
      )
    ) {
      throw new Error(
        `teacher-assignment-transition-not-allowed:${current.state}:${toState}`,
      )
    }

    const transitionedAt =
      normalizeRequiredTimestamp(
        now(),
        'transitionedAt',
      )

    const acknowledgement =
      trustedLifecycleRepository.transition({
        assignment,
        toState,
        transitionedAt,
      })

    return assertLifecycleAcknowledgement(
      acknowledgement,
      assignment,
      {
        state: toState,
        stateChangedAt: transitionedAt,
        revokedAt: null,
      },
    )
  }

  function revokeAssignment(
    assignmentId,
  ) {
    const {
      assignment,
      assignments,
    } = resolveAssignmentContext(
      assignmentId,
    )
    const current = resolveCurrent(
      assignment,
      assignments,
    )

    if (current.revokedAt !== null) {
      return current
    }

    const revokedAt =
      normalizeRequiredTimestamp(
        now(),
        'revokedAt',
      )

    const acknowledgement =
      trustedLifecycleRepository.revoke({
        assignment,
        revokedAt,
      })

    return assertLifecycleAcknowledgement(
      acknowledgement,
      assignment,
      {
        state: current.state,
        stateChangedAt:
          current.stateChangedAt,
        revokedAt,
      },
    )
  }

  function getAssignmentHistory(
    assignmentId,
  ) {
    const {
      assignment,
      assignments,
    } = resolveAssignmentContext(
      assignmentId,
    )

    resolveCurrent(
      assignment,
      assignments,
    )

    const rows =
      trustedLifecycleRepository.history(
        assignment.assignmentId,
      )

    if (!Array.isArray(rows)) {
      throw new TypeError(
        'teacher assignment lifecycle history() must return an array.',
      )
    }

    const validated = rows.map((row) => {
      if (
        !isAssignmentLifecycleRecord(row) ||
        row.assignment !== assignment
      ) {
        throw new Error(
          'teacher assignment lifecycle history mismatch.',
        )
      }
      return row
    })

    return Object.freeze(validated)
  }

  return Object.freeze({
    listAssignments,
    markCompleted(assignmentId) {
      return transitionTo(
        assignmentId,
        PRIVATE_ASSIGNMENT_STATE.COMPLETED,
      )
    },
    moveToRepertoire(assignmentId) {
      return transitionTo(
        assignmentId,
        PRIVATE_ASSIGNMENT_STATE.REPERTOIRE,
      )
    },
    revokeAssignment,
    getAssignmentHistory,
  })
}
