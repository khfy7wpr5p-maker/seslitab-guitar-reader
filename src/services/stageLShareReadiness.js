// Stage L — bounded student/share readiness orchestration.
//
// This layer does not deliver content. It composes the already-reviewed
// Package 12 T1/T2/T3/T4 contracts for one exact current teacher revision and
// returns metadata only. No payload, MusicXML, link, token, URL, account,
// persistence, authentication or network delivery is created here.

import {
  TEACHER_REVISION_KIND,
} from './teacherRevisionModel.js'
import {
  getCurrentTeacherRevision,
} from './teacherRevisionHistory.js'
import {
  getTeacherWorkspaceApplicableApproval,
  isTeacherWorkspace,
} from './teacherWorkspaceModel.js'
import {
  createTeacherShareAuthorization,
} from './teacherShareAuthorization.js'
import {
  createTeacherShareQualityEvidence,
  evaluateTeacherShareEligibility,
} from './teacherShareEligibility.js'
import {
  createTeacherCorrectionRevalidationEvidence,
  evaluateTeacherCorrectedShareEligibility,
} from './teacherCorrectionRevalidation.js'
import {
  createTeacherStructuralCorrectionRevalidationEvidence,
  evaluateTeacherStructurallyCorrectedShareEligibility,
} from './teacherStructuralCorrectionRevalidation.js'

export const STAGE_L_SHARE_READINESS_STATUS = Object.freeze({
  READY_EXACT_REVISION: 'ready_exact_revision',
  APPROVAL_REQUIRED: 'approval_required',
  SOURCE_QUALITY_NOT_ELIGIBLE: 'source_quality_not_eligible',
  CORRECTED_REVALIDATION_NOT_ELIGIBLE: 'corrected_revalidation_not_eligible',
  UNSUPPORTED_REVISION: 'unsupported_revision',
})

export const STAGE_L_SHARE_READINESS_ROUTE = Object.freeze({
  PACKAGE_12_T2: 'package12_t2',
  PACKAGE_12_T3: 'package12_t3',
  PACKAGE_12_T4: 'package12_t4',
  NONE: 'none',
})

export const STAGE_L_DELIVERY_STATE = 'not_implemented'

