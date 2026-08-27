// Package 3 — accessible playback/interface controller.
//
// Package 3A changes the user-facing playback wording. Package 3D adds
// keyboard/screen-reader accessible measure selection, but deliberately does
// not trigger TTS or playback yet. Measure identity always comes from the
// parser-supplied canonical measureKey policy in Package 3C.

import {
  clearPackage3Notes,
  selectPackage3MeasureKey,
  subscribePackage3Measures,
} from '../package3MeasureBridge.js'
import { buildMeasureIndex, selectCanonicalMeasure } from './services/measureIdentity.js'

export const MUSIC_LISTEN_LABELS = Object.freeze({
  heading: 'Müziği Dinle',
  button: '🎵 Müziği Dinle',
  ariaLabel: 'Müziği dinlemeyi başlat',
})

const rootSubscriptions = new WeakMap()
const resetBoundRoots = new WeakSet()

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

  region.appendChild(heading)
  region.appendChild(group)
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
  if (models.length === 0) {
    region.hidden = true
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
      // Revalidate against the exact current NoteObject[] before selection.
      const selected = selectCanonicalMeasure(bridgeSnapshot.notes, model.measureKey)
      if (!selected) return
      if (!selectPackage3MeasureKey(model.measureKey)) return

      const live = root.getElementById('aria-live-region')
      if (live) live.textContent = `${model.visibleLabel} seçildi.`
    })
    buttonGroup.appendChild(button)
  }

  region.hidden = false
  return true
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
    reset.addEventListener('click', () => clearPackage3Notes())
    resetBoundRoots.add(root)
  }

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
