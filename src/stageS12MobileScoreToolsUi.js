// S12 — mobile score tools + touch-selection acceptance repair.
//
// Presentation/interaction only. ST Score Rendering Layer is used only for
// bounded hit-test/highlight identity. Package 3/S06 remain exact selection
// authority; S07/Package 8/Stage F remain correction/revision/revalidation
// authority. No pitch/proximity guessing and no source mutation are introduced.

import {
  bindPackage3RevisionIdentity,
  getPackage3MeasureSnapshot,
  selectPackage3MeasureKey,
  selectPackage3NoteIndex,
  subscribePackage3Measures,
} from '../package3MeasureBridge.js'
import {
  hitTestScoreNote,
  resolveStScoreRuntime,
} from './services/scoreRendererConsumer.js'
import { resolveCanonicalNoteFromScoreRef } from './services/scoreNoteIdentity.js'
import { STAGE_E_EDIT_FIELD } from './services/stageEVisualNoteEdit.js'

const TOOL_DEFS = Object.freeze([
  Object.freeze({ field: STAGE_E_EDIT_FIELD.PITCH, glyph: 'A', label: 'Nota harfini düzenle' }),
  Object.freeze({ field: STAGE_E_EDIT_FIELD.ACCIDENTAL, glyph: '♯', label: 'Arızayı düzenle' }),
  Object.freeze({ field: STAGE_E_EDIT_FIELD.OCTAVE, glyph: '8', label: 'Oktavı düzenle' }),
  Object.freeze({ field: STAGE_E_EDIT_FIELD.DURATION, glyph: '♩', label: 'Süreyi düzenle' }),
])

const states = new WeakMap()
const boundFrames = new WeakSet()
const boundFrameDocuments = new WeakSet()

function stateFor(root) {
  let state = states.get(root)
  if (!state) {
    state = {
      unsubscribe: null,
      observer: null,
      lastSelectionIdentity: null,
      lastTouchSelectionAt: 0,
      lastWorkspaceVisible: false,
    }
    states.set(root, state)
  }
  return state
}

function selectionNotesFor(snapshot) {
  if (Array.isArray(snapshot?.selectionNotes)) return snapshot.selectionNotes
  return Array.isArray(snapshot?.notes) ? snapshot.notes : null
}

function live(root, message) {
  const status = root.getElementById?.('stage-s12-note-tools-status')
  if (status) status.textContent = message
  const globalLive = root.getElementById?.('aria-live-region')
  if (globalLive) globalLive.textContent = message
}

function ensureCloseButton(root, inspector) {
  let close = root.getElementById?.('stage-s12-note-tools-close')
  if (close) return close
  close = root.createElement('button')
  close.id = 'stage-s12-note-tools-close'
  close.type = 'button'
  close.className = 'stage-s12-note-tools-close'
  close.textContent = 'Kapat'
  close.setAttribute('aria-label', 'Nota düzenleme panelini kapat')
  close.addEventListener('click', () => {
    inspector.setAttribute('data-stage-s12-tools-open', 'false')
    root.getElementById?.('stage-s12-note-tools')?.querySelector?.('button:not(:disabled)')?.focus?.()
  })
  inspector.insertBefore(close, inspector.firstChild ?? null)
  return close
}

function focusToolField(root, field) {
  const inspector = root.getElementById?.('stage-s05-score-inspector')
  const input = root.getElementById?.(`stage-s07-${field}`)
  if (!inspector || !input) {
    live(root, 'Bu nota için seçilen düzenleme alanı güvenli şekilde kullanılamıyor.')
    return false
  }
  inspector.setAttribute('data-stage-s12-tools-open', 'true')
  input.focus?.({ preventScroll: true })
  if (root.defaultView?.innerWidth > 760) inspector.scrollIntoView?.({ block: 'nearest' })
  live(root, `${input.labels?.[0]?.textContent || 'Nota alanı'} düzenlemeye hazır.`)
  return true
}

