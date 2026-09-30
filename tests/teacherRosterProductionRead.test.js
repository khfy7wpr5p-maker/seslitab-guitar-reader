import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SECURE_DELIVERY_ROLE,
  createSecureDeliveryIdentityMapping,
} from '../src/services/secureDeliveryIdentity.js'
import {
  createStudentRosterEntry,
} from '../src/services/studentRosterEntry.js'
import {
  createTeacherStudentGrant,
} from '../src/services/teacherStudentGrant.js'
import {
  createSecureDeliveryAuthorization,
} from '../backend/delivery/authorization/secureDeliveryAuthorization.js'
import {
  createInMemorySecureDeliveryStore,
} from '../backend/delivery/repositories/inMemorySecureDeliveryStore.js'
import {
  createTeacherRosterReadService,
} from '../backend/delivery/services/teacherRosterReadService.js'

const CREATED_AT = '2026-09-30T09:00:00Z'
const REVOKED_AT = '2026-09-30T09:30:00Z'

function teacherIdentity(
  providerSubject,
  teacherId,
) {
  return createSecureDeliveryIdentityMapping({
    providerSubject,
    role: SECURE_DELIVERY_ROLE.TEACHER,
    teacherId,
    studentId: null,
    active: true,
    createdAt: CREATED_AT,
    disabledAt: null,
  })
}

function studentIdentity(
  providerSubject,
  studentId,
) {
  return createSecureDeliveryIdentityMapping({
    providerSubject,
    role: SECURE_DELIVERY_ROLE.STUDENT,
    teacherId: null,
    studentId,
    active: true,
    createdAt: CREATED_AT,
    disabledAt: null,
  })
}

function grant(
  teacherId,
  studentId,
  active = true,
) {
  return createTeacherStudentGrant({
    teacherId,
    studentId,
    active,
    createdAt: CREATED_AT,
    revokedAt: active ? null : REVOKED_AT,
  })
}

function roster(
  studentId,
  displayNameOrNickname,
  active = true,
) {
  return createStudentRosterEntry({
    studentId,
    displayNameOrNickname,
    active,
  })
}

function service({
  identityMappings,
  grants,
  rosterEntries,
}) {
  const store =
    createInMemorySecureDeliveryStore({
      identityMappings,
      grants,
      rosterEntries,
    })
  const authorization =
    createSecureDeliveryAuthorization({
      store,
    })

  return {
    store,
    rosterRead:
      createTeacherRosterReadService({
        authorization,
        store,
      }),
  }
}

test('Task 2 returns only the authenticated teacher active-grant roster scope using stable studentId', async () => {
  const studentA =
    roster('student-a', 'Ali')
  const studentZ =
    roster('student-z', 'Zeynep', false)
  const revoked =
    roster('student-revoked', 'Eski')
  const otherTeacher =
    roster('student-other', 'Başka')

  const { rosterRead } = service({
    identityMappings: [
      teacherIdentity(
        'firebase-teacher-a',
        'teacher-a',
      ),
    ],
    grants: [
      grant('teacher-a', 'student-z'),
      grant('teacher-a', 'student-revoked', false),
      grant('teacher-b', 'student-other'),
      grant('teacher-a', 'student-a'),
    ],
    rosterEntries: [
      studentZ,
      revoked,
      otherTeacher,
      studentA,
    ],
  })

  const rows = await rosterRead.listRoster({
    providerSubject: 'firebase-teacher-a',
  })

  assert.deepEqual(
    rows,
    [studentA, studentZ],
  )
  assert.equal(
    Object.isFrozen(rows),
    true,
  )

  const serialized = JSON.stringify(rows)
  assert.equal(
    serialized.includes('teacherId'),
    false,
  )
  assert.equal(
    serialized.includes('providerSubject'),
    false,
  )
  assert.equal(
    serialized.includes('firebase-teacher-a'),
    false,
  )
})

test('Task 2 rejects a STUDENT principal from the teacher roster read', async () => {
  const { rosterRead } = service({
    identityMappings: [
      studentIdentity(
        'firebase-student-a',
        'student-a',
      ),
    ],
    grants: [],
    rosterEntries: [
      roster('student-a', 'Ali'),
    ],
  })

  await assert.rejects(
    () => rosterRead.listRoster({
      providerSubject:
        'firebase-student-a',
    }),
    /wrong-role/i,
  )
})

test('Task 2 fails closed when an active teacher grant has no matching roster entry', async () => {
  const { rosterRead } = service({
    identityMappings: [
      teacherIdentity(
        'firebase-teacher-a',
        'teacher-a',
      ),
    ],
    grants: [
      grant('teacher-a', 'student-missing'),
    ],
    rosterEntries: [],
  })

  await assert.rejects(
    () => rosterRead.listRoster({
      providerSubject:
        'firebase-teacher-a',
    }),
    /roster-entry-missing/i,
  )
})

test('Task 2 store read primitives preserve grant and roster authority separately', async () => {
  const activeGrant =
    grant('teacher-a', 'student-a')
  const inactiveGrant =
    grant('teacher-a', 'student-b', false)
  const entry =
    roster('student-a', 'Ali')

  const store =
    createInMemorySecureDeliveryStore({
      grants: [
        activeGrant,
        inactiveGrant,
        grant('teacher-b', 'student-c'),
      ],
      rosterEntries: [entry],
    })

  assert.deepEqual(
    await store
      .listTeacherStudentGrantsForTeacher(
        'teacher-a',
      ),
    [activeGrant, inactiveGrant],
  )
  assert.equal(
    await store.getRosterEntry('student-a'),
    entry,
  )
  assert.equal(
    await store.getRosterEntry('student-missing'),
    null,
  )
})
