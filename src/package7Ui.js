// Package 7D–7F — accessible source-chord UI and Turkish TTS lifecycle.
//
// The UI consumes only Package 7C source-only results resolved for the exact
// NoteObject[] currently published through the Package 3 bridge. It never
// derives chords from notes and never represents MusicXML source harmony as
// teacher-approved or definitive musical truth.

import {
  getPackage3MeasureSnapshot,
  subscribePackage3Measures,
} from '../package3MeasureBridge.js'
import {
  CHORD_SOURCE_CONSUMER_STATE,
  buildRegisteredChordSourceConsumer,
} from './services/chordSourceConsumer.js'
import { speakChordSourceResult } from './services/chordTtsConsumer.js'
import { stopSpeech } from './services/voiceService.js'

export const CHORD_UI_STATE = Object.freeze({
  SOURCE_READY: 'source-ready',
  EMPTY: 'empty',
  REVIEW_REQUIRED: 'review-required',
  INVALID: 'invalid',
  NO_SOURCE: 'no-source',
})

export const CHORD_UI_MESSAGE = Object.freeze({
  SOURCE_READY: 'MusicXML kaynak akor işaretleri gösteriliyor. Bu bilgi öğretmen onayı değildir.',
  EMPTY: 'MusicXML içinde kaynak akor işareti bulunamadı.',
  REVIEW_REQUIRED: 'Kaynak akor verisi inceleme gerektiriyor. Akor gösterimi ve seslendirme kapalı.',
  INVALID: 'Kaynak akor verisi güvenli biçimde gösterilemedi.',
  NO_SOURCE: 'Bu sonuç için MusicXML kaynak akor verisi yok.',
})

const rootSubscriptions = new WeakMap()
const resetBoundRoots = new WeakSet()
const lifecycleBoundRoots = new WeakSet()
const uiStateByRoot = new WeakMap()

function operationState(root) {
  let state = uiStateByRoot.get(root)
  if (!state) {
    state = { token: 0, active: false, sourceResult: null, notes: null }
    uiStateByRoot.set(root, state)
  }
  return state
}

function announce(root, message) {
  const live = root.getElementById('aria-live-region')
  if (live) live.textContent = message
}

function hasPlayingClass(element) {
  if (!element) return false
  if (element.classList && typeof element.classList.contains === 'function') {
    return element.classList.contains('playing')
  }
  return String(element.className || '').split(/\s+/).includes('playing')
}

export function hasConflictingAudioConsumer(root) {
  if (!root || typeof root.getElementById !== 'function') return false
  if (hasPlayingClass(root.getElementById('voice-btn'))) return true
  if (hasPlayingClass(root.getElementById('rhythm-btn'))) return true
  const selectedStop = root.getElementById('selected-measure-stop')
  return Boolean(selectedStop && selectedStop.disabled === false)
}

export function stopChordOperation(root, message = '') {
  const state = operationState(root)
  state.token += 1
  const wasActive = state.active
  state.active = false

  // Only cancel the shared speech service when this module proves it owns the
  // active chord utterance. Never stop another consumer merely because its
  // controls exist.
  if (wasActive) stopSpeech()

  const speak = root?.getElementById?.('chord-speak-btn')
  const stop = root?.getElementById?.('chord-stop-btn')
  if (speak) speak.disabled = !isSourceReady(state.sourceResult)
  if (stop) stop.disabled = true
  if (message) announce(root, message)
  return wasActive
}

function isSourceReady(result) {
  return Boolean(
    result &&
    result.state === CHORD_SOURCE_CONSUMER_STATE.SOURCE_READY &&
    result.renderable === true &&
    result.speakable === true &&
    result.sourceOnly === true &&
    result.definitive === false &&
    result.teacherApproved === false &&
    typeof result.displayText === 'string' &&
    result.displayText.trim() !== '' &&
    typeof result.spokenText === 'string' &&
    result.spokenText.trim() !== ''
  )
}

