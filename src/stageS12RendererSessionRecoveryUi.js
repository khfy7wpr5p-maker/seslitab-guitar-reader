// S12 / STI-15 — renderer-only session recovery for real mobile Safari.
//
// This layer never reloads the page, never re-runs OMR, never mutates source
// MusicXML, and never changes musical/quality/revision authority. After PR-D it
// must also preserve the exact current immutable product revision: a corrected
// revision is recovered only from its revalidated product MusicXML record and
// never silently replaced with the source XML.

import {
  clearPackage3NoteSelection,
  getPackage3MeasureSnapshot,
} from '../package3MeasureBridge.js'
import { getTeacherUiWorkspace } from './package8TeacherUi.js'
import { getTeacherWorkspaceCurrentRevision } from './services/teacherWorkspaceModel.js'
import { resolvePrDProductMusicXml } from './services/editorPrDRevisionMusicXmlRegistry.js'
import {
  activateScoreView,
  syncScoreNoteHighlight,
} from './scoreViewUi.js'
import { bindStagePrBEditorSelection } from './stagePrBEditorSelectionUi.js'
import { syncStageS06RevisionBinding } from './stageS06ExactSelectionUi.js'
import { syncStageS07VerifiedSelectionProjection } from './stageS07VerifiedSelectionProjection.js'

const states = new WeakMap()
const STARTUP_FAILURE_RE = /^Görsel nota renderer başlatılamadı\./
const AUTO_RETRY_DELAY_MS = 350

function stateFor(root) {
  let state = states.get(root)
  if (!state) {
    state = {
      observer: null,
      retryTimer: null,
      retrying: false,
      autoRetryUsed: false,
      lastRecoveryKey: null,
      syncScheduled: false,
    }
    states.set(root, state)
  }
  return state
}

function sourceMusicXml(root) {
  const output = root.getElementById?.('xml-output')
  const value = typeof output?.textContent === 'string' ? output.textContent : ''
  if (!value.trim() || value.startsWith('(TAB modunda')) return null
  return value
}

function currentWorkspaceRevision(root) {
  const workspace = getTeacherUiWorkspace(root)
  if (!workspace) return Object.freeze({ workspace: null, revision: null, rootRevision: null })
  try {
    return Object.freeze({
      workspace,
      revision: getTeacherWorkspaceCurrentRevision(workspace),
      rootRevision: workspace.history?.revisions?.[0] ?? null,
    })
  } catch {
    return Object.freeze({ workspace, revision: null, rootRevision: null })
  }
}

/**
 * Resolve the only MusicXML that may be shown after renderer recovery.
 * Corrected/undo/redo product revisions require their exact PR-D registry
 * record. Source fallback is admitted only for the automatic root/no-workspace
 * flow, preserving the original S12 PDF/MusicXML recovery behavior.
 */
export function resolveStageS15RecoveryMusicXml(root = document) {
  const source = sourceMusicXml(root)
  const { workspace, revision, rootRevision } = currentWorkspaceRevision(root)

  if (!workspace || !revision) {
    return Object.freeze({
      ok: Boolean(source),
      musicXml: source,
      revisionId: null,
      provenance: source ? 'source-session-musicxml' : null,
      reason: source ? null : 'session-musicxml-unavailable',
      recoveryKey: source ? `source\u0000${source}` : 'source\u0000missing',
    })
  }

  const product = resolvePrDProductMusicXml(revision)
  if (product?.musicXml) {
    return Object.freeze({
      ok: true,
      musicXml: product.musicXml,
      revisionId: revision.revisionId,
      provenance: product.provenance,
      reason: null,
      recoveryKey: `product\u0000${revision.revisionId}\u0000${revision.contentFingerprint}`,
    })
  }

  const automaticRoot = Boolean(
    rootRevision &&
    revision === rootRevision &&
    revision.revisionId === rootRevision.revisionId
  )
  if (automaticRoot && source) {
    return Object.freeze({
      ok: true,
      musicXml: source,
      revisionId: revision.revisionId,
      provenance: 'automatic-root-source-session-musicxml',
      reason: null,
      recoveryKey: `root\u0000${revision.revisionId}\u0000${revision.contentFingerprint}`,
    })
  }

  return Object.freeze({
    ok: false,
    musicXml: null,
    revisionId: revision.revisionId,
    provenance: null,
    reason: 'current-product-revision-musicxml-unavailable',
    recoveryKey: `product\u0000${revision.revisionId}\u0000missing`,
  })
}

