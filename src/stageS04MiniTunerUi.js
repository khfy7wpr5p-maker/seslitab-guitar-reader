// S04 — presentation-only mini tuner dock.
//
// Package 11 remains the sole microphone/pitch-analysis authority. S04 only
// relocates the already-installed tuner surface into a compact header panel,
// preserves the existing Start/Stop controls, and keeps secondary technical
// measurements in the existing Stage K details element.

export const STAGE_S04_TUNER_COPY = Object.freeze({
  toggleOpen: 'Akort cihazını aç',
  toggleClose: 'Akort cihazını kapat',
  panelLabel: 'Akort cihazı',
})

const boundToggles = new WeakSet()
const pendingStopWatchers = new WeakMap()

function appendClass(node, className) {
  const values = new Set(String(node?.className || '').split(/\s+/).filter(Boolean))
  values.add(className)
  if (node) node.className = [...values].join(' ')
}

function setExpanded(toggle, panel, expanded) {
  panel.hidden = !expanded
  toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false')
  toggle.setAttribute('aria-label', expanded ? STAGE_S04_TUNER_COPY.toggleClose : STAGE_S04_TUNER_COPY.toggleOpen)
  toggle.title = expanded ? STAGE_S04_TUNER_COPY.toggleClose : STAGE_S04_TUNER_COPY.toggleOpen
}

function clearPendingStopWatcher(root) {
  const watcher = pendingStopWatchers.get(root)
  watcher?.disconnect?.()
  pendingStopWatchers.delete(root)
}

function armPendingStopWatcher(root, start, stop) {
  clearPendingStopWatcher(root)
  const MutationObserverCtor = root?.defaultView?.MutationObserver ?? globalThis.MutationObserver
  if (typeof MutationObserverCtor !== 'function') return false

  const watcher = new MutationObserverCtor(() => {
    if (stop.disabled === false) {
      clearPendingStopWatcher(root)
      stop.click?.()
      return
    }
    if (start.disabled === false) clearPendingStopWatcher(root)
  })
  watcher.observe(start, { attributes: true, attributeFilter: ['disabled'] })
  watcher.observe(stop, { attributes: true, attributeFilter: ['disabled'] })
  pendingStopWatchers.set(root, watcher)
  return true
}

function prepareSafeClose(root) {
  const start = root.getElementById('tuner-start-btn')
  const stop = root.getElementById('tuner-stop-btn')
  if (!start || !stop) return true

  if (stop.disabled === false) {
    clearPendingStopWatcher(root)
    stop.click?.()
    return true
  }

  // Package 11 disables both controls only while explicit getUserMedia startup
  // is pending. Browser getUserMedia has no portable AbortSignal, so arm a
  // one-shot guard before hiding: if permission later resolves and Package 11
  // exposes Stop, immediately route through that existing authoritative stop.
  if (start.disabled === true && stop.disabled === true) {
    return armPendingStopWatcher(root, start, stop)
  }

  clearPendingStopWatcher(root)
  return true
}

function ensureDock(root, headerContent) {
  let dock = root.getElementById('stage-s04-tuner-dock')
  if (dock) return dock

  dock = root.createElement('div')
  dock.id = 'stage-s04-tuner-dock'
  dock.className = 'stage-s04-tuner-dock'

  const toggle = root.createElement('button')
  toggle.id = 'stage-s04-tuner-toggle'
  toggle.className = 'stage-s04-tuner-toggle'
  toggle.type = 'button'
  toggle.textContent = '♩'
  toggle.setAttribute('aria-controls', 'stage-s04-tuner-panel')
  toggle.setAttribute('aria-expanded', 'false')
  toggle.setAttribute('aria-label', STAGE_S04_TUNER_COPY.toggleOpen)
  toggle.title = STAGE_S04_TUNER_COPY.toggleOpen

  const panel = root.createElement('div')
  panel.id = 'stage-s04-tuner-panel'
  panel.className = 'stage-s04-tuner-panel'
  panel.setAttribute('role', 'region')
  panel.setAttribute('aria-label', STAGE_S04_TUNER_COPY.panelLabel)
  panel.hidden = true

  dock.appendChild(toggle)
  dock.appendChild(panel)
  headerContent.appendChild(dock)
  return dock
}