function uiModel(result) {
  if (isSourceReady(result)) {
    return Object.freeze({
      state: CHORD_UI_STATE.SOURCE_READY,
      message: CHORD_UI_MESSAGE.SOURCE_READY,
      text: result.displayText,
      canSpeak: true,
      sourceOnly: true,
      teacherApproved: false,
    })
  }

  const stateMap = {
    [CHORD_SOURCE_CONSUMER_STATE.EMPTY]: CHORD_UI_STATE.EMPTY,
    [CHORD_SOURCE_CONSUMER_STATE.REVIEW_REQUIRED]: CHORD_UI_STATE.REVIEW_REQUIRED,
    [CHORD_SOURCE_CONSUMER_STATE.INVALID]: CHORD_UI_STATE.INVALID,
    [CHORD_SOURCE_CONSUMER_STATE.NO_SOURCE]: CHORD_UI_STATE.NO_SOURCE,
  }
  const state = stateMap[result?.state] ?? CHORD_UI_STATE.INVALID
  return Object.freeze({
    state,
    message: CHORD_UI_MESSAGE[state.toUpperCase?.()] || {
      [CHORD_UI_STATE.EMPTY]: CHORD_UI_MESSAGE.EMPTY,
      [CHORD_UI_STATE.REVIEW_REQUIRED]: CHORD_UI_MESSAGE.REVIEW_REQUIRED,
      [CHORD_UI_STATE.INVALID]: CHORD_UI_MESSAGE.INVALID,
      [CHORD_UI_STATE.NO_SOURCE]: CHORD_UI_MESSAGE.NO_SOURCE,
    }[state],
    text: '',
    canSpeak: false,
    sourceOnly: true,
    teacherApproved: false,
  })
}

export function buildChordUiModel(result) {
  return uiModel(result)
}

function appendBeforeSummary(root, body, panel) {
  const summary = root.getElementById('notes-summary')
  if (summary && summary.parentElement === body && typeof body.insertBefore === 'function') {
    body.insertBefore(panel, summary)
  } else {
    body.appendChild(panel)
  }
}

export function ensureChordPanel(root) {
  if (!root || typeof root.getElementById !== 'function' || typeof root.createElement !== 'function') return null
  const existing = root.getElementById('tab-chords')
  if (existing) return existing

  const results = root.getElementById('results-section')
  const tabList = root.querySelector?.('.result-tabs') ?? null
  const body = tabList?.parentElement ?? results?.querySelector?.('.card-body') ?? null
  if (!results || !tabList || !body) return null

  const tabButton = root.createElement('button')
  tabButton.id = 'chord-tab-btn'
  tabButton.type = 'button'
  tabButton.className = 'tab-btn'
  tabButton.dataset.tab = 'chords'
  tabButton.setAttribute('role', 'tab')
  tabButton.setAttribute('aria-selected', 'false')
  tabButton.setAttribute('aria-controls', 'tab-chords')
  tabButton.textContent = 'Akorlar'

  const panel = root.createElement('section')
  panel.id = 'tab-chords'
  panel.setAttribute('role', 'tabpanel')
  panel.setAttribute('aria-labelledby', 'chord-tab-btn')
  panel.hidden = true

  const heading = root.createElement('h3')
  heading.id = 'chord-heading'
  heading.textContent = 'Kaynak akor işaretleri'

  const status = root.createElement('p')
  status.id = 'chord-status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.textContent = CHORD_UI_MESSAGE.NO_SOURCE

  const output = root.createElement('pre')
  output.id = 'chord-output'
  output.className = 'plain-text-output'
  output.setAttribute('tabindex', '0')
  output.setAttribute('aria-label', 'MusicXML kaynak akor işaretleri')
  output.hidden = true
  output.textContent = ''

  const actions = root.createElement('div')
  actions.id = 'chord-actions'
  actions.setAttribute('role', 'group')
  actions.setAttribute('aria-label', 'Kaynak akor seslendirme işlemleri')

  const speak = root.createElement('button')
  speak.id = 'chord-speak-btn'
  speak.type = 'button'
  speak.className = 'btn btn-secondary btn-sm'
  speak.textContent = '🔊 Akorları dinle'
  speak.setAttribute('aria-label', 'MusicXML kaynak akor işaretlerini Türkçe seslendir')
  speak.disabled = true
  speak.addEventListener('click', () => { void runChordSpeech(root) })

  const stop = root.createElement('button')
  stop.id = 'chord-stop-btn'
  stop.type = 'button'
  stop.className = 'btn btn-secondary btn-sm'
  stop.textContent = '⏹ Durdur'
  stop.setAttribute('aria-label', 'Kaynak akor seslendirmesini durdur')
  stop.disabled = true
  stop.addEventListener('click', () => stopChordOperation(root, 'Akor seslendirmesi durduruldu.'))

  actions.appendChild(speak)
  actions.appendChild(stop)
  panel.appendChild(heading)
  panel.appendChild(status)
  panel.appendChild(output)
  panel.appendChild(actions)
  tabList.appendChild(tabButton)
  appendBeforeSummary(root, body, panel)

  tabButton.addEventListener('click', () => activateChordResultTab(root))
  return panel
}

