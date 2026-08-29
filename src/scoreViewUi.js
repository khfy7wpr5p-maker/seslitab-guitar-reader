// SesliTab — presentation-only score view shell.
//
// Existing TTS, keyboard navigation, measure selection, quality gating and
// teacher approval remain owned by SesliTab. This UI only exposes a place for
// the ST renderer runtime to draw notation.

import { subscribePackage3Measures } from '../package3MeasureBridge.js'
import {
  clearScoreView,
  renderScoreView,
  resolveStScoreRuntime,
  ST_SCORE_RENDERER_REVIEWED_REVISION,
} from './services/scoreRendererConsumer.js'
import { deriveScoreMeasureSelection } from './services/scoreMeasureSync.js'

const SCORE_RUNTIME_URL = '/st-score-runtime/index.html'
const SCORE_RUNTIME_READY_TIMEOUT_MS = 10000
const scoreMeasureSubscriptions = new WeakMap()
let ticketCounter = 0

function nextTicket() {
  ticketCounter += 1
  return String(ticketCounter)
}

function setExistingResultTabs(root, activeName) {
  const buttons = root.querySelectorAll?.('.tab-btn') ?? []
  for (const button of buttons) {
    const active = button.dataset?.tab === activeName
    button.classList?.toggle?.('active', active)
    button.setAttribute?.('aria-selected', active ? 'true' : 'false')
  }

  const panelIds = ['tab-rhythmic', 'tab-html', 'tab-notes', 'tab-xml', 'tab-guitar-tab', 'tab-violin', 'tab-chords']
  for (const id of panelIds) {
    const panel = root.getElementById(id)
    if (panel) panel.hidden = true
  }
}

function currentMusicXml(root) {
  const xmlOutput = root.getElementById('xml-output')
  const value = typeof xmlOutput?.textContent === 'string' ? xmlOutput.textContent : ''
  if (!value.trim() || value.startsWith('(TAB modunda')) return null
  return value
}

function ensureRuntimeFrame(root, surface) {
  let frame = root.getElementById('score-view-runtime-frame')
  if (frame) return frame

  frame = root.createElement('iframe')
  frame.id = 'score-view-runtime-frame'
  frame.className = 'score-view-runtime-frame'
  frame.title = 'ST görsel nota renderer'
  frame.src = SCORE_RUNTIME_URL
  frame.loading = 'eager'
  frame.setAttribute('aria-label', 'Görsel nota sayfası')
  frame.style.width = '100%'
  frame.style.minHeight = '640px'
  frame.style.border = '0'
  frame.style.background = '#fff'
  surface.replaceChildren(frame)
  return frame
}

async function waitForRuntime(frame, timeoutMs = SCORE_RUNTIME_READY_TIMEOUT_MS) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const runtime = resolveStScoreRuntime(frame?.contentWindow)
      if (runtime) return runtime
    } catch {
      return null
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return null
}

export function renderScoreMeasureSelection(root, bridgeSnapshot) {
  if (!root || typeof root.getElementById !== 'function') return false
  const status = root.getElementById('score-view-measure-sync')
  if (!status) return false

  const selection = deriveScoreMeasureSelection(bridgeSnapshot)
  status.dataset.measureKey = selection.measureKey ?? ''
  status.dataset.measureSelected = selection.selected ? 'true' : 'false'
  status.textContent = selection.selected
    ? `SesliTab seçimi: Ölçü ${selection.visibleLabel ?? selection.measureKey}. Görsel highlight sonraki güvenli aşamada bağlanacak.`
    : 'SesliTab ölçü seçimi yok. Görsel nota yalnızca sunum yapıyor.'
  return true
}

function bindScoreMeasureSelection(root) {
  if (scoreMeasureSubscriptions.has(root)) return true
  const unsubscribe = subscribePackage3Measures((snapshot) => {
    renderScoreMeasureSelection(root, snapshot)
  })
  scoreMeasureSubscriptions.set(root, unsubscribe)
  return true
}

