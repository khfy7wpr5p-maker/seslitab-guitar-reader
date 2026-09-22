import { isStudentRosterEntry } from './studentRosterEntry.js'
import {
  normalizeRequiredId,
} from './teacherDeliveryContractValidation.js'
import {
  assertTeacherRosterRepository,
} from './teacherRosterRepository.js'

function assertRosterEntry(value, label) {
  if (!isStudentRosterEntry(value)) {
    throw new TypeError(
      `invalid StudentRosterEntry from ${label}.`,
    )
  }

  return value
}

function validatedRosterList(repository) {
  const value = repository.list()

  if (!Array.isArray(value)) {
    throw new TypeError('teacher roster repository list() must return an array.')
  }

  const seen = new Set()
  const entries = []

  for (const candidate of value) {
    const row = assertRosterEntry(
      candidate,
      'teacher roster repository row',
    )

    if (seen.has(row.studentId)) {
      throw new Error(
        `duplicate studentId returned by teacher roster repository: ${row.studentId}`,
      )
    }

    seen.add(row.studentId)
    entries.push(row)
  }

  return Object.freeze(entries)
}

export function createTeacherRosterService({ repository } = {}) {
  const trustedRepository = assertTeacherRosterRepository(repository)

  function getStudent(studentId) {
    const normalizedStudentId = normalizeRequiredId(
      studentId,
      'studentId',
    )

    // Validate the complete authority snapshot before accepting any
    // point lookup so a custom adapter cannot hide duplicate identities.
    validatedRosterList(trustedRepository)

    const candidate =
      trustedRepository.getByStudentId(normalizedStudentId)

    if (candidate === null || candidate === undefined) {
      return null
    }

    const row = assertRosterEntry(
      candidate,
      'teacher roster repository lookup result',
    )

    if (row.studentId !== normalizedStudentId) {
      throw new Error(
        `teacher-roster-identity-mismatch:${normalizedStudentId}`,
      )
    }

    return row
  }

  function requireActiveStudent(studentId) {
    const normalizedStudentId = normalizeRequiredId(
      studentId,
      'studentId',
    )
    const entries = validatedRosterList(trustedRepository)
    const row =
      entries.find(
        (candidate) =>
          candidate.studentId === normalizedStudentId,
      ) ?? null

    if (row === null) {
      throw new Error(
        `teacher-roster-student-not-found:${normalizedStudentId}`,
      )
    }

    if (row.active !== true) {
      throw new Error(
        `teacher-roster-student-inactive:${normalizedStudentId}`,
      )
    }

    return row
  }

  return Object.freeze({
    listStudents({ includeInactive = true } = {}) {
      if (typeof includeInactive !== 'boolean') {
        throw new TypeError('includeInactive must be a boolean.')
      }

      const entries = validatedRosterList(trustedRepository)

      if (includeInactive) {
        return entries
      }

      return Object.freeze(
        entries.filter((row) => row.active === true),
      )
    },

    getStudent,

    requireActiveStudent,

    preflightActiveStudentIds(studentIds) {
      if (!Array.isArray(studentIds)) {
        throw new TypeError('studentIds must be an array.')
      }

      const normalizedIds = []
      const seen = new Set()

      for (const rawStudentId of studentIds) {
        const studentId = normalizeRequiredId(
          rawStudentId,
          'studentId',
        )

        if (seen.has(studentId)) continue
        seen.add(studentId)
        normalizedIds.push(studentId)
      }

      if (normalizedIds.length === 0) {
        throw new Error(
          'teacher roster preflight requires at least one studentId.',
        )
      }

      const rosterSnapshot = validatedRosterList(
        trustedRepository,
      )
      const byStudentId = new Map(
        rosterSnapshot.map((row) => [row.studentId, row]),
      )

      const entries = normalizedIds.map((studentId) => {
        const row = byStudentId.get(studentId) ?? null

        if (row === null) {
          throw new Error(
            `teacher-roster-student-not-found:${studentId}`,
          )
        }

        if (row.active !== true) {
          throw new Error(
            `teacher-roster-student-inactive:${studentId}`,
          )
        }

        return row
      })

      return Object.freeze(entries)
    },
  })
}
