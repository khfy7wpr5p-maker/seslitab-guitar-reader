// S12 production-acceptance addendum — mobile interaction and workspace orchestration only.
//
// Renderer hit-testing remains interaction identity, never musical authority.
// This layer adds touch/pointer/click delivery for real mobile browsers, keeps
// the exact ScoreNoteRef -> canonical resolver -> S06 selection chain, relocates
// existing primary playback controls beside the score, hands the input slot to
// the score after a successful render, and focuses the score workspace without
// forcing an aggressive page jump. It does not alter OMR, quality policy,
// immutable revision authority, approval, instrument solvers, sharing, or
// Package 12 authorization.

import {
  getPackage3MeasureSnapshot,
  selectPackage3MeasureKey,
  selectPackage3NoteIndex,
} from '../package3MeasureBridge.js'
import {
  hitTestScoreNote,
  resolveStScoreRuntime,
} from './services/scoreRendererConsumer.js'
import { resolveCanonicalNoteFromScoreRef } from './services/scoreNoteIdentity.js'
import { activateScoreView } from './scoreViewUi.js'

const states = new WeakMap()
const MOBILE_EVENT_DEDUPE_MS = 450
const MOBILE_EVENT_DEDUPE_DISTANCE_PX = 3
const CAPTURE_LISTENER_OPTIONS = Object.freeze({ capture: true, passive: true })

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
      lastInteraction: null,
      lastFocusedMusicXml: null,
      recoveringScore: false,
    }
    states.set(root, state)
  }
  return state
}

function announceSelectionStatus(root, text) {
  const status = root.getElementById?.('score-view-note-sync')
  if (!status) return
  status.dataset.noteSynced = 'false'
  status.textContent = text
}

function selectionNotesFor(snapshot) {
  if (Array.isArray(snapshot?.selectionNotes)) return snapshot.selectionNotes
  return Array.isArray(snapshot?.notes) ? snapshot.notes : null
}

export function resolveStageS12InteractionPoint(event) {
  if (!event || typeof event !== 'object') return null
  const touch = event.changedTouches?.[0] ?? event.touches?.[0] ?? null
  const clientX = touch?.clientX ?? event.clientX
  const clientY = touch?.clientY ?? event.clientY
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null
  return Object.freeze({ clientX, clientY })
}

function duplicateSuccessfulInteraction(state, point, now = Date.now()) {
  const previous = state.lastInteraction
  if (!previous) return false
  return (
    now - previous.at <= MOBILE_EVENT_DEDUPE_MS &&
    Math.abs(point.clientX - previous.clientX) <= MOBILE_EVENT_DEDUPE_DISTANCE_PX &&
    Math.abs(point.clientY - previous.clientY) <= MOBILE_EVENT_DEDUPE_DISTANCE_PX
  )
}

function rememberSuccessfulInteraction(state, point, now = Date.now()) {
  state.lastInteraction = { ...point, at: now }
}

export function selectStageS12ExactRenderedNote(root, runtime, point) {
  if (!root || typeof root.getElementById !== 'function' || !runtime) return false
  const normalizedPoint = resolveStageS12InteractionPoint(point)
  if (!normalizedPoint) return false

  const rendererRef = hitTestScoreNote(runtime, normalizedPoint)
  if (!rendererRef) {
    announceSelectionStatus(root, 'Dokunulan konum için exact renderer nota kimliği bulunamadı; seçim değiştirilmedi.')
    return false
  }

  const snapshot = getPackage3MeasureSnapshot()
  const projectedNotes = selectionNotesFor(snapshot)
  const resolved = projectedNotes
    ? resolveCanonicalNoteFromScoreRef(projectedNotes, rendererRef)
    : null
  if (!resolved) {
    announceSelectionStatus(root, 'Dokunulan görsel nota canonical nota ile kesin eşlenemedi; seçim değiştirilmedi.')
    return false
  }

  if (!selectPackage3MeasureKey(resolved.measureKey)) return false
  if (!selectPackage3NoteIndex(resolved.noteIndex, {
    rendererTarget: rendererRef,
    interaction: 'score-mobile-hit-test',
  })) return false
  return true
}