function ensureToolbar(root) {
  let toolbar = root.getElementById?.('stage-s12-note-tools')
  if (toolbar) return toolbar
  const scoreColumn = root.getElementById?.('stage-s05-score-column')
  if (!scoreColumn || typeof root.createElement !== 'function') return null

  toolbar = root.createElement('div')
  toolbar.id = 'stage-s12-note-tools'
  toolbar.className = 'stage-s12-note-tools'
  toolbar.setAttribute('role', 'toolbar')
  toolbar.setAttribute('aria-label', 'Nota araçları')
  toolbar.setAttribute('data-stage-s12-note-tools', 'ready')
  toolbar.dataset.selected = 'false'

  for (const tool of TOOL_DEFS) {
    const button = root.createElement('button')
    button.type = 'button'
    button.className = 'stage-s12-note-tool'
    button.dataset.stageS12Field = tool.field
    button.textContent = tool.glyph
    button.setAttribute('aria-label', tool.label)
    button.title = tool.label
    button.disabled = true
    button.addEventListener('click', () => { focusToolField(root, tool.field) })
    toolbar.appendChild(button)
  }

  const status = root.createElement('span')
  status.id = 'stage-s12-note-tools-status'
  status.className = 'sr-only'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  toolbar.appendChild(status)
  scoreColumn.appendChild(toolbar)
  return toolbar
}

function syncToolbar(root, snapshot = getPackage3MeasureSnapshot()) {
  const toolbar = ensureToolbar(root)
  const inspector = root.getElementById?.('stage-s05-score-inspector')
  if (!toolbar || !inspector) return false
  ensureCloseButton(root, inspector)

  const selected = Boolean(snapshot?.selectedNoteIdentity && Number.isSafeInteger(snapshot?.selectedNoteIndex))
  toolbar.dataset.selected = selected ? 'true' : 'false'

  let enabledCount = 0
  for (const tool of TOOL_DEFS) {
    const button = toolbar.querySelector?.(`[data-stage-s12-field="${tool.field}"]`)
    const input = root.getElementById?.(`stage-s07-${tool.field}`)
    const enabled = selected && Boolean(input)
    if (button) button.disabled = !enabled
    if (enabled) enabledCount += 1
  }

  const state = stateFor(root)
  if (!selected) {
    inspector.setAttribute('data-stage-s12-tools-open', 'false')
    state.lastSelectionIdentity = null
    live(root, 'Düzenlemek için görsel notaya dokunun.')
    return true
  }

  if (snapshot.selectedNoteIdentity !== state.lastSelectionIdentity) {
    state.lastSelectionIdentity = snapshot.selectedNoteIdentity
    inspector.setAttribute('data-stage-s12-tools-open', 'true')
    live(root, enabledCount > 0
      ? 'Exact nota seçildi. Nota araçları ve güvenli düzeltme paneli açıldı.'
      : 'Nota seçildi; ancak current revision ile güvenli düzenleme alanı doğrulanamadı.')
  }
  return true
}

function selectFromPointer(root, runtime, event) {
  if (!runtime) return false
  const clientX = Number(event?.clientX)
  const clientY = Number(event?.clientY)
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false

  const rendererRef = hitTestScoreNote(runtime, { clientX, clientY })
  if (!rendererRef) return false
  const snapshot = getPackage3MeasureSnapshot()
  const notes = selectionNotesFor(snapshot)
  const resolved = notes ? resolveCanonicalNoteFromScoreRef(notes, rendererRef) : null
  if (!resolved) {
    live(root, 'Dokunulan görsel nota exact canonical nota ile eşlenemedi; seçim değiştirilmedi.')
    return false
  }
  if (!selectPackage3MeasureKey(resolved.measureKey)) return false
  if (!selectPackage3NoteIndex(resolved.noteIndex, {
    rendererTarget: rendererRef,
    interaction: 'score-pointerup',
  })) return false
  return true
}

