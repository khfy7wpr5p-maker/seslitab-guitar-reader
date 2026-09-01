// STI-02 — SesliTab <-> ST Score Editor Core authority reconciliation.
//
// This module is intentionally identity-only. It does not mutate NoteObject,
// Package 8 history, Stage F evidence, renderer state, OMR state or UI state.
// It proves that an Editor Core session may be initialized only from the exact
// current SesliTab revision projection and freezes the single-writer rule for
// the future keypad path.

import { isTeacherRevision } from './teacherRevisionModel.js'
import { createStageS06RevisionIdentity } from './stageS06SelectionIdentity.js'

export const EDITOR_CORE_INTEGRATION_AUTHORITY_VERSION = '1.0.0'
export const EDITOR_CORE_KEYPAD_WRITE_AUTHORITY = 'st-score-editor-core'
export const SESLITAB_PRODUCT_REVISION_AUDIT_AUTHORITY = 'seslitab-package-8'

export const EDITOR_CORE_AUTHORITY_PROFILE = Object.freeze({
  contractVersion: EDITOR_CORE_INTEGRATION_AUTHORITY_VERSION,
  keypadWriteAuthority: EDITOR_CORE_KEYPAD_WRITE_AUTHORITY,
  legacySesliTabKeypadMutationAuthority: false,
  rendererMutationAuthority: false,
  productRevisionAuditAuthority: SESLITAB_PRODUCT_REVISION_AUDIT_AUTHORITY,
  directEditorUndoProductAuthority: false,
  editorUndoBridgeEnabled: false,
})

function requiredText(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '' || value.trim() !== value) {
    throw new TypeError(`${fieldName} must be a non-empty trimmed string.`)
  }
  return value
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function samePlainValue(left, right) {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    for (let index = 0; index < left.length; index++) {
      if (!samePlainValue(left[index], right[index])) return false
    }
    return true
  }
  if (!isPlainObject(left) || !isPlainObject(right)) return false

  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  if (leftKeys.length !== rightKeys.length) return false
  for (let index = 0; index < leftKeys.length; index++) {
    if (leftKeys[index] !== rightKeys[index]) return false
    const key = leftKeys[index]
    if (!samePlainValue(left[key], right[key])) return false
  }
  return true
}

function sameProjectedContent(selectionNotes, revisionContent) {
  return Array.isArray(selectionNotes) &&
    Array.isArray(revisionContent) &&
    samePlainValue(selectionNotes, revisionContent)
}

export function createEditorCoreRevisionBinding({
  package3Snapshot,
  teacherRevision,
  editorDocumentId,
} = {}) {
  if (!package3Snapshot || typeof package3Snapshot !== 'object' || Array.isArray(package3Snapshot)) {
    throw new TypeError('package3Snapshot is required.')
  }
  if (!isTeacherRevision(teacherRevision)) {
    throw new TypeError('teacherRevision must be a valid immutable Package 8 revision.')
  }

  const revisionIdentity = createStageS06RevisionIdentity(package3Snapshot.revisionIdentity)
  if (!revisionIdentity) {
    throw new Error('Package 3 current revision identity is unavailable.')
  }
  for (const field of ['sourceId', 'sourceRevisionId', 'revisionId', 'contentFingerprint']) {
    if (revisionIdentity[field] !== teacherRevision[field]) {
      throw new Error(`Package 3 / Package 8 revision mismatch: ${field}.`)
    }
  }
  if (!sameProjectedContent(package3Snapshot.selectionNotes, teacherRevision.content)) {
    throw new Error('Package 3 selection projection does not match the exact current Package 8 revision content.')
  }

  return Object.freeze({
    contractVersion: EDITOR_CORE_INTEGRATION_AUTHORITY_VERSION,
    editorDocumentId: requiredText(editorDocumentId, 'editorDocumentId'),
    sourceId: teacherRevision.sourceId,
    sourceRevisionId: teacherRevision.sourceRevisionId,
    editorRevisionId: teacherRevision.revisionId,
    editorParentRevisionId: teacherRevision.parentRevisionId,
    contentFingerprint: teacherRevision.contentFingerprint,
    revisionKind: teacherRevision.revisionKind,
    projectedNoteCount: teacherRevision.content.length,
    keypadWriteAuthority: EDITOR_CORE_KEYPAD_WRITE_AUTHORITY,
    productRevisionAuditAuthority: SESLITAB_PRODUCT_REVISION_AUDIT_AUTHORITY,
    legacySesliTabKeypadMutationAuthority: false,
    editorUndoBridgeEnabled: false,
  })
}

export function assertEditorCoreSessionInitialization(binding, editorSession) {
  if (!binding || binding.contractVersion !== EDITOR_CORE_INTEGRATION_AUTHORITY_VERSION) {
    throw new TypeError('A current Editor Core revision binding is required.')
  }
  const score = editorSession?.history?.present?.score
  if (!score || typeof score !== 'object') {
    throw new TypeError('Editor Core session current score is required.')
  }
  if (score.id !== binding.editorDocumentId) {
    throw new Error('Editor Core document identity does not match SesliTab binding.')
  }
  if (score.revision?.id !== binding.editorRevisionId || score.revision?.parentId !== binding.editorParentRevisionId) {
    throw new Error('Editor Core revision identity does not match SesliTab binding.')
  }
  return true
}

export function auditEditorCoreUndoPolicy() {
  return EDITOR_CORE_AUTHORITY_PROFILE
}
