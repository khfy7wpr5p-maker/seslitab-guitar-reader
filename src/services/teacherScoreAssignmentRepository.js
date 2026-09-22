import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  isPrivateAssignment,
} from './privateAssignment.js'
import {
  assertStrictInputObject,
  normalizeRequiredId,
} from './teacherDeliveryContractValidation.js'

const EXACT_LOOKUP_FIELDS = Object.freeze([
  'studentId',
  'sourceId',
  'revisionId',
])

function exactKey({
  studentId,
  sourceId,
  revisionId,
}) {
  return [
    normalizeRequiredId(studentId, 'studentId'),
    normalizeRequiredId(sourceId, 'sourceId'),
    normalizeRequiredId(revisionId, 'revisionId'),
  ].join('\u0001')
}

function exactKeyFromAssignment(assignment) {
  return exactKey({
    studentId: assignment.studentId,
    sourceId: assignment.sourceRef.sourceId,
    revisionId: assignment.sourceRef.revisionId,
  })
}

function assertAssignment(value, label) {
  if (!isPrivateAssignment(value)) {
    throw new TypeError(
      `${label} must be a valid immutable PrivateAssignment.`,
    )
  }
  if (
    value.practiceType !==
      PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE
  ) {
    throw new TypeError(
      `${label} must be a SCORE PrivateAssignment.`,
    )
  }
  return value
}

export function assertTeacherScoreAssignmentRepository(
  repository,
) {
  if (
    !repository ||
    typeof repository !== 'object' ||
    typeof repository.list !== 'function' ||
    typeof repository.getByAssignmentId !== 'function' ||
    typeof repository.findExactScoreAssignment !==
      'function' ||
    typeof repository.createBatch !== 'function'
  ) {
    throw new TypeError(
      'teacher SCORE assignment repository must provide list(), getByAssignmentId(), findExactScoreAssignment() and createBatch().',
    )
  }

  return repository
}

export function createInMemoryTeacherScoreAssignmentRepository(
  initialAssignments = [],
) {
  if (!Array.isArray(initialAssignments)) {
    throw new TypeError(
      'initial SCORE assignment snapshot must be an array.',
    )
  }

  const order = []
  const byAssignmentId = new Map()
  const byExactScoreKey = new Map()

  function validateNewAssignment(
    assignment,
    pendingAssignmentIds,
    pendingExactKeys,
  ) {
    const row = assertAssignment(
      assignment,
      'SCORE assignment',
    )
    const assignmentId = row.assignmentId
    const scoreKey = exactKeyFromAssignment(row)

    if (
      byAssignmentId.has(assignmentId) ||
      pendingAssignmentIds.has(assignmentId)
    ) {
      throw new Error(
        `duplicate assignmentId in SCORE assignment repository: ${assignmentId}`,
      )
    }

    if (
      byExactScoreKey.has(scoreKey) ||
      pendingExactKeys.has(scoreKey)
    ) {
      throw new Error(
        `duplicate exact SCORE assignment: ${row.studentId}:${row.sourceRef.sourceId}:${row.sourceRef.revisionId}`,
      )
    }

    pendingAssignmentIds.add(assignmentId)
    pendingExactKeys.add(scoreKey)
    return row
  }

  for (const assignment of initialAssignments) {
    const pendingAssignmentIds = new Set()
    const pendingExactKeys = new Set()
    const row = validateNewAssignment(
      assignment,
      pendingAssignmentIds,
      pendingExactKeys,
    )
    order.push(row.assignmentId)
    byAssignmentId.set(row.assignmentId, row)
    byExactScoreKey.set(
      exactKeyFromAssignment(row),
      row,
    )
  }

  return Object.freeze({
    list() {
      return Object.freeze(
        order.map((assignmentId) =>
          byAssignmentId.get(assignmentId),
        ),
      )
    },

    getByAssignmentId(assignmentId) {
      const id = normalizeRequiredId(
        assignmentId,
        'assignmentId',
      )
      return byAssignmentId.get(id) ?? null
    },

    findExactScoreAssignment(input = {}) {
      assertStrictInputObject(
        input,
        EXACT_LOOKUP_FIELDS,
        'ExactScoreAssignmentLookup',
      )
      const key = exactKey(input)
      return byExactScoreKey.get(key) ?? null
    },

    createBatch(assignments) {
      if (
        !Array.isArray(assignments) ||
        assignments.length === 0
      ) {
        throw new TypeError(
          'SCORE assignment batch must be a non-empty array.',
        )
      }

      const pendingAssignmentIds = new Set()
      const pendingExactKeys = new Set()
      const validated = assignments.map(
        (assignment) =>
          validateNewAssignment(
            assignment,
            pendingAssignmentIds,
            pendingExactKeys,
          ),
      )

      for (const row of validated) {
        order.push(row.assignmentId)
        byAssignmentId.set(
          row.assignmentId,
          row,
        )
        byExactScoreKey.set(
          exactKeyFromAssignment(row),
          row,
        )
      }

      return Object.freeze([...validated])
    },
  })
}
