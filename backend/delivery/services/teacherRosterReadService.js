import {
  SECURE_DELIVERY_ROLE,
} from '../../../src/services/secureDeliveryIdentity.js'
import {
  isStudentRosterEntry,
} from '../../../src/services/studentRosterEntry.js'
import {
  isTeacherStudentGrant,
} from '../../../src/services/teacherStudentGrant.js'

function assertDependencies(
  authorization,
  store,
) {
  if (
    !authorization ||
    typeof authorization.resolvePrincipal !==
      'function'
  ) {
    throw new TypeError(
      'authorization must provide resolvePrincipal().',
    )
  }
  if (
    !store ||
    typeof store !== 'object' ||
    typeof store
      .listTeacherStudentGrantsForTeacher !==
      'function' ||
    typeof store.getRosterEntry !==
      'function'
  ) {
    throw new TypeError(
      'teacher roster read store must provide grant listing and roster lookup.',
    )
  }
}

function compareStudentId(left, right) {
  if (left.studentId < right.studentId) {
    return -1
  }
  if (left.studentId > right.studentId) {
    return 1
  }
  return 0
}

export function createTeacherRosterReadService({
  authorization,
  store,
} = {}) {
  assertDependencies(
    authorization,
    store,
  )

  return Object.freeze({
    async listRoster({
      providerSubject,
    } = {}) {
      const principal =
        await authorization.resolvePrincipal(
          providerSubject,
          SECURE_DELIVERY_ROLE.TEACHER,
        )

      const grants =
        await store
          .listTeacherStudentGrantsForTeacher(
            principal.teacherId,
          )

      if (!Array.isArray(grants)) {
        throw new TypeError(
          'teacher roster grant listing must return an array.',
        )
      }

      const seenStudentIds = new Set()
      const rows = []

      for (const grant of grants) {
        if (
          !isTeacherStudentGrant(grant) ||
          grant.teacherId !==
            principal.teacherId
        ) {
          throw new Error(
            'secure-delivery-roster-grant-mismatch',
          )
        }

        if (
          seenStudentIds.has(
            grant.studentId,
          )
        ) {
          throw new Error(
            'secure-delivery-roster-grant-duplicate',
          )
        }
        seenStudentIds.add(grant.studentId)

        if (
          grant.active !== true ||
          grant.revokedAt !== null
        ) {
          continue
        }

        const row =
          await store.getRosterEntry(
            grant.studentId,
          )

        if (row === null || row === undefined) {
          throw new Error(
            'secure-delivery-roster-entry-missing',
          )
        }

        if (
          !isStudentRosterEntry(row) ||
          row.studentId !== grant.studentId
        ) {
          throw new Error(
            'secure-delivery-roster-entry-mismatch',
          )
        }

        rows.push(row)
      }

      rows.sort(compareStudentId)
      return Object.freeze(rows)
    },
  })
}
