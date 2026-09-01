// S12 — renderer-only session recovery for real mobile Safari.
//
// This layer never reloads the page, never re-runs OMR, never mutates source
// MusicXML, and never changes musical/quality/revision authority. It only
// reuses the already-present MusicXML in the current SesliTab session and calls
// the existing score-view activation path again when the renderer runtime fails
// to start.

import { activateScoreView } from './scoreViewUi.js'

const states = new WeakMap()
const STARTUP_FAILURE_RE = /^Görsel nota renderer başlatılamadı\./
const AUTO_RETRY_DELAY_MS = 350

function stateFor(root) {
  let state = states.get(root)
  if (!state) {
    state = {
      observer: null,
      retryTimer: null,
      retrying: false,
      autoRetryUsed: false,
      lastMusicXml: null,
    }
    states.set(root, state)
  }
  return state
}

function currentMusicXml(root) {
  const output = root.getElementById?.('xml-output')
  const value = typeof output?.textContent === 'string' ? output.textContent : ''
  if (!value.trim() || value.startsWith('(TAB modunda')) return null
  return value
}

export function isStageS12RendererStartupFailure(text) {
  return STARTUP_FAILURE_RE.test(String(text || ''))
}

function ensureRetryButton(root) {
  let button = root.getElementById?.('stage-s12-renderer-retry-btn')
  if (button) return button

  const status = root.getElementById?.('score-view-status')
  const host = status?.parentElement
  if (!status || !host || typeof root.createElement !== 'function') return null

  button = root.createElement('button')
  button.id = 'stage-s12-renderer-retry-btn'
  button.type = 'button'
  button.className = 'btn btn-secondary stage-s12-renderer-retry-btn'
  button.textContent = 'Nota ekranını yeniden başlat'
  button.setAttribute('aria-label', 'Yüklenen dosyayı koruyarak yalnız nota ekranını yeniden başlat')
  button.hidden = true
  button.addEventListener('click', () => {
    void retryStageS12RendererSession(root, { automatic: false })
  })

  if (typeof status.insertAdjacentElement === 'function') status.insertAdjacentElement('afterend', button)
  else host.appendChild(button)
  return button
}

function announce(root, text) {
  const live = root.getElementById?.('aria-live-region')
  if (live) live.textContent = text
}

export async function retryStageS12RendererSession(root = document, { automatic = false } = {}) {
  if (!root || typeof root.getElementById !== 'function') return false
  const state = stateFor(root)
  if (state.retrying) return false

  const musicxml = currentMusicXml(root)
  const status = root.getElementById?.('score-view-status')
  const button = ensureRetryButton(root)
  if (!musicxml || !status || !button) return false

  state.retrying = true
  button.disabled = true
  button.hidden = true
  status.textContent = automatic
    ? 'Nota ekranı otomatik olarak yeniden başlatılıyor…'
    : 'Nota ekranı yeniden başlatılıyor…'
  announce(root, 'PDF ve işlenmiş nota verisi korunuyor. Yalnız görsel nota ekranı yeniden başlatılıyor.')

  try {
    const restored = await activateScoreView(root)
    if (restored) {
      button.hidden = true
      button.disabled = false
      button.dataset.lastResult = 'restored'
      announce(root, 'Nota ekranı yeniden başlatıldı. Yüklenen dosya ve mevcut çalışma korunmuştur.')
      return true
    }

    button.hidden = false
    button.disabled = false
    button.dataset.lastResult = 'failed'
    announce(root, 'Nota ekranı yeniden başlatılamadı. Yüklenen dosya korunuyor; yeniden deneyebilirsiniz.')
    return false
  } finally {
    state.retrying = false
  }
}

export function syncStageS12RendererSessionRecovery(root = document) {
  if (!root || typeof root.getElementById !== 'function') return false
  const state = stateFor(root)
  const status = root.getElementById?.('score-view-status')
  const button = ensureRetryButton(root)
  if (!status || !button) return false

  const musicxml = currentMusicXml(root)
  if (musicxml !== state.lastMusicXml) {
    state.lastMusicXml = musicxml
    state.autoRetryUsed = false
  }

  const failed = Boolean(musicxml && isStageS12RendererStartupFailure(status.textContent))
  if (!failed) {
    if (!state.retrying) button.hidden = true
    return true
  }

  button.hidden = false
  button.disabled = state.retrying

  if (!state.autoRetryUsed && !state.retrying && !state.retryTimer) {
    state.autoRetryUsed = true
    state.retryTimer = setTimeout(() => {
      state.retryTimer = null
      void retryStageS12RendererSession(root, { automatic: true })
    }, AUTO_RETRY_DELAY_MS)
  }
  return true
}

function installObserver(root, state) {
  if (state.observer) return true
  const status = root.getElementById?.('score-view-status')
  const xml = root.getElementById?.('xml-output')
  const Observer = root.defaultView?.MutationObserver ?? globalThis.MutationObserver
  if (!status || !xml || typeof Observer !== 'function') return false

  state.observer = new Observer(() => {
    syncStageS12RendererSessionRecovery(root)
  })
  state.observer.observe(status, { childList: true, characterData: true, subtree: true })
  state.observer.observe(xml, { childList: true, characterData: true, subtree: true })
  return true
}

export function applyStageS12RendererSessionRecoveryUi(root = document) {
  if (!root || typeof root.getElementById !== 'function') return false
  const state = stateFor(root)
  if (!ensureRetryButton(root)) return false
  installObserver(root, state)
  syncStageS12RendererSessionRecovery(root)
  return true
}

export function initStageS12RendererSessionRecoveryUi(root = document) {
  const init = () => applyStageS12RendererSessionRecoveryUi(root)
  if (root?.readyState === 'loading') {
    root.addEventListener?.('DOMContentLoaded', init, { once: true })
    return true
  }
  return init()
}
