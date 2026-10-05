import { loadGuitarTabEditorRuntime } from './services/guitarTabEditorRuntimeLoader.js'
import {
  clearScoreView,
  renderScoreView,
  resolveStScoreRuntime,
} from './services/scoreRendererConsumer.js'

const SCORE_RUNTIME_URL = '/st-score-runtime/index.html'
const SCORE_RUNTIME_READY_TIMEOUT_MS = 10000
const STRING_LABELS = Object.freeze([
  '1 · E4',
  '2 · B3',
  '3 · G3',
  '4 · D3',
  '5 · A2',
  '6 · E2',
])

const workspaceStates = new WeakMap()
const workspaceBindings = new WeakSet()
let renderTicketCounter = 0

function nextRenderTicket() {
  renderTicketCounter += 1
  return String(renderTicketCounter)
}

function createElement(root, tagName, options = {}) {
  const element = root.createElement(tagName)
  if (options.id) element.id = options.id
  if (options.className) element.className = options.className
  if (options.textContent !== undefined) element.textContent = options.textContent
  return element
}

function setStatus(root, text, state) {
  const status = root?.getElementById?.('guitar-tab-source-status')
  if (!status) return
  status.textContent = text
  if (status.dataset) status.dataset.state = state
}

function clearScoreSurface(root) {
  const surface = root?.getElementById?.('guitar-tab-score-surface')
  if (!surface) return
  if (typeof surface.replaceChildren === 'function') surface.replaceChildren()
  else if ('textContent' in surface) surface.textContent = ''
}

function removeScoreRuntimeFrame(root) {
  const frame = root?.getElementById?.('guitar-tab-score-runtime-frame')
  frame?.remove?.()
  clearScoreSurface(root)
}

function ensureScoreRuntimeFrame(root) {
  const surface = root?.getElementById?.('guitar-tab-score-surface')
  if (!surface || typeof root?.createElement !== 'function') return null

  let frame = root.getElementById('guitar-tab-score-runtime-frame')
  if (frame) return frame

  frame = root.createElement('iframe')
  frame.id = 'guitar-tab-score-runtime-frame'
  frame.className = 'guitar-tab-score-runtime-frame'
  frame.title = 'ST salt okunur nota renderer'
  frame.src = SCORE_RUNTIME_URL
  frame.loading = 'eager'
  frame.setAttribute('aria-label', 'Yüklenen MusicXML nota görünümü')
  frame.style.width = '100%'
  frame.style.minHeight = '420px'
  frame.style.border = '0'
  frame.style.background = '#fff'
  if (typeof surface.replaceChildren === 'function') surface.replaceChildren(frame)
  else surface.appendChild(frame)
  return frame
}

