import {
  getPackage3MeasureSnapshot,
  subscribePackage3Measures,
} from '../package3MeasureBridge.js'
import {
  buildQualityOverlayModel,
  QUALITY_OVERLAY_STATE,
  qualityOverlayStatusCopy,
} from './services/qualityOverlay.js'

const boundRoots = new WeakSet()

function ensureOverlay(root) {
  const measureRegion = root.getElementById('measure-controls')
  if (!measureRegion || typeof root.createElement !== 'function') return null

  let region = root.getElementById('stage-d-quality-overlay')
  if (region) return region

  region = root.createElement('section')
  region.id = 'stage-d-quality-overlay'
  region.className = 'stage-d-quality-overlay'
  region.setAttribute('aria-labelledby', 'stage-d-quality-heading')
  region.hidden = true

  const heading = root.createElement('h4')
  heading.id = 'stage-d-quality-heading'
  heading.textContent = 'Otomatik kontrol'

  const status = root.createElement('p')
  status.id = 'stage-d-quality-status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')

  const help = root.createElement('p')
  help.id = 'stage-d-quality-help'
  help.textContent = 'İşaretler mevcut kalite raporunu gösterir; yeni nota veya hata tahmini yapmaz.'

  const selected = root.createElement('div')
  selected.id = 'stage-d-selected-measure-quality'
  selected.setAttribute('aria-live', 'polite')

  const global = root.createElement('div')
  global.id = 'stage-d-global-quality'

  region.appendChild(heading)
  region.appendChild(status)
  region.appendChild(help)
  region.appendChild(selected)
  region.appendChild(global)
  measureRegion.appendChild(region)
  return region
}

function decorateMeasureButtons(root, model) {
  const buttons = root.querySelectorAll?.('.measure-select-btn[data-measure-key]') ?? []
  const byKey = new Map(model.measures.map((measure) => [measure.measureKey, measure]))

  for (const button of buttons) {
    const key = button.getAttribute('data-measure-key')
    const measure = byKey.get(key)
    button.classList?.remove?.('quality-review', 'quality-block')
    button.removeAttribute?.('data-quality-state')
    button.removeAttribute?.('data-quality-findings')

    if (!measure) continue
    const stateCopy = qualityOverlayStatusCopy(measure.state)
    button.setAttribute('data-quality-state', measure.state)
    button.setAttribute('data-quality-findings', String(measure.count))
    button.classList?.add?.(
      measure.state === QUALITY_OVERLAY_STATE.BLOCK ? 'quality-block' : 'quality-review',
    )
    const baseLabel = button.getAttribute('aria-label') || button.textContent || 'Ölçü seç'
    button.setAttribute(
      'aria-label',
      `${baseLabel}; ${measure.count} kalite bulgusu; ${stateCopy.toLocaleLowerCase('tr-TR')}`,
    )
  }
}

function renderFindingList(root, target, findings, headingText) {
  target.replaceChildren()
  if (!Array.isArray(findings) || findings.length === 0) return

  const heading = root.createElement('h5')
  heading.textContent = headingText
  const list = root.createElement('ul')
  list.className = 'stage-d-quality-findings'

  for (const finding of findings) {
    const item = root.createElement('li')
    item.className = finding.severity === 'error' ? 'quality-block' : 'quality-review'
    item.textContent = finding.label
    // Package 2C does not expose an exact canonical note identity here. Never
    // add a note click/highlight target from measure/voice/staff proximity.
    item.setAttribute('data-exact-note-target', 'none')
    list.appendChild(item)
  }

  target.appendChild(heading)
  target.appendChild(list)
}

export function renderStageDQualityOverlay(root, snapshot) {
  if (!root || typeof root.getElementById !== 'function') return false
  const region = ensureOverlay(root)
  if (!region) return false

  const notes = snapshot?.notes
  if (!Array.isArray(notes) || notes.length === 0) {
    region.hidden = true
    return true
  }

  let model
  try {
    model = buildQualityOverlayModel(notes, snapshot?.selectedMeasureKey ?? null)
  } catch {
    region.hidden = true
    return false
  }

  const status = root.getElementById('stage-d-quality-status')
  if (status) {
    status.textContent = model.statusText
    status.setAttribute('data-quality-state', model.state)
  }

  decorateMeasureButtons(root, model)

  const selected = root.getElementById('stage-d-selected-measure-quality')
  if (selected) {
    selected.replaceChildren()
    if (snapshot?.selectedMeasureKey) {
      if (model.selectedMeasure) {
        renderFindingList(
          root,
          selected,
          model.selectedMeasure.findings,
          'Seçili ölçüde incelenecek bulgular',
        )
      } else {
        const clear = root.createElement('p')
        clear.textContent = 'Seçili ölçü için konumlandırılmış kalite bulgusu yok.'
        selected.appendChild(clear)
      }
    }
  }

  const global = root.getElementById('stage-d-global-quality')
  if (global) {
    renderFindingList(root, global, model.globalFindings, 'Eser geneli kalite bulguları')
  }

  region.hidden = false
  return true
}

export function initStageDQualityOverlay(root = document) {
  if (!root || typeof root.getElementById !== 'function' || boundRoots.has(root)) return false
  boundRoots.add(root)
  subscribePackage3Measures((snapshot) => {
    renderStageDQualityOverlay(root, snapshot)
  })
  return true
}

export function refreshStageDQualityOverlay(root = document) {
  return renderStageDQualityOverlay(root, getPackage3MeasureSnapshot())
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initStageDQualityOverlay(document), { once: true })
  } else {
    initStageDQualityOverlay(document)
  }
}