function detachMobileBinding(state) {
  if (state.boundDocument) {
    if (state.pointerHandler) state.boundDocument.removeEventListener?.('pointerup', state.pointerHandler, true)
    if (state.touchHandler) state.boundDocument.removeEventListener?.('touchend', state.touchHandler, true)
    if (state.clickHandler) state.boundDocument.removeEventListener?.('click', state.clickHandler, true)
  }
  if (state.boundFrame && state.loadHandler) {
    state.boundFrame.removeEventListener?.('load', state.loadHandler)
  }
  state.boundFrame = null
  state.boundDocument = null
  state.pointerHandler = null
  state.touchHandler = null
  state.clickHandler = null
  state.loadHandler = null
  state.lastInteraction = null
}

function runtimeForFrame(frame) {
  try {
    return resolveStScoreRuntime(frame?.contentWindow)
  } catch {
    return null
  }
}

function documentForFrame(frame) {
  try {
    return frame?.contentDocument ?? null
  } catch {
    return null
  }
}

export function bindStageS12MobileScoreInteraction(root = document) {
  if (!root || typeof root.getElementById !== 'function') return false
  const frame = root.getElementById('score-view-runtime-frame')
  if (!frame) return false

  const state = stateFor(root)
  const frameDocument = documentForFrame(frame)
  if (!frameDocument?.addEventListener) return false
  if (state.boundFrame === frame && state.boundDocument === frameDocument) return true

  detachMobileBinding(state)

  const handle = (event) => {
    if (event?.type === 'pointerup') {
      const pointerType = typeof event.pointerType === 'string' ? event.pointerType : ''
      if (pointerType && pointerType !== 'touch' && pointerType !== 'pen') return
    }

    const point = resolveStageS12InteractionPoint(event)
    if (!point || duplicateSuccessfulInteraction(state, point)) return
    const runtime = runtimeForFrame(frame)
    if (!runtime) {
      announceSelectionStatus(root, 'Görsel nota etkileşim katmanı henüz hazır değil; seçim değiştirilmedi.')
      return
    }

    // Do not remember a failed pointer/touch attempt. iPhone Safari may emit a
    // later synthetic click for the same tap; that retry must remain available.
    if (selectStageS12ExactRenderedNote(root, runtime, point)) {
      rememberSuccessfulInteraction(state, point)
    }
  }

  const pointerHandler = (event) => handle(event)
  const touchHandler = (event) => handle(event)
  const clickHandler = (event) => handle(event)
  frameDocument.addEventListener('pointerup', pointerHandler, CAPTURE_LISTENER_OPTIONS)
  frameDocument.addEventListener('touchend', touchHandler, CAPTURE_LISTENER_OPTIONS)
  frameDocument.addEventListener('click', clickHandler, CAPTURE_LISTENER_OPTIONS)

  const loadHandler = () => {
    // A same-origin iframe navigation replaces its Document. Rebind only to the
    // new document; the exact runtime contract is still resolved at tap time.
    bindStageS12MobileScoreInteraction(root)
  }
  frame.addEventListener?.('load', loadHandler)

  state.boundFrame = frame
  state.boundDocument = frameDocument
  state.pointerHandler = pointerHandler
  state.touchHandler = touchHandler
  state.clickHandler = clickHandler
  state.loadHandler = loadHandler
  return true
}

export function moveStageS12PrimaryScoreActions(root = document) {
  if (!root || typeof root.getElementById !== 'function' || typeof root.createElement !== 'function') return false
  const scoreColumn = root.getElementById('stage-s05-score-column')
  const voiceSection = root.getElementById('voice-section')
  const rhythmSection = root.getElementById('rhythm-section')
  if (!scoreColumn || !voiceSection || !rhythmSection) return false

  let rail = root.getElementById('stage-s12-primary-score-actions')
  if (!rail) {
    rail = root.createElement('section')
    rail.id = 'stage-s12-primary-score-actions'
    rail.className = 'stage-s12-primary-score-actions'
    rail.setAttribute('aria-label', 'Nota çalışma alanı dinleme işlemleri')

    const instrumentProducts = root.getElementById('stage-i-instrument-products')
    if (instrumentProducts?.parentElement === scoreColumn && typeof scoreColumn.insertBefore === 'function') {
      scoreColumn.insertBefore(rail, instrumentProducts)
    } else {
      scoreColumn.appendChild(rail)
    }
  }

  if (voiceSection.parentElement !== rail) rail.appendChild(voiceSection)
  if (rhythmSection.parentElement !== rail) rail.appendChild(rhythmSection)
  voiceSection.setAttribute?.('data-stage-s12-near-score-action', 'true')
  rhythmSection.setAttribute?.('data-stage-s12-near-score-action', 'true')
  return true
}

