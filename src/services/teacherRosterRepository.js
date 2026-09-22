import { isStudentRosterEntry } from './studentRosterEntry.js'
import { normalizeRequiredId } from './teacherDeliveryContractValidation.js'

export function assertTeacherRosterRepository(repository) {
  if (
    repository === null ||
    typeof repository !== 'object' ||
    typeof repository.list !== 'function' ||
    typeof repository.getByStudentId !== 'function'
  ) {
    throw new TypeError(
      'teacher roster repository must provide list() and getByStudentId().',
    )
  }

  return repository
}

export function createInMemoryTeacherRosterRepository(initialEntries = []) {
  if (!Array.isArray(initialEntries)) {
    throw new TypeError('initial roster snapshot must be an array.')
  }

  const ordered = []
  const byStudentId = new Map()

  for (const candidate of initialEntries) {
    if (!isStudentRosterEntry(candidate)) {
      throw new TypeError(
        'initial roster snapshot entries must be valid immutable StudentRosterEntry records.',
      )
    }

    if (byStudentId.has(candidate.studentId)) {
      throw new Error(
        `duplicate studentId in teacher roster snapshot: ${candidate.studentId}`,
      )
    }

    ordered.push(candidate)
    byStudentId.set(candidate.studentId, candidate)
  }

  const frozenOrdered = Object.freeze([...ordered])

  return Object.freeze({
    list() {
      return frozenOrdered
    },

    getByStudentId(studentId) {
      const normalizedStudentId = normalizeRequiredId(
        studentId,
        'studentId',
      )

      return byStudentId.get(normalizedStudentId) ?? null
    },
  })
}
