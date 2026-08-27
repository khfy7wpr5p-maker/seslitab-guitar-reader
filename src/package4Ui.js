// Package 4F — accessible quality-gated Guitar TAB result panel.
//
// The UI consumes the exact NoteObject[] reference already published by the
// Package 3 Rhythmic HTML handoff. It never clones, reparses, or promotes note
// data. Only the Package 4E `rendered` state may expose generated TAB text.

import {
  getPackage3MeasureSnapshot,
  subscribePackage3Measures,
} from '../package3MeasureBridge.js'
import {
  buildQualityGatedBasicGuitarTab,
  GUITAR_TAB_CONSUMER_STATE,
} from './services/guitarTabConsumer.js'

export const GUITAR_TAB_UI_STATE = Object.freeze({
  EMPTY: 'empty',
  RENDERED: 'rendered',
  REVIEW_REQUIRED: 'review-required',
  BLOCKED: 'blocked',
  NOT_AVAILABLE: 'not-available',
  INVALID: 'invalid',
})

export const GUITAR_TAB_UI_MESSAGE = Object.freeze({
  EMPTY: 'Gitar TAB için nota verisi bulunamadı.',
  RENDERED: 'Kalite kontrolünden geçen temel gitar TAB hazır.',
  REVIEW_REQUIRED: 'Bu nota verisi inceleme gerektiriyor. Gitar TAB oluşturulmadı.',
  BLOCKED: 'Nota verisi kalite kontrolünden geçmedi. Gitar TAB oluşturulmadı.',
  NOT_AVAILABLE: 'Bu müzik temel tek sesli gitar TAB kapsamının dışında. Kısmi veya tahmini TAB üretilmedi.',
  INVALID: 'Gitar TAB güvenli biçimde oluşturulamadı. Tahmini çıktı gösterilmedi.',
})

const rootSubscriptions = new WeakMap()
const existingTabBindings = new WeakSet()

function freezeModel(state, status, text = '') {
  return Object.freeze({
    state,
    status,
    text,
    rendered: state === GUITAR_TAB_UI_STATE.RENDERED,
  })
}

export function buildGuitarTabUiModel(notes, adapters = {}) {
  if (!Array.isArray(notes) || notes.length === 0) {
    return freezeModel(
      GUITAR_TAB_UI_STATE.EMPTY,
      GUITAR_TAB_UI_MESSAGE.EMPTY,
    )
  }

  const buildConsumer = adapters.buildQualityGatedBasicGuitarTab
    ?? buildQualityGatedBasicGuitarTab

  let result
  try {
    result = buildConsumer(notes)
  } catch {
    return freezeModel(
      GUITAR_TAB_UI_STATE.INVALID,
      GUITAR_TAB_UI_MESSAGE.INVALID,
    )
  }

  if (
    result?.state === GUITAR_TAB_CONSUMER_STATE.RENDERED &&
    result.allowed === true &&
    result.definitive === true &&
    typeof result.text === 'string' &&
    result.text.trim().length > 0
  ) {
    return freezeModel(
      GUITAR_TAB_UI_STATE.RENDERED,
      GUITAR_TAB_UI_MESSAGE.RENDERED,
      result.text,
    )
  }

  if (result?.state === GUITAR_TAB_CONSUMER_STATE.REVIEW_REQUIRED) {
    return freezeModel(
      GUITAR_TAB_UI_STATE.REVIEW_REQUIRED,
      GUITAR_TAB_UI_MESSAGE.REVIEW_REQUIRED,
    )
  }

  if (result?.state === GUITAR_TAB_CONSUMER_STATE.BLOCKED) {
    return freezeModel(
      GUITAR_TAB_UI_STATE.BLOCKED,
      GUITAR_TAB_UI_MESSAGE.BLOCKED,
    )
  }

  if (result?.state === GUITAR_TAB_CONSUMER_STATE.NOT_AVAILABLE) {
    return freezeModel(
      GUITAR_TAB_UI_STATE.NOT_AVAILABLE,
      GUITAR_TAB_UI_MESSAGE.NOT_AVAILABLE,
    )
  }

  return freezeModel(
    GUITAR_TAB_UI_STATE.INVALID,
    GUITAR_TAB_UI_MESSAGE.INVALID,
  )
}

function setActiveTabState(root, activeName) {
  const buttons = root.querySelectorAll?.('.tab-btn') ?? []
  for (const button of buttons) {
    const active = button.dataset?.tab === activeName
    button.classList?.toggle?.('active', active)
    button.setAttribute?.('aria-selected', active ? 'true' : 'false')
  }
}