function currentMusicXml(root) {
  const output = root.getElementById?.('xml-output')
  const value = typeof output?.textContent === 'string' ? output.textContent : ''
  if (!value.trim() || value.startsWith('(TAB modunda')) return null
  return value
}

function isScoreWorkspaceReady(root) {
  const workspace = root.getElementById?.('stage-s05-score-workspace')
  const status = root.getElementById?.('score-view-status')
  return Boolean(
    workspace &&
    workspace.hidden === false &&
    currentMusicXml(root) &&
    status &&
    (/^Görsel nota hazır\./.test(String(status.textContent || '')) || String(status.textContent || '') === 'Notaya dokunun.')
  )
}

export function syncStageS12InputSlot(root = document) {
  if (!root || typeof root.getElementById !== 'function') return false
  const input = root.getElementById('input-section')
  const workspace = root.getElementById('stage-s05-score-workspace')
  if (!input || !workspace) return false

  const ready = isScoreWorkspaceReady(root)
  input.hidden = ready
  input.setAttribute?.('data-stage-s12-slot-state', ready ? 'score-active' : 'input-active')
  workspace.setAttribute?.('data-stage-s12-slot-state', ready ? 'score-active' : 'input-active')
  return ready
}

function compactQualityStatus(root) {
  const status = root.getElementById?.('stage-s08-score-quality-status')
  const text = String(status?.textContent || '')
  const match = text.match(/^(\d+) engelli, (\d+) inceleme, (\d+) otomatik kontrolde sorun bulunmadı, (\d+) exact durumu bilinmiyor\./)
  if (!status || !match) return false

  const [, block, review, clear, unknown] = match
  const compact = [`⛔ ${block}`, `⚠ ${review}`, `✓ ${clear}`, `? ${unknown}`].join(' · ')
  status.setAttribute?.('aria-label', text)
  status.textContent = compact
  return true
}

function compactInspectorStatus(root) {
  const status = root.getElementById?.('stage-s07-inline-status')
  if (!status) return false
  const text = String(status.textContent || '')
  let compact = null

  if (text.startsWith('Düzeltmek için skor üzerindeki notayı seçin.')) compact = 'Notaya dokunun.'
  else if (text.startsWith('Eser hazır olduğunda güvenli öğretmen çalışma alanı otomatik hazırlanır.')) compact = 'Skor bekleniyor.'
  else {
    const selected = text.match(/^Nota (\d+) exact current revision ile doğrulandı\./)
    if (selected) compact = `Nota ${selected[1]} seçildi.`
  }

  if (!compact || compact === text) return false
  status.setAttribute?.('aria-label', text)
  status.textContent = compact
  return true
}

function compactActionLabels(root) {
  const undo = root.getElementById?.('stage-s07-undo-btn')
  if (undo && undo.textContent === 'Son değişikliği geri al') {
    undo.setAttribute?.('aria-label', undo.textContent)
    undo.textContent = 'Geri al'
  }

  const approve = root.getElementById?.('stage-s07-approve-btn')
  if (approve) {
    if (approve.textContent === 'Geçerli sürümü ayrıca onayla') {
      approve.setAttribute?.('aria-label', approve.textContent)
      approve.textContent = 'Sürümü onayla'
    } else if (approve.textContent === 'Geçerli sürüm ayrıca onaylandı') {
      approve.setAttribute?.('aria-label', approve.textContent)
      approve.textContent = 'Onaylandı'
    }
  }

  for (const button of root.querySelectorAll?.('.stage-s07-apply-field') ?? []) {
    const text = String(button.textContent || '')
    if (text.endsWith(' kaydet') && text !== 'Kaydet') {
      button.setAttribute?.('aria-label', text)
      button.textContent = 'Kaydet'
    }
  }
  return true
}

export function compactStageS12RoutineCopy(root = document) {
  if (!root || typeof root.getElementById !== 'function') return false

  const scoreStatus = root.getElementById?.('score-view-status')
  if (scoreStatus && /^Görsel nota hazır\./.test(String(scoreStatus.textContent || ''))) {
    scoreStatus.setAttribute?.('aria-label', scoreStatus.textContent)
    scoreStatus.textContent = 'Notaya dokunun.'
  }

  compactQualityStatus(root)
  compactInspectorStatus(root)
  compactActionLabels(root)
  return true
}

