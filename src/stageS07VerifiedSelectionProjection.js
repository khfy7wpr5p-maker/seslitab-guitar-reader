// S07 — verified corrected selection-projection coordinator.
//
// Source/quality consumers keep Package 3 `notes` unchanged. This coordinator
// watches only S07 score verification state. While a correction is pending or
// blocked it restores source selection. Once Stage F has completed
// canonicalization/materialization/revalidation/rerender and S07 marks the score
// verified, it binds the exact current immutable revision content as
// `selectionNotes`. No quality, product, parser, or renderer authority moves.

import {
  bindPackage3SelectionProjection,
  clearPackage3SelectionProjection,
  getPackage3MeasureSnapshot,
} from '../package3MeasureBridge.js'
import { getTeacherUiWorkspace } from './package8TeacherUi.js'
import { getTeacherWorkspaceCurrentRevision } from './services/teacherWorkspaceModel.js'

const states = new WeakMap()

function announceProjectionFailure(root) {
  const status = root.getElementById?.('stage-s07-inline-status')
  const message = 'Corrected skor doğrulandı ancak exact görsel seçim projection’ı güvenle bağlanamadı. Nota seçimi kilitli kaldı.'
  if (status) {
    status.textContent = message
    status.setAttribute?.('role', 'alert')
    status.setAttribute?.('aria-live', 'assertive')
  }
  const globalLive = root.getElementById?.('aria-live-region')
  if (globalLive) globalLive.textContent = message
}

export function syncStageS07VerifiedSelectionProjection(root = document) {
  if (!root || typeof root.getElementById !== 'function') return false
  const scoreWorkspace = root.getElementById('stage-s05-score-workspace')
  const snapshot = getPackage3MeasureSnapshot()
  if (!scoreWorkspace || !Array.isArray(snapshot.notes)) return false

  if (scoreWorkspace.getAttribute?.('data-stage-s07-score-state') !== 'verified') {
    clearPackage3SelectionProjection(snapshot.notes)
    return false
  }

  const workspace = getTeacherUiWorkspace(root)
  if (!workspace) {
    clearPackage3SelectionProjection(snapshot.notes)
    announceProjectionFailure(root)
    return false
  }

  let revision
  try {
    revision = getTeacherWorkspaceCurrentRevision(workspace)
  } catch {
    clearPackage3SelectionProjection(snapshot.notes)
    announceProjectionFailure(root)
    return false
  }

  if (!Array.isArray(revision.content)) {
    clearPackage3SelectionProjection(snapshot.notes)
    announceProjectionFailure(root)
    return false
  }

  const bound = bindPackage3SelectionProjection({
    notes: snapshot.notes,
    selectionNotes: revision.content,
    sourceId: revision.sourceId,
    sourceRevisionId: revision.sourceRevisionId,
    revisionId: revision.revisionId,
    contentFingerprint: revision.contentFingerprint,
  })
  if (!bound) announceProjectionFailure(root)
  return bound
}

export function applyStageS07VerifiedSelectionProjection(root = document) {
  if (!root || typeof root.getElementById !== 'function') return false
  const scoreWorkspace = root.getElementById('stage-s05-score-workspace')
  const Observer = root.defaultView?.MutationObserver ?? globalThis.MutationObserver
  if (!scoreWorkspace || typeof Observer !== 'function') return false

  let state = states.get(root)
  if (!state) {
    const observer = new Observer(() => { syncStageS07VerifiedSelectionProjection(root) })
    observer.observe(scoreWorkspace, {
      attributes: true,
      attributeFilter: ['data-stage-s07-score-state'],
    })
    state = { observer }
    states.set(root, state)
  }

  syncStageS07VerifiedSelectionProjection(root)
  scoreWorkspace.setAttribute('data-stage-s07-selection-projection', 'ready')
  return true
}

export function initStageS07VerifiedSelectionProjection(root = document) {
  const init = () => applyStageS07VerifiedSelectionProjection(root)
  if (root?.readyState === 'loading') {
    root.addEventListener?.('DOMContentLoaded', init, { once: true })
    return true
  }
  return init()
}
