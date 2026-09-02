// STI-07 / STI-17 — current-render exact Editor selection gate for desktop/mobile score taps.
//
// This gate is initialized before the legacy S12 mobile delivery layer. It owns
// the iframe WINDOW capture-phase score-selection decision and calls
// stopImmediatePropagation so older document-level S12/ScoreView handlers cannot
// become a second canonical authority. Failed pointer/touch attempts are not
// deduped, allowing Safari's later synthetic click to retry the same exact chain.

import {
  getPackage3MeasureSnapshot,
  selectPackage3ExactNote,
} from '../package3MeasureBridge.js'
import { getTeacherUiWorkspace } from './package8TeacherUi.js'
import { getTeacherWorkspaceCurrentRevision } from './services/teacherWorkspaceModel.js'
import { resolvePrDProductMusicXml } from './services/editorPrDRevisionMusicXmlRegistry.js'
import {
  hitTestScoreNoteDetailed,
  resolveStScoreRuntime,
} from './services/scoreRendererConsumer.js'
import {
  createEditorSelectionContext,
  resolveEditorCoreRuntime,
  selectDetailedRendererHitWithEditor,
} from './services/editorRendererSelectionBridge.js'

export const PR_B_INTERACTION_DIAGNOSTIC = Object.freeze({
  EVENT_NOT_RECEIVED: 'PRB_EVENT_NOT_RECEIVED',
  RUNTIME_UNAVAILABLE: 'PRB_RENDERER_RUNTIME_UNAVAILABLE',
  RENDERER_MISS: 'PRB_RENDERER_MISS',
  RENDERER_STALE: 'PRB_RENDERER_STALE',
  CANONICAL_MISS: 'PRB_CANONICAL_MISS',
  EDITOR_UI_STATE_FAILURE: 'PRB_EDITOR_UI_STATE_FAILURE',
  SELECTED: 'PRB_SELECTED',
})

const states = new WeakMap()
const runtimeLoads = new WeakMap()
const DEDUPE_MS = 450
const DEDUPE_PX = 3
const CAPTURE_OPTIONS = Object.freeze({ capture: true, passive: true })
const EDITOR_RUNTIME_SRC = '/st-score-editor-core-runtime/st-score-editor-core.runtime.js'
const BIND_RETRY_MS = 50
const BIND_RETRY_LIMIT = 200

function stateFor(root) {
  let state = states.get(root)
  if (!state) {
    state = {
      observer: null,
      boundFrame: null,
      boundDocument: null,
      boundWindow: null,
      pointerHandler: null,
      touchHandler: null,
      clickHandler: null,
      loadHandler: null,
      bindRetryTimer: null,
      bindRetryAttempts: 0,
      lastSuccess: null,
      inFlight: false,
      queuedRetry: null,
      editorContext: null,
      editorContextKey: null,
      editorContextMusicXml: null,
      editorContextPromise: null,
      eventCount: 0,
      rendererMissCount: 0,
      canonicalMissCount: 0,
      uiStateFailureCount: 0,
      selectedCount: 0,
      lastDiagnostic: PR_B_INTERACTION_DIAGNOSTIC.EVENT_NOT_RECEIVED,
    }
    states.set(root, state)
  }
  return state
}

function announce(root, diagnosticCode, text) {
  const status = root.getElementById?.('score-view-note-sync')
  if (status) {
    status.dataset.noteSynced = diagnosticCode === PR_B_INTERACTION_DIAGNOSTIC.SELECTED ? 'true' : 'false'
    status.dataset.prbSelectionDiagnostic = diagnosticCode
    status.textContent = text
  }
}

function pointFromEvent(event) {
  if (!event || typeof event !== 'object') return null
  const touch = event.changedTouches?.[0] ?? event.touches?.[0] ?? null
  const clientX = touch?.clientX ?? event.clientX
  const clientY = touch?.clientY ?? event.clientY
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null
  return Object.freeze({ clientX, clientY })
}

function duplicateSuccess(state, point, now = Date.now()) {
  const prior = state.lastSuccess
  return Boolean(
    prior &&
    now - prior.at <= DEDUPE_MS &&
    Math.abs(point.clientX - prior.clientX) <= DEDUPE_PX &&
    Math.abs(point.clientY - prior.clientY) <= DEDUPE_PX
  )
}

function samePoint(left, right) {
  return Boolean(left && right && Math.abs(left.clientX - right.clientX) <= DEDUPE_PX && Math.abs(left.clientY - right.clientY) <= DEDUPE_PX)
}

function blockedTapThroughTarget(target) {
  if (!target || typeof target.closest !== 'function') return false
  return Boolean(target.closest('button,input,select,textarea,a,[role="button"],[data-seslitab-selection-blocker="true"]'))
}

function frameDocument(frame) {
  try { return frame?.contentDocument ?? null } catch { return null }
}

