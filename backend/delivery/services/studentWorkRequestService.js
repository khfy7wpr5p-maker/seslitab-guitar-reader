import {
  createPendingStudentWorkRequest,
  convertStudentWorkRequest,
  revokeStudentWorkRequest,
  STUDENT_WORK_REQUEST_STATE,
  STUDENT_WORK_REQUEST_TARGET,
} from '../../../src/services/studentWorkRequest.js'
import {
  isStudentRosterEntry,
} from '../../../src/services/studentRosterEntry.js'
import {
  isTeacherStudentGrant,
} from '../../../src/services/teacherStudentGrant.js'
import {
  normalizeRequiredId,
  normalizeRequiredText,
} from '../../../src/services/teacherDeliveryContractValidation.js'

const MAX_TITLE_LENGTH = 200

function assertDependency(value, method, label) {
  if (!value || typeof value[method] !== 'function') {
    throw new TypeError(`${label} must provide ${method}().`)
  }
}

function requireOwnedRequest(request, teacherId) {
  if (request === null) throw new Error('work-request-not-found')
  if (request.teacherId !== teacherId) throw new Error('work-request-forbidden')
  return request
}

function requireSingleActiveTeacherGrant(grants, studentId) {
  if (!Array.isArray(grants) || grants.length !== 1) {
    throw new Error('work-request-teacher-authority-ambiguous')
  }
  const grant = grants[0]
  if (
    !isTeacherStudentGrant(grant) ||
    grant.studentId !== studentId ||
    grant.active !== true ||
    grant.revokedAt !== null
  ) {
    throw new Error('work-request-teacher-authority-invalid')
  }
  return grant
}

function studentRequestDto(request) {
  return Object.freeze({
    title: request.title,
    state: request.state,
    requestedAt: request.requestedAt,
    updatedAt: request.updatedAt,
    targetState: request.targetState,
  })
}

function sharedPendingRequestDto(request, rosterEntry) {
  return Object.freeze({
    title: request.title,
    displayNameOrNickname: rosterEntry.displayNameOrNickname,
  })
}

function teacherInternalRequestDto(request) {
  return Object.freeze({
    requestId: request.requestId,
    studentId: request.studentId,
    title: request.title,
    state: request.state,
    requestedAt: request.requestedAt,
    updatedAt: request.updatedAt,
    targetState: request.targetState,
    pieceAssignmentId: request.pieceAssignmentId,
  })
}

