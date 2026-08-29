// SesliTab — presentation-only score view shell.
//
// Existing TTS, keyboard navigation, measure selection, quality gating and
// teacher approval remain owned by SesliTab. This UI only exposes a place for
// the ST renderer runtime to draw notation when that reviewed runtime is bound.

import {
  clearScoreView,
  renderScoreView,
  resolveStScoreRuntime,
  ST_SCORE_RENDERER_REVIEWED_REVISION,
} from './services/scoreRendererConsumer.js'

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
  status.textContent = 'ST score renderer bağlantısı bekleniyor.'

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
  panel.appendChild(surface)
  panel.appendChild(provenance)
  tabList.appendChild(button)
  if (notesSummary && notesSummary.parentElement === host) host.insertBefore(panel, notesSummary)
  else host.appendChild(panel)

  button.addEventListener('click', () => { void activateScoreView(root) })
  return panel
}

export async function activateScoreView(root = document, globalScope = globalThis) {
  const panel = ensureScoreViewPanel(root)
  if (!panel) return false

  setExistingResultTabs(root, 'score-view')
  panel.hidden = false
  const status = root.getElementById('score-view-status')
  const surface = root.getElementById('score-view-surface')
  const musicxml = currentMusicXml(root)

  if (!musicxml) {
    if (status) status.textContent = 'Görsel nota için MusicXML bulunamadı.'
    if (surface?.replaceChildren) surface.replaceChildren()
    return false
  }

  const runtime = resolveStScoreRuntime(globalScope)
  if (!runtime) {
    if (status) status.textContent = 'Nota görünümü hazır; ST renderer runtime henüz bağlanmadı.'
    if (surface?.replaceChildren) surface.replaceChildren()
    return false
  }

  if (status) status.textContent = 'Nota görünümü hazırlanıyor…'
  try {
    await renderScoreView(runtime, musicxml, { ticket: nextTicket() })
    if (status) status.textContent = 'Görsel nota hazır.'
    return true
  } catch (error) {
    try { await clearScoreView(runtime) } catch {}
    if (surface?.replaceChildren) surface.replaceChildren()
    if (status) status.textContent = `Görsel nota oluşturulamadı: ${error?.message || 'bilinmeyen hata'}`
    return false
  }
}

export function initScoreViewUi(root = document) {
  return Boolean(ensureScoreViewPanel(root))
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    initScoreViewUi(document)
  })
}