function frameWindow(frame) {
  try { return frame?.contentWindow ?? null } catch { return null }
}

function frameRuntime(frame) {
  try { return resolveStScoreRuntime(frame?.contentWindow) } catch { return null }
}

function currentRevision(root) {
  const workspace = getTeacherUiWorkspace(root)
  if (!workspace) return null
  try { return getTeacherWorkspaceCurrentRevision(workspace) } catch { return null }
}

function sourceMusicXml(root) {
  const output = root?.getElementById?.('xml-output')
  const value = typeof output?.textContent === 'string' ? output.textContent : ''
  if (!value.trim() || value.startsWith('(TAB modunda')) return null
  return value
}

function currentMusicXml(root, revision) {
  if (!revision) return null
  const product = resolvePrDProductMusicXml(revision)
  if (product?.musicXml) return product.musicXml

  const workspace = getTeacherUiWorkspace(root)
  const rootRevision = workspace?.history?.revisions?.[0] ?? null
  if (rootRevision && revision.revisionId !== rootRevision.revisionId) {
    // A corrected/undo/redo revision must never silently project against the raw
    // source XML. Missing exact product XML is an intentional fail-closed state.
    return null
  }
  return sourceMusicXml(root)
}

function contextKey(snapshot, revision) {
  const identity = snapshot?.revisionIdentity
  if (!identity || !revision) return null
  if (
    identity.sourceId !== revision.sourceId ||
    identity.sourceRevisionId !== revision.sourceRevisionId ||
    identity.revisionId !== revision.revisionId ||
    identity.contentFingerprint !== revision.contentFingerprint
  ) return null
  return `${revision.sourceId}\u0000${revision.sourceRevisionId}\u0000${revision.revisionId}\u0000${revision.contentFingerprint}`
}

async function loadEditorRuntime(root) {
  const globalScope = root?.defaultView ?? globalThis
  const existing = resolveEditorCoreRuntime(globalScope)
  if (existing) return existing
  if (!root?.createElement) return null
  if (runtimeLoads.has(root)) return runtimeLoads.get(root)

  const promise = new Promise((resolve) => {
    const script = root.createElement('script')
    script.src = EDITOR_RUNTIME_SRC
    script.async = true
    script.setAttribute?.('data-seslitab-editor-runtime', 'true')
    script.addEventListener?.('load', () => resolve(resolveEditorCoreRuntime(globalScope)), { once: true })
    script.addEventListener?.('error', () => resolve(null), { once: true })
    const parent = root.head ?? root.body ?? root.documentElement
    if (!parent?.appendChild) resolve(null)
    else parent.appendChild(script)
  })
  runtimeLoads.set(root, promise)
  return promise
}

async function ensureEditorContext(root, state) {
  const snapshot = getPackage3MeasureSnapshot()
  const revision = currentRevision(root)
  const musicXml = currentMusicXml(root, revision)
  const key = contextKey(snapshot, revision)
  if (!key || !Array.isArray(snapshot?.selectionNotes) || !musicXml) return null
  if (state.editorContext && state.editorContextKey === key && state.editorContextMusicXml === musicXml) return state.editorContext
  if (state.editorContextPromise && state.editorContextKey === key && state.editorContextMusicXml === musicXml) return state.editorContextPromise

  state.editorContext = null
  state.editorContextKey = key
  state.editorContextMusicXml = musicXml
  const promise = (async () => {
    const editorRuntime = await loadEditorRuntime(root)
    if (!editorRuntime) return null
    try {
      const context = await createEditorSelectionContext({
        package3Snapshot: snapshot,
        teacherRevision: revision,
        editorRuntime,
        cryptoScope: root?.defaultView?.crypto ?? globalThis.crypto,
        musicXml,
        DOMParserCtor: root?.defaultView?.DOMParser ?? globalThis.DOMParser,
      })
      state.editorContext = context
      return context
    } catch {
      return null
    } finally {
      state.editorContextPromise = null
    }
  })()
  state.editorContextPromise = promise
  return promise
}

