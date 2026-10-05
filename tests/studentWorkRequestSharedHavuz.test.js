import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createPendingStudentWorkRequest,
  convertStudentWorkRequest,
  revokeStudentWorkRequest,
} from '../src/services/studentWorkRequest.js'
import {
  createStudentRosterEntry,
} from '../src/services/studentRosterEntry.js'
import {
  createTeacherStudentGrant,
} from '../src/services/teacherStudentGrant.js'
import {
  createStudentWorkRequestService,
} from '../backend/delivery/services/studentWorkRequestService.js'

const CREATED_AT = '2026-10-05T07:00:00Z'

function grant(teacherId, studentId) {
  return createTeacherStudentGrant({
    teacherId,
    studentId,
    active: true,
    createdAt: CREATED_AT,
    revokedAt: null,
  })
}

function roster(studentId, displayNameOrNickname) {
  return createStudentRosterEntry({
    studentId,
    displayNameOrNickname,
    active: true,
  })
}

function pending({ requestId, teacherId, studentId, title }) {
  return createPendingStudentWorkRequest({
    requestId,
    teacherId,
    studentId,
    title,
    requestedAt: CREATED_AT,
  })
}

function makeHarness({
  grantsByStudent = {},
  requestsByTeacher = {},
  rosterGrantsByTeacher = {},
  rosterEntriesByStudent = {},
} = {}) {
  const studentSubjects = Object.freeze({
    'uid-student-a': 'student-a',
    'uid-student-b': 'student-b',
    'uid-student-c': 'student-c',
    'uid-student-d': 'student-d',
  })

  const authorization = {
    async resolvePrincipal(subject, role) {
      if (role === 'STUDENT' && studentSubjects[subject]) {
        return { role, studentId: studentSubjects[subject] }
      }
      throw new Error('unauthorized')
    },
  }

  const store = {
    async getWorkRequest() { return null },
    async putWorkRequest(request) { return request },
    async listWorkRequestsForTeacher(teacherId) {
      return requestsByTeacher[teacherId] ?? []
    },
    async listActiveTeacherGrantsForStudent(studentId) {
      return grantsByStudent[studentId] ?? []
    },
    async getPieceEvidence() { return null },
    async commitWorkRequestTransition(_current, next) { return next },
  }

  const rosterStore = {
    async listTeacherStudentGrantsForTeacher(teacherId) {
      return rosterGrantsByTeacher[teacherId] ?? []
    },
    async getRosterEntry(studentId) {
      return rosterEntriesByStudent[studentId] ?? null
    },
  }

  return createStudentWorkRequestService({
    authorization,
    store,
    rosterStore,
    now: () => '2026-10-05T07:01:00Z',
    createRequestId: () => 'request-created',
  })
}

test('shared pending Havuz is cohort-scoped, pending-only, and presentation-only', async () => {
  const grantA = grant('teacher-a', 'student-a')
  const grantB = grant('teacher-a', 'student-b')
  const grantC = grant('teacher-a', 'student-c')
  const grantD = grant('teacher-b', 'student-d')

  const requestA = pending({
    requestId: 'request-a',
    teacherId: 'teacher-a',
    studentId: 'student-a',
    title: 'Carcassi Op. 60 No. 3',
  })
  const convertedB = convertStudentWorkRequest(
    pending({
      requestId: 'request-b',
      teacherId: 'teacher-a',
      studentId: 'student-b',
      title: 'Converted Etüt',
    }),
    {
      pieceAssignmentId: 'piece-b',
      targetState: 'ACTIVE',
      changedAt: '2026-10-05T07:02:00Z',
    },
  )
  const revokedC = revokeStudentWorkRequest(
    pending({
      requestId: 'request-c',
      teacherId: 'teacher-a',
      studentId: 'student-c',
      title: 'Revoked Etüt',
    }),
    { changedAt: '2026-10-05T07:03:00Z' },
  )
  const requestD = pending({
    requestId: 'request-d',
    teacherId: 'teacher-b',
    studentId: 'student-d',
    title: 'Other Teacher Piece',
  })

  const service = makeHarness({
    grantsByStudent: {
      'student-a': [grantA],
      'student-b': [grantB],
      'student-d': [grantD],
    },
    requestsByTeacher: {
      'teacher-a': [requestA, convertedB, revokedC],
      'teacher-b': [requestD],
    },
    rosterGrantsByTeacher: {
      'teacher-a': [grantA, grantB, grantC],
      'teacher-b': [grantD],
    },
    rosterEntriesByStudent: {
      'student-a': roster('student-a', 'Ahmet'),
      'student-b': roster('student-b', 'Buse'),
      'student-c': roster('student-c', 'Cem'),
      'student-d': roster('student-d', 'Deniz'),
    },
  })

  const expected = [{
    title: 'Carcassi Op. 60 No. 3',
    displayNameOrNickname: 'Ahmet',
  }]

  const studentA = await service.listSharedPendingForStudent({
    providerSubject: 'uid-student-a',
  })
  const studentB = await service.listSharedPendingForStudent({
    providerSubject: 'uid-student-b',
  })
  const otherCohort = await service.listSharedPendingForStudent({
    providerSubject: 'uid-student-d',
  })

  assert.deepEqual(studentA, expected)
  assert.deepEqual(studentB, expected)
  assert.deepEqual(otherCohort, [{
    title: 'Other Teacher Piece',
    displayNameOrNickname: 'Deniz',
  }])
  assert.deepEqual(Object.keys(studentA[0]).sort(), [
    'displayNameOrNickname',
    'title',
  ])
})

test('shared pending Havuz fails closed when teacher authority is missing or ambiguous', async () => {
  const grantA = grant('teacher-a', 'student-a')
  const grantB = grant('teacher-b', 'student-a')

  for (const grants of [[], [grantA, grantB]]) {
    const service = makeHarness({
      grantsByStudent: { 'student-a': grants },
    })
    await assert.rejects(
      service.listSharedPendingForStudent({
        providerSubject: 'uid-student-a',
      }),
      /teacher-authority-ambiguous/,
    )
  }
})

test('shared pending Havuz fails closed when a pending requester is missing from the active roster', async () => {
  const grantA = grant('teacher-a', 'student-a')
  const grantB = grant('teacher-a', 'student-b')
  const requestB = pending({
    requestId: 'request-b',
    teacherId: 'teacher-a',
    studentId: 'student-b',
    title: 'Missing Roster Etüt',
  })

  const service = makeHarness({
    grantsByStudent: { 'student-a': [grantA] },
    requestsByTeacher: { 'teacher-a': [requestB] },
    rosterGrantsByTeacher: { 'teacher-a': [grantA, grantB] },
    rosterEntriesByStudent: {
      'student-a': roster('student-a', 'Ahmet'),
    },
  })

  await assert.rejects(
    service.listSharedPendingForStudent({
      providerSubject: 'uid-student-a',
    }),
    /roster/,
  )
})
