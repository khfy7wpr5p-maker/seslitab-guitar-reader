import {
  getTeacherWorkspaceApplicableApproval,
  getTeacherWorkspaceCurrentRevision,
} from './teacherWorkspaceModel.js'
import {
  STAGE_L_DELIVERY_STATE,
  STAGE_L_SHARE_READINESS_STATUS,
  evaluateStageLShareReadiness,
} from './stageLShareReadiness.js'
import {
  assertStrictInputObject,
  isStrictFrozenRecord,
  normalizeNullableTimestamp,
  normalizeRequiredId,
} from './teacherDeliveryContractValidation.js'

export const SCORE_ASSIGNMENT_SOURCE_SCHEMA_VERSION = 1
export const SCORE_ASSIGNMENT_SOURCE_KIND = 'score_exact_revision'

const INPUT_FIELDS = Object.freeze([
  'workspace',
  'sourceNotes',
  'studentId',
  'authorizationId',
  'rootQualityEvidenceId',
  'revalidationEvidenceId',
  'createdAt',
])

const RECORD_FIELDS = Object.freeze([
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
])

function nullableId(value, fieldName) {
  if (value === null) return null
  return normalizeRequiredId(value, fieldName)
}

export function createScoreAssignmentSourceBinding(input = {}) {
  assertStrictInputObject(input, INPUT_FIELDS, 'ScoreAssignmentSourceBinding')

  const studentId = normalizeRequiredId(input.studentId, 'studentId')
  const authorizationId = normalizeRequiredId(input.authorizationId, 'authorizationId')
  const rootQualityEvidenceId = normalizeRequiredId(
    input.rootQualityEvidenceId,
    'rootQualityEvidenceId',
  )
  const revalidationEvidenceId = normalizeRequiredId(
    input.revalidationEvidenceId,
    'revalidationEvidenceId',
  )
  const boundAt = normalizeNullableTimestamp(input.createdAt, 'createdAt')

  if (!Array.isArray(input.sourceNotes)) {
    throw new TypeError('sourceNotes must be the exact automatic source NoteObject array.')
  }

  const revision = getTeacherWorkspaceCurrentRevision(input.workspace)
  const approval = getTeacherWorkspaceApplicableApproval(input.workspace)
  if (!approval) {
    throw new Error('score-assignment-approval-required')
  }

  const readiness = evaluateStageLShareReadiness({
    workspace: input.workspace,
    sourceNotes: input.sourceNotes,
    recipientId: studentId,
    authorizationId,
    rootQualityEvidenceId,
    revalidationEvidenceId,
    createdAt: boundAt,
  })

  if (
    readiness.deliveryState !== STAGE_L_DELIVERY_STATE ||
    readiness.deliveryAllowed !== false
  ) {
    throw new Error('stage-l-delivery-boundary-changed')
  }

  if (
    readiness.status !== STAGE_L_SHARE_READINESS_STATUS.READY_EXACT_REVISION ||
    readiness.eligible !== true
  ) {
    throw new Error(
      `score-assignment-readiness-not-eligible:${readiness.status}:${readiness.package12Status ?? 'none'}`,
    )
  }

  if (
    readiness.revisionId !== revision.revisionId ||
    readiness.recipientId !== studentId
  ) {
    throw new Error('score-assignment-readiness-binding-mismatch')
  }

  return Object.freeze({
    schemaVersion: SCORE_ASSIGNMENT_SOURCE_SCHEMA_VERSION,
    sourceKind: SCORE_ASSIGNMENT_SOURCE_KIND,
    studentId,
    sourceId: revision.sourceId,
    sourceRevisionId: revision.sourceRevisionId,
    revisionId: revision.revisionId,
    revisionKind: revision.revisionKind,
    contentFingerprint: revision.contentFingerprint,
    lineageFingerprint: revision.lineageFingerprint,
    approvalId: approval.approvalId,
    authorizationId: readiness.authorizationId,
    qualityEvidenceId: readiness.qualityEvidenceId,
    revalidationEvidenceId: readiness.revalidationEvidenceId,
    readinessRoute: readiness.route,
    package12Status: readiness.package12Status,
    boundAt,
  })
}

export function isScoreAssignmentSourceBinding(value) {
  try {
    if (
      value?.schemaVersion !== SCORE_ASSIGNMENT_SOURCE_SCHEMA_VERSION ||
      value?.sourceKind !== SCORE_ASSIGNMENT_SOURCE_KIND ||
      !isStrictFrozenRecord(value, RECORD_FIELDS)
    ) {
      return false
    }

    for (const [fieldName, fieldValue] of [
      ['studentId', value.studentId],
      ['sourceId', value.sourceId],
      ['sourceRevisionId', value.sourceRevisionId],
      ['revisionId', value.revisionId],
      ['revisionKind', value.revisionKind],
      ['contentFingerprint', value.contentFingerprint],
      ['lineageFingerprint', value.lineageFingerprint],
      ['approvalId', value.approvalId],
      ['authorizationId', value.authorizationId],
      ['qualityEvidenceId', value.qualityEvidenceId],
      ['readinessRoute', value.readinessRoute],
      ['package12Status', value.package12Status],
    ]) {
      if (normalizeRequiredId(fieldValue, fieldName) !== fieldValue) return false
    }

    if (
      nullableId(value.revalidationEvidenceId, 'revalidationEvidenceId') !==
      value.revalidationEvidenceId
    ) {
      return false
    }

    if (
      normalizeNullableTimestamp(value.boundAt, 'boundAt') !==
      value.boundAt
    ) {
      return false
    }

    return true
  } catch {
    return false
  }
}