function requiredString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${fieldName} must be a non-empty string.`)
  }
  return value.trim()
}

function nullableString(value, fieldName) {
  if (value === null || value === undefined) return null
  return requiredString(value, fieldName)
}

function buildResult({
  status,
  route = STAGE_L_SHARE_READINESS_ROUTE.NONE,
  revision,
  recipientId,
  package12Status = null,
  authorizationId = null,
  qualityEvidenceId = null,
  revalidationEvidenceId = null,
}) {
  return Object.freeze({
    status,
    eligible: status === STAGE_L_SHARE_READINESS_STATUS.READY_EXACT_REVISION,
    route,
    deliveryState: STAGE_L_DELIVERY_STATE,
    deliveryAllowed: false,
    sourceId: revision.sourceId,
    revisionId: revision.revisionId,
    recipientId,
    package12Status,
    authorizationId,
    qualityEvidenceId,
    revalidationEvidenceId,
  })
}

function automaticReadiness({
  workspace,
  revision,
  approval,
  recipientId,
  sourceNotes,
  authorization,
  rootQualityEvidence,
}) {
  const eligibility = evaluateTeacherShareEligibility({
    authorization,
    revision,
    approval,
    recipientId,
    sourceNotes,
    qualityEvidence: rootQualityEvidence,
  })

  return buildResult({
    status: eligibility.eligible
      ? STAGE_L_SHARE_READINESS_STATUS.READY_EXACT_REVISION
      : STAGE_L_SHARE_READINESS_STATUS.SOURCE_QUALITY_NOT_ELIGIBLE,
    route: STAGE_L_SHARE_READINESS_ROUTE.PACKAGE_12_T2,
    revision,
    recipientId,
    package12Status: eligibility.status,
    authorizationId: authorization.authorizationId,
    qualityEvidenceId: rootQualityEvidence.evidenceId,
  })
}

function correctedReadiness({
  workspace,
  revision,
  approval,
  recipientId,
  sourceNotes,
  authorization,
  rootQualityEvidence,
  revalidationEvidenceId,
  createdAt,
}) {
  try {
    const evidence = createTeacherCorrectionRevalidationEvidence({
      evidenceId: revalidationEvidenceId,
      history: workspace.history,
      sourceNotes,
      rootQualityEvidence,
      createdAt,
    })
    const eligibility = evaluateTeacherCorrectedShareEligibility({
      authorization,
      revision,
      approval,
      recipientId,
      history: workspace.history,
      sourceNotes,
      revalidationEvidence: evidence,
    })

    return buildResult({
      status: eligibility.eligible
        ? STAGE_L_SHARE_READINESS_STATUS.READY_EXACT_REVISION
        : STAGE_L_SHARE_READINESS_STATUS.CORRECTED_REVALIDATION_NOT_ELIGIBLE,
      route: STAGE_L_SHARE_READINESS_ROUTE.PACKAGE_12_T3,
      revision,
      recipientId,
      package12Status: eligibility.status,
      authorizationId: authorization.authorizationId,
      qualityEvidenceId: rootQualityEvidence.evidenceId,
      revalidationEvidenceId: evidence.evidenceId,
    })
  } catch {
    // T3 intentionally excludes structural/rhythmic/undo correction classes.
    // Only then do we attempt the already-reviewed broader T4 contract.
  }

  try {
    const evidence = createTeacherStructuralCorrectionRevalidationEvidence({
      evidenceId: revalidationEvidenceId,
      history: workspace.history,
      sourceNotes,
      rootQualityEvidence,
      createdAt,
    })
    const eligibility = evaluateTeacherStructurallyCorrectedShareEligibility({
      authorization,
      revision,
      approval,
      recipientId,
      history: workspace.history,
      sourceNotes,
      revalidationEvidence: evidence,
    })

    return buildResult({
      status: eligibility.eligible
        ? STAGE_L_SHARE_READINESS_STATUS.READY_EXACT_REVISION
        : STAGE_L_SHARE_READINESS_STATUS.CORRECTED_REVALIDATION_NOT_ELIGIBLE,
      route: STAGE_L_SHARE_READINESS_ROUTE.PACKAGE_12_T4,
      revision,
      recipientId,
      package12Status: eligibility.status,
      authorizationId: authorization.authorizationId,
      qualityEvidenceId: rootQualityEvidence.evidenceId,
      revalidationEvidenceId: evidence.evidenceId,
    })
  } catch {
    return buildResult({
      status: STAGE_L_SHARE_READINESS_STATUS.CORRECTED_REVALIDATION_NOT_ELIGIBLE,
      route: STAGE_L_SHARE_READINESS_ROUTE.NONE,
      revision,
      recipientId,
      authorizationId: authorization.authorizationId,
      qualityEvidenceId: rootQualityEvidence.evidenceId,
    })
  }
}

/**
 * Create explicit in-memory Package 12 authorization evidence and evaluate the
 * exact current revision against the existing share-quality contracts.
 *
 * Pressing the corresponding Stage L UI action is the explicit teacher intent
 * to authorize this caller-supplied recipient label for readiness evaluation.
 * The recipient label is not an authenticated account and a READY result is not
 * student delivery permission. Delivery remains deliberately unimplemented.
 */
export function evaluateStageLShareReadiness({
  workspace,
  sourceNotes,
  recipientId,
  authorizationId,
  rootQualityEvidenceId,
  revalidationEvidenceId,
  createdAt = null,
} = {}) {
  if (!isTeacherWorkspace(workspace)) {
    throw new TypeError('workspace must be a valid immutable teacher workspace.')
  }
  if (!Array.isArray(sourceNotes)) {
    throw new TypeError('sourceNotes must be the exact automatic source NoteObject array.')
  }

  const normalizedRecipientId = requiredString(recipientId, 'recipientId')
  const normalizedAuthorizationId = requiredString(authorizationId, 'authorizationId')
  const normalizedRootQualityEvidenceId = requiredString(
    rootQualityEvidenceId,
    'rootQualityEvidenceId',
  )
  const normalizedRevalidationEvidenceId = requiredString(
    revalidationEvidenceId,
    'revalidationEvidenceId',
  )
  const normalizedCreatedAt = nullableString(createdAt, 'createdAt')

  const revision = getCurrentTeacherRevision(workspace.history)
  const approval = getTeacherWorkspaceApplicableApproval(workspace)
  if (!approval) {
    return buildResult({
      status: STAGE_L_SHARE_READINESS_STATUS.APPROVAL_REQUIRED,
      revision,
      recipientId: normalizedRecipientId,
    })
  }

  const authorization = createTeacherShareAuthorization({
    authorizationId: normalizedAuthorizationId,
    issuerActorId: workspace.actorId,
    recipientId: normalizedRecipientId,
    revision,
    approval,
    createdAt: normalizedCreatedAt,
  })

  const root = workspace.history.revisions[0]
  let rootQualityEvidence
  try {
    rootQualityEvidence = createTeacherShareQualityEvidence({
      evidenceId: normalizedRootQualityEvidenceId,
      revision: root,
      sourceNotes,
      createdAt: normalizedCreatedAt,
    })
  } catch {
    return buildResult({
      status: STAGE_L_SHARE_READINESS_STATUS.SOURCE_QUALITY_NOT_ELIGIBLE,
      revision,
      recipientId: normalizedRecipientId,
      authorizationId: authorization.authorizationId,
    })
  }

  if (revision.revisionKind === TEACHER_REVISION_KIND.AUTOMATIC) {
    return automaticReadiness({
      workspace,
      revision,
      approval,
      recipientId: normalizedRecipientId,
      sourceNotes,
      authorization,
      rootQualityEvidence,
    })
  }

  if (revision.revisionKind === TEACHER_REVISION_KIND.TEACHER_CORRECTED) {
    return correctedReadiness({
      workspace,
      revision,
      approval,
      recipientId: normalizedRecipientId,
      sourceNotes,
      authorization,
      rootQualityEvidence,
      revalidationEvidenceId: normalizedRevalidationEvidenceId,
      createdAt: normalizedCreatedAt,
    })
  }

  return buildResult({
    status: STAGE_L_SHARE_READINESS_STATUS.UNSUPPORTED_REVISION,
    revision,
    recipientId: normalizedRecipientId,
    authorizationId: authorization.authorizationId,
    qualityEvidenceId: rootQualityEvidence.evidenceId,
  })
}