export function activateGuitarTabResultTab(root) {
  if (!root || typeof root.getElementById !== 'function') return false

  const panel = root.getElementById('tab-guitar-tab')
  if (!panel) return false

  setActiveTabState(root, 'guitar-tab')
  for (const id of ['tab-rhythmic', 'tab-html', 'tab-notes', 'tab-xml']) {
    const existingPanel = root.getElementById(id)
    if (existingPanel) existingPanel.hidden = true
  }
  panel.hidden = false
  return true
}

export function ensureGuitarTabPanel(root) {
  if (
    !root ||
    typeof root.getElementById !== 'function' ||
    typeof root.createElement !== 'function'
  ) {
    return null
  }

  const existing = root.getElementById('tab-guitar-tab')
  if (existing) return existing

  const tabList = root.querySelector?.('.result-tabs') ?? null
  const notesSummary = root.getElementById('notes-summary')
  const host = notesSummary?.parentElement ?? tabList?.parentElement ?? null
  if (!tabList || !host) return null

  const button = root.createElement('button')
  button.id = 'result-guitar-tab-btn'
  button.type = 'button'
  button.className = 'tab-btn'
  button.dataset.tab = 'guitar-tab'
  button.textContent = 'Gitar TAB'
  button.setAttribute('role', 'tab')
  button.setAttribute('aria-selected', 'false')
  button.setAttribute('aria-controls', 'tab-guitar-tab')
  button.addEventListener('click', () => activateGuitarTabResultTab(root))
  tabList.appendChild(button)

  const panel = root.createElement('div')
  panel.id = 'tab-guitar-tab'
  panel.className = 'tab-content guitar-tab-panel'
  panel.hidden = true
  panel.setAttribute('role', 'tabpanel')
  panel.setAttribute('aria-labelledby', 'result-guitar-tab-btn')

  const heading = root.createElement('h3')
  heading.id = 'guitar-tab-heading'
  heading.textContent = 'Temel Gitar TAB'

  const status = root.createElement('div')
  status.id = 'guitar-tab-status'
  status.className = 'rhythm-warning guitar-tab-status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')

  const output = root.createElement('pre')
  output.id = 'guitar-tab-output'
  output.className = 'rhythmic-text guitar-tab-output'
  output.hidden = true
  output.setAttribute('aria-label', 'Oluşturulan temel gitar TAB')
  output.setAttribute('tabindex', '0')

  panel.appendChild(heading)
  panel.appendChild(status)
  panel.appendChild(output)
  if (notesSummary && notesSummary.parentElement === host) host.insertBefore(panel, notesSummary)
  else host.appendChild(panel)

  if (!existingTabBindings.has(root)) {
    const buttons = root.querySelectorAll?.('.tab-btn') ?? []
    for (const existingButton of buttons) {
      if (existingButton === button) continue
      existingButton.addEventListener?.('click', () => {
        panel.hidden = true
        button.classList?.remove?.('active')
        button.setAttribute('aria-selected', 'false')
      })
    }
    existingTabBindings.add(root)
  }

  return panel
}

export function renderGuitarTabPanel(root, notes, adapters = {}) {
  const panel = ensureGuitarTabPanel(root)
  if (!panel) return null

  const output = root.getElementById('guitar-tab-output')
  const status = root.getElementById('guitar-tab-status')
  if (!output || !status) return null

  const model = buildGuitarTabUiModel(notes, adapters)
  output.textContent = model.rendered ? model.text : ''
  output.hidden = !model.rendered
  status.textContent = model.status
  panel.setAttribute('data-guitar-tab-state', model.state)
  return model
}

export function initPackage4Ui(root = document) {
  if (!ensureGuitarTabPanel(root)) return false

  const oldUnsubscribe = rootSubscriptions.get(root)
  if (oldUnsubscribe) oldUnsubscribe()

  const unsubscribe = subscribePackage3Measures((snapshot) => {
    renderGuitarTabPanel(root, snapshot?.notes ?? null)
  })
  rootSubscriptions.set(root, unsubscribe)

  // Render synchronously even if a caller initializes after notes were already
  // published. The exact published array reference is preserved.
  const current = getPackage3MeasureSnapshot()
  renderGuitarTabPanel(root, current.notes)
  return true
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    initPackage4Ui(document)
  })
}