export function activateChordResultTab(root) {
  if (!root || typeof root.getElementById !== 'function') return false
  const panel = root.getElementById('tab-chords')
  const button = root.getElementById('chord-tab-btn')
  if (!panel || !button) return false

  for (const tab of root.querySelectorAll?.('.tab-btn') ?? []) {
    const active = tab === button
    tab.classList?.toggle?.('active', active)
    tab.setAttribute?.('aria-selected', active ? 'true' : 'false')
  }

  for (const id of ['tab-rhythmic', 'tab-html', 'tab-notes', 'tab-xml', 'tab-guitar-tab', 'tab-violin', 'tab-chords']) {
    const item = root.getElementById(id)
    if (item) item.hidden = id !== 'tab-chords'
  }
  return true
}

export function renderChordPanel(root, result) {
  const panel = ensureChordPanel(root)
  if (!panel) return false
  const state = operationState(root)
  const model = buildChordUiModel(result)
  state.sourceResult = result

  const status = root.getElementById('chord-status')
  const output = root.getElementById('chord-output')
  const speak = root.getElementById('chord-speak-btn')
  const stop = root.getElementById('chord-stop-btn')

  if (status) status.textContent = model.message
  if (output) {
    output.textContent = model.text
    output.hidden = model.text === ''
  }
  if (speak) speak.disabled = !model.canSpeak || state.active
  if (stop) stop.disabled = !state.active
  return true
}