export async function recoverStageS12ScoreAfterCursorFailure(root = document) {
  if (!root || typeof root.getElementById !== 'function') return false
  const state = stateFor(root)
  if (state.recoveringScore) return false

  const workspace = root.getElementById('stage-s05-score-workspace')
  const cursorStatus = root.getElementById('score-view-measure-sync')
  const frame = root.getElementById('score-view-runtime-frame')
  const cursorFailed = /Görsel cursor uygulanamadı/i.test(String(cursorStatus?.textContent || ''))
  if (!workspace || workspace.hidden !== false || !currentMusicXml(root) || frame || !cursorStatus || !cursorFailed) return false

  state.recoveringScore = true
  try {
    // Cursor movement is presentation-only. If it fails, scoreViewUi currently
    // removes the renderer to avoid a stale cursor. Disable only that optional
    // cursor-sync status endpoint for this page session, then restore the exact
    // score. Note hit-test/highlight and all canonical authority remain intact.
    cursorStatus.id = 'score-view-measure-sync-disabled'
    cursorStatus.hidden = true
    cursorStatus.setAttribute?.('data-stage-s12-cursor-disabled', 'true')
    const restored = await activateScoreView(root)
    compactStageS12RoutineCopy(root)
    bindStageS12MobileScoreInteraction(root)
    return Boolean(restored)
  } finally {
    state.recoveringScore = false
  }
}

export function focusStageS12WorkspaceAfterRender(root = document) {
  if (!root || typeof root.getElementById !== 'function') return false
  const state = stateFor(root)
  const workspace = root.getElementById('stage-s05-score-workspace')
  const musicxml = currentMusicXml(root)

  if (!workspace || workspace.hidden !== false || !musicxml) {
    state.lastFocusedMusicXml = null
    return false
  }
  if (!isScoreWorkspaceReady(root)) return false
  if (state.lastFocusedMusicXml === musicxml) return true

  workspace.setAttribute?.('tabindex', '-1')
  workspace.focus?.({ preventScroll: true })
  // The input card is hidden first, so the workspace naturally takes its exact
  // top-page slot. `nearest` avoids the previous iPhone jump that placed the
  // score at an unexpected viewport origin while still landing out-of-view users.
  workspace.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  workspace.setAttribute?.('data-stage-s12-post-input-focus', 'true')
  state.lastFocusedMusicXml = musicxml
  return true
}

function installObserver(root, state) {
  if (state.observer) return true
  const Observer = root.defaultView?.MutationObserver ?? globalThis.MutationObserver
  if (typeof Observer !== 'function') return false

  const workspace = root.getElementById?.('stage-s05-score-workspace')
  const xml = root.getElementById?.('xml-output')
  if (!workspace || !xml) return false

  state.observer = new Observer(() => {
    moveStageS12PrimaryScoreActions(root)
    bindStageS12MobileScoreInteraction(root)
    compactStageS12RoutineCopy(root)
    syncStageS12InputSlot(root)
    focusStageS12WorkspaceAfterRender(root)
    void recoverStageS12ScoreAfterCursorFailure(root)
  })
  state.observer.observe(workspace, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['hidden'],
  })
  state.observer.observe(xml, { childList: true, characterData: true, subtree: true })
  return true
}

export function applyStageS12MobileProductionAcceptanceUi(root = document, { observe = true } = {}) {
  if (!root || typeof root.getElementById !== 'function') return false
  const state = stateFor(root)
  const moved = moveStageS12PrimaryScoreActions(root)
  bindStageS12MobileScoreInteraction(root)
  compactStageS12RoutineCopy(root)
  syncStageS12InputSlot(root)
  focusStageS12WorkspaceAfterRender(root)
  void recoverStageS12ScoreAfterCursorFailure(root)
  if (observe) installObserver(root, state)

  const workspace = root.getElementById?.('stage-s05-score-workspace')
  workspace?.setAttribute?.('data-stage-s12-mobile-acceptance', 'ready')
  return moved || Boolean(workspace)
}

export function initStageS12MobileProductionAcceptanceUi(root = document) {
  const init = () => applyStageS12MobileProductionAcceptanceUi(root)
  if (root?.readyState === 'loading') {
    root.addEventListener?.('DOMContentLoaded', init, { once: true })
    return true
  }
  return init()
}