function snapshotResultTabs(root) {
  const buttons = [...(root.querySelectorAll?.('.result-tabs .tab-btn') ?? [])]
  const panels = []
  const seen = new Set()
  for (const button of buttons) {
    const panelId = button.getAttribute?.('aria-controls')
    const panel = panelId ? root.getElementById?.(panelId) : null
    if (panel && !seen.has(panel)) {
      seen.add(panel)
      panels.push({ panel, hidden: panel.hidden })
    }
  }
  return {
    buttons: buttons.map((button) => ({
      button,
      active: button.classList?.contains?.('active') === true,
      selected: button.getAttribute?.('aria-selected') ?? 'false',
    })),
    panels,
  }
}

function restoreResultTabs(snapshot) {
  for (const item of snapshot.buttons) {
    item.button.classList?.toggle?.('active', item.active)
    item.button.setAttribute?.('aria-selected', item.selected)
  }
  for (const item of snapshot.panels) item.panel.hidden = item.hidden
}

export function isStageS12RendererStartupFailure(text) {
  return STARTUP_FAILURE_RE.test(String(text || ''))
}

function ensureRetryButton(root) {
  let button = root.getElementById?.('stage-s12-renderer-retry-btn')
  if (button) return button

  const status = root.getElementById?.('score-view-status')
  const host = status?.parentElement
  if (!status || !host || typeof root.createElement !== 'function') return null

  button = root.createElement('button')
  button.id = 'stage-s12-renderer-retry-btn'
  button.type = 'button'
  button.className = 'btn btn-secondary stage-s12-renderer-retry-btn'
  button.textContent = 'Nota ekranını yeniden başlat'
  button.setAttribute('aria-label', 'Yüklenen dosyayı ve geçerli düzenlemeyi koruyarak yalnız nota ekranını yeniden başlat')
  button.hidden = true
  button.addEventListener('click', () => {
    void retryStageS12RendererSession(root, { automatic: false })
  })

  if (typeof status.insertAdjacentElement === 'function') status.insertAdjacentElement('afterend', button)
  else host.appendChild(button)
  return button
}

function announce(root, text) {
  const live = root.getElementById?.('aria-live-region')
  if (live) live.textContent = text
}

async function activateRecoveryMusicXml(root, musicXml) {
  const output = root.getElementById?.('xml-output')
  if (!output || typeof output.textContent !== 'string') return false
  const original = output.textContent
  try {
    output.textContent = musicXml
    return await activateScoreView(root)
  } finally {
    output.textContent = original
  }
}

async function restoreCurrentSelectionAfterRecovery(root) {
  bindStagePrBEditorSelection(root)
  syncStageS06RevisionBinding(root)
  syncStageS07VerifiedSelectionProjection(root)
  const snapshot = getPackage3MeasureSnapshot()
  if (!snapshot?.selectedNoteIdentity || !Number.isSafeInteger(snapshot.selectedNoteIndex)) return true
  const highlighted = await syncScoreNoteHighlight(root, snapshot)
  if (!highlighted) clearPackage3NoteSelection()
  return highlighted
}