export async function selectStagePrBExactRenderedNote(root, rendererRuntime, point, state = stateFor(root)) {
  const normalizedPoint = pointFromEvent(point)
  if (!normalizedPoint || !rendererRuntime) {
    state.uiStateFailureCount += 1
    state.lastDiagnostic = PR_B_INTERACTION_DIAGNOSTIC.RUNTIME_UNAVAILABLE
    announce(root, state.lastDiagnostic, 'Nota seçimi hazır değil.')
    return false
  }

  const detailed = hitTestScoreNoteDetailed(rendererRuntime, normalizedPoint)
  if (detailed.kind !== 'HIT') {
    state.rendererMissCount += 1
    state.lastDiagnostic = detailed.kind === 'MISS'
      ? PR_B_INTERACTION_DIAGNOSTIC.RENDERER_MISS
      : PR_B_INTERACTION_DIAGNOSTIC.RENDERER_STALE
    announce(root, state.lastDiagnostic, 'Bu dokunuş için exact nota seçilemedi.')
    return false
  }

  const snapshot = getPackage3MeasureSnapshot()
  const revision = currentRevision(root)
  const editorRuntime = await loadEditorRuntime(root)
  const context = editorRuntime ? await ensureEditorContext(root, state) : null
  if (!revision || !editorRuntime || !context) {
    state.uiStateFailureCount += 1
    state.lastDiagnostic = PR_B_INTERACTION_DIAGNOSTIC.EDITOR_UI_STATE_FAILURE
    announce(root, state.lastDiagnostic, 'Nota düzenleme seçimi henüz hazır değil.')
    return false
  }

  const result = selectDetailedRendererHitWithEditor({
    context,
    package3Snapshot: snapshot,
    teacherRevision: revision,
    detailedHit: detailed,
    editorRuntime,
  })
  if (result.kind !== 'SELECTED') {
    if (result.diagnosticCode === 'EDITOR_CANONICAL_RESOLUTION_MISS') state.canonicalMissCount += 1
    else state.uiStateFailureCount += 1
    state.lastDiagnostic = result.diagnosticCode === 'EDITOR_CANONICAL_RESOLUTION_MISS'
      ? PR_B_INTERACTION_DIAGNOSTIC.CANONICAL_MISS
      : PR_B_INTERACTION_DIAGNOSTIC.EDITOR_UI_STATE_FAILURE
    announce(root, state.lastDiagnostic, 'Dokunulan nota current revision ile kesin eşlenemedi.')
    return false
  }

  // Editor selection is already canonical and revision-bound at this point.
  // Project measure + note atomically so no transient legacy/measure-only state
  // can redraw the keypad or be mistaken for a valid Editor selection.
  if (!selectPackage3ExactNote(result.resolved.noteIndex, {
    measureKey: result.resolved.measureKey,
    rendererTarget: result.rendererTarget,
    interaction: 'score-editor-current-hit',
  })) {
    state.uiStateFailureCount += 1
    state.lastDiagnostic = PR_B_INTERACTION_DIAGNOSTIC.EDITOR_UI_STATE_FAILURE
    announce(root, state.lastDiagnostic, 'Exact Editor seçimi ürün seçimine yansıtılamadı.')
    return false
  }

  state.editorContext = result.context
  state.selectedCount += 1
  state.lastDiagnostic = PR_B_INTERACTION_DIAGNOSTIC.SELECTED
  announce(root, state.lastDiagnostic, `Nota ${result.resolved.noteIndex + 1} seçildi.`)
  return true
}

async function runPoint(root, frame, state, point) {
  const rendererRuntime = frameRuntime(frame)
  const success = await selectStagePrBExactRenderedNote(root, rendererRuntime, point, state)
  if (success) state.lastSuccess = { ...point, at: Date.now() }
  return success
}

function clearBindRetry(state) {
  if (state.bindRetryTimer) clearTimeout(state.bindRetryTimer)
  state.bindRetryTimer = null
}

function detachEventBinding(state) {
  if (state.boundWindow) {
    if (state.pointerHandler) state.boundWindow.removeEventListener?.('pointerup', state.pointerHandler, true)
    if (state.touchHandler) state.boundWindow.removeEventListener?.('touchend', state.touchHandler, true)
    if (state.clickHandler) state.boundWindow.removeEventListener?.('click', state.clickHandler, true)
  }
  state.boundDocument = null
  state.boundWindow = null
  state.pointerHandler = null
  state.touchHandler = null
  state.clickHandler = null
  state.lastSuccess = null
  state.inFlight = false
  state.queuedRetry = null
}

function detachFrame(state) {
  detachEventBinding(state)
  clearBindRetry(state)
  if (state.boundFrame && state.loadHandler) state.boundFrame.removeEventListener?.('load', state.loadHandler)
  state.boundFrame = null
  state.loadHandler = null
  state.bindRetryAttempts = 0
}

function scheduleBindRetry(root, state) {
  if (state.bindRetryTimer || state.bindRetryAttempts >= BIND_RETRY_LIMIT) return false
  state.bindRetryAttempts += 1
  state.bindRetryTimer = setTimeout(() => {
    state.bindRetryTimer = null
    bindStagePrBEditorSelection(root)
  }, BIND_RETRY_MS)
  return true
}

