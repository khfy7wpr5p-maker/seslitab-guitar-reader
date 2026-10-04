import {
  createPendingStudentWorkRequest,
  convertStudentWorkRequest,
  revokeStudentWorkRequest,
  STUDENT_WORK_REQUEST_STATE,
  STUDENT_WORK_REQUEST_TARGET,
} from '../../../src/services/studentWorkRequest.js'
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

function studentRequestDto(request) {
  return Object.freeze({
    title: request.title,
    state: request.state,
    requestedAt: request.requestedAt,
    updatedAt: request.updatedAt,
    targetState: request.targetState,
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
  })
}

export function createStudentWorkRequestService({
  authorization,
  store,
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
    const grants = await store.listActiveTeacherGrantsForStudent(studentId)
    if (!Array.isArray(grants) || grants.length !== 1) {
      throw new Error('work-request-teacher-authority-ambiguous')
    }
    const grant = grants[0]
    if (grant.studentId !== studentId || grant.active !== true || grant.revokedAt !== null) {
      throw new Error('work-request-teacher-authority-invalid')
    }
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
    listPendingForTeacher,
    revokePending,
    acknowledgeConversion,
  })
}
