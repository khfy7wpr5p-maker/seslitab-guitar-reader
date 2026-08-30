import { isTeacherWorkspace } from './teacherWorkspaceModel.js'
import { STAGE_F_CANONICALIZER_ACTOR_ID } from './stageFCanonicalization.js'

export const STAGE_F_LIFECYCLE_STATUS = Object.freeze({
  NO_WORKSPACE: 'no_workspace',
  SOURCE_EXACT: 'source_exact',
  CORRECTION_REVALIDATION_REQUIRED: 'correction_revalidation_required',
  STRUCTURAL_REVALIDATION_REQUIRED: 'structural_revalidation_required',
  CANONICALIZED_MATERIALIZATION_REQUIRED: 'canonicalized_materialization_required',
  UNSUPPORTED_HISTORY: 'unsupported_history',
})

const STAGE_E_FIELDS = new Set(['step', 'alter', 'octave', 'durationValue'])
const PITCH_FIELDS = new Set(['step', 'alter', 'octave'])

function currentResultEvent(history, revisionId) {
  const correction = history.correctionAuditEvents.find((event) => event.resultRevisionId === revisionId)
  if (correction) return { kind: 'correction', event: correction }
  const undo = history.undoAuditEvents.find((event) => event.resultRevisionId === revisionId)
  if (undo) return { kind: 'undo', event: undo }
  return null
}

function revisionTarget(history, revisionId) {
  const index = history.revisions.findIndex((revision) => revision.revisionId === revisionId)
  if (index < 0) return null
  const revision = history.revisions[index]
  return Object.freeze({
    revisionId: revision.revisionId,
    contentFingerprint: revision.contentFingerprint,
    revisionIndex: index,
  })
}

export function resolveStageFPreviousUndoTarget(workspace) {
  if (!isTeacherWorkspace(workspace)) return null
  const history = workspace.history
  const revisions = history.revisions
  const current = revisions.at(-1)
  if (!current || revisions.length < 2) return null

  const currentResult = currentResultEvent(history, current.revisionId)
  if (
    currentResult?.kind === 'correction' &&
    currentResult.event.actorId === STAGE_F_CANONICALIZER_ACTOR_ID
  ) {
    for (let index = history.correctionAuditEvents.length - 1; index >= 0; index--) {
      const event = history.correctionAuditEvents[index]
      if (event.actorId === STAGE_F_CANONICALIZER_ACTOR_ID) continue
      const target = revisionTarget(history, event.parentRevisionId)
      if (target && target.contentFingerprint !== current.contentFingerprint) return target
    }
  }

  for (let index = revisions.length - 2; index >= 0; index--) {
    const candidate = revisions[index]
    if (candidate.contentFingerprint !== current.contentFingerprint) {
      return Object.freeze({
        revisionId: candidate.revisionId,
        contentFingerprint: candidate.contentFingerprint,
        revisionIndex: index,
      })
    }
  }
  return null
}

export function assessStageFRevisionLifecycle(workspace) {
  if (!isTeacherWorkspace(workspace)) {
    return Object.freeze({
      status: STAGE_F_LIFECYCLE_STATUS.NO_WORKSPACE,
      canRerenderSource: false,
      undoTarget: null,
      reason: 'teacher-workspace-required',
    })
  }

  const history = workspace.history
  const root = history.revisions[0]
  const current = history.revisions.at(-1)
  const undoTarget = resolveStageFPreviousUndoTarget(workspace)

  if (current.contentFingerprint === root.contentFingerprint) {
    return Object.freeze({
      status: STAGE_F_LIFECYCLE_STATUS.SOURCE_EXACT,
      canRerenderSource: true,
      undoTarget,
      reason: history.revisions.length === 1 ? 'automatic-root-current' : 'exact-root-content-restored',
    })
  }

  const result = currentResultEvent(history, current.revisionId)
  if (!result) {
    return Object.freeze({
      status: STAGE_F_LIFECYCLE_STATUS.UNSUPPORTED_HISTORY,
      canRerenderSource: false,
      undoTarget,
      reason: 'current-transition-evidence-missing',
    })
  }

  if (result.kind === 'undo') {
    return Object.freeze({
      status: STAGE_F_LIFECYCLE_STATUS.STRUCTURAL_REVALIDATION_REQUIRED,
      canRerenderSource: false,
      undoTarget,
      reason: 'non-root-undo-needs-product-revalidation',
    })
  }

  if (result.event.actorId === STAGE_F_CANONICALIZER_ACTOR_ID) {
    return Object.freeze({
      status: STAGE_F_LIFECYCLE_STATUS.CANONICALIZED_MATERIALIZATION_REQUIRED,
      canRerenderSource: false,
      undoTarget,
      reason: 'canonicalized-revision-needs-corrected-musicxml',
    })
  }

  const fields = new Set()
  for (const operation of result.event.operations) {
    if (!Array.isArray(operation.path) || operation.path.length !== 2) {
      return Object.freeze({
        status: STAGE_F_LIFECYCLE_STATUS.UNSUPPORTED_HISTORY,
        canRerenderSource: false,
        undoTarget,
        reason: 'unsupported-correction-path',
      })
    }
    const field = operation.path[1]
    if (!STAGE_E_FIELDS.has(field)) {
      return Object.freeze({
        status: STAGE_F_LIFECYCLE_STATUS.UNSUPPORTED_HISTORY,
        canRerenderSource: false,
        undoTarget,
        reason: 'correction-outside-stage-e-scope',
      })
    }
    fields.add(field)
  }

  if (fields.has('durationValue')) {
    return Object.freeze({
      status: STAGE_F_LIFECYCLE_STATUS.STRUCTURAL_REVALIDATION_REQUIRED,
      canRerenderSource: false,
      undoTarget,
      reason: 'duration-needs-product-canonicalization-and-structural-revalidation',
    })
  }

  if ([...fields].every((field) => PITCH_FIELDS.has(field))) {
    return Object.freeze({
      status: STAGE_F_LIFECYCLE_STATUS.CORRECTION_REVALIDATION_REQUIRED,
      canRerenderSource: false,
      undoTarget,
      reason: 'pitch-correction-needs-product-canonicalization-and-corrected-musicxml',
    })
  }

  return Object.freeze({
    status: STAGE_F_LIFECYCLE_STATUS.UNSUPPORTED_HISTORY,
    canRerenderSource: false,
    undoTarget,
    reason: 'unsupported-stage-f-state',
  })
}
