// SesliTab — presentation-only score view shell.
//
// Existing TTS, keyboard navigation, measure selection, quality gating and
// teacher approval remain owned by SesliTab. This UI only consumes the bounded
// ST renderer interaction contract and resolves hits back to canonical notes.

import {
  getPackage3MeasureSnapshot,
  selectPackage3MeasureKey,
  selectPackage3NoteIndex,
  subscribePackage3Measures,
} from '../package3MeasureBridge.js'
import {
  clearScoreHighlights,
  clearScoreMeasureHighlights,
  clearScoreView,
  getCurrentScoreRenderEvidence,
  highlightScoreNote,
  hitTestScoreNote,
  moveScoreCursor,
  renderScoreView,
  resolveStScoreRuntime,
  ST_SCORE_RENDERER_REVIEWED_REVISION,
} from './services/scoreRendererConsumer.js'
import { deriveCanonicalNoteSelection } from './services/canonicalNoteSelection.js'
import { resolveCanonicalNoteFromScoreRef } from './services/scoreNoteIdentity.js'
import { deriveScoreMeasureSelection } from './services/scoreMeasureSync.js'
import {
  analyzeSuspiciousMeasures,
  resolveCorrectionAnalysisRuntime,
} from './services/correctionAnalysisConsumer.js'
import { replaceSuspiciousMeasureOverlays } from './services/correctionMeasureOverlay.js'

const SCORE_RUNTIME_URL = '/st-score-runtime/index.html'
const SCORE_RUNTIME_READY_TIMEOUT_MS = 10000
const CE_ANALYSIS_RUNTIME_URL = '/st-omr-correction-analysis-runtime/ce-analysis-browser-runtime.js'
const CE_ANALYSIS_RUNTIME_READY_TIMEOUT_MS = 10000
const scoreMeasureSubscriptions = new WeakMap()
const scoreRuntimeHosts = new WeakMap()
const scoreCursorSelections = new WeakMap()
const scoreHighlightSelections = new WeakMap()
const scoreNoteBindings = new WeakMap()
const correctionAnalysisLoads = new WeakMap()
let ticketCounter = 0

function nextTicket() {
  ticketCounter += 1
  return String(ticketCounter)
}

