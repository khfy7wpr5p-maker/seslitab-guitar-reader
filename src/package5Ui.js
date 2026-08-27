// Package 5F — accessible quality-gated Basic Violin result panel.
//
// The UI consumes the exact NoteObject[] reference already published by the
// Package 3 measure bridge. It never clones, reparses, or promotes note data.
// Only the Package 5E `projected` state may expose generated basic fingering.

import {
  getPackage3MeasureSnapshot,
  subscribePackage3Measures,
} from '../package3MeasureBridge.js'
import {
  buildQualityGatedBasicViolin,
  VIOLIN_CONSUMER_STATE,
} from './services/violinConsumer.js'

export const VIOLIN_UI_STATE = Object.freeze({
  EMPTY: 'empty',
  RENDERED: 'rendered',
  REVIEW_REQUIRED: 'review-required',
  BLOCKED: 'blocked',
  NOT_AVAILABLE: 'not-available',
  INVALID: 'invalid',
})

export const VIOLIN_UI_MESSAGE = Object.freeze({
  EMPTY: 'Temel keman pozisyonu için nota verisi bulunamadı.',
  RENDERED: 'Kalite kontrolünden geçen temel keman tel ve parmak önerisi hazır.',
  REVIEW_REQUIRED: 'Bu nota verisi inceleme gerektiriyor. Keman tel veya parmak seçimi gösterilmedi.',
  BLOCKED: 'Nota verisi kalite kontrolünden geçmedi. Keman tel veya parmak seçimi gösterilmedi.',
  NOT_AVAILABLE: 'Bu müzik temel birinci pozisyon keman kapsamının dışında. Kısmi veya tahmini seçim gösterilmedi.',
  INVALID: 'Temel keman pozisyonu güvenli biçimde oluşturulamadı. Tahmini seçim gösterilmedi.',
})

const rootSubscriptions = new WeakMap()
const existingTabBindings = new WeakSet()

const STRING_LABEL = Object.freeze({
  1: 'Birinci tel',
  2: 'İkinci tel',
  3: 'Üçüncü tel',
  4: 'Dördüncü tel',
})

const STRING_NAME = Object.freeze({
  1: 'E',
  2: 'A',
  3: 'D',
  4: 'G',
})

const STRING_OPEN_MIDI = Object.freeze({
  1: 76,
  2: 69,
  3: 62,
  4: 55,
})

const FINGER_LABEL = Object.freeze({
  0: 'açık tel',
  1: 'birinci parmak',
  2: 'ikinci parmak',
  3: 'üçüncü parmak',
  4: 'dördüncü parmak',
})

const FINGER_BY_SEMITONE_OFFSET = Object.freeze([
  0,
  1, 1,
  2, 2,
  3, 3,
  4,
])

const BASIC_VIOLIN_POLICY_ID = 'first-position-semitone-zone-v1'
const BASIC_VIOLIN_PROVENANCE = 'generated-basic-first-position-fingering'

function freezeModel(state, status, text = '') {
  return Object.freeze({
    state,
    status,
    text,
    rendered: state === VIOLIN_UI_STATE.RENDERED,
  })
}

function validIndex(value) {
  return Number.isInteger(value) && value >= 0
}

function hasConsistentGeneratedFingering(event) {
  const fingering = event?.fingering
  if (!fingering || typeof fingering !== 'object') return false

  const stringNumber = fingering.stringNumber
  const semitoneOffset = fingering.semitoneOffset
  const expectedOpenMidi = STRING_OPEN_MIDI[stringNumber]

  if (
    !Number.isInteger(stringNumber) ||
    !STRING_LABEL[stringNumber] ||
    fingering.stringName !== STRING_NAME[stringNumber] ||
    fingering.position !== 'first' ||
    fingering.policyId !== BASIC_VIOLIN_POLICY_ID ||
    event.policyId !== BASIC_VIOLIN_POLICY_ID ||
    fingering.provenance !== BASIC_VIOLIN_PROVENANCE ||
    event.provenance !== BASIC_VIOLIN_PROVENANCE ||
    fingering.teacherApproved !== false ||
    event.teacherApproved !== false ||
    !Number.isInteger(expectedOpenMidi) ||
    fingering.openMidi !== expectedOpenMidi ||
    !Number.isInteger(semitoneOffset) ||
    semitoneOffset < 0 ||
    semitoneOffset >= FINGER_BY_SEMITONE_OFFSET.length ||
    !Number.isInteger(fingering.fingerNumber) ||
    fingering.fingerNumber !== FINGER_BY_SEMITONE_OFFSET[semitoneOffset] ||
    !FINGER_LABEL[fingering.fingerNumber] ||
    !Number.isInteger(fingering.writtenMidi) ||
    fingering.writtenMidi !== expectedOpenMidi + semitoneOffset
  ) {
    return false
  }

  if (
    Number.isInteger(event.note?.midi) &&
    event.note.midi !== fingering.writtenMidi
  ) {
    return false
  }

  return true
}

