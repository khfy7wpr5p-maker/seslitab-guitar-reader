import {
  PRIVATE_ASSIGNMENT_MAX_TEACHER_NOTE_LENGTH,
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  createPrivateAssignment,
  isPrivateAssignment,
} from './privateAssignment.js'
import {
  createScoreAssignmentSourceBinding,
  isScoreAssignmentSourceBinding,
} from './scoreAssignmentSourceBinding.js'
import {
  assertTeacherScoreAssignmentRepository,
} from './teacherScoreAssignmentRepository.js'
import {
  assertStrictInputObject,
  normalizeOptionalText,
  normalizeRequiredId,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

const PREPARE_FIELDS = Object.freeze([
  'workspace',
  'sourceNotes',
  'studentIds',
  'commonTeacherNote',
  'teacherNoteOverrides',
])

const OVERRIDE_FIELDS = Object.freeze([
  'studentId',
  'teacherNote',
])

const READINESS_ID_FIELDS = Object.freeze([
  'authorizationId',
  'rootQualityEvidenceId',
  'revalidationEvidenceId',
])

function assertOwnRequiredFields(
  input,
  fields,
  label,
) {
  if (
    fields.some(
      (field) => !Object.hasOwn(input, field),
    )
  ) {
    throw new TypeError(
      `${label} input contains missing fields.`,
    )
  }
}

function normalizeOverrides(
  rows,
  selectedStudentIds,
) {
  if (!Array.isArray(rows)) {
    throw new TypeError(
      'teacherNoteOverrides must be an array.',
    )
  }

  const selected = new Set(selectedStudentIds)
  const byStudentId = new Map()

  for (const row of rows) {
    assertStrictInputObject(
      row,
      OVERRIDE_FIELDS,
      'TeacherNoteOverride',
    )
    assertOwnRequiredFields(
      row,
      OVERRIDE_FIELDS,
      'TeacherNoteOverride',
    )

    const studentId = normalizeRequiredId(
      row.studentId,
      'studentId',
    )

    if (!selected.has(studentId)) {
      throw new Error(
        `teacher-note-override-target-not-selected:${studentId}`,
      )
    }
    if (byStudentId.has(studentId)) {
      throw new Error(
        `duplicate-teacher-note-override:${studentId}`,
      )
    }

    byStudentId.set(
      studentId,
      normalizeOptionalText(
        row.teacherNote,
        'teacherNote',
        PRIVATE_ASSIGNMENT_MAX_TEACHER_NOTE_LENGTH,
      ),
    )
  }

  return byStudentId
}

function sameSourceBinding(a, b) {
  if (
    !isScoreAssignmentSourceBinding(a) ||
    !isScoreAssignmentSourceBinding(b)
  ) {
    return false
  }

  for (const field of [
    'schemaVersion',
    'sourceKind',
    'studentId',
    'sourceId',
    'sourceRevisionId',
    'revisionId',
    'revisionKind',
    'contentFingerprint',
    'lineageFingerprint',
    'approvalId',
    'authorizationId',
    'qualityEvidenceId',
    'revalidationEvidenceId',
    'readinessRoute',
    'package12Status',
    'boundAt',
  ]) {
    if (a[field] !== b[field]) return false
  }

  return true
}

function sameAssignment(a, b) {
  return (
    isPrivateAssignment(a) &&
    isPrivateAssignment(b) &&
    a.schemaVersion === b.schemaVersion &&
    a.assignmentId === b.assignmentId &&
    a.studentId === b.studentId &&
    a.practiceType === b.practiceType &&
    a.teacherNote === b.teacherNote &&
    a.state === b.state &&
    a.assignedAt === b.assignedAt &&
    a.revokedAt === b.revokedAt &&
    sameSourceBinding(a.sourceRef, b.sourceRef)
  )
}

function assertBatchAcknowledgement(
  acknowledgement,
  expected,
) {
  if (
    !Array.isArray(acknowledgement) ||
    !Object.isFrozen(acknowledgement) ||
    acknowledgement.length !== expected.length
  ) {
    throw new Error(
      'teacher SCORE assignment repository acknowledgement is invalid.',
    )
  }

  for (
    let index = 0;
    index < expected.length;
    index += 1
  ) {
    if (
      !sameAssignment(
        acknowledgement[index],
        expected[index],
      )
    ) {
      throw new Error(
        'teacher SCORE assignment repository acknowledgement mismatch.',
      )
    }
  }

  return acknowledgement
}

function normalizeReadinessIds(value) {
  assertStrictInputObject(
    value,
    READINESS_ID_FIELDS,
    'ScoreAssignmentReadinessIds',
  )
  assertOwnRequiredFields(
    value,
    READINESS_ID_FIELDS,
    'ScoreAssignmentReadinessIds',
  )

  return Object.freeze({
    authorizationId: normalizeRequiredId(
      value.authorizationId,
      'authorizationId',
    ),
    rootQualityEvidenceId:
      normalizeRequiredId(
        value.rootQualityEvidenceId,
        'rootQualityEvidenceId',
      ),
    revalidationEvidenceId:
      normalizeRequiredId(
        value.revalidationEvidenceId,
        'revalidationEvidenceId',
      ),
  })
}

function assertExactLookup(
  existing,
  {
    studentId,
    sourceId,
    revisionId,
  },
) {
  if (
    !isPrivateAssignment(existing) ||
    existing.practiceType !==
      PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE ||
    existing.studentId !== studentId ||
    existing.sourceRef.sourceId !== sourceId ||
    existing.sourceRef.revisionId !== revisionId
  ) {
    throw new Error(
      'teacher SCORE assignment repository exact lookup mismatch.',
    )
  }
}

export function createTeacherScoreAssignmentService({
  repository,
  rosterService,
  createAssignmentId,
  createReadinessIds,
  now,
} = {}) {
  const trustedRepository =
    assertTeacherScoreAssignmentRepository(
      repository,
    )

  if (
    !rosterService ||
    typeof rosterService.preflightActiveStudentIds !==
      'function'
  ) {
    throw new TypeError(
      'rosterService must provide preflightActiveStudentIds().',
    )
  }
  if (
    typeof createAssignmentId !== 'function'
  ) {
    throw new TypeError(
      'createAssignmentId must be a function.',
    )
  }
  if (
    typeof createReadinessIds !== 'function'
  ) {
    throw new TypeError(
      'createReadinessIds must be a function.',
    )
  }
  if (typeof now !== 'function') {
    throw new TypeError(
      'now must be a function.',
    )
  }

  function prepareScoreAssignments(input = {}) {
    assertStrictInputObject(
      input,
      PREPARE_FIELDS,
      'TeacherScoreAssignment',
    )
    assertOwnRequiredFields(
      input,
      PREPARE_FIELDS,
      'TeacherScoreAssignment',
    )

    if (!Array.isArray(input.sourceNotes)) {
      throw new TypeError(
        'sourceNotes must be the exact automatic source NoteObject array.',
      )
    }
    if (!Array.isArray(input.studentIds)) {
      throw new TypeError(
        'studentIds must be an array.',
      )
    }

    const activeStudents =
      rosterService.preflightActiveStudentIds(
        input.studentIds,
      )
    const studentIds =
      activeStudents.map(
        (row) => row.studentId,
      )

    const commonTeacherNote =
      normalizeOptionalText(
        input.commonTeacherNote,
        'commonTeacherNote',
        PRIVATE_ASSIGNMENT_MAX_TEACHER_NOTE_LENGTH,
      )
    const overrides = normalizeOverrides(
      input.teacherNoteOverrides,
      studentIds,
    )
    const assignedAt =
      normalizeRequiredTimestamp(
        now(),
        'assignedAt',
      )

    const planned = studentIds.map(
      (studentId, index) => {
        const readinessIds =
          normalizeReadinessIds(
            createReadinessIds({
              studentId,
              index,
            }),
          )

        const sourceRef =
          createScoreAssignmentSourceBinding({
            workspace: input.workspace,
            sourceNotes: input.sourceNotes,
            studentId,
            authorizationId:
              readinessIds.authorizationId,
            rootQualityEvidenceId:
              readinessIds.rootQualityEvidenceId,
            revalidationEvidenceId:
              readinessIds.revalidationEvidenceId,
            createdAt: assignedAt,
          })

        const lookup = Object.freeze({
          studentId,
          sourceId: sourceRef.sourceId,
          revisionId:
            sourceRef.revisionId,
        })
        const existing =
          trustedRepository
            .findExactScoreAssignment(
              lookup,
            )

        if (
          existing !== null &&
          existing !== undefined
        ) {
          assertExactLookup(
            existing,
            lookup,
          )
          throw new Error(
            `teacher-score-assignment-already-prepared:${studentId}`,
          )
        }

        const assignmentId =
          normalizeRequiredId(
            createAssignmentId({
              studentId,
              index,
            }),
            'assignmentId',
          )

        return createPrivateAssignment({
          assignmentId,
          studentId,
          practiceType:
            PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE,
          teacherNote:
            overrides.has(studentId)
              ? overrides.get(studentId)
              : commonTeacherNote,
          assignedAt,
          sourceRef,
        })
      },
    )

    const acknowledgement =
      trustedRepository.createBatch(
        planned,
      )

    return assertBatchAcknowledgement(
      acknowledgement,
      planned,
    )
  }

  return Object.freeze({
    prepareScoreAssignments,
  })
}