function selectionNotesFor(snapshot) {
  if (Array.isArray(snapshot?.selectionNotes)) return snapshot.selectionNotes
  return Array.isArray(snapshot?.notes) ? snapshot.notes : null
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

function sameRenderEvidence(left, right) {
  if (!left || !right || left.renderEpoch !== right.renderEpoch) return false
  return left.sourceId === right.sourceId
}

function setCorrectionOverlayState(root, state, count = 0) {
  const surface = root?.getElementById?.('score-view-surface')
  if (!surface?.dataset) return
  surface.dataset.correctionOverlayState = state
  surface.dataset.correctionOverlayCount = String(count)
}

async function loadCorrectionAnalysisRuntime(root, timeoutMs = CE_ANALYSIS_RUNTIME_READY_TIMEOUT_MS) {
  const scope = root?.defaultView ?? globalThis
  const connected = resolveCorrectionAnalysisRuntime(scope)
  if (connected) return connected
  if (!root || typeof root.createElement !== 'function' || !root.head?.appendChild) return null

  const pending = correctionAnalysisLoads.get(root)
  if (pending) return pending

  const promise = new Promise((resolve) => {
    let settled = false
    let timer = null
    const finish = (value) => {
      if (settled) return
      settled = true
      if (timer !== null) clearTimeout(timer)
      resolve(value)
    }

    let script = root.querySelector?.('script[data-seslitab-ce-analysis-runtime="true"]') ?? null
    const created = !script
    if (!script) {
      script = root.createElement('script')
      script.src = CE_ANALYSIS_RUNTIME_URL
      script.async = true
      script.dataset.seslitabCeAnalysisRuntime = 'true'
    }
    script.addEventListener?.('load', () => finish(resolveCorrectionAnalysisRuntime(scope)), { once: true })
    script.addEventListener?.('error', () => finish(null), { once: true })
    timer = setTimeout(() => finish(resolveCorrectionAnalysisRuntime(scope)), timeoutMs)
    if (created) root.head.appendChild(script)
    else {
      const ready = resolveCorrectionAnalysisRuntime(scope)
      if (ready) finish(ready)
    }
  })

  correctionAnalysisLoads.set(root, promise)
  const runtime = await promise
  if (!runtime) correctionAnalysisLoads.delete(root)
  return runtime
}

export async function syncCorrectionMeasureOverlays(
  root,
  rendererRuntime,
  musicxml,
  analysisRuntime = null,
) {
  try { await clearScoreMeasureHighlights(rendererRuntime) } catch {}
  setCorrectionOverlayState(root, 'cleared', 0)

  const expectedEvidence = getCurrentScoreRenderEvidence(rendererRuntime)
  if (!expectedEvidence || typeof musicxml !== 'string' || currentMusicXml(root) !== musicxml) return false
  const registeredAtStart = scoreRuntimeHosts.get(root)
  if (registeredAtStart !== undefined && registeredAtStart !== rendererRuntime) return false
  const sourceId = expectedEvidence.sourceId ?? `seslitab-render:${expectedEvidence.renderEpoch}`

  const runtime = analysisRuntime ?? await loadCorrectionAnalysisRuntime(root)
  if (!runtime) {
    setCorrectionOverlayState(root, 'unavailable', 0)
    return false
  }
  if (
    (registeredAtStart !== undefined && scoreRuntimeHosts.get(root) !== rendererRuntime)
    || !sameRenderEvidence(expectedEvidence, getCurrentScoreRenderEvidence(rendererRuntime))
    || currentMusicXml(root) !== musicxml
  ) {
    try { await clearScoreMeasureHighlights(rendererRuntime) } catch {}
    setCorrectionOverlayState(root, 'stale', 0)
    return false
  }

  let result
  try {
    result = analyzeSuspiciousMeasures(runtime, { musicxml, sourceId })
  } catch {
    try { await clearScoreMeasureHighlights(rendererRuntime) } catch {}
    setCorrectionOverlayState(root, 'unavailable', 0)
    return false
  }

  if (
    (registeredAtStart !== undefined && scoreRuntimeHosts.get(root) !== rendererRuntime)
    || !sameRenderEvidence(expectedEvidence, getCurrentScoreRenderEvidence(rendererRuntime))
    || currentMusicXml(root) !== musicxml
  ) {
    try { await clearScoreMeasureHighlights(rendererRuntime) } catch {}
    setCorrectionOverlayState(root, 'stale', 0)
    return false
  }

  const applied = await replaceSuspiciousMeasureOverlays(rendererRuntime, result, { expectedSourceId: sourceId })
  if (!applied) {
    setCorrectionOverlayState(root, 'rejected', 0)
    return false
  }
  const count = new Set(result.suspiciousMeasures.map((measure) => `${result.partId}\u0000${measure.measureIndex}`)).size
  setCorrectionOverlayState(root, 'ready', count)
  return true
}

function removeRuntimeFrame(root) {
  const frame = root?.getElementById?.('score-view-runtime-frame')
  frame?.remove?.()
}

function clearRenderedNoteBinding(root) {
  const binding = scoreNoteBindings.get(root)
  if (binding?.document && binding?.handler) {
    binding.document.removeEventListener?.('click', binding.handler)
  }
  scoreNoteBindings.delete(root)
}

async function resetScoreRuntime(root, runtime) {
  clearRenderedNoteBinding(root)
  scoreRuntimeHosts.delete(root)
  scoreCursorSelections.delete(root)
  scoreHighlightSelections.delete(root)
  try { await clearScoreMeasureHighlights(runtime) } catch {}
  try { await clearScoreView(runtime) } catch {}
  removeRuntimeFrame(root)
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
  status.dataset.cursorSynced = 'false'
  status.dataset.cursorPartId = selection.cursorTarget?.partId ?? ''
  status.dataset.cursorMeasureIndex = selection.cursorTarget ? String(selection.cursorTarget.measureIndex) : ''
  if (!selection.selected) {
    status.textContent = 'SesliTab ölçü seçimi yok. Görsel nota yalnızca sunum yapıyor.'
  } else if (!selection.cursorTarget) {
    status.textContent = `SesliTab seçimi: Ölçü ${selection.visibleLabel ?? selection.measureKey}. Görsel cursor için güvenli part/ölçü kimliği bulunamadı.`
  } else {
    status.textContent = `SesliTab seçimi: Ölçü ${selection.visibleLabel ?? selection.measureKey}. Görsel cursor canonical ölçü kimliğiyle eşlenmeye hazır.`
  }
  return true
}

export async function syncScoreMeasureCursor(root, bridgeSnapshot, runtime = scoreRuntimeHosts.get(root)) {
  if (!root || typeof root.getElementById !== 'function' || !runtime) return false
  const status = root.getElementById('score-view-measure-sync')
  if (!status) return false

  const selection = deriveScoreMeasureSelection(bridgeSnapshot)
  if (!selection.selected || !selection.cursorTarget) {
    status.dataset.cursorSynced = 'false'
    scoreCursorSelections.delete(root)
    return false
  }

  const signature = `${selection.cursorTarget.partId}:${selection.cursorTarget.measureIndex}`
  if (scoreCursorSelections.get(root) === signature && status.dataset.cursorSynced === 'true') return true

  try {
    await moveScoreCursor(runtime, selection.cursorTarget)
    scoreCursorSelections.set(root, signature)
    status.dataset.cursorSynced = 'true'
    status.dataset.cursorPartId = selection.cursorTarget.partId
    status.dataset.cursorMeasureIndex = String(selection.cursorTarget.measureIndex)
    status.textContent = `SesliTab seçimi: Ölçü ${selection.visibleLabel ?? selection.measureKey}. Görsel cursor bu canonical ölçüyle eşlendi.`
    return true
  } catch {
    await resetScoreRuntime(root, runtime)
    status.dataset.cursorSynced = 'false'
    status.textContent = 'Görsel cursor uygulanamadı; yanıltıcı eski nota gösterimi güvenli şekilde temizlendi.'
    return false
  }
}

export async function syncScoreNoteHighlight(root, bridgeSnapshot, runtime = scoreRuntimeHosts.get(root)) {
  if (!root || typeof root.getElementById !== 'function' || !runtime) return false
  const status = root.getElementById('score-view-note-sync')
  if (!status) return false

  const selection = deriveCanonicalNoteSelection(
    selectionNotesFor(bridgeSnapshot),
    bridgeSnapshot?.selectedMeasureKey,
    bridgeSnapshot?.selectedNoteIndex,
  )

  if (!selection.selected || !selection.rendererTarget) {
    scoreHighlightSelections.delete(root)
    try { await clearScoreHighlights(runtime) } catch {}
    status.dataset.noteSynced = 'false'
    status.textContent = selection.selected
      ? 'Seçili canonical nota için güvenli görsel nota kimliği kanıtlanamadı.'
      : 'Bir nota seçildiğinde aynı nota görsel üzerinde vurgulanır.'
    return false
  }

  const target = selection.rendererTarget
  const signature = `${target.partId}:${target.measureIndex}:${target.voice}:${target.noteIndex}`
  if (scoreHighlightSelections.get(root) === signature && status.dataset.noteSynced === 'true') return true

  try {
    await clearScoreHighlights(runtime)
    await highlightScoreNote(runtime, target)
    scoreHighlightSelections.set(root, signature)
    status.dataset.noteSynced = 'true'
    status.textContent = `Canonical Nota ${selection.measureNoteOrdinal + 1} görsel notayla eşlendi.`
    return true
  } catch {
    scoreHighlightSelections.delete(root)
    try { await clearScoreHighlights(runtime) } catch {}
    status.dataset.noteSynced = 'false'
    status.textContent = 'Görsel nota vurgusu uygulanamadı; eski vurgu güvenli şekilde temizlendi.'
    return false
  }
}

export function bindRenderedNoteSelection(root, frame, runtime) {
  if (!root || !frame || !runtime) return false
  let frameDocument
  try { frameDocument = frame.contentDocument } catch { return false }
  if (!frameDocument?.addEventListener) return false

  const existing = scoreNoteBindings.get(root)
  if (existing?.document === frameDocument) return true
  clearRenderedNoteBinding(root)

  const handler = (event) => {
    const rendererRef = hitTestScoreNote(runtime, { clientX: event.clientX, clientY: event.clientY })
    if (!rendererRef) return

    const snapshot = getPackage3MeasureSnapshot()
    const projectedNotes = selectionNotesFor(snapshot)
    const resolved = projectedNotes
      ? resolveCanonicalNoteFromScoreRef(projectedNotes, rendererRef)
      : null
    const status = root.getElementById('score-view-note-sync')
    if (!resolved) {
      if (status) {
        status.dataset.noteSynced = 'false'
        status.textContent = 'Dokunulan görsel nota canonical nota ile kesin eşlenemedi; seçim değiştirilmedi.'
      }
      return
    }

    if (!selectPackage3MeasureKey(resolved.measureKey)) return
    if (!selectPackage3NoteIndex(resolved.noteIndex, {
      rendererTarget: rendererRef,
      interaction: 'score-hit-test',
    })) return
  }

  frameDocument.addEventListener('click', handler)
  scoreNoteBindings.set(root, { document: frameDocument, handler })
  return true
}

function bindScoreMeasureSelection(root) {
  if (scoreMeasureSubscriptions.has(root)) return true
  const unsubscribe = subscribePackage3Measures((snapshot) => {
    renderScoreMeasureSelection(root, snapshot)
    const runtime = scoreRuntimeHosts.get(root)
    if (runtime) {
      void syncScoreMeasureCursor(root, snapshot, runtime)
      void syncScoreNoteHighlight(root, snapshot, runtime)
    }
  })
  scoreMeasureSubscriptions.set(root, unsubscribe)
  return true
}

export function ensureScoreViewPanel(root = document) {
  if (!root || typeof root.getElementById !== 'function' || typeof root.createElement !== 'function') return null

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
  measureSync.dataset.cursorSynced = 'false'
  measureSync.textContent = 'SesliTab ölçü seçimi yok. Görsel nota yalnızca sunum yapıyor.'

  const noteSync = root.createElement('p')
  noteSync.id = 'score-view-note-sync'
  noteSync.className = 'score-view-note-sync'
  noteSync.dataset.noteSynced = 'false'
  noteSync.setAttribute('aria-live', 'polite')
  noteSync.textContent = 'Bir nota seçildiğinde aynı nota görsel üzerinde vurgulanır.'

  const mobileHint = root.createElement('p')
  mobileHint.id = 'score-view-mobile-hint'
  mobileHint.className = 'score-view-mobile-hint'
  mobileHint.textContent = 'Notaya dokunarak canonical nota seçebilirsiniz. Dar ekranda nota görünümünü yatay kaydırabilirsiniz.'

  const surface = root.createElement('div')
  surface.id = 'score-view-surface'
  surface.className = 'score-view-surface'
  surface.tabIndex = 0
  surface.setAttribute('role', 'region')
  surface.setAttribute('aria-label', 'Görsel nota sayfası')
  surface.setAttribute('aria-describedby', 'score-view-mobile-hint')

  const provenance = root.createElement('p')
  provenance.className = 'score-view-provenance'
  provenance.textContent = `Renderer sınırı: ST Score Rendering Layer ${ST_SCORE_RENDERER_REVIEWED_REVISION.slice(0, 12)}`

  panel.appendChild(heading)
  panel.appendChild(status)
  panel.appendChild(measureSync)
  panel.appendChild(noteSync)
  panel.appendChild(mobileHint)
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
    removeRuntimeFrame(root)
    if (status) status.textContent = 'Görsel nota renderer başlatılamadı. Yeniden deneyebilirsiniz.'
    return false
  }

  if (status) status.textContent = 'Nota görünümü hazırlanıyor…'
  try {
    try { await clearScoreMeasureHighlights(runtime) } catch {}
    await renderScoreView(runtime, musicxml, { ticket: nextTicket() })
    scoreRuntimeHosts.set(root, runtime)
    scoreCursorSelections.delete(root)
    scoreHighlightSelections.delete(root)
    bindRenderedNoteSelection(root, frame, runtime)
    if (status) status.textContent = 'Görsel nota hazır. Notaya dokunarak seçim yapabilirsiniz.'
    const snapshot = getPackage3MeasureSnapshot()
    await syncScoreMeasureCursor(root, snapshot, runtime)
    await syncScoreNoteHighlight(root, snapshot, runtime)
    await syncCorrectionMeasureOverlays(root, runtime, musicxml)
    return true
  } catch (error) {
    await resetScoreRuntime(root, runtime)
    if (status) status.textContent = `Görsel nota oluşturulamadı: ${error?.message || 'bilinmeyen hata'}. Renderer temizlendi; yeniden deneyebilirsiniz.`
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