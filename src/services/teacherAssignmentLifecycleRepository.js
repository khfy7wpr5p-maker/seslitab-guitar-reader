import { isPrivateAssignment } from './privateAssignment.js'
import {
  createInitialAssignmentLifecycleRecord,
  isAssignmentLifecycleRecord,
  revokeAssignmentLifecycleRecord,
  transitionAssignmentLifecycleRecord,
} from './assignmentLifecycleRecord.js'
import {
  assertStrictInputObject,
  normalizeRequiredId,
} from './teacherDeliveryContractValidation.js'

const TRANSITION_FIELDS = Object.freeze([
  'assignment',
  'toState',
  'transitionedAt',
])

const REVOKE_FIELDS = Object.freeze([
  'assignment',
  'revokedAt',
])

function assertInitialAssignment(value) {
  if (!isPrivateAssignment(value)) {
    throw new TypeError(
      'assignment must be a valid immutable initial PrivateAssignment.',
    )
  }

  return value
}

export function assertTeacherAssignmentLifecycleRepository(
  repository,
) {
  if (
    !repository ||
    typeof repository !== 'object' ||
    typeof repository.list !== 'function' ||
    typeof repository.getByAssignmentId !== 'function' ||
    typeof repository.history !== 'function' ||
    typeof repository.transition !== 'function' ||
    typeof repository.revoke !== 'function'
  ) {
    throw new TypeError(
      'teacher assignment lifecycle repository must provide list(), getByAssignmentId(), history(), transition() and revoke().',
    )
  }

  return repository
}

export function createInMemoryTeacherAssignmentLifecycleRepository(
  initialRecords = [],
) {
  if (!Array.isArray(initialRecords)) {
    throw new TypeError(
      'initial assignment lifecycle snapshot must be an array.',
    )
  }

  const order = []
  const currentById = new Map()
  const historyById = new Map()

  for (const record of initialRecords) {
    if (!isAssignmentLifecycleRecord(record)) {
      throw new TypeError(
        'initial lifecycle records must be valid immutable AssignmentLifecycleRecord values.',
      )
    }

    const id = record.assignment.assignmentId
    if (currentById.has(id)) {
      throw new Error(
        `duplicate assignmentId in assignment lifecycle snapshot: ${id}`,
      )
    }

    order.push(id)
    currentById.set(id, record)
    historyById.set(id, [record])
  }

  function currentOrInitial(assignment) {
    const trusted = assertInitialAssignment(assignment)
    const id = trusted.assignmentId
    const current = currentById.get(id) ?? null

    if (current === null) {
      return createInitialAssignmentLifecycleRecord(
        trusted,
      )
    }

    if (current.assignment !== trusted) {
      throw new Error(
        `teacher-assignment-lifecycle-identity-mismatch:${id}`,
      )
    }

    return current
  }

  function append(record) {
    const id = record.assignment.assignmentId

    if (!historyById.has(id)) {
      order.push(id)
      historyById.set(id, [])
    }

    historyById.get(id).push(record)
    currentById.set(id, record)
    return record
  }

  return Object.freeze({
    list() {
      return Object.freeze(
        order.map((id) => currentById.get(id)),
      )
    },

    getByAssignmentId(assignmentId) {
      const id = normalizeRequiredId(
        assignmentId,
        'assignmentId',
      )
      return currentById.get(id) ?? null
    },

    history(assignmentId) {
      const id = normalizeRequiredId(
        assignmentId,
        'assignmentId',
      )
      return Object.freeze([
        ...(historyById.get(id) ?? []),
      ])
    },

    transition(input = {}) {
      assertStrictInputObject(
        input,
        TRANSITION_FIELDS,
        'AssignmentLifecycleTransition',
      )

      const current = currentOrInitial(
        input.assignment,
      )
      const next =
        transitionAssignmentLifecycleRecord(
          current,
          input.toState,
          input.transitionedAt,
        )

      if (next === current) {
        return current
      }

      return append(next)
    },

    revoke(input = {}) {
      assertStrictInputObject(
        input,
        REVOKE_FIELDS,
        'AssignmentLifecycleRevoke',
      )

      const current = currentOrInitial(
        input.assignment,
      )
      const next = revokeAssignmentLifecycleRecord(
        current,
        input.revokedAt,
      )

      if (next === current) {
        return current
      }

      return append(next)
    },
  })
}
