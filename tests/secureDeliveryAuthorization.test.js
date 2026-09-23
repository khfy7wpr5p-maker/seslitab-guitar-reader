import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createSecureDeliveryIdentityMapping,
} from '../src/services/secureDeliveryIdentity.js'
import {
  createTeacherStudentGrant,
} from '../src/services/teacherStudentGrant.js'

async function loadAuth() {
  try {
    return await import('../backend/delivery/authorization/secureDeliveryAuthorization.js')
  } catch {
    assert.fail('secureDeliveryAuthorization module must exist')
  }
}

function mapping({
  providerSubject = 'uid-student-a',
  role = 'STUDENT',
  teacherId = null,
  studentId = 'student-a',
  active = true,
  disabledAt = null,
} = {}) {
  return createSecureDeliveryIdentityMapping({
    providerSubject,
    role,
    teacherId,
    studentId,
    active,
    createdAt: '2026-09-23T08:00:00Z',
    disabledAt,
  })
}

function grant({
  teacherId = 'teacher-a',
  studentId = 'student-a',
  active = true,
  revokedAt = null,
} = {}) {
  return createTeacherStudentGrant({
    teacherId,
    studentId,
    active,
    createdAt: '2026-09-23T08:00:00Z',
    revokedAt,
  })
}

function fakeStore({ mappings = new Map(), grants = new Map() } = {}) {
  return {
    async getIdentityMapping(providerSubject) {
      return mappings.get(providerSubject) ?? null
    },
    async getTeacherStudentGrant(teacherId, studentId) {
      return grants.get(teacherId + '\u0001' + studentId) ?? null
    },
  }
}

test('authorization resolves active stable principal and never returns provider subject', async () => {
  const { createSecureDeliveryAuthorization } = await loadAuth()
  const m = mapping()
  const authorization = createSecureDeliveryAuthorization({
    store: fakeStore({
      mappings: new Map([[m.providerSubject, m]]),
    }),
  })

  const principal = await authorization.resolvePrincipal(
    'uid-student-a',
    'STUDENT',
  )

  assert.deepEqual(principal, Object.freeze({
    role: 'STUDENT',
    teacherId: null,
    studentId: 'student-a',
  }))
  assert.equal('providerSubject' in principal, false)
})

test('authorization fails closed for missing, disabled and wrong-role identity mappings', async () => {
  const { createSecureDeliveryAuthorization } = await loadAuth()
  const disabled = mapping({
    providerSubject: 'uid-disabled',
    active: false,
    disabledAt: '2026-09-23T08:10:00Z',
  })
  const teacher = mapping({
    providerSubject: 'uid-teacher',
    role: 'TEACHER',
    teacherId: 'teacher-a',
    studentId: null,
  })
  const authorization = createSecureDeliveryAuthorization({
    store: fakeStore({
      mappings: new Map([
        [disabled.providerSubject, disabled],
        [teacher.providerSubject, teacher],
      ]),
    }),
  })

  await assert.rejects(
    () => authorization.resolvePrincipal('uid-missing', 'STUDENT'),
    /identity.*mapping|unauthenticated/i,
  )
  await assert.rejects(
    () => authorization.resolvePrincipal('uid-disabled', 'STUDENT'),
    /disabled|inactive/i,
  )
  await assert.rejects(
    () => authorization.resolvePrincipal('uid-teacher', 'STUDENT'),
    /wrong-role|role/i,
  )
})

test('teacher-student authorization requires exact active grant', async () => {
  const { createSecureDeliveryAuthorization } = await loadAuth()
  const activeGrant = grant()
  const revokedGrant = grant({
    studentId: 'student-b',
    active: false,
    revokedAt: '2026-09-23T08:20:00Z',
  })
  const authorization = createSecureDeliveryAuthorization({
    store: fakeStore({
      grants: new Map([
        ['teacher-a\u0001student-a', activeGrant],
        ['teacher-a\u0001student-b', revokedGrant],
      ]),
    }),
  })

  assert.equal(
    await authorization.requireTeacherStudent('teacher-a', 'student-a'),
    activeGrant,
  )
  await assert.rejects(
    () => authorization.requireTeacherStudent('teacher-a', 'student-missing'),
    /grant/i,
  )
  await assert.rejects(
    () => authorization.requireTeacherStudent('teacher-a', 'student-b'),
    /grant|revoked|inactive/i,
  )
})