export async function runChordSpeech(root, adapters = {}) {
  const state = operationState(root)
  if (!isSourceReady(state.sourceResult)) {
    announce(root, state.sourceResult?.message || CHORD_UI_MESSAGE.NO_SOURCE)
    return false
  }
  if (hasConflictingAudioConsumer(root)) {
    announce(root, 'Başka bir sesli okuma veya çalma devam ediyor. Önce onu durdurun.')
    return false
  }

  stopChordOperation(root)
  const token = state.token + 1
  state.token = token
  state.active = true

  const speakButton = root.getElementById('chord-speak-btn')
  const stopButton = root.getElementById('chord-stop-btn')
  const status = root.getElementById('chord-status')
  if (speakButton) speakButton.disabled = true
  if (stopButton) stopButton.disabled = false
  if (status) status.textContent = 'Kaynak akor seslendirmesi hazırlanıyor...'

  const rateValue = Number.parseFloat(root.getElementById('speed-slider')?.value ?? '1')
  const rate = Number.isFinite(rateValue) && rateValue > 0 ? rateValue : 1
  const speak = adapters.speakChordSourceResult ?? speakChordSourceResult

  try {
    const result = await speak(state.sourceResult, {
      rate,
      onStart: () => {
        if (state.token !== token) return
        if (status) status.textContent = 'Kaynak akor işaretleri seslendiriliyor...'
        announce(root, 'Kaynak akor işaretleri seslendiriliyor.')
      },
      adapters: adapters.voiceAdapters,
    })
    if (state.token !== token) return false
    if (!result?.ok) {
      if (status) status.textContent = result?.message || CHORD_UI_MESSAGE.INVALID
      announce(root, result?.message || CHORD_UI_MESSAGE.INVALID)
      return false
    }
    if (status) status.textContent = 'Kaynak akor seslendirmesi tamamlandı.'
    announce(root, 'Kaynak akor seslendirmesi tamamlandı.')
    return true
  } catch (error) {
    if (state.token === token) {
      const message = error?.message || 'Akor seslendirmesi başlatılamadı.'
      if (status) status.textContent = `Hata: ${message}`
      announce(root, message)
    }
    return false
  } finally {
    if (state.token === token) {
      state.active = false
      if (speakButton) speakButton.disabled = !isSourceReady(state.sourceResult)
      if (stopButton) stopButton.disabled = true
    }
  }
}

function bindLifecyclePreemption(root) {
  if (lifecycleBoundRoots.has(root)) return
  for (const id of ['voice-btn', 'rhythm-btn', 'selected-measure-speak', 'selected-measure-play']) {
    const control = root.getElementById(id)
    if (control && typeof control.addEventListener === 'function') {
      control.addEventListener('click', () => stopChordOperation(root), true)
    }
  }
  lifecycleBoundRoots.add(root)
}

function bindLegacyTabYield(root) {
  for (const tab of root.querySelectorAll?.('.tab-btn') ?? []) {
    if (tab.id === 'chord-tab-btn' || tab.__package7YieldBound) continue
    tab.addEventListener('click', () => {
      const panel = root.getElementById('tab-chords')
      if (panel) panel.hidden = true
      const button = root.getElementById('chord-tab-btn')
      if (button) {
        button.classList?.toggle?.('active', false)
        button.setAttribute?.('aria-selected', 'false')
      }
    })
    tab.__package7YieldBound = true
  }
}

export function initPackage7Ui(root = document, adapters = {}) {
  if (!root || typeof root.getElementById !== 'function') return false
  if (!ensureChordPanel(root)) return false

  const oldUnsubscribe = rootSubscriptions.get(root)
  if (oldUnsubscribe) oldUnsubscribe()

  const buildConsumer = adapters.buildRegisteredChordSourceConsumer ?? buildRegisteredChordSourceConsumer
  const unsubscribe = subscribePackage3Measures((snapshot) => {
    const state = operationState(root)
    if (state.notes !== snapshot.notes) stopChordOperation(root)
    state.notes = snapshot.notes
    let result
    try {
      result = Array.isArray(snapshot.notes)
        ? buildConsumer(snapshot.notes)
        : Object.freeze({ state: CHORD_SOURCE_CONSUMER_STATE.NO_SOURCE, message: CHORD_UI_MESSAGE.NO_SOURCE })
    } catch {
      result = Object.freeze({ state: CHORD_SOURCE_CONSUMER_STATE.INVALID, message: CHORD_UI_MESSAGE.INVALID })
    }
    renderChordPanel(root, result)
  })
  rootSubscriptions.set(root, unsubscribe)

  const reset = root.getElementById('reset-btn')
  if (reset && typeof reset.addEventListener === 'function' && !resetBoundRoots.has(root)) {
    reset.addEventListener('click', () => stopChordOperation(root))
    resetBoundRoots.add(root)
  }

  bindLifecyclePreemption(root)
  bindLegacyTabYield(root)
  return true
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    initPackage7Ui(document)
  })
}