export function bindStagePrBEditorSelection(root = document) {
  if (!root || typeof root.getElementById !== 'function') return false
  const frame = root.getElementById('score-view-runtime-frame')
  const state = stateFor(root)
  if (!frame) {
    if (state.boundFrame) detachFrame(state)
    return false
  }

  if (state.boundFrame !== frame) {
    detachFrame(state)
    state.boundFrame = frame
    state.loadHandler = () => {
      detachEventBinding(state)
      clearBindRetry(state)
      state.bindRetryAttempts = 0
      queueMicrotask(() => bindStagePrBEditorSelection(root))
    }
    frame.addEventListener?.('load', state.loadHandler)
  }

  const doc = frameDocument(frame)
  const win = frameWindow(frame)
  const runtime = frameRuntime(frame)
  if (!doc?.addEventListener || !win?.addEventListener || !runtime) {
    scheduleBindRetry(root, state)
    return false
  }

  if (state.boundDocument === doc && state.boundWindow === win) {
    clearBindRetry(state)
    state.bindRetryAttempts = 0
    return true
  }
  detachEventBinding(state)

  const handle = (event) => {
    if (event?.type === 'pointerup') {
      const pointerType = typeof event.pointerType === 'string' ? event.pointerType : ''
      if (pointerType && pointerType !== 'touch' && pointerType !== 'pen') return
    }
    if (blockedTapThroughTarget(event?.target)) return
    const point = pointFromEvent(event)
    if (!point || duplicateSuccess(state, point)) return

    // Window capture runs before document-level legacy S12/ScoreView handlers,
    // making PR-B the single product selection authority when the Editor keypad
    // is active. Failure remains fail-closed; legacy direct selection does not
    // get a chance to create a visually-selected-but-not-editable state.
    event.stopImmediatePropagation?.()
    state.eventCount += 1
    if (state.inFlight) {
      if (samePoint(state.queuedRetry, point) || samePoint(state.lastSuccess, point)) return
      state.queuedRetry = point
      return
    }

    state.inFlight = true
    void (async () => {
      try {
        const success = await runPoint(root, frame, state, point)
        if (!success && state.queuedRetry) {
          const retry = state.queuedRetry
          state.queuedRetry = null
          await runPoint(root, frame, state, retry)
        }
      } finally {
        state.inFlight = false
        state.queuedRetry = null
      }
    })()
  }

  const pointerHandler = (event) => handle(event)
  const touchHandler = (event) => handle(event)
  const clickHandler = (event) => handle(event)
  win.addEventListener('pointerup', pointerHandler, CAPTURE_OPTIONS)
  win.addEventListener('touchend', touchHandler, CAPTURE_OPTIONS)
  win.addEventListener('click', clickHandler, CAPTURE_OPTIONS)

  state.boundDocument = doc
  state.boundWindow = win
  state.pointerHandler = pointerHandler
  state.touchHandler = touchHandler
  state.clickHandler = clickHandler
  clearBindRetry(state)
  state.bindRetryAttempts = 0
  void ensureEditorContext(root, state)
  return true
}

export function getStagePrBInteractionDiagnostics(root = document) {
  const state = stateFor(root)
  return Object.freeze({
    eventCount: state.eventCount,
    rendererMissCount: state.rendererMissCount,
    canonicalMissCount: state.canonicalMissCount,
    uiStateFailureCount: state.uiStateFailureCount,
    selectedCount: state.selectedCount,
    lastDiagnostic: state.lastDiagnostic,
    eventDelivery: state.eventCount === 0 ? PR_B_INTERACTION_DIAGNOSTIC.EVENT_NOT_RECEIVED : 'PRB_EVENT_RECEIVED',
    boundToCurrentIframe: Boolean(state.boundFrame && state.boundDocument && state.boundWindow),
  })
}

function installObserver(root, state) {
  if (state.observer) return true
  const Observer = root.defaultView?.MutationObserver ?? globalThis.MutationObserver
  const workspace = root.getElementById?.('stage-s05-score-workspace')
  if (typeof Observer !== 'function' || !workspace) return false
  state.observer = new Observer(() => {
    bindStagePrBEditorSelection(root)
    void ensureEditorContext(root, state)
  })
  state.observer.observe(workspace, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] })
  return true
}

export function applyStagePrBEditorSelectionUi(root = document, { observe = true } = {}) {
  if (!root || typeof root.getElementById !== 'function') return false
  const state = stateFor(root)
  const bound = bindStagePrBEditorSelection(root)
  if (observe) installObserver(root, state)
  void ensureEditorContext(root, state)
  root.getElementById?.('stage-s05-score-workspace')?.setAttribute?.('data-prb-editor-selection', bound ? 'ready' : 'pending')
  return bound || Boolean(root.getElementById?.('stage-s05-score-workspace'))
}

export function initStagePrBEditorSelectionUi(root = document) {
  const init = () => applyStagePrBEditorSelectionUi(root)
  if (root?.readyState === 'loading') {
    root.addEventListener?.('DOMContentLoaded', init, { once: true })
    return true
  }
  return init()
}