function formatEvent(event, measureKey) {
  if (!event || typeof event !== 'object' || event.measureKey !== measureKey) {
    return null
  }

  if (event.isRest === true) {
    return event.fingering === null ? 'sus' : null
  }

  if (!hasConsistentGeneratedFingering(event)) return null

  const fingering = event.fingering
  const position = `${STRING_LABEL[fingering.stringNumber]}, ${FINGER_LABEL[fingering.fingerNumber]}`
  const noteName = typeof event.note?.noteName === 'string'
    ? event.note.noteName.trim()
    : ''

  return noteName ? `${noteName} notası: ${position}` : position
}

/**
 * Convert only a finalized Package 5C projection into deterministic plain text.
 * Physical measure identity is kept in every line so duplicate displayed
 * measure numbers are never collapsed in the accessible output.
 */
export function formatBasicViolinProjectionForUi(projection) {
  if (
    !projection ||
    typeof projection !== 'object' ||
    projection.state !== 'projected' ||
    projection.teacherApproved !== false ||
    projection.provenance !== BASIC_VIOLIN_PROVENANCE ||
    projection.policyId !== BASIC_VIOLIN_POLICY_ID ||
    !Array.isArray(projection.measures) ||
    !validIndex(projection.measureCount) ||
    projection.measureCount !== projection.measures.length ||
    !validIndex(projection.noteCount) ||
    projection.noteCount < 1
  ) {
    return null
  }

  const lines = []
  const observedNoteIndexes = new Set()

  for (const measure of projection.measures) {
    if (
      !measure ||
      typeof measure !== 'object' ||
      typeof measure.measureKey !== 'string' ||
      measure.measureKey.trim() === '' ||
      !validIndex(measure.measureIndex) ||
      !Array.isArray(measure.events) ||
      measure.events.length === 0
    ) {
      return null
    }

    const eventText = []
    for (const event of measure.events) {
      if (
        !validIndex(event?.noteIndex) ||
        event.noteIndex >= projection.noteCount ||
        observedNoteIndexes.has(event.noteIndex)
      ) {
        return null
      }

      const text = formatEvent(event, measure.measureKey)
      if (!text) return null
      observedNoteIndexes.add(event.noteIndex)
      eventText.push(text)
    }

    const visibleNumber = measure.measureNumber === null || measure.measureNumber === undefined
      ? String(measure.measureIndex + 1)
      : String(measure.measureNumber)

    lines.push(
      `Ölçü ${visibleNumber}; fiziksel kimlik ${measure.measureKey}. ${eventText.join('; ')}.`,
    )
  }

  if (observedNoteIndexes.size !== projection.noteCount) return null
  for (let noteIndex = 0; noteIndex < projection.noteCount; noteIndex += 1) {
    if (!observedNoteIndexes.has(noteIndex)) return null
  }

  return lines.join('\n')
}

export function buildViolinUiModel(notes, adapters = {}) {
  if (!Array.isArray(notes) || notes.length === 0) {
    return freezeModel(VIOLIN_UI_STATE.EMPTY, VIOLIN_UI_MESSAGE.EMPTY)
  }

  const buildConsumer = adapters.buildQualityGatedBasicViolin
    ?? buildQualityGatedBasicViolin

  let result
  try {
    result = buildConsumer(notes)
  } catch {
    return freezeModel(VIOLIN_UI_STATE.INVALID, VIOLIN_UI_MESSAGE.INVALID)
  }

  if (
    result?.state === VIOLIN_CONSUMER_STATE.PROJECTED &&
    result.allowed === true &&
    result.definitive === true &&
    result.teacherApproved === false
  ) {
    const text = formatBasicViolinProjectionForUi(result.projection)
    if (text) {
      return freezeModel(VIOLIN_UI_STATE.RENDERED, VIOLIN_UI_MESSAGE.RENDERED, text)
    }
    return freezeModel(VIOLIN_UI_STATE.INVALID, VIOLIN_UI_MESSAGE.INVALID)
  }

  if (result?.state === VIOLIN_CONSUMER_STATE.REVIEW_REQUIRED) {
    return freezeModel(VIOLIN_UI_STATE.REVIEW_REQUIRED, VIOLIN_UI_MESSAGE.REVIEW_REQUIRED)
  }

  if (result?.state === VIOLIN_CONSUMER_STATE.BLOCKED) {
    return freezeModel(VIOLIN_UI_STATE.BLOCKED, VIOLIN_UI_MESSAGE.BLOCKED)
  }

  if (result?.state === VIOLIN_CONSUMER_STATE.NOT_AVAILABLE) {
    return freezeModel(VIOLIN_UI_STATE.NOT_AVAILABLE, VIOLIN_UI_MESSAGE.NOT_AVAILABLE)
  }

  return freezeModel(VIOLIN_UI_STATE.INVALID, VIOLIN_UI_MESSAGE.INVALID)
}

