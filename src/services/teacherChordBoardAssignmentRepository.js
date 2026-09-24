import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  isPrivateAssignment,
} from './privateAssignment.js'
import {
  isChordBoardAssignmentSourceBinding,
} from './chordBoardAssignmentSourceBinding.js'
import {
  sameChordBoardVoicingSnapshot,
} from './chordBoardVoicingCanonical.js'
import {
  assertStrictInputObject,
  normalizeRequiredId,
} from './teacherDeliveryContractValidation.js'

const EXACT_LOOKUP_FIELDS = Object.freeze([
  'studentId',
  'voicingFingerprint',
])

function normalizeFingerprint(value) {
  if (
    typeof value !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value)
  ) {
    throw new TypeError(
      'voicingFingerprint must be lowercase SHA-256 hex.',
    )
  }
  return value
}

function exactKey({
  studentId,
  voicingFingerprint,
}) {
  return [
    normalizeRequiredId(studentId, 'studentId'),
    normalizeFingerprint(voicingFingerprint),
  ].join('\u0001')
}

function exactKeyFromAssignment(assignment) {
  return exactKey({
    studentId: assignment.studentId,
    voicingFingerprint:
      assignment.sourceRef.voicingFingerprint,
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
      PRIVATE_ASSIGNMENT_PRACTICE_TYPE.CHORD_BOARD ||
    !isChordBoardAssignmentSourceBinding(
      value.sourceRef,
    )
  ) {
    throw new TypeError(
      `${label} must be a CHORD_BOARD PrivateAssignment.`,
    )
  }
  return value
}

function assertExactCollisionSafe(
  existing,
  candidate,
) {
  if (
    existing.studentId !== candidate.studentId ||
    existing.sourceRef.voicingFingerprint !==
      candidate.sourceRef.voicingFingerprint
  ) {
    throw new Error(
      'CHORD_BOARD exact-key authority mismatch.',
    )
  }

  if (
    !sameChordBoardVoicingSnapshot(
      existing.sourceRef.snapshot,
      candidate.sourceRef.snapshot,
    )
  ) {
    throw new Error(
      'CHORD_BOARD exact-key fingerprint collision or source conflict.',
    )
  }
}

export function assertTeacherChordBoardAssignmentRepository(
  repository,
) {
  if (
    !repository ||
    typeof repository !== 'object' ||
    typeof repository.list !== 'function' ||
    typeof repository.getByAssignmentId !==
      'function' ||
    typeof repository
      .findExactChordBoardAssignment !==
      'function' ||
    typeof repository.createBatch !==
      'function'
  ) {
    throw new TypeError(
      'teacher CHORD_BOARD assignment repository must provide list(), getByAssignmentId(), findExactChordBoardAssignment() and createBatch().',
    )
  }

  return repository
}

export function createInMemoryTeacherChordBoardAssignmentRepository(
  initialAssignments = [],
) {
  if (!Array.isArray(initialAssignments)) {
    throw new TypeError(
      'initial CHORD_BOARD assignment snapshot must be an array.',
    )
  }

  const order = []
  const byAssignmentId = new Map()
  const byExactKey = new Map()

  function validateNewAssignment(
    assignment,
    pendingAssignmentIds,
    pendingExactRows,
  ) {
    const row = assertAssignment(
      assignment,
      'CHORD_BOARD assignment',
    )
    const assignmentId = row.assignmentId
    const key = exactKeyFromAssignment(row)

    if (
      byAssignmentId.has(assignmentId) ||
      pendingAssignmentIds.has(assignmentId)
    ) {
      throw new Error(
        `duplicate assignmentId in CHORD_BOARD assignment repository: ${assignmentId}`,
      )
    }

    const existing =
      byExactKey.get(key) ??
      pendingExactRows.get(key) ??
      null

    if (existing !== null) {
      assertExactCollisionSafe(
        existing,
        row,
      )
      throw new Error(
        `duplicate exact CHORD_BOARD assignment: ${row.studentId}:${row.sourceRef.voicingFingerprint}`,
      )
    }

    pendingAssignmentIds.add(assignmentId)
    pendingExactRows.set(key, row)
    return row
  }

  function commitRows(rows) {
    for (const row of rows) {
      order.push(row.assignmentId)
      byAssignmentId.set(
        row.assignmentId,
        row,
      )
      byExactKey.set(
        exactKeyFromAssignment(row),
        row,
      )
    }
  }

  if (initialAssignments.length > 0) {
    const pendingAssignmentIds = new Set()
    const pendingExactRows = new Map()
    const validated = initialAssignments.map(
      (assignment) =>
        validateNewAssignment(
          assignment,
          pendingAssignmentIds,
          pendingExactRows,
        ),
    )
    commitRows(validated)
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

    findExactChordBoardAssignment(
      input = {},
    ) {
      assertStrictInputObject(
        input,
        EXACT_LOOKUP_FIELDS,
        'ExactChordBoardAssignmentLookup',
      )
      const key = exactKey(input)
      return byExactKey.get(key) ?? null
    },

    createBatch(assignments) {
      if (
        !Array.isArray(assignments) ||
        assignments.length === 0
      ) {
        throw new TypeError(
          'CHORD_BOARD assignment batch must be a non-empty array.',
        )
      }

      const pendingAssignmentIds = new Set()
      const pendingExactRows = new Map()
      const validated = assignments.map(
        (assignment) =>
          validateNewAssignment(
            assignment,
            pendingAssignmentIds,
            pendingExactRows,
          ),
      )

      commitRows(validated)
      return Object.freeze([...validated])
    },
  })
}
