// Package 3 — accessible playback/interface controller.
//
// Measure identity always comes from the parser-supplied canonical measureKey
// policy in Package 3C. Package 3E adds quality-gated TTS/playback for the
// selected measure while keeping selected-measure and full-score browser
// lifecycles explicitly separated.

import {
  clearPackage3Notes,
  getPackage3MeasureSnapshot,
  selectPackage3MeasureKey,
  subscribePackage3Measures,
} from '../package3MeasureBridge.js'
import { buildMeasureIndex, selectCanonicalMeasure } from './services/measureIdentity.js'
import {
  playSelectedMeasure,
  speakSelectedMeasure,
} from './services/selectedMeasureConsumer.js'
import {
  bpmToSpeed,
  stopRhythm,
  stopSpeech,
} from './services/voiceService.js'

export const MUSIC_LISTEN_LABELS = Object.freeze({
  heading: 'Müziği Dinle',
  button: '🎵 Müziği Dinle',
  ariaLabel: 'Müziği dinlemeyi başlat',
})

const rootSubscriptions = new WeakMap()
const resetBoundRoots = new WeakSet()
const fullConsumerPreemptionRoots = new WeakSet()
const selectedOperationState = new WeakMap()

function operationState(root) {
  let state = selectedOperationState.get(root)
  if (!state) {
    state = { token: 0, activeConsumer: null }
    selectedOperationState.set(root, state)
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

export function hasActiveFullScoreConsumer(root) {
  if (!root || typeof root.getElementById !== 'function') return false
  return (
    hasPlayingClass(root.getElementById('voice-btn')) ||
    hasPlayingClass(root.getElementById('rhythm-btn'))
  )
}

function stopSelectedOperation(root, message = '') {
  const state = operationState(root)
  state.token += 1
  const hadActiveSelectedOperation = state.activeConsumer !== null
  state.activeConsumer = null

  // The low-level speech/rhythm services are shared with full-score playback.
  // They may be stopped here only when this UI state proves that Package 3 owns
  // an active selected-measure operation. Measure selection alone must never
  // terminate a full-score operation.
  if (hadActiveSelectedOperation && typeof window !== 'undefined') {
    stopSpeech()
    stopRhythm()
  }

  const stop = root.getElementById('selected-measure-stop')
  if (stop) stop.disabled = true
  if (message) announce(root, message)
  return hadActiveSelectedOperation
}

export function applyMusicListenLabels(root) {
  if (!root || typeof root.getElementById !== 'function') return false

  const heading = root.getElementById('rhythm-heading')
  const button = root.getElementById('rhythm-btn')
  const text = button?.querySelector?.('.btn-icon-text') ?? null

  if (!heading || !button || !text) return false

  heading.textContent = MUSIC_LISTEN_LABELS.heading
  button.setAttribute('aria-label', MUSIC_LISTEN_LABELS.ariaLabel)
  text.textContent = MUSIC_LISTEN_LABELS.button
  return true
}

function displayMeasureLabel(group) {
  if (group.displayNumber !== null && group.displayNumber !== undefined) {
    return String(group.displayNumber)
  }
  if (Number.isInteger(group.measureIndex)) return String(group.measureIndex + 1)
  return 'bilinmeyen'
}

export function buildMeasureControlModels(notes, selectedMeasureKey = null) {
  if (!Array.isArray(notes)) return Object.freeze([])

  const groups = buildMeasureIndex(notes).filter((group) => group.selectable)
  const labelCounts = new Map()
  for (const group of groups) {
    const label = displayMeasureLabel(group)
    labelCounts.set(label, (labelCounts.get(label) || 0) + 1)
  }

  const models = groups.map((group) => {
    const label = displayMeasureLabel(group)
    const duplicateVisibleNumber = labelCounts.get(label) > 1
    const physicalMeasure = Number.isInteger(group.measureIndex)
      ? group.measureIndex + 1
      : null
    const partNumber = Number.isInteger(group.partIndex)
      ? group.partIndex + 1
      : null

    let ariaLabel = `Ölçü ${label} seç`
    if (duplicateVisibleNumber) {
      const details = []
      if (partNumber !== null) details.push(`bölüm ${partNumber}`)
      if (physicalMeasure !== null) details.push(`fiziksel ölçü ${physicalMeasure}`)
      ariaLabel = `Ölçü ${label}${details.length ? `, ${details.join(', ')}` : ''} seç`
    }

    return Object.freeze({
      measureKey: group.measureKey,
      visibleLabel: `Ölçü ${label}`,
      ariaLabel,
      selected: group.measureKey === selectedMeasureKey,
      noteCount: group.notes.length,
    })
  })

  Object.freeze(models)
  return models
}

export async function runSelectedMeasureAction(root, consumer) {
  const bridge = getPackage3MeasureSnapshot()
  if (!Array.isArray(bridge.notes) || !bridge.selectedMeasureKey) {
    announce(root, 'Önce bir ölçü seçin.')
    return false
  }

  // A selected action does not own app.js full-score lifecycle state. Stopping
  // the shared low-level service here could make an older full-score promise
  // report a stale completion. Fail closed until the user stops that operation.
  if (hasActiveFullScoreConsumer(root)) {
    announce(root, 'Tam parça sesli okuma veya çalma devam ediyor. Önce onu durdurun.')
    return false
  }

  // Replacing one selected-measure action with another is safe because this
  // module owns both sides of that lifecycle and suppresses stale completions.
  stopSelectedOperation(root)

  const state = operationState(root)
  const token = state.token + 1
  state.token = token
  state.activeConsumer = consumer
  const stop = root.getElementById('selected-measure-stop')
  if (stop) stop.disabled = false

  try {
    let result
    if (consumer === 'tts') {
      const rate = Number.parseFloat(root.getElementById('speed-slider')?.value ?? '1')
      result = await speakSelectedMeasure({
        notes: bridge.notes,
        measureKey: bridge.selectedMeasureKey,
        rate: Number.isFinite(rate) && rate > 0 ? rate : 1,
      })
    } else {
      const tempo = Number.parseFloat(root.getElementById('tempo-slider')?.value ?? '120')
      const speed = bpmToSpeed(Number.isFinite(tempo) && tempo > 0 ? tempo : 120)
      result = await playSelectedMeasure({
        notes: bridge.notes,
        measureKey: bridge.selectedMeasureKey,
        speed,
      })
    }

    if (state.token !== token) return false
    if (!result.ok) {
      announce(root, result.message)
      return false
    }

    announce(
      root,
      consumer === 'tts'
        ? 'Seçili ölçünün sesli okuması tamamlandı.'
        : 'Seçili ölçünün çalması tamamlandı.',
    )
    return true
  } catch (error) {
    if (state.token === token) {
      announce(root, `Seçili ölçü işlemi başlatılamadı: ${error?.message || 'bilinmeyen hata'}`)
    }
    return false
  } finally {
    if (state.token === token) {
      state.activeConsumer = null
      if (stop) stop.disabled = true
    }
  }
}

function ensureMeasureControls(root) {
  const tab = root.getElementById('tab-html')
  const output = root.getElementById('rhythmic-html-output')
  if (!tab || !output || typeof root.createElement !== 'function') return null

  let region = root.getElementById('measure-controls')
  if (region) return region

  region = root.createElement('section')
  region.id = 'measure-controls'
  region.className = 'measure-controls'
  region.setAttribute('aria-labelledby', 'measure-controls-heading')
  region.hidden = true

  const heading = root.createElement('h3')
  heading.id = 'measure-controls-heading'
  heading.textContent = 'Ölçü seçimi'

  const group = root.createElement('div')
  group.id = 'measure-control-buttons'
  group.className = 'measure-control-buttons'
  group.setAttribute('role', 'group')
  group.setAttribute('aria-label', 'Çalınacak veya okunacak ölçüyü seç')

  const actions = root.createElement('div')
  actions.id = 'selected-measure-actions'
  actions.className = 'measure-control-actions'
  actions.setAttribute('role', 'group')
  actions.setAttribute('aria-label', 'Seçili ölçü işlemleri')

  const speak = root.createElement('button')
  speak.id = 'selected-measure-speak'
  speak.type = 'button'
  speak.className = 'btn btn-secondary btn-sm'
  speak.textContent = '🔊 Seçili ölçüyü sesli oku'
  speak.disabled = true
  speak.addEventListener('click', () => { void runSelectedMeasureAction(root, 'tts') })

  const play = root.createElement('button')
  play.id = 'selected-measure-play'
  play.type = 'button'
  play.className = 'btn btn-primary btn-sm'
  play.textContent = '🎵 Seçili ölçüyü dinle'
  play.disabled = true
  play.addEventListener('click', () => { void runSelectedMeasureAction(root, 'playback') })

  const stop = root.createElement('button')
  stop.id = 'selected-measure-stop'
  stop.type = 'button'
  stop.className = 'btn btn-secondary btn-sm'
  stop.textContent = '⏹ Seçili ölçüyü durdur'
  stop.disabled = true
  stop.addEventListener('click', () => {
    stopSelectedOperation(root, 'Seçili ölçü işlemi durduruldu.')
  })

  actions.appendChild(speak)
  actions.appendChild(play)
  actions.appendChild(stop)
  region.appendChild(heading)
  region.appendChild(group)
  region.appendChild(actions)
  tab.insertBefore(region, output)
  return region
}

export function renderMeasureControls(root, bridgeSnapshot) {
  if (!root || typeof root.getElementById !== 'function') return false
  const region = ensureMeasureControls(root)
  if (!region) return false

  const buttonGroup = root.getElementById('measure-control-buttons')
  if (!buttonGroup || typeof buttonGroup.replaceChildren !== 'function') return false

  let models = Object.freeze([])
  try {
    models = buildMeasureControlModels(
      bridgeSnapshot?.notes,
      bridgeSnapshot?.selectedMeasureKey ?? null,
    )
  } catch {
    buttonGroup.replaceChildren()
    region.hidden = true
    return false
  }

  buttonGroup.replaceChildren()
  const speak = root.getElementById('selected-measure-speak')
  const play = root.getElementById('selected-measure-play')
  const hasSelection = Boolean(bridgeSnapshot?.selectedMeasureKey)
  if (speak) speak.disabled = !hasSelection
  if (play) play.disabled = !hasSelection

  if (models.length === 0) {
    region.hidden = true
    if (speak) speak.disabled = true
    if (play) play.disabled = true
    return true
  }

  for (const model of models) {
    const button = root.createElement('button')
    button.type = 'button'
    button.className = 'btn btn-secondary btn-sm measure-select-btn'
    button.textContent = model.visibleLabel
    button.setAttribute('aria-label', model.ariaLabel)
    button.setAttribute('aria-pressed', model.selected ? 'true' : 'false')
    button.setAttribute('data-measure-key', model.measureKey)

    button.addEventListener('click', () => {
      const current = getPackage3MeasureSnapshot()
      if (current.notes !== bridgeSnapshot.notes) return
      const selected = selectCanonicalMeasure(current.notes, model.measureKey)
      if (!selected) return
      stopSelectedOperation(root)
      if (!selectPackage3MeasureKey(model.measureKey)) return
      announce(root, `${model.visibleLabel} seçildi.`)
    })
    buttonGroup.appendChild(button)
  }

  region.hidden = false
  return true
}

function bindFullConsumerPreemption(root) {
  if (fullConsumerPreemptionRoots.has(root)) return

  // App listeners are registered before Package 3 UI. Capture phase ensures a
  // Package 3-owned selected operation is stopped before a full-score action
  // starts. If no selected operation exists, shared audio is left untouched.
  for (const id of ['voice-btn', 'rhythm-btn']) {
    const button = root.getElementById(id)
    if (button && typeof button.addEventListener === 'function') {
      button.addEventListener('click', () => stopSelectedOperation(root), true)
    }
  }
  fullConsumerPreemptionRoots.add(root)
}

export function initMeasureControls(root) {
  if (!root || typeof root.getElementById !== 'function') return false
  if (!ensureMeasureControls(root)) return false

  const oldUnsubscribe = rootSubscriptions.get(root)
  if (oldUnsubscribe) oldUnsubscribe()

  const unsubscribe = subscribePackage3Measures((bridgeSnapshot) => {
    renderMeasureControls(root, bridgeSnapshot)
  })
  rootSubscriptions.set(root, unsubscribe)

  const reset = root.getElementById('reset-btn')
  if (reset && typeof reset.addEventListener === 'function' && !resetBoundRoots.has(root)) {
    reset.addEventListener('click', () => {
      stopSelectedOperation(root)
      clearPackage3Notes()
    })
    resetBoundRoots.add(root)
  }

  bindFullConsumerPreemption(root)
  return true
}

export function initPackage3Ui(root = document) {
  const labelsApplied = applyMusicListenLabels(root)
  initMeasureControls(root)
  return labelsApplied
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    initPackage3Ui(document)
  })
}