function bindFrameDocument(root, frame) {
  let frameDocument
  try { frameDocument = frame?.contentDocument } catch { return false }
  if (!frameDocument?.addEventListener || boundFrameDocuments.has(frameDocument)) return Boolean(frameDocument)
  boundFrameDocuments.add(frameDocument)

  frameDocument.addEventListener('pointerup', (event) => {
    if (event?.isPrimary === false) return
    if (Number.isFinite(event?.button) && event.button !== 0) return
    if (event?.pointerType === 'mouse') return
    let runtime = null
    try { runtime = resolveStScoreRuntime(frame?.contentWindow) } catch {}
    if (!runtime) return
    if (selectFromPointer(root, runtime, event)) {
      stateFor(root).lastTouchSelectionAt = Date.now()
    }
  }, true)

  // The legacy score bridge owns normal mouse/click selection. After a
  // successful touch pointerup, suppress only the synthetic compatibility click
  // so the same exact note is not selected twice on iPhone/Safari.
  frameDocument.addEventListener('click', (event) => {
    if (Date.now() - stateFor(root).lastTouchSelectionAt > 900) return
    event.stopImmediatePropagation?.()
  }, true)
  return true
}

function bindRuntimeFrame(root, frame) {
  if (!frame) return false
  bindFrameDocument(root, frame)
  if (!boundFrames.has(frame)) {
    boundFrames.add(frame)
    frame.addEventListener?.('load', () => { bindFrameDocument(root, frame) })
  }
  return true
}

function installFrameObserver(root, state) {
  if (state.observer) return true
  const surface = root.getElementById?.('score-view-surface')
  const workspace = root.getElementById?.('stage-s05-score-workspace')
  const Observer = root.defaultView?.MutationObserver ?? globalThis.MutationObserver
  if (!surface || !workspace || typeof Observer !== 'function') return false

  state.lastWorkspaceVisible = workspace.hidden === false
  state.observer = new Observer(() => {
    const frame = root.getElementById?.('score-view-runtime-frame')
    if (frame) bindRuntimeFrame(root, frame)

    const visible = workspace.hidden === false
    if (visible && !state.lastWorkspaceVisible) {
      workspace.scrollIntoView?.({ block: 'start' })
      live(root, 'Nota çalışma alanı hazır. Görsel notaya dokunarak seçim yapabilirsiniz.')
    }
    state.lastWorkspaceVisible = visible
  })
  state.observer.observe(surface, { childList: true, subtree: false })
  state.observer.observe(workspace, { attributes: true, attributeFilter: ['hidden'] })
  return true
}

export function applyStageS12MobileScoreToolsUi(root = document) {
  if (!root || typeof root.getElementById !== 'function') return false
  const workspace = root.getElementById?.('stage-s05-score-workspace')
  const inspector = root.getElementById?.('stage-s05-score-inspector')
  if (!workspace || !inspector) return false

  ensureToolbar(root)
  ensureCloseButton(root, inspector)
  const state = stateFor(root)
  if (!state.unsubscribe) {
    state.unsubscribe = subscribePackage3Measures((snapshot) => {
      // S07 subscription was installed earlier; queue one microtask so its
      // exact-current-revision fields are present before enabling palette tools.
      queueMicrotask(() => { syncToolbar(root, snapshot) })
    })
  }
  installFrameObserver(root, state)
  bindRuntimeFrame(root, root.getElementById?.('score-view-runtime-frame'))
  syncToolbar(root)
  workspace.setAttribute('data-stage-s12-mobile-score-tools', 'ready')
  return true
}

export function initStageS12MobileScoreToolsUi(root = document) {
  const init = () => applyStageS12MobileScoreToolsUi(root)
  if (root?.readyState === 'loading') {
    root.addEventListener?.('DOMContentLoaded', init, { once: true })
    return true
  }
  return init()
}