export async function retryStageS12RendererSession(root = document, { automatic = false } = {}) {
  if (!root || typeof root.getElementById !== 'function') return false
  const state = stateFor(root)
  if (state.retrying) return false

  const recovery = resolveStageS15RecoveryMusicXml(root)
  const status = root.getElementById?.('score-view-status')
  const button = ensureRetryButton(root)
  if (!status || !button) return false
  if (!recovery.ok || !recovery.musicXml) {
    button.hidden = false
    button.disabled = true
    button.dataset.lastResult = 'blocked'
    announce(root, 'Nota ekranı yeniden başlatılmadı: geçerli düzenlenmiş sürümün exact MusicXML kanıtı bulunamadı.')
    return false
  }

  state.retrying = true
  button.disabled = true
  button.hidden = true
  status.textContent = automatic
    ? 'Nota ekranı otomatik olarak yeniden başlatılıyor…'
    : 'Nota ekranı yeniden başlatılıyor…'
  announce(root, 'Yüklenen dosya ve geçerli düzenleme korunuyor. Yalnız görsel nota ekranı yeniden başlatılıyor.')

  const tabs = snapshotResultTabs(root)
  try {
    const pending = activateRecoveryMusicXml(root, recovery.musicXml)
    // activateScoreView changes result-tab presentation synchronously before its
    // first await. Restore the user's current tab immediately; the score panel
    // is hosted by the S05 workspace outside the legacy result-tab system.
    restoreResultTabs(tabs)
    const restored = await pending
    if (restored) {
      await restoreCurrentSelectionAfterRecovery(root)
      button.hidden = true
      button.disabled = false
      button.dataset.lastResult = 'restored'
      button.dataset.recoveredRevisionId = recovery.revisionId ?? ''
      button.dataset.recoveryProvenance = recovery.provenance ?? ''
      announce(root, 'Nota ekranı yeniden başlatıldı. Yüklenen dosya ve geçerli çalışma korunmuştur.')
      return true
    }

    button.hidden = false
    button.disabled = false
    button.dataset.lastResult = 'failed'
    announce(root, 'Nota ekranı yeniden başlatılamadı. Yüklenen dosya ve geçerli çalışma korunuyor; yeniden deneyebilirsiniz.')
    return false
  } finally {
    restoreResultTabs(tabs)
    state.retrying = false
  }
}

function resetRetryForRecoveryKey(state, key) {
  if (key === state.lastRecoveryKey) return false
  state.lastRecoveryKey = key
  state.autoRetryUsed = false
  if (state.retryTimer) {
    clearTimeout(state.retryTimer)
    state.retryTimer = null
  }
  return true
}

export function syncStageS12RendererSessionRecovery(root = document) {
  if (!root || typeof root.getElementById !== 'function') return false
  const state = stateFor(root)
  const status = root.getElementById?.('score-view-status')
  const button = ensureRetryButton(root)
  if (!status || !button) return false
  if (state.retrying) return true

  const recovery = resolveStageS15RecoveryMusicXml(root)
  resetRetryForRecoveryKey(state, recovery.recoveryKey)

  const failed = isStageS12RendererStartupFailure(status.textContent)
  if (!failed) {
    button.hidden = true
    button.disabled = false
    return true
  }

  button.hidden = false
  if (!recovery.ok) {
    button.disabled = true
    button.dataset.lastResult = 'blocked'
    return true
  }
  button.disabled = false

  if (!state.autoRetryUsed && !state.retryTimer) {
    state.autoRetryUsed = true
    state.retryTimer = setTimeout(() => {
      state.retryTimer = null
      void retryStageS12RendererSession(root, { automatic: true })
    }, AUTO_RETRY_DELAY_MS)
  }
  return true
}

function scheduleSync(root, state) {
  if (state.retrying || state.syncScheduled) return false
  state.syncScheduled = true
  queueMicrotask(() => {
    state.syncScheduled = false
    if (!state.retrying) syncStageS12RendererSessionRecovery(root)
  })
  return true
}

function installObserver(root, state) {
  if (state.observer) return true
  const status = root.getElementById?.('score-view-status')
  const xml = root.getElementById?.('xml-output')
  const workspace = root.getElementById?.('stage-s05-score-workspace')
  const teacher = root.getElementById?.('tab-teacher')
  const Observer = root.defaultView?.MutationObserver ?? globalThis.MutationObserver
  if (!status || !xml || typeof Observer !== 'function') return false

  state.observer = new Observer(() => {
    scheduleSync(root, state)
  })
  state.observer.observe(status, { childList: true, characterData: true, subtree: true })
  state.observer.observe(xml, { childList: true, characterData: true, subtree: true })
  if (workspace) state.observer.observe(workspace, { attributes: true, attributeFilter: ['data-stage-s07-score-state'] })
  if (teacher) state.observer.observe(teacher, { childList: true, characterData: true, subtree: true })
  return true
}

export function applyStageS12RendererSessionRecoveryUi(root = document) {
  if (!root || typeof root.getElementById !== 'function') return false
  const state = stateFor(root)
  if (!ensureRetryButton(root)) return false
  installObserver(root, state)
  scheduleSync(root, state)
  return true
}

export function initStageS12RendererSessionRecoveryUi(root = document) {
  const init = () => applyStageS12RendererSessionRecoveryUi(root)
  if (root?.readyState === 'loading') {
    root.addEventListener?.('DOMContentLoaded', init, { once: true })
    return true
  }
  return init()
}