export function ensureScoreViewPanel(root = document) {
  if (!root || typeof root.getElementById !== 'function' || typeof root.createElement !== 'function') {
    return null
  }

  const existing = root.getElementById('tab-score-view')
  if (existing) return existing

  const tabList = root.querySelector?.('.result-tabs') ?? null
  const notesSummary = root.getElementById('notes-summary')
  const host = notesSummary?.parentElement ?? tabList?.parentElement ?? null
  if (!tabList || !host) return null

  const button = root.createElement('button')
  button.id = 'result-score-view-btn'
  button.type = 'button'
  button.className = 'tab-btn'
  button.dataset.tab = 'score-view'
  button.textContent = 'Nota Görünümü'
  button.setAttribute('role', 'tab')
  button.setAttribute('aria-selected', 'false')
  button.setAttribute('aria-controls', 'tab-score-view')

  const panel = root.createElement('div')
  panel.id = 'tab-score-view'
  panel.className = 'tab-content score-view-panel'
  panel.hidden = true
  panel.setAttribute('role', 'tabpanel')
  panel.setAttribute('aria-labelledby', 'result-score-view-btn')

  const heading = root.createElement('h3')
  heading.textContent = 'Görsel Nota Görünümü'

  const status = root.createElement('div')
  status.id = 'score-view-status'
  status.className = 'score-view-status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.textContent = 'ST score renderer hazırlanıyor.'

  const measureSync = root.createElement('p')
  measureSync.id = 'score-view-measure-sync'
  measureSync.className = 'score-view-measure-sync'
  measureSync.dataset.measureSelected = 'false'
  measureSync.textContent = 'SesliTab ölçü seçimi yok. Görsel nota yalnızca sunum yapıyor.'

  const surface = root.createElement('div')
  surface.id = 'score-view-surface'
  surface.className = 'score-view-surface'
  surface.setAttribute('role', 'region')
  surface.setAttribute('aria-label', 'Görsel nota sayfası')

  const provenance = root.createElement('p')
  provenance.className = 'score-view-provenance'
  provenance.textContent = `Renderer sınırı: ST Score Rendering Layer ${ST_SCORE_RENDERER_REVIEWED_REVISION.slice(0, 12)}`

  panel.appendChild(heading)
  panel.appendChild(status)
  panel.appendChild(measureSync)
  panel.appendChild(surface)
  panel.appendChild(provenance)
  tabList.appendChild(button)
  if (notesSummary && notesSummary.parentElement === host) host.insertBefore(panel, notesSummary)
  else host.appendChild(panel)

  button.addEventListener('click', () => { void activateScoreView(root) })
  return panel
}

export async function activateScoreView(root = document) {
  const panel = ensureScoreViewPanel(root)
  if (!panel) return false

  bindScoreMeasureSelection(root)
  setExistingResultTabs(root, 'score-view')
  panel.hidden = false
  const status = root.getElementById('score-view-status')
  const surface = root.getElementById('score-view-surface')
  const musicxml = currentMusicXml(root)

  if (!musicxml) {
    if (status) status.textContent = 'Görsel nota için MusicXML bulunamadı.'
    return false
  }
  if (!surface) return false

  const frame = ensureRuntimeFrame(root, surface)
  if (status) status.textContent = 'ST renderer runtime başlatılıyor…'
  const runtime = await waitForRuntime(frame)
  if (!runtime) {
    if (status) status.textContent = 'Görsel nota renderer başlatılamadı.'
    return false
  }

  if (status) status.textContent = 'Nota görünümü hazırlanıyor…'
  try {
    await renderScoreView(runtime, musicxml, { ticket: nextTicket() })
    if (status) status.textContent = 'Görsel nota hazır.'
    return true
  } catch (error) {
    try { await clearScoreView(runtime) } catch {}
    if (status) status.textContent = `Görsel nota oluşturulamadı: ${error?.message || 'bilinmeyen hata'}`
    return false
  }
}

export function initScoreViewUi(root = document) {
  const panel = ensureScoreViewPanel(root)
  if (!panel) return false
  bindScoreMeasureSelection(root)
  return true
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    initScoreViewUi(document)
  })
}