async function waitForScoreRuntime(frame, timeoutMs = SCORE_RUNTIME_READY_TIMEOUT_MS) {
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

async function loadScoreRuntime(root) {
  const frame = ensureScoreRuntimeFrame(root)
  if (!frame) return null
  return waitForScoreRuntime(frame)
}

const defaultAdapters = Object.freeze({
  loadEditorRuntime: loadGuitarTabEditorRuntime,
  loadScoreRuntime,
  renderScore: renderScoreView,
  clearScore: clearScoreView,
})

function normalizeAdapters(adapters = {}) {
  return {
    loadEditorRuntime: adapters.loadEditorRuntime ?? defaultAdapters.loadEditorRuntime,
    loadScoreRuntime: adapters.loadScoreRuntime ?? defaultAdapters.loadScoreRuntime,
    renderScore: adapters.renderScore ?? defaultAdapters.renderScore,
    clearScore: adapters.clearScore ?? defaultAdapters.clearScore,
  }
}

async function readSource(source, options = {}) {
  if (typeof source === 'string') {
    return Object.freeze({
      xml: source,
      name: options.filename ?? 'MusicXML',
    })
  }
  if (!source || typeof source.text !== 'function') {
    throw new TypeError('MusicXML dosyası veya XML metni gereklidir.')
  }
  return Object.freeze({
    xml: await source.text(),
    name: typeof source.name === 'string' && source.name ? source.name : 'MusicXML',
  })
}

async function clearPreviousRender(root, adapters) {
  const previous = workspaceStates.get(root)
  if (previous?.rendererRuntime) {
    try { await adapters.clearScore(previous.rendererRuntime) } catch {}
  }
  removeScoreRuntimeFrame(root)
}

export function getGuitarTabTeacherWorkspaceState(root) {
  const state = workspaceStates.get(root)
  if (!state) return null
  return Object.freeze({
    generation: state.generation,
    sourceName: state.sourceName,
    sourceSession: state.sourceSession,
    rendererAvailable: Boolean(state.rendererRuntime),
  })
}

export async function resetGuitarTabTeacherWorkspace(root, adapters = {}) {
  if (!root || typeof root.getElementById !== 'function') return false
  const normalized = normalizeAdapters(adapters)
  const previous = workspaceStates.get(root)
  const generation = (previous?.generation ?? 0) + 1
  await clearPreviousRender(root, normalized)
  workspaceStates.set(root, {
    generation,
    sourceName: null,
    sourceSession: null,
    rendererRuntime: null,
  })

  const input = root.getElementById('guitar-tab-source-input')
  if (input && 'value' in input) input.value = ''
  setStatus(root, 'MusicXML yüklenmedi.', 'empty')
  return true
}

export async function loadGuitarTabTeacherSource(root, source, adapters = {}, options = {}) {
  if (!root || typeof root.getElementById !== 'function') {
    return Object.freeze({ ok: false, reason: 'INVALID_ROOT' })
  }

  const normalized = normalizeAdapters(adapters)
  const previous = workspaceStates.get(root)
  const generation = (previous?.generation ?? 0) + 1
  await clearPreviousRender(root, normalized)
  workspaceStates.set(root, {
    generation,
    sourceName: null,
    sourceSession: null,
    rendererRuntime: null,
  })
  setStatus(root, 'MusicXML yükleniyor…', 'loading')

  let payload
  try {
    payload = await readSource(source, options)
  } catch {
    if (workspaceStates.get(root)?.generation === generation) {
      setStatus(root, 'MusicXML dosyası okunamadı.', 'invalid')
    }
    return Object.freeze({ ok: false, reason: 'SOURCE_READ_FAILED' })
  }

  let editorRuntime
  try {
    editorRuntime = await normalized.loadEditorRuntime(root)
  } catch {
    editorRuntime = null
  }
  if (!editorRuntime || typeof editorRuntime.createSourceSession !== 'function') {
    if (workspaceStates.get(root)?.generation === generation) {
      setStatus(root, 'Guitar TAB Editor çalışma zamanı kullanılamıyor.', 'runtime-unavailable')
    }
    return Object.freeze({ ok: false, reason: 'EDITOR_RUNTIME_UNAVAILABLE' })
  }

  let sourceSession
  try {
    sourceSession = editorRuntime.createSourceSession(payload.xml)
  } catch {
    if (workspaceStates.get(root)?.generation === generation) {
      setStatus(root, 'MusicXML güvenli biçimde açılamadı.', 'unsupported')
    }
    return Object.freeze({ ok: false, reason: 'SOURCE_UNSUPPORTED' })
  }

  if (workspaceStates.get(root)?.generation !== generation) {
    return Object.freeze({ ok: false, reason: 'STALE_SOURCE' })
  }

  workspaceStates.set(root, {
    generation,
    sourceName: payload.name,
    sourceSession,
    rendererRuntime: null,
  })
  setStatus(root, `${payload.name} yüklendi. Nota görünümü hazırlanıyor…`, 'source-ready')

  let rendererRuntime = null
  try {
    rendererRuntime = await normalized.loadScoreRuntime(root)
    if (!rendererRuntime) throw new Error('renderer unavailable')
    await normalized.renderScore(rendererRuntime, payload.xml, {
      ticket: nextRenderTicket(),
      pageMode: 'continuous',
      autoResize: true,
      drawTitle: true,
      drawComposer: true,
    })
  } catch {
    if (workspaceStates.get(root)?.generation === generation) {
      removeScoreRuntimeFrame(root)
      setStatus(
        root,
        `${payload.name} yüklendi. Nota görünümü kullanılamadı; TAB çalışma alanı kullanılabilir.`,
        'renderer-unavailable',
      )
    }
    return Object.freeze({
      ok: true,
      sourceSession,
      rendererAvailable: false,
    })
  }

  if (workspaceStates.get(root)?.generation !== generation) {
    try { await normalized.clearScore(rendererRuntime) } catch {}
    return Object.freeze({ ok: false, reason: 'STALE_SOURCE' })
  }

  workspaceStates.set(root, {
    generation,
    sourceName: payload.name,
    sourceSession,
    rendererRuntime,
  })
  setStatus(root, `${payload.name} yüklendi. Nota ve TAB çalışma alanı hazır.`, 'ready')
  return Object.freeze({
    ok: true,
    sourceSession,
    rendererAvailable: true,
  })
}

function bindWorkspaceControls(root) {
  if (workspaceBindings.has(root)) return
  const sourceInput = root.getElementById('guitar-tab-source-input')
  const resetButton = root.getElementById('guitar-tab-source-reset')
  sourceInput?.addEventListener?.('change', async () => {
    const file = sourceInput.files?.[0]
    if (!file) return
    await loadGuitarTabTeacherSource(root, file)
  })
  resetButton?.addEventListener?.('click', async () => {
    await resetGuitarTabTeacherWorkspace(root)
  })
  workspaceBindings.add(root)
}

export function ensureGuitarTabTeacherWorkspace(root, panel) {
  if (
    !root
    || typeof root.getElementById !== 'function'
    || typeof root.createElement !== 'function'
    || !panel?.appendChild
  ) {
    return null
  }

  const existing = root.getElementById('guitar-tab-teacher-workspace')
  if (existing) {
    bindWorkspaceControls(root)
    return existing
  }

  const workspace = createElement(root, 'section', {
    id: 'guitar-tab-teacher-workspace',
    className: 'guitar-tab-teacher-workspace',
  })
  workspace.setAttribute('aria-labelledby', 'guitar-tab-workspace-heading')

  const heading = createElement(root, 'h3', {
    id: 'guitar-tab-workspace-heading',
    textContent: 'Gitar TAB çalışma alanı',
  })
  workspace.appendChild(heading)

  const sourceControls = createElement(root, 'div', {
    className: 'guitar-tab-source-controls',
  })
  const sourceLabel = createElement(root, 'label', {
    textContent: 'MusicXML yükle',
  })
  sourceLabel.setAttribute('for', 'guitar-tab-source-input')
  sourceControls.appendChild(sourceLabel)

  const sourceInput = createElement(root, 'input', {
    id: 'guitar-tab-source-input',
    className: 'guitar-tab-source-input',
  })
  sourceInput.type = 'file'
  sourceInput.setAttribute(
    'accept',
    '.xml,.musicxml,text/xml,application/xml,application/vnd.recordare.musicxml+xml',
  )
  sourceControls.appendChild(sourceInput)

  const resetButton = createElement(root, 'button', {
    id: 'guitar-tab-source-reset',
    className: 'guitar-tab-source-reset',
    textContent: 'Sıfırla',
  })
  resetButton.type = 'button'
  sourceControls.appendChild(resetButton)
  workspace.appendChild(sourceControls)

  const sourceStatus = createElement(root, 'div', {
    id: 'guitar-tab-source-status',
    className: 'guitar-tab-source-status',
    textContent: 'MusicXML yüklenmedi.',
  })
  sourceStatus.setAttribute('role', 'status')
  sourceStatus.setAttribute('aria-live', 'polite')
  if (sourceStatus.dataset) sourceStatus.dataset.state = 'empty'
  workspace.appendChild(sourceStatus)

  const scoreRegion = createElement(root, 'section', {
    className: 'guitar-tab-score-region',
  })
  const scoreHeading = createElement(root, 'h4', {
    textContent: 'Nota görünümü',
  })
  scoreRegion.appendChild(scoreHeading)
  const scoreSurface = createElement(root, 'div', {
    id: 'guitar-tab-score-surface',
    className: 'guitar-tab-score-surface',
  })
  scoreSurface.setAttribute('aria-readonly', 'true')
  scoreSurface.setAttribute('aria-label', 'Yüklenen MusicXML için salt okunur nota görünümü')
  scoreRegion.appendChild(scoreSurface)
  workspace.appendChild(scoreRegion)

  const editorRegion = createElement(root, 'section', {
    className: 'guitar-tab-editor-region',
  })
  const editorHeading = createElement(root, 'h4', {
    textContent: '6 telli TAB çalışma alanı',
  })
  editorRegion.appendChild(editorHeading)
  const editorSurface = createElement(root, 'div', {
    id: 'guitar-tab-editor-surface',
    className: 'guitar-tab-editor-surface',
  })
  editorSurface.setAttribute('aria-label', 'Altı telli gitar TAB çalışma alanı')

  for (let index = 0; index < STRING_LABELS.length; index += 1) {
    const row = createElement(root, 'div', {
      className: 'guitar-tab-string-row',
      textContent: STRING_LABELS[index],
    })
    row.dataset.string = String(index + 1)
    editorSurface.appendChild(row)
  }

  editorRegion.appendChild(editorSurface)
  workspace.appendChild(editorRegion)
  panel.appendChild(workspace)
  workspaceStates.set(root, {
    generation: 0,
    sourceName: null,
    sourceSession: null,
    rendererRuntime: null,
  })
  bindWorkspaceControls(root)
  return workspace
}
