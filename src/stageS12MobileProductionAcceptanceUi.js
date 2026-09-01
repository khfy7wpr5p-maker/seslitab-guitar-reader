// S12 production-acceptance addendum — mobile interaction and workspace orchestration only.
//
// Renderer hit-testing remains interaction identity, never musical authority.
// This layer adds touch/pointer delivery for real mobile browsers, keeps the
// exact ScoreNoteRef -> canonical resolver -> S06 selection chain, relocates
// existing primary playback controls beside the score without replacing their
// listeners, and focuses the score workspace after a newly rendered input.
// It does not alter OMR, quality policy, immutable revision authority, approval,
// instrument solvers, sharing, or Package 12 authorization.

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

const states = new WeakMap()
const MOBILE_EVENT_DEDUPE_MS = 450
const MOBILE_EVENT_DEDUPE_DISTANCE_PX = 3

function stateFor(root) {
  let state = states.get(root)
  if (!state) {
    state = {
      observer: null,
      boundFrame: null,
      boundDocument: null,
      pointerHandler: null,
      touchHandler: null,
      loadHandler: null,
      lastInteraction: null,
      lastFocusedMusicXml: null,
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

function duplicateMobileInteraction(state, point, now = Date.now()) {
  const previous = state.lastInteraction
  state.lastInteraction = { ...point, at: now }
  if (!previous) return false
  return (
    now - previous.at <= MOBILE_EVENT_DEDUPE_MS &&
    Math.abs(point.clientX - previous.clientX) <= MOBILE_EVENT_DEDUPE_DISTANCE_PX &&
    Math.abs(point.clientY - previous.clientY) <= MOBILE_EVENT_DEDUPE_DISTANCE_PX
  )
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
    if (state.pointerHandler) state.boundDocument.removeEventListener?.('pointerup', state.pointerHandler)
    if (state.touchHandler) state.boundDocument.removeEventListener?.('touchend', state.touchHandler)
  }
  if (state.boundFrame && state.loadHandler) {
    state.boundFrame.removeEventListener?.('load', state.loadHandler)
  }
  state.boundFrame = null
  state.boundDocument = null
  state.pointerHandler = null
  state.touchHandler = null
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
    if (!point || duplicateMobileInteraction(state, point)) return
    const runtime = runtimeForFrame(frame)
    if (!runtime) return
    selectStageS12ExactRenderedNote(root, runtime, point)
  }

  const pointerHandler = (event) => handle(event)
  const touchHandler = (event) => handle(event)
  frameDocument.addEventListener('pointerup', pointerHandler)
  frameDocument.addEventListener('touchend', touchHandler)

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

export function focusStageS12WorkspaceAfterRender(root = document) {
  if (!root || typeof root.getElementById !== 'function') return false
  const state = stateFor(root)
  const workspace = root.getElementById('stage-s05-score-workspace')
  const status = root.getElementById('score-view-status')
  const musicxml = currentMusicXml(root)

  if (!workspace || workspace.hidden !== false || !musicxml) {
    state.lastFocusedMusicXml = null
    return false
  }
  if (!status || !/^Görsel nota hazır\./.test(String(status.textContent || ''))) return false
  if (state.lastFocusedMusicXml === musicxml) return true

  workspace.setAttribute?.('tabindex', '-1')
  workspace.focus?.({ preventScroll: true })
  workspace.scrollIntoView?.({ block: 'start', inline: 'nearest' })
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
    focusStageS12WorkspaceAfterRender(root)
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
  focusStageS12WorkspaceAfterRender(root)
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
