// S08 — score-adjacent exact quality/error marker rail.
//
// This presentation layer does not add renderer authority. Marker activation
// routes through Package 3 exact selection; existing scoreViewUi then owns the
// reviewed ST highlight, and S07 owns the teacher inspector.

import {
  getPackage3MeasureSnapshot,
  selectPackage3MeasureKey,
  selectPackage3NoteIndex,
  subscribePackage3Measures,
} from '../package3MeasureBridge.js'
import {
  buildStageS08ScoreQualityOverlayModel,
  STAGE_S08_NOTE_STATE,
} from './services/stageS08ScoreQualityOverlay.js'

const states = new WeakMap()

const ICON = Object.freeze({
  [STAGE_S08_NOTE_STATE.BLOCK]: '⛔',
  [STAGE_S08_NOTE_STATE.REVIEW]: '⚠',
  [STAGE_S08_NOTE_STATE.NO_ISSUE_FOUND]: '✓',
  [STAGE_S08_NOTE_STATE.UNKNOWN]: '?',
})

function scoreState(root) {
  return root.getElementById?.('stage-s05-score-workspace')
    ?.getAttribute?.('data-stage-s07-score-state') || 'source'
}

function ensureRegion(root) {
  const surface = root.getElementById?.('score-view-surface')
  const panel = root.getElementById?.('tab-score-view')
  if (!surface || !panel || typeof root.createElement !== 'function') return null

  let region = root.getElementById?.('stage-s08-score-quality-overlay')
  if (region) return region

  region = root.createElement('section')
  region.id = 'stage-s08-score-quality-overlay'
  region.className = 'stage-s08-score-quality-overlay'
  region.setAttribute('aria-labelledby', 'stage-s08-score-quality-heading')

  const heading = root.createElement('h4')
  heading.id = 'stage-s08-score-quality-heading'
  heading.textContent = 'Skor kalite işaretleri'

  const status = root.createElement('p')
  status.id = 'stage-s08-score-quality-status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')

  const help = root.createElement('p')
  help.id = 'stage-s08-score-quality-help'
  help.textContent = 'İşaretler yalnız exact canonical nota kanıtını gösterir. Ölçü/genel bulgular notaya tahminle atanmaz. ✓ işareti müzikal doğruluk garantisi değildir.'

  const rail = root.createElement('div')
  rail.id = 'stage-s08-score-quality-rail'
  rail.className = 'stage-s08-score-quality-rail'
  rail.setAttribute('role', 'group')
  rail.setAttribute('aria-label', 'Exact nota kalite işaretleri')

  region.appendChild(heading)
  region.appendChild(status)
  region.appendChild(help)
  region.appendChild(rail)
  panel.insertBefore(region, surface)
  return region
}

function markerAccessibleLabel(marker) {
  const measure = marker.visibleMeasureNumber ?? marker.measureKey
  return `Ölçü ${measure}, nota ${marker.measureNoteOrdinal + 1}: ${marker.statusText}. ${marker.reason}`
}

function focusInspector(root) {
  const field = root.querySelector?.('#stage-s07-inline-fields [data-stage-s07-field]')
  if (field?.focus) {
    field.focus()
    return true
  }
  const inspector = root.getElementById?.('stage-s05-score-inspector')
  if (inspector?.focus) {
    inspector.tabIndex = -1
    inspector.focus()
    return true
  }
  return false
}

export function activateStageS08QualityMarker(root, marker) {
  if (!marker?.rendererTarget || !Number.isSafeInteger(marker.noteIndex)) return false
  if (!selectPackage3MeasureKey(marker.measureKey)) return false
  if (!selectPackage3NoteIndex(marker.noteIndex, {
    rendererTarget: marker.rendererTarget,
    interaction: 'quality-marker',
  })) return false

  focusInspector(root)
  const live = root.getElementById?.('aria-live-region')
  if (live) live.textContent = `${markerAccessibleLabel(marker)} Nota inceleme alanı açıldı.`
  return true
}