function setActiveTabState(root, activeName) {
  const buttons = root.querySelectorAll?.('.tab-btn') ?? []
  for (const button of buttons) {
    const active = button.dataset?.tab === activeName
    button.classList?.toggle?.('active', active)
    button.setAttribute?.('aria-selected', active ? 'true' : 'false')
  }
}

export function activateViolinResultTab(root) {
  if (!root || typeof root.getElementById !== 'function') return false

  const panel = root.getElementById('tab-violin')
  if (!panel) return false

  setActiveTabState(root, 'violin')
  for (const id of [
    'tab-rhythmic',
    'tab-html',
    'tab-notes',
    'tab-xml',
    'tab-guitar-tab',
  ]) {
    const existingPanel = root.getElementById(id)
    if (existingPanel) existingPanel.hidden = true
  }
  panel.hidden = false
  return true
}

export function ensureViolinPanel(root) {
  if (
    !root ||
    typeof root.getElementById !== 'function' ||
    typeof root.createElement !== 'function'
  ) {
    return null
  }

  const existing = root.getElementById('tab-violin')
  if (existing) return existing

  const tabList = root.querySelector?.('.result-tabs') ?? null
  const notesSummary = root.getElementById('notes-summary')
  const host = notesSummary?.parentElement ?? tabList?.parentElement ?? null
  if (!tabList || !host) return null

  const button = root.createElement('button')
  button.id = 'result-violin-btn'
  button.type = 'button'
  button.className = 'tab-btn'
  button.dataset.tab = 'violin'
  button.textContent = 'Keman'
  button.setAttribute('role', 'tab')
  button.setAttribute('aria-selected', 'false')
  button.setAttribute('aria-controls', 'tab-violin')
  button.addEventListener('click', () => activateViolinResultTab(root))
  tabList.appendChild(button)

  const panel = root.createElement('div')
  panel.id = 'tab-violin'
  panel.className = 'tab-content violin-panel'
  panel.hidden = true
  panel.setAttribute('role', 'tabpanel')
  panel.setAttribute('aria-labelledby', 'result-violin-btn')

  const heading = root.createElement('h3')
  heading.id = 'violin-heading'
  heading.textContent = 'Temel Keman — Birinci Pozisyon'

  const status = root.createElement('div')
  status.id = 'violin-status'
  status.className = 'rhythm-warning violin-status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')

  const output = root.createElement('pre')
  output.id = 'violin-output'
  output.className = 'rhythmic-text violin-output'
  output.hidden = true
  output.setAttribute('aria-label', 'Oluşturulan temel keman tel ve parmak önerisi')
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

export function renderViolinPanel(root, notes, adapters = {}) {
  const panel = ensureViolinPanel(root)
  if (!panel) return null

  const output = root.getElementById('violin-output')
  const status = root.getElementById('violin-status')
  if (!output || !status) return null

  const model = buildViolinUiModel(notes, adapters)
  output.textContent = model.rendered ? model.text : ''
  output.hidden = !model.rendered
  status.textContent = model.status
  panel.setAttribute('data-violin-state', model.state)
  return model
}

export function initPackage5Ui(root = document, adapters = {}) {
  if (!ensureViolinPanel(root)) return false

  const oldUnsubscribe = rootSubscriptions.get(root)
  if (oldUnsubscribe) oldUnsubscribe()

  const unsubscribe = subscribePackage3Measures((snapshot) => {
    renderViolinPanel(root, snapshot?.notes ?? null, adapters)
  })
  rootSubscriptions.set(root, unsubscribe)

  const current = getPackage3MeasureSnapshot()
  renderViolinPanel(root, current.notes, adapters)
  return true
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    initPackage5Ui(document)
  })
}