export function createStudentWorkRequestService({
  authorization,
  store,
  rosterStore = null,
  now,
  createRequestId,
} = {}) {
  assertDependency(authorization, 'resolvePrincipal', 'authorization')
  for (const method of [
    'getWorkRequest',
    'putWorkRequest',
    'listWorkRequestsForTeacher',
    'listActiveTeacherGrantsForStudent',
    'getPieceEvidence',
    'commitWorkRequestTransition',
  ]) {
    assertDependency(store, method, 'store')
  }
  if (typeof now !== 'function') throw new TypeError('now must be a function.')
  if (typeof createRequestId !== 'function') {
    throw new TypeError('createRequestId must be a function.')
  }

  async function requestWork({ providerSubject, title } = {}) {
    const principal = await authorization.resolvePrincipal(
      providerSubject,
      'STUDENT',
    )
    const studentId = normalizeRequiredId(principal.studentId, 'studentId')
    const grant = requireSingleActiveTeacherGrant(
      await store.listActiveTeacherGrantsForStudent(studentId),
      studentId,
    )
    const requestedAt = now()
    const request = createPendingStudentWorkRequest({
      requestId: createRequestId(),
      teacherId: grant.teacherId,
      studentId,
      title: normalizeRequiredText(title, 'title', MAX_TITLE_LENGTH),
      requestedAt,
    })
    const stored = await store.putWorkRequest(request)
    return studentRequestDto(stored)
  }

  async function listSharedPendingForStudent({ providerSubject } = {}) {
    assertDependency(
      rosterStore,
      'listTeacherStudentGrantsForTeacher',
      'rosterStore',
    )
    assertDependency(rosterStore, 'getRosterEntry', 'rosterStore')

    const principal = await authorization.resolvePrincipal(
      providerSubject,
      'STUDENT',
    )
    const studentId = normalizeRequiredId(principal.studentId, 'studentId')
    const currentGrant = requireSingleActiveTeacherGrant(
      await store.listActiveTeacherGrantsForStudent(studentId),
      studentId,
    )
    const teacherId = normalizeRequiredId(currentGrant.teacherId, 'teacherId')

    const [requests, cohortGrants] = await Promise.all([
      store.listWorkRequestsForTeacher(teacherId),
      rosterStore.listTeacherStudentGrantsForTeacher(teacherId),
    ])
    if (!Array.isArray(requests)) {
      throw new TypeError('work-request listing must return an array.')
    }
    if (!Array.isArray(cohortGrants)) {
      throw new TypeError('secure-delivery-roster-grant-list-invalid')
    }

    const activeStudentIds = new Set()
    const seenStudentIds = new Set()
    for (const grant of cohortGrants) {
      if (!isTeacherStudentGrant(grant) || grant.teacherId !== teacherId) {
        throw new Error('secure-delivery-roster-grant-mismatch')
      }
      if (seenStudentIds.has(grant.studentId)) {
        throw new Error('secure-delivery-roster-grant-duplicate')
      }
      seenStudentIds.add(grant.studentId)
      if (grant.active === true && grant.revokedAt === null) {
        activeStudentIds.add(grant.studentId)
      }
    }

    if (!activeStudentIds.has(studentId)) {
      throw new Error('secure-delivery-roster-current-student-missing')
    }

    const rows = []
    for (const request of requests) {
      if (request?.teacherId !== teacherId) {
        throw new Error('work-request-teacher-authority-invalid')
      }
      if (request.state !== STUDENT_WORK_REQUEST_STATE.PENDING) {
        continue
      }
      if (!activeStudentIds.has(request.studentId)) {
        throw new Error('secure-delivery-roster-requester-missing')
      }

      const rosterEntry = await rosterStore.getRosterEntry(request.studentId)
      if (
        !isStudentRosterEntry(rosterEntry) ||
        rosterEntry.studentId !== request.studentId ||
        rosterEntry.active !== true
      ) {
        throw new Error('secure-delivery-roster-entry-mismatch')
      }
      rows.push(sharedPendingRequestDto(request, rosterEntry))
    }

    return Object.freeze(rows)
  }

  async function listPendingForTeacher({ providerSubject } = {}) {
    const principal = await authorization.resolvePrincipal(
      providerSubject,
      'TEACHER',
    )
    const teacherId = normalizeRequiredId(principal.teacherId, 'teacherId')
    const rows = await store.listWorkRequestsForTeacher(teacherId)
    return Object.freeze(
      rows
        .filter((row) => row.state === STUDENT_WORK_REQUEST_STATE.PENDING)
        .map(teacherInternalRequestDto),
    )
  }

  async function getForTeacher({ providerSubject, requestId } = {}) {
    const principal = await authorization.resolvePrincipal(
      providerSubject,
      'TEACHER',
    )
    const teacherId = normalizeRequiredId(principal.teacherId, 'teacherId')
    const normalizedRequestId = normalizeRequiredId(requestId, 'requestId')
    const current = requireOwnedRequest(
      await store.getWorkRequest(normalizedRequestId),
      teacherId,
    )
    if (current.requestId !== normalizedRequestId) {
      throw new Error('work-request-not-found')
    }
    return teacherInternalRequestDto(current)
  }

  async function revokePending({ providerSubject, requestId } = {}) {
    const principal = await authorization.resolvePrincipal(
      providerSubject,
      'TEACHER',
    )
    const teacherId = normalizeRequiredId(principal.teacherId, 'teacherId')
    const current = requireOwnedRequest(
      await store.getWorkRequest(normalizeRequiredId(requestId, 'requestId')),
      teacherId,
    )
    const next = revokeStudentWorkRequest(current, { changedAt: now() })
    const stored = await store.commitWorkRequestTransition(current, next)
    return teacherInternalRequestDto(stored)
  }

  async function acknowledgeConversion({
    providerSubject,
    requestId,
    pieceAssignmentId,
    targetState,
  } = {}) {
    const principal = await authorization.resolvePrincipal(
      providerSubject,
      'TEACHER',
    )
    const teacherId = normalizeRequiredId(principal.teacherId, 'teacherId')
    const current = requireOwnedRequest(
      await store.getWorkRequest(normalizeRequiredId(requestId, 'requestId')),
      teacherId,
    )
    const normalizedPieceId = normalizeRequiredId(
      pieceAssignmentId,
      'pieceAssignmentId',
    )
    if (!Object.values(STUDENT_WORK_REQUEST_TARGET).includes(targetState)) {
      throw new TypeError('targetState must be ACTIVE or REPERTOIRE.')
    }

    if (
      current.state === STUDENT_WORK_REQUEST_STATE.CONVERTED &&
      current.pieceAssignmentId === normalizedPieceId &&
      current.targetState === targetState
    ) {
      return teacherInternalRequestDto(current)
    }

    const evidence = await store.getPieceEvidence(normalizedPieceId)
    if (evidence === null) throw new Error('work-request-piece-evidence-missing')
    if (
      evidence.piece.studentId !== current.studentId ||
      evidence.lifecycle.piece.pieceAssignmentId !== normalizedPieceId ||
      evidence.lifecycle.revokedAt !== null ||
      evidence.lifecycle.state !== targetState
    ) {
      throw new Error('work-request-piece-evidence-mismatch')
    }

    const next = convertStudentWorkRequest(current, {
      pieceAssignmentId: normalizedPieceId,
      targetState,
      changedAt: now(),
    })
    const stored = await store.commitWorkRequestTransition(current, next)
    return teacherInternalRequestDto(stored)
  }

  return Object.freeze({
    requestWork,
    listSharedPendingForStudent,
    listPendingForTeacher,
    getForTeacher,
    revokePending,
    acknowledgeConversion,
  })
}