function markerButton(root, marker, selectedNoteIndex) {
  const button = root.createElement('button')
  button.type = 'button'
  button.className = 'stage-s08-quality-marker'
  button.dataset.stageS08State = marker.state
  button.dataset.noteIndex = String(marker.noteIndex)
  button.dataset.measureKey = marker.measureKey
  button.setAttribute('aria-pressed', marker.noteIndex === selectedNoteIndex ? 'true' : 'false')
  button.setAttribute('aria-label', markerAccessibleLabel(marker))

  const icon = root.createElement('span')
  icon.className = 'stage-s08-quality-marker-icon'
  icon.setAttribute('aria-hidden', 'true')
  icon.textContent = ICON[marker.state] ?? '?'

  const label = root.createElement('span')
  label.className = 'stage-s08-quality-marker-label'
  const measure = marker.visibleMeasureNumber ?? marker.measureKey
  label.textContent = `Ölçü ${measure} · Nota ${marker.measureNoteOrdinal + 1}`

  const reason = root.createElement('span')
  reason.className = 'stage-s08-quality-marker-reason'
  reason.textContent = `${marker.statusText}: ${marker.reason}`

  button.appendChild(icon)
  button.appendChild(label)
  button.appendChild(reason)
  button.addEventListener('click', () => { activateStageS08QualityMarker(root, marker) })
  return button
}

function statusText(model) {
  if (!model.exactSourceEvidence) return model.reason
  const { block, review, noIssueFound, unknown } = model.counts
  return `${block} engelli, ${review} inceleme, ${noIssueFound} otomatik kontrolde sorun bulunmadı, ${unknown} exact durumu bilinmiyor. ${model.reason}`
}

export function renderStageS08ScoreQualityOverlay(root = document, snapshot = getPackage3MeasureSnapshot()) {
  if (!root || typeof root.getElementById !== 'function') return false
  const region = ensureRegion(root)
  if (!region) return false

  const model = buildStageS08ScoreQualityOverlayModel(snapshot, { scoreState: scoreState(root) })
  const status = root.getElementById?.('stage-s08-score-quality-status')
  const rail = root.getElementById?.('stage-s08-score-quality-rail')
  if (!status || !rail) return false

  region.dataset.stageS08State = model.state
  region.dataset.stageS08Stale = model.stale ? 'true' : 'false'
  status.textContent = statusText(model)
  rail.replaceChildren()

  for (const marker of model.markers) {
    rail.appendChild(markerButton(root, marker, snapshot?.selectedNoteIndex ?? null))
  }

  if (model.markers.length === 0) {
    const empty = root.createElement('p')
    empty.className = 'stage-s08-quality-empty'
    empty.textContent = model.stale
      ? 'Eski note-level işaretler temizlendi; bu sürüm için yeni exact kalite kanıtı bekleniyor.'
      : 'Gösterilebilecek exact note-level kalite işareti yok.'
    rail.appendChild(empty)
  }

  region.setAttribute('data-stage-s08-score-overlay', 'ready')
  return true
}

function installScoreStateObserver(root, state) {
  if (state.observer) return true
  const workspace = root.getElementById?.('stage-s05-score-workspace')
  const Observer = root.defaultView?.MutationObserver ?? globalThis.MutationObserver
  if (!workspace || typeof Observer !== 'function') return false

  state.observer = new Observer(() => {
    renderStageS08ScoreQualityOverlay(root, getPackage3MeasureSnapshot())
  })
  state.observer.observe(workspace, {
    attributes: true,
    attributeFilter: ['data-stage-s07-score-state'],
  })
  return true
}

export function applyStageS08ScoreQualityOverlay(root = document) {
  if (!root || typeof root.getElementById !== 'function') return false
  if (!ensureRegion(root)) return false

  let state = states.get(root)
  if (!state) {
    state = { unsubscribe: null, observer: null }
    state.unsubscribe = subscribePackage3Measures((snapshot) => {
      renderStageS08ScoreQualityOverlay(root, snapshot)
    })
    states.set(root, state)
  }
  installScoreStateObserver(root, state)
  renderStageS08ScoreQualityOverlay(root, getPackage3MeasureSnapshot())
  return true
}

export function initStageS08ScoreQualityOverlay(root = document) {
  const init = () => applyStageS08ScoreQualityOverlay(root)
  if (root?.readyState === 'loading') {
    root.addEventListener?.('DOMContentLoaded', init, { once: true })
    return true
  }
  return init()
}