function moveSecondaryMeasurement(node, details) {
  if (node && details && node.parentElement !== details) details.appendChild(node)
}

function configurePrimaryAndSecondary(root, section, body, details) {
  const display = section.querySelector?.('.tuner-display') ?? null
  const cents = root.getElementById('tuner-cents')
  const centsWrap = cents?.parentElement ?? null
  const readout = section.querySelector?.('.tuner-readout') ?? null
  const frequency = root.getElementById('tuner-frequency')
  const frequencyWrap = frequency?.parentElement ?? null
  const octave = section.querySelector?.('.tuner-octave') ?? null
  const meter = root.getElementById('tuner-meter')
  const scale = section.querySelector?.('.tuner-scale') ?? null

  if (!display || !cents || !centsWrap || !readout || !frequency || !frequencyWrap) return false

  let primary = root.getElementById('stage-s04-tuner-primary-metrics')
  if (!primary) {
    primary = root.createElement('div')
    primary.id = 'stage-s04-tuner-primary-metrics'
    primary.className = 'stage-s04-tuner-primary-metrics'
    primary.setAttribute('aria-label', 'Akort sapması')
    if (details.parentElement === body && typeof body.insertBefore === 'function') body.insertBefore(primary, details)
    else body.appendChild(primary)
  }

  if (centsWrap.parentElement !== primary) primary.appendChild(centsWrap)
  if (frequencyWrap.parentElement !== readout) readout.appendChild(frequencyWrap)
  moveSecondaryMeasurement(octave, details)
  moveSecondaryMeasurement(meter, details)
  moveSecondaryMeasurement(scale, details)

  appendClass(display, 'stage-s04-tuner-primary-display')
  return true
}

function closePanelSafely(root, toggle, panel) {
  if (!prepareSafeClose(root)) return false
  setExpanded(toggle, panel, false)
  return true
}

function bindToggle(root, toggle, panel) {
  if (!toggle?.addEventListener || boundToggles.has(toggle)) return
  boundToggles.add(toggle)

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true'
    if (expanded) {
      closePanelSafely(root, toggle, panel)
      return
    }
    clearPendingStopWatcher(root)
    setExpanded(toggle, panel, true)
  })

  panel.addEventListener?.('keydown', (event) => {
    if (event?.key !== 'Escape') return
    if (!closePanelSafely(root, toggle, panel)) return
    toggle.focus?.()
  })
}

export function applyStageS04MiniTunerUi(root = document) {
  if (!root || typeof root.getElementById !== 'function') return false
  const headerContent = root.querySelector?.('.app-header .header-content') ?? null
  const section = root.getElementById('chromatic-tuner-section')
  const details = root.getElementById('stage-k-tuner-details')
  const body = section?.querySelector?.('.tuner-body') ?? null
  if (!headerContent || !section || !details || !body) return false

  const dock = ensureDock(root, headerContent)
  const toggle = root.getElementById('stage-s04-tuner-toggle')
  const panel = root.getElementById('stage-s04-tuner-panel')
  if (!dock || !toggle || !panel) return false

  if (!configurePrimaryAndSecondary(root, section, body, details)) return false
  if (section.parentElement !== panel) panel.appendChild(section)

  appendClass(section, 'stage-s04-mini-tuner')
  section.setAttribute('data-stage-s04-mini-tuner', 'ready')
  bindToggle(root, toggle, panel)
  setExpanded(toggle, panel, toggle.getAttribute('aria-expanded') === 'true')
  return true
}

export function initStageS04MiniTunerUi(root = document) {
  const init = () => applyStageS04MiniTunerUi(root)
  if (root?.readyState === 'loading') {
    root.addEventListener?.('DOMContentLoaded', init, { once: true })
    return true
  }
  return init()
}
