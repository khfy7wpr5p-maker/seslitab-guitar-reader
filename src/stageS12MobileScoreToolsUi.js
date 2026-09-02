// S12 — compact mobile note tools over the existing exact-selection chain.
//
// StageS12MobileProductionAcceptanceUi already owns real-mobile pointer/touch
// delivery and the renderer ScoreNoteRef -> canonical NoteObject resolution.
// This module deliberately does not hit-test or infer notes. It only projects an
// already-proven Package 3/S06 selection into the existing S07 correction UI.
// Package 8/Stage F remain immutable revision/revalidation authority.

import {
  getPackage3MeasureSnapshot,
  subscribePackage3Measures,
} from '../package3MeasureBridge.js'
import { STAGE_E_EDIT_FIELD } from './services/stageEVisualNoteEdit.js'

const TOOL_DEFS = Object.freeze([
  Object.freeze({ field: STAGE_E_EDIT_FIELD.PITCH, glyph: 'A', label: 'Nota harfini düzenle' }),
  Object.freeze({ field: STAGE_E_EDIT_FIELD.ACCIDENTAL, glyph: '♯', label: 'Arızayı düzenle' }),
  Object.freeze({ field: STAGE_E_EDIT_FIELD.OCTAVE, glyph: '8', label: 'Oktavı düzenle' }),
  Object.freeze({ field: STAGE_E_EDIT_FIELD.DURATION, glyph: '♩', label: 'Süreyi düzenle' }),
])

const states = new WeakMap()

function stateFor(root) {
  let state = states.get(root)
  if (!state) {
    state = {
      unsubscribe: null,
      lastSelectionIdentity: null,
    }
    states.set(root, state)
  }
  return state
}

function announce(root, message) {
  const local = root.getElementById?.('stage-s12-note-tools-status')
  if (local) local.textContent = message
  const globalLive = root.getElementById?.('aria-live-region')
  if (globalLive) globalLive.textContent = message
}

function integratedEditorKeypadActive(root) {
  const workspace = root.getElementById?.('stage-s05-score-workspace')
  return Boolean(
    workspace?.getAttribute?.('data-sti-prd-keypad-active') === 'true' ||
    workspace?.getAttribute?.('data-sti-prc-keypad-active') === 'true'
  )
}

function closeInspector(root, { returnFocus = false } = {}) {
  const inspector = root.getElementById?.('stage-s05-score-inspector')
  if (!inspector) return false
  inspector.setAttribute('data-stage-s12-tools-open', 'false')
  if (returnFocus) {
    root.getElementById?.('stage-s12-note-tools')
      ?.querySelector?.('button:not(:disabled)')
      ?.focus?.({ preventScroll: true })
  }
  return true
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
  close.addEventListener('click', () => closeInspector(root, { returnFocus: true }))
  inspector.insertBefore(close, inspector.firstChild ?? null)
  return close
}

function openField(root, field) {
  // PR-D/PR-C keypad is the current write surface. The old S12/S07 bottom sheet
  // must never re-open on top of it, otherwise two generations of editor UI are
  // visible at once even though only Editor Core owns new keypad writes.
  if (integratedEditorKeypadActive(root)) {
    closeInspector(root)
    announce(root, 'Nota düzenleme tuş takımını kullanın.')
    return false
  }

  const inspector = root.getElementById?.('stage-s05-score-inspector')
  const input = root.getElementById?.(`stage-s07-${field}`)
  if (!inspector || !input) {
    announce(root, 'Bu exact nota için seçilen düzenleme alanı kullanılamıyor.')
    return false
  }

  inspector.setAttribute('data-stage-s12-tools-open', 'true')
  input.focus?.({ preventScroll: true })
  announce(root, `${input.labels?.[0]?.textContent || 'Nota alanı'} düzenlemeye hazır.`)
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
    button.title = tool.label
    button.setAttribute('aria-label', tool.label)
    button.disabled = true
    button.addEventListener('click', () => openField(root, tool.field))
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

export function syncStageS12MobileScoreTools(root = document, snapshot = getPackage3MeasureSnapshot()) {
  const toolbar = ensureToolbar(root)
  const inspector = root.getElementById?.('stage-s05-score-inspector')
  if (!toolbar || !inspector) return false
  ensureCloseButton(root, inspector)

  const selected = Boolean(
    snapshot?.selectedNoteIdentity &&
    Number.isSafeInteger(snapshot?.selectedNoteIndex)
  )
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
    state.lastSelectionIdentity = null
    closeInspector(root)
    announce(root, 'Düzenlemek için görsel notaya dokunun.')
    return true
  }

  // When the integrated Editor keypad is mounted, S12 is legacy presentation
  // only. Keep its accessibility announcement, but never auto-open the old S07
  // bottom sheet over the score/keypad. This is intentionally independent of
  // quality/approval authority and does not remove any underlying history.
  if (integratedEditorKeypadActive(root)) {
    state.lastSelectionIdentity = snapshot.selectedNoteIdentity
    closeInspector(root)
    announce(root, 'Nota seçildi.')
    return true
  }

  if (snapshot.selectedNoteIdentity !== state.lastSelectionIdentity) {
    state.lastSelectionIdentity = snapshot.selectedNoteIdentity
    if (enabledCount > 0) {
      inspector.setAttribute('data-stage-s12-tools-open', 'true')
      announce(root, 'Exact nota seçildi. Nota araçları ve düzeltme paneli açıldı.')
    } else {
      closeInspector(root)
      announce(root, 'Nota seçildi; ancak current revision ile güvenli düzenleme alanı doğrulanamadı.')
    }
  }
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
      // S07 subscribed before this module. Defer one microtask so its exact
      // selected-note fields are rendered before tool enablement is projected.
      queueMicrotask(() => syncStageS12MobileScoreTools(root, snapshot))
    })
  }

  root.addEventListener?.('keydown', (event) => {
    if (event?.key !== 'Escape') return
    if (inspector.getAttribute?.('data-stage-s12-tools-open') !== 'true') return
    closeInspector(root, { returnFocus: true })
  }, { once: false })

  syncStageS12MobileScoreTools(root)
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
