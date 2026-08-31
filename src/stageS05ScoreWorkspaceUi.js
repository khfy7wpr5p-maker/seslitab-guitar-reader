// S05 — presentation-only unified score workspace shell.
//
// This layer does not parse MusicXML, infer musical identity, mutate canonical
// notes, or own renderer lifecycle. It reuses the existing score-view panel and
// activateScoreView() boundary, preserving the currently selected result tab.

import { activateScoreView, ensureScoreViewPanel } from './scoreViewUi.js'

export const STAGE_S05_WORKSPACE_COPY = Object.freeze({
  heading: 'Nota Çalışma Alanı',
  inspectorHeading: 'Nota İncelemesi',
  inspectorPlaceholder: 'Bir notayı seçtiğinizde inceleme ve düzeltme araçları burada gösterilecek.',
})

const workspaceStates = new WeakMap()

function currentMusicXml(root) {
  const output = root.getElementById?.('xml-output')
  const value = typeof output?.textContent === 'string' ? output.textContent : ''
  if (!value.trim() || value.startsWith('(TAB modunda')) return null
  return value
}

function isResultReady(root) {
  const results = root.getElementById?.('results-section')
  return Boolean(results && results.hidden === false && currentMusicXml(root))
}

function snapshotResultTabs(root) {
  const buttons = [...(root.querySelectorAll?.('.result-tabs .tab-btn') ?? [])]
  const panels = []
  const seen = new Set()
  for (const button of buttons) {
    const panelId = button.getAttribute?.('aria-controls')
    const panel = panelId ? root.getElementById?.(panelId) : null
    if (panel && !seen.has(panel)) {
      seen.add(panel)
      panels.push({ panel, hidden: panel.hidden })
    }
  }
  return {
    buttons: buttons.map((button) => ({
      button,
      active: button.classList?.contains?.('active') === true,
      selected: button.getAttribute?.('aria-selected') ?? 'false',
    })),
    panels,
  }
}

function restoreResultTabs(snapshot) {
  for (const item of snapshot.buttons) {
    item.button.classList?.toggle?.('active', item.active)
    item.button.setAttribute?.('aria-selected', item.selected)
  }
  for (const item of snapshot.panels) item.panel.hidden = item.hidden
}

function ensureWorkspace(root, panel) {
  let workspace = root.getElementById?.('stage-s05-score-workspace')
  if (workspace) return workspace

  const results = root.getElementById?.('results-section')
  const appMain = results?.parentElement ?? root.querySelector?.('.app-main') ?? null
  if (!appMain || typeof root.createElement !== 'function') return null

  workspace = root.createElement('section')
  workspace.id = 'stage-s05-score-workspace'
  workspace.className = 'stage-s05-score-workspace'
  workspace.hidden = true
  workspace.setAttribute('aria-labelledby', 'stage-s05-score-workspace-heading')

  const heading = root.createElement('h2')
  heading.id = 'stage-s05-score-workspace-heading'
  heading.className = 'stage-s05-score-workspace-heading'
  heading.textContent = STAGE_S05_WORKSPACE_COPY.heading

  const grid = root.createElement('div')
  grid.className = 'stage-s05-score-workspace-grid'

  const scoreColumn = root.createElement('div')
  scoreColumn.id = 'stage-s05-score-column'
  scoreColumn.className = 'stage-s05-score-column'

  const inspector = root.createElement('aside')
  inspector.id = 'stage-s05-score-inspector'
  inspector.className = 'stage-s05-score-inspector'
  inspector.setAttribute('aria-labelledby', 'stage-s05-score-inspector-heading')

  const inspectorHeading = root.createElement('h3')
  inspectorHeading.id = 'stage-s05-score-inspector-heading'
  inspectorHeading.textContent = STAGE_S05_WORKSPACE_COPY.inspectorHeading

  const inspectorText = root.createElement('p')
  inspectorText.id = 'stage-s05-score-inspector-placeholder'
  inspectorText.textContent = STAGE_S05_WORKSPACE_COPY.inspectorPlaceholder

  inspector.appendChild(inspectorHeading)
  inspector.appendChild(inspectorText)
  scoreColumn.appendChild(panel)
  grid.appendChild(scoreColumn)
  grid.appendChild(inspector)
  workspace.appendChild(heading)
  workspace.appendChild(grid)

  if (results?.parentElement === appMain) appMain.insertBefore(workspace, results)
  else appMain.appendChild(workspace)
  return workspace
}

function configureScorePanel(root, panel) {
  const legacyButton = root.getElementById?.('result-score-view-btn')
  legacyButton?.remove?.()
  panel.hidden = true
  panel.removeAttribute?.('aria-labelledby')
  panel.setAttribute?.('aria-label', 'Görsel nota çalışma alanı')
  panel.setAttribute?.('data-stage-s05-workspace-panel', 'true')
}

async function renderWorkspace(root, state) {
  if (state.rendering) return false
  const musicxml = currentMusicXml(root)
  if (!musicxml || !isResultReady(root)) return false
  if (state.lastRenderedMusicXml === musicxml && state.workspace.hidden === false) return true

  state.rendering = true
  state.workspace.hidden = false
  state.panel.hidden = false
  const tabs = snapshotResultTabs(root)
  let result = false
  try {
    const pending = state.activate(root)
    // activateScoreView changes result-tab presentation synchronously before its
    // first await. Restore the user's existing result tab immediately; the score
    // panel now lives outside that tab system.
    restoreResultTabs(tabs)
    result = await pending
    if (result) state.lastRenderedMusicXml = musicxml
    return Boolean(result)
  } finally {
    restoreResultTabs(tabs)
    state.rendering = false
  }
}

function syncWorkspaceVisibility(root, state) {
  if (!isResultReady(root)) {
    state.workspace.hidden = true
    state.panel.hidden = true
    state.lastRenderedMusicXml = null
    return false
  }
  void renderWorkspace(root, state)
  return true
}

function installObserver(root, state) {
  if (state.observer) return true
  const Observer = root.defaultView?.MutationObserver ?? globalThis.MutationObserver
  if (typeof Observer !== 'function') return false
  const results = root.getElementById?.('results-section')
  const xml = root.getElementById?.('xml-output')
  if (!results || !xml) return false

  state.observer = new Observer(() => { syncWorkspaceVisibility(root, state) })
  state.observer.observe(results, { attributes: true, attributeFilter: ['hidden'] })
  state.observer.observe(xml, { childList: true, characterData: true, subtree: true })
  return true
}

export function applyStageS05ScoreWorkspaceUi(root = document, options = {}) {
  if (!root || typeof root.getElementById !== 'function') return false
  const panel = ensureScoreViewPanel(root)
  if (!panel) return false
  configureScorePanel(root, panel)
  const workspace = ensureWorkspace(root, panel)
  if (!workspace) return false

  let state = workspaceStates.get(root)
  if (!state) {
    state = {
      workspace,
      panel,
      activate: typeof options.activate === 'function' ? options.activate : activateScoreView,
      observer: null,
      rendering: false,
      lastRenderedMusicXml: null,
    }
    workspaceStates.set(root, state)
  }

  workspace.setAttribute('data-stage-s05-score-workspace', 'ready')
  if (options.observe !== false) installObserver(root, state)
  syncWorkspaceVisibility(root, state)
  return true
}

export function initStageS05ScoreWorkspaceUi(root = document) {
  const init = () => applyStageS05ScoreWorkspaceUi(root)
  if (root?.readyState === 'loading') {
    root.addEventListener?.('DOMContentLoaded', init, { once: true })
    return true
  }
  return init()
}
