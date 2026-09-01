// STI-07 — current-render exact Editor selection gate for desktop/mobile score taps.
//
// This gate is initialized before the legacy S12 mobile delivery layer. It owns
// the capture-phase score-selection decision and calls stopImmediatePropagation
// so the older bubble/capture selection handlers cannot become a second
// canonical authority. Failed pointer/touch attempts are not deduped, allowing
// Safari's later synthetic click to retry the same exact chain.

import {
  getPackage3MeasureSnapshot,
  selectPackage3MeasureKey,
  selectPackage3NoteIndex,
} from '../package3MeasureBridge.js'
import { getTeacherUiWorkspace } from './package8TeacherUi.js'
import { getTeacherWorkspaceCurrentRevision } from './services/teacherWorkspaceModel.js'
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

function stateFor(root) {
  let state = states.get(root)
  if (!state) {
    state = {
      observer: null,
      boundFrame: null,
      boundDocument: null,
      pointerHandler: null,
      touchHandler: null,
      clickHandler: null,
      loadHandler: null,
      lastSuccess: null,
      inFlight: false,
      queuedRetry: null,
      editorContext: null,
      editorContextKey: null,
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

function frameRuntime(frame) {
  try { return resolveStScoreRuntime(frame?.contentWindow) } catch { return null }
}

function currentRevision(root) {
  const workspace = getTeacherUiWorkspace(root)
  if (!workspace) return null
  try { return getTeacherWorkspaceCurrentRevision(workspace) } catch { return null }
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
  const key = contextKey(snapshot, revision)
  if (!key || !Array.isArray(snapshot?.selectionNotes)) return null
  if (state.editorContext && state.editorContextKey === key) return state.editorContext
  if (state.editorContextPromise && state.editorContextKey === key) return state.editorContextPromise

  state.editorContext = null
  state.editorContextKey = key
  const promise = (async () => {
    const editorRuntime = await loadEditorRuntime(root)
    if (!editorRuntime) return null
    try {
      const context = await createEditorSelectionContext({
        package3Snapshot: snapshot,
        teacherRevision: revision,
        editorRuntime,
        cryptoScope: root?.defaultView?.crypto ?? globalThis.crypto,
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
  // Only now may SesliTab project that proven result into its existing S06/S07
  // selection state. Existing highlight subscription therefore also runs only
  // after Editor Core selection succeeds.
  if (!selectPackage3MeasureKey(result.resolved.measureKey) || !selectPackage3NoteIndex(result.resolved.noteIndex, {
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

function detach(state) {
  if (state.boundDocument) {
    if (state.pointerHandler) state.boundDocument.removeEventListener?.('pointerup', state.pointerHandler, true)
    if (state.touchHandler) state.boundDocument.removeEventListener?.('touchend', state.touchHandler, true)
    if (state.clickHandler) state.boundDocument.removeEventListener?.('click', state.clickHandler, true)
  }
  if (state.boundFrame && state.loadHandler) state.boundFrame.removeEventListener?.('load', state.loadHandler)
  state.boundFrame = null
  state.boundDocument = null
  state.pointerHandler = null
  state.touchHandler = null
  state.clickHandler = null
  state.loadHandler = null
  state.lastSuccess = null
  state.inFlight = false
  state.queuedRetry = null
}

export function bindStagePrBEditorSelection(root = document) {
  if (!root || typeof root.getElementById !== 'function') return false
  const frame = root.getElementById('score-view-runtime-frame')
  const doc = frameDocument(frame)
  if (!frame || !doc?.addEventListener) return false

  const state = stateFor(root)
  if (state.boundFrame === frame && state.boundDocument === doc) return true
  detach(state)

  const handle = (event) => {
    if (event?.type === 'pointerup') {
      const pointerType = typeof event.pointerType === 'string' ? event.pointerType : ''
      if (pointerType && pointerType !== 'touch' && pointerType !== 'pen') return
    }
    if (blockedTapThroughTarget(event?.target)) return
    const point = pointFromEvent(event)
    if (!point || duplicateSuccess(state, point)) return

    // This capture gate intentionally prevents the old direct Package 3 click
    // path from running. A failed exact attempt is still retryable by a later
    // Safari synthetic click because only successful points enter lastSuccess.
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
  doc.addEventListener('pointerup', pointerHandler, CAPTURE_OPTIONS)
  doc.addEventListener('touchend', touchHandler, CAPTURE_OPTIONS)
  doc.addEventListener('click', clickHandler, CAPTURE_OPTIONS)

  const loadHandler = () => bindStagePrBEditorSelection(root)
  frame.addEventListener?.('load', loadHandler)
  state.boundFrame = frame
  state.boundDocument = doc
  state.pointerHandler = pointerHandler
  state.touchHandler = touchHandler
  state.clickHandler = clickHandler
  state.loadHandler = loadHandler
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
  root.getElementById?.('stage-s05-score-workspace')?.setAttribute?.('data-prb-editor-selection', 'ready')
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
