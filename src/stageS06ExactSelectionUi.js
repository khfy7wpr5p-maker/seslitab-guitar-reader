// S06 — exact visual note selection presentation/synchronization boundary.
//
// This module reads the existing authoritative Package 8 workspace only to bind
// its immutable source/revision identity to Package 3 selection state. It never
// parses revision IDs from DOM text, creates revision truth, edits notes, or
// adds renderer authority.

import {
  bindPackage3RevisionIdentity,
  clearPackage3RevisionIdentity,
  getPackage3MeasureSnapshot,
  subscribePackage3Measures,
} from '../package3MeasureBridge.js'
import { getTeacherUiWorkspace } from './package8TeacherUi.js'
import { getTeacherWorkspaceCurrentRevision } from './services/teacherWorkspaceModel.js'
import {
  isStageS06SelectionCurrent,
  stageS06SelectionMatchesRevision,
} from './services/stageS06SelectionIdentity.js'

const states = new WeakMap()

function inspectorStatus(root) {
  const status = root.getElementById?.('stage-s05-score-inspector-placeholder')
  if (!status) return null
  status.setAttribute?.('role', 'status')
  status.setAttribute?.('aria-live', 'polite')
  return status
}

function currentRevision(root) {
  const workspace = getTeacherUiWorkspace(root)
  if (!workspace) return null
  try {
    return getTeacherWorkspaceCurrentRevision(workspace)
  } catch {
    return null
  }
}

export function syncStageS06RevisionBinding(root = document) {
  const snapshot = getPackage3MeasureSnapshot()
  if (!Array.isArray(snapshot.notes)) return false

  const revision = currentRevision(root)
  if (!revision) {
    clearPackage3RevisionIdentity(snapshot.notes)
    return false
  }

  return bindPackage3RevisionIdentity({
    notes: snapshot.notes,
    sourceId: revision.sourceId,
    sourceRevisionId: revision.sourceRevisionId,
    revisionId: revision.revisionId,
    contentFingerprint: revision.contentFingerprint,
  })
}

export function renderStageS06SelectionStatus(root = document, snapshot = getPackage3MeasureSnapshot()) {
  const status = inspectorStatus(root)
  const inspector = root.getElementById?.('stage-s05-score-inspector')
  if (!status || !inspector) return false

  inspector.setAttribute?.('data-stage-s06-selection-gate', 'locked')
  status.dataset.stageS06SelectionState = 'idle'

  if (!snapshot?.selectedNoteIdentity || !Number.isSafeInteger(snapshot.selectedNoteIndex)) {
    status.textContent = 'Bir notayı seçtiğinizde exact canonical kimlik ve geçerli sürüm doğrulanır. Doğrulanmadan düzenleme açılmaz.'
    return true
  }

  const revision = currentRevision(root)
  if (!revision || !isStageS06SelectionCurrent(snapshot, { requireRevision: true })) {
    status.dataset.stageS06SelectionState = 'locked'
    status.textContent = 'Nota seçimi geçerli sürüm kimliğiyle kesin doğrulanamadı. Düzenleme açılmadı; notayı yeniden seçin.'
    return true
  }

  if (!stageS06SelectionMatchesRevision(snapshot, revision)) {
    status.dataset.stageS06SelectionState = 'locked'
    status.textContent = 'Seçili görsel nota current revision içindeki canonical olayla kesin eşleşmiyor. Düzenleme açılmadı.'
    return true
  }

  const ordinal = snapshot.selectedNoteIndex + 1
  inspector.setAttribute?.('data-stage-s06-selection-gate', 'verified')
  status.dataset.stageS06SelectionState = 'verified'
  status.textContent = `Nota ${ordinal} exact canonical kimlik ve geçerli immutable sürümle doğrulandı. Güvenli inceleme seçimi hazır.`
  return true
}

function installTeacherObserver(root, state) {
  if (state.observer) return true
  const teacherPanel = root.getElementById?.('tab-teacher')
  const Observer = root.defaultView?.MutationObserver ?? globalThis.MutationObserver
  if (!teacherPanel || typeof Observer !== 'function') return false

  state.observer = new Observer(() => {
    syncStageS06RevisionBinding(root)
    renderStageS06SelectionStatus(root)
  })
  state.observer.observe(teacherPanel, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['hidden'],
  })
  return true
}

export function applyStageS06ExactSelectionUi(root = document, { observe = true } = {}) {
  if (!root || typeof root.getElementById !== 'function') return false
  if (!root.getElementById('stage-s05-score-inspector')) return false

  let state = states.get(root)
  if (!state) {
    state = { observer: null, unsubscribe: null }
    states.set(root, state)
  }

  if (!state.unsubscribe) {
    state.unsubscribe = subscribePackage3Measures((snapshot) => {
      syncStageS06RevisionBinding(root)
      renderStageS06SelectionStatus(root, getPackage3MeasureSnapshot() ?? snapshot)
    })
  }
  if (observe) installTeacherObserver(root, state)

  syncStageS06RevisionBinding(root)
  renderStageS06SelectionStatus(root)
  root.getElementById('stage-s05-score-inspector')?.setAttribute('data-stage-s06-exact-selection', 'ready')
  return true
}

export function initStageS06ExactSelectionUi(root = document) {
  const init = () => applyStageS06ExactSelectionUi(root)
  if (root?.readyState === 'loading') {
    root.addEventListener?.('DOMContentLoaded', init, { once: true })
    return true
  }
  return init()
}
