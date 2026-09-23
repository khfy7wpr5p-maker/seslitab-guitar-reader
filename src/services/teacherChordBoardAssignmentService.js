import {
  PRIVATE_ASSIGNMENT_MAX_TEACHER_NOTE_LENGTH,
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  createPrivateAssignment,
  isPrivateAssignment,
} from './privateAssignment.js'
import {
  createChordBoardAssignmentSourceBinding,
  isChordBoardAssignmentSourceBinding,
} from './chordBoardAssignmentSourceBinding.js'
import {
  isPinnedChordBoardVoicing,
} from './chordBoardCatalog.js'
import {
  sameChordBoardVoicingSnapshot,
} from './chordBoardVoicingCanonical.js'
import {
  assertTeacherChordBoardAssignmentRepository,
} from './teacherChordBoardAssignmentRepository.js'
import {
  assertStrictInputObject,
  normalizeOptionalText,
  normalizeRequiredId,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

export const TEACHER_CHORD_BOARD_MAX_BATCH_SIZE = 40

const PREPARE_FIELDS = Object.freeze([
  'snapshot',
  'studentIds',
  'commonTeacherNote',
  'teacherNoteOverrides',
])

const OVERRIDE_FIELDS = Object.freeze([
  'studentId',
  'teacherNote',
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
    isChordBoardAssignmentSourceBinding(
      a.sourceRef,
    ) &&
    isChordBoardAssignmentSourceBinding(
      b.sourceRef,
    ) &&
    a.sourceRef.studentId ===
      b.sourceRef.studentId &&
    a.sourceRef.voicingFingerprint ===
      b.sourceRef.voicingFingerprint &&
    a.sourceRef.boundAt ===
      b.sourceRef.boundAt &&
    sameChordBoardVoicingSnapshot(
      a.sourceRef.snapshot,
      b.sourceRef.snapshot,
    )
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
      'teacher CHORD_BOARD assignment repository acknowledgement is invalid.',
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
        'teacher CHORD_BOARD assignment repository acknowledgement mismatch.',
      )
    }
  }

  return acknowledgement
}

function assertExactLookup(
  existing,
  {
    studentId,
    snapshot,
    teacherNote,
  },
) {
  if (
    !isPrivateAssignment(existing) ||
    existing.practiceType !==
      PRIVATE_ASSIGNMENT_PRACTICE_TYPE.CHORD_BOARD ||
    existing.studentId !== studentId ||
    existing.sourceRef.voicingFingerprint !==
      snapshot.voicingFingerprint ||
    !sameChordBoardVoicingSnapshot(
      existing.sourceRef.snapshot,
      snapshot,
    )
  ) {
    throw new Error(
      'teacher CHORD_BOARD assignment repository exact lookup mismatch.',
    )
  }

  if (existing.teacherNote !== teacherNote) {
    throw new Error(
      `teacher-chord-board-assignment-note-conflict:${studentId}`,
    )
  }

  return existing
}

export function createTeacherChordBoardAssignmentService({
  repository,
  rosterService,
  createAssignmentId,
  now,
} = {}) {
  const trustedRepository =
    assertTeacherChordBoardAssignmentRepository(
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
  if (typeof now !== 'function') {
    throw new TypeError(
      'now must be a function.',
    )
  }

  function prepareChordBoardAssignments(
    input = {},
  ) {
    assertStrictInputObject(
      input,
      PREPARE_FIELDS,
      'TeacherChordBoardAssignment',
    )
    assertOwnRequiredFields(
      input,
      PREPARE_FIELDS,
      'TeacherChordBoardAssignment',
    )

    if (!isPinnedChordBoardVoicing(input.snapshot)) {
      throw new Error(
        'teacher-chord-board-voicing-not-in-pinned-catalog',
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

    if (
      studentIds.length >
      TEACHER_CHORD_BOARD_MAX_BATCH_SIZE
    ) {
      throw new Error(
        `teacher CHORD_BOARD assignment batch maximum is ${TEACHER_CHORD_BOARD_MAX_BATCH_SIZE}.`,
      )
    }

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

    const rows = studentIds.map(
      (studentId, index) => ({
        studentId,
        index,
        teacherNote:
          overrides.has(studentId)
            ? overrides.get(studentId)
            : commonTeacherNote,
      }),
    )

    const resolved = new Array(rows.length)
    const pending = []

    for (const row of rows) {
      const existing =
        trustedRepository
          .findExactChordBoardAssignment({
            studentId: row.studentId,
            voicingFingerprint:
              input.snapshot.voicingFingerprint,
          })

      if (
        existing !== null &&
        existing !== undefined
      ) {
        resolved[row.index] =
          assertExactLookup(
            existing,
            {
              studentId: row.studentId,
              snapshot: input.snapshot,
              teacherNote: row.teacherNote,
            },
          )
      } else {
        pending.push(row)
      }
    }

    if (pending.length === 0) {
      return Object.freeze([...resolved])
    }

    const assignedAt =
      normalizeRequiredTimestamp(
        now(),
        'assignedAt',
      )

    const planned = pending.map(
      ({
        studentId,
        index,
        teacherNote,
      }) => {
        const sourceRef =
          createChordBoardAssignmentSourceBinding({
            studentId,
            snapshot: input.snapshot,
            boundAt: assignedAt,
          })
        const assignmentId =
          normalizeRequiredId(
            createAssignmentId({
              studentId,
              index,
            }),
            'assignmentId',
          )

        return Object.freeze({
          index,
          assignment:
            createPrivateAssignment({
              assignmentId,
              studentId,
              practiceType:
                PRIVATE_ASSIGNMENT_PRACTICE_TYPE.CHORD_BOARD,
              teacherNote,
              assignedAt,
              sourceRef,
            }),
        })
      },
    )

    const acknowledgement =
      trustedRepository.createBatch(
        planned.map(
          (row) => row.assignment,
        ),
      )
    assertBatchAcknowledgement(
      acknowledgement,
      planned.map(
        (row) => row.assignment,
      ),
    )

    for (
      let offset = 0;
      offset < planned.length;
      offset += 1
    ) {
      resolved[planned[offset].index] =
        acknowledgement[offset]
    }

    return Object.freeze([...resolved])
  }

  return Object.freeze({
    prepareChordBoardAssignments,
  })
}
