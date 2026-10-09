import { parseMusicXml } from '../musicXmlParser.js'
import { prepareEditorGuitarTabHandoff } from './services/editorGuitarTabHandoff.js'
import { loadGuitarTabEditorRuntime } from './services/guitarTabEditorRuntimeLoader.js'
import { resolveGuitarTabEventMidi } from './services/guitarTabPitchPolicy.js'
import { createGuitarTabRendererTargetResolver } from './services/guitarTabSourceIdentity.js'
import {
  clearScoreHighlights,
  clearScoreView,
  highlightScoreNote,
  moveScoreCursor,
  renderScoreView,
  resolveStScoreRuntime,
} from './services/scoreRendererConsumer.js'
import { prepareTeacherAssignmentScoreUpload } from './services/teacherAssignmentComposerScoreUpload.js'
import { readMusicXmlSourceFile, validateMusicXmlFile } from './services/musicXmlFile.js'
import {
  extractGuitarTabScoreInventory,
  prepareGuitarTabEditorSourceXml,
} from './services/guitarTabScoreInventory.js'
import { resolveGuitarTabTargetSelection, selectCanonicalNotesForGuitarTabTarget } from './services/guitarTabTargetSelection.js'

const SCORE_RUNTIME_URL = '/st-score-runtime/index.html'
const SCORE_RUNTIME_READY_TIMEOUT_MS = 10000
const STRING_LABELS = Object.freeze(['1 · E4', '2 · B3', '3 · G3', '4 · D3', '5 · A2', '6 · E2'])
const FRET_COUNT = 21
const STANDARD_TUNING_MIDI = Object.freeze([64, 59, 55, 50, 45, 40])
const EDITOR_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Enter', 'Delete', 'Backspace', 'Escape'])
const GUITAR_TAB_MUSICXML_MIME = 'application/vnd.recordare.musicxml+xml'

const workspaceStates = new WeakMap()
const targetSynchronizationQueues = new WeakMap()
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

function setEditorStatus(root, text, state = 'ready') {
  const status = root?.getElementById?.('guitar-tab-editor-status')
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

function parseCanonicalNotes(xml) {
  try {
    const parsed = parseMusicXml(xml)
    return !parsed?.error && Array.isArray(parsed?.notes) ? parsed.notes : null
  } catch {
    return null
  }
}

async function downloadTextFile({ filename, text, mimeType = GUITAR_TAB_MUSICXML_MIME } = {}) {
  if (typeof filename !== 'string' || !filename || typeof text !== 'string') {
    throw new TypeError('Dosya adı ve metin gereklidir.')
  }
  if (typeof Blob !== 'function' || typeof URL?.createObjectURL !== 'function' || typeof document?.createElement !== 'function') {
    throw new Error('browser-download-unavailable')
  }
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }))
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.hidden = true
    document.body?.appendChild?.(anchor)
    anchor.click()
    anchor.remove?.()
  } finally {
    URL.revokeObjectURL(url)
  }
}

const defaultAdapters = Object.freeze({
  loadEditorRuntime: loadGuitarTabEditorRuntime,
  loadScoreRuntime,
  renderScore: renderScoreView,
  clearScore: clearScoreView,
  parseCanonicalNotes,
  clearHighlights: clearScoreHighlights,
  moveCursor: moveScoreCursor,
  highlightNote: highlightScoreNote,
  prepareScoreUpload: prepareTeacherAssignmentScoreUpload,
  prepareHandoff: prepareEditorGuitarTabHandoff,
  downloadText: downloadTextFile,
  validateMusicXmlFile,
  readMusicXmlSourceFile,
  extractScoreInventory: extractGuitarTabScoreInventory,
  prepareEditorSourceXml: prepareGuitarTabEditorSourceXml,
})

function normalizeAdapters(adapters = {}) {
  return {
    loadEditorRuntime: adapters.loadEditorRuntime ?? defaultAdapters.loadEditorRuntime,
    loadScoreRuntime: adapters.loadScoreRuntime ?? defaultAdapters.loadScoreRuntime,
    renderScore: adapters.renderScore ?? defaultAdapters.renderScore,
    clearScore: adapters.clearScore ?? defaultAdapters.clearScore,
    parseCanonicalNotes: adapters.parseCanonicalNotes ?? defaultAdapters.parseCanonicalNotes,
    clearHighlights: adapters.clearHighlights ?? defaultAdapters.clearHighlights,
    moveCursor: adapters.moveCursor ?? defaultAdapters.moveCursor,
    highlightNote: adapters.highlightNote ?? defaultAdapters.highlightNote,
    prepareScoreUpload: adapters.prepareScoreUpload ?? defaultAdapters.prepareScoreUpload,
    prepareHandoff: adapters.prepareHandoff ?? defaultAdapters.prepareHandoff,
    downloadText: adapters.downloadText ?? defaultAdapters.downloadText,
    validateMusicXmlFile: adapters.validateMusicXmlFile ?? defaultAdapters.validateMusicXmlFile,
    readMusicXmlSourceFile: adapters.readMusicXmlSourceFile ?? defaultAdapters.readMusicXmlSourceFile,
    extractScoreInventory: adapters.extractScoreInventory ?? defaultAdapters.extractScoreInventory,
    prepareEditorSourceXml: adapters.prepareEditorSourceXml ?? defaultAdapters.prepareEditorSourceXml,
  }
}

async function readSource(source, options = {}, adapters = normalizeAdapters()) {
  if (typeof source === 'string') return Object.freeze({ xml: source, name: options.filename ?? 'MusicXML' })
  if (!source || typeof source !== 'object') throw new TypeError('MusicXML dosyası veya XML metni gereklidir.')
  const validationError = adapters.validateMusicXmlFile(source)
  if (validationError) throw new Error(validationError)
  const readResult = await adapters.readMusicXmlSourceFile(source)
  return Object.freeze({
    xml: readResult.xmlText,
    name: readResult.sourceName,
  })
}

function emptyState(generation = 0) {
  return {
    generation,
    sourceName: null,
    sourceXml: null,
    sourceSession: null,
    parsedScoreSummary: null,
    selectedRegionSummary: null,
    canonicalTabRegions: Object.freeze([]),
    selectedRegion: null,
    rendererRuntime: null,
    editorRuntime: null,
    tabDocument: null,
    keyboardController: null,
    targetResolver: null,
    adapters: null,
    notationSynchronized: false,
  }
}

function currentControllerState(state) {
  try { return state?.keyboardController?.getState?.() ?? null } catch { return null }
}

function currentGroupEventIds(state, controllerState) {
  const group = state?.sourceSession?.groups?.find?.((item) => item.groupId === controllerState?.currentGroupId)
  return new Set(group?.sourceEventIds ?? [])
}

function currentEventMidi(state, controllerState) {
  const event = state?.sourceSession?.events?.find?.((item) => item.sourceEventId === controllerState?.currentEventId)
  return resolveGuitarTabEventMidi(event)
}

function canExportState(state) {
  if (!state?.sourceXml || !state?.sourceSession || !state?.tabDocument || typeof state?.editorRuntime?.serializeGuitarTabMusicXml !== 'function') return false
  try { return state.tabDocument.canExport?.() === true } catch { return false }
}

function updateExportButton(root, state) {
  const button = root?.getElementById?.('guitar-tab-export')
  if (!button) return
  const enabled = canExportState(state)
  button.disabled = !enabled
  button.setAttribute?.('aria-disabled', enabled ? 'false' : 'true')
}

function regionKey(region) {
  return JSON.stringify({
    partId: region.partId,
    partIndex: region.partIndex,
    staff: region.staff,
    voice: region.voice,
  })
}

function renderTargetOptions(root, state) {
  const select = root?.getElementById?.('guitar-tab-target-region')
  if (!select) return
  const regions = state?.canonicalTabRegions ?? []
  select.replaceChildren?.()
  const placeholder = createElement(root, 'option', { textContent: regions.length ? 'TAB hedefi seçin' : 'Uygun TAB bölgesi yok' })
  placeholder.value = ''
  select.appendChild(placeholder)
  for (const region of regions) {
    const option = createElement(root, 'option', {
      textContent: `${region.partName || region.partId} · Part ${region.partIndex + 1} · Staff ${region.staff} · Voice ${region.voice}`,
    })
    option.value = regionKey(region)
    select.appendChild(option)
  }
  select.hidden = regions.length <= 1
  select.value = state?.selectedRegion ? regionKey(state.selectedRegion) : ''
  select.disabled = regions.length === 0
}

function resolveCanonicalRegion(state, encodedRegion) {
  if (typeof encodedRegion !== 'string' || !encodedRegion) return null
  const region = state?.canonicalTabRegions?.find((candidate) => regionKey(candidate) === encodedRegion)
  return region ? Object.freeze({ partId: region.partId, partIndex: region.partIndex, staff: region.staff, voice: region.voice }) : null
}

async function activateTarget(root, state, selectedRegion) {
  if (!state || workspaceStates.get(root)?.generation !== state.generation) return false
  const invalidatedState = { ...state, sourceSession: null, selectedRegion: null, selectedRegionSummary: null, tabDocument: null, keyboardController: null, targetResolver: null, notationSynchronized: false }
  workspaceStates.set(root, invalidatedState)
  renderTargetOptions(root, invalidatedState)
  renderAuthoringSurface(root, invalidatedState)
  const canonicalNotes = state.canonicalNotes
  let selectedCanonicalNotes = canonicalNotes
  if (Array.isArray(canonicalNotes)) {
    try { selectedCanonicalNotes = selectCanonicalNotesForGuitarTabTarget(canonicalNotes, selectedRegion) }
    catch { selectedCanonicalNotes = Object.freeze([]) }
  }
  let sourceSession
  try {
    const editorSourceXml = state.adapters.prepareEditorSourceXml(state.sourceXml, selectedRegion)
    sourceSession = state.editorRuntime.createSourceSession(editorSourceXml, {
      targetSelection: selectedRegion,
      guitarOctaveTransposition: true,
    })
  }
  catch {
    if (workspaceStates.get(root) === invalidatedState) {
      renderTargetOptions(root, invalidatedState)
      setStatus(root, 'MusicXML güvenli biçimde açılamadı.', 'unsupported')
      setEditorStatus(root, 'Bu MusicXML editör tarafından açılamadı. Dosyanın nota verisini kontrol edin.', 'unsupported')
      await synchronizeAuthoringSelection(root, invalidatedState)
    }
    return false
  }
  if (workspaceStates.get(root)?.generation !== state.generation) return false
  const authoring = createAuthoringState(state.editorRuntime, sourceSession, selectedCanonicalNotes, canonicalNotes)
  const nextState = {
    ...state,
    sourceSession,
    selectedRegion,
    selectedRegionSummary: Object.freeze({
      ...selectedRegion,
      partName: state.canonicalTabRegions.find((region) => regionKey(region) === regionKey(selectedRegion))?.partName ?? selectedRegion.partId,
      pitchedEventCount: state.canonicalTabRegions.find((region) => regionKey(region) === regionKey(selectedRegion))?.pitchedEventCount ?? 0,
    }),
    tabDocument: authoring?.tabDocument ?? null,
    keyboardController: authoring?.keyboardController ?? null,
    targetResolver: authoring?.targetResolver ?? null,
    notationSynchronized: false,
  }
  workspaceStates.set(root, nextState)
  renderTargetOptions(root, nextState)
  renderAuthoringSurface(root, nextState)
  if (!authoring) {
    setStatus(root, 'MusicXML nota hedefleri bulundu ancak TAB editör oturumu oluşturulamadı.', 'unsupported')
    setEditorStatus(root, 'Bu nota bölgesi için düzenlenebilir TAB oturumu oluşturulamadı.', 'unsupported')
  }
  if (nextState.rendererRuntime) await synchronizeAuthoringSelection(root, nextState)
  if (workspaceStates.get(root) !== nextState) return false
  setStatus(root, `${nextState.sourceName} yüklendi. Nota ve seçili TAB çalışma alanı hazır.`, 'ready')
  return true
}

async function handleTargetChange(root, encodedRegion) {
  const state = workspaceStates.get(root)
  const selectedRegion = resolveCanonicalRegion(state, encodedRegion)
  if (!selectedRegion) {
    if (state) {
      const nextState = { ...state, sourceSession: null, selectedRegion: null, selectedRegionSummary: null, tabDocument: null, keyboardController: null, targetResolver: null, notationSynchronized: false }
      workspaceStates.set(root, nextState)
      renderAuthoringSurface(root, nextState)
      renderTargetOptions(root, nextState)
      await synchronizeAuthoringSelection(root, nextState)
      if (workspaceStates.get(root) === nextState) {
        setStatus(root, state.canonicalTabRegions.length ? 'TAB hedefi seçilmedi; dışa aktarma devre dışı.' : 'Bu MusicXML içinde kullanılabilir TAB bölgesi yok.', 'target-required')
        setEditorStatus(root, state.canonicalTabRegions.length
          ? 'Düzenlemeye devam etmek için TAB hedef bölgesini seçin.'
          : 'Bu MusicXML içinde TAB’a aktarılabilecek nota bulunamadı.', 'target-required')
      }
    }
    return false
  }
  return activateTarget(root, state, selectedRegion)
}

function renderEmptySixStrings(root) {
  const surface = root?.getElementById?.('guitar-tab-editor-surface')
  if (!surface) return
  if (typeof surface.replaceChildren === 'function') surface.replaceChildren()
  else surface.textContent = ''
  for (let index = 0; index < STRING_LABELS.length; index += 1) {
    const row = createElement(root, 'div', { className: 'guitar-tab-string-row', textContent: STRING_LABELS[index] })
    row.dataset.string = String(index + 1)
    surface.appendChild(row)
  }
  updateExportButton(root, workspaceStates.get(root))
}

async function assignFretboardPosition(root, string, fret) {
  const state = workspaceStates.get(root)
  const controller = state?.keyboardController
  if (!controller || !state?.tabDocument) return false

  try {
    let controllerState = controller.getState()
    controller.handleKey({ key: 'Escape' })
    controllerState = controller.getState()
    while (controllerState.selectedString < string) {
      controller.handleKey({ key: 'ArrowDown' })
      controllerState = controller.getState()
    }
    while (controllerState.selectedString > string) {
      controller.handleKey({ key: 'ArrowUp' })
      controllerState = controller.getState()
    }
    for (const digit of String(fret)) controller.handleKey({ key: digit })

    const advancesWithinChord = controllerState.noteCount > 1
      && controllerState.noteIndex < controllerState.noteCount - 1
    controller.handleKey({ key: advancesWithinChord ? 'Tab' : 'Enter' })
    renderAuthoringSurface(root, state)
    root?.getElementById?.('guitar-tab-editor-surface')?.focus?.()
    await synchronizeAuthoringSelection(root, state)
    return true
  } catch (error) {
    renderAuthoringSurface(root, state)
    setEditorStatus(root, assignmentErrorMessage(error), 'assignment-error')
    return false
  }
}

function renderAuthoringSurface(root, state) {
  const surface = root?.getElementById?.('guitar-tab-editor-surface')
  const controllerState = currentControllerState(state)
  if (!surface || !controllerState || !state?.tabDocument || !state?.editorRuntime?.createFixedSixStringRows) {
    renderEmptySixStrings(root)
    setEditorStatus(root, 'MusicXML yükleyerek tel/perde düzenlemeyi başlatın.', 'empty')
    updateExportButton(root, state)
    return false
  }

  let assignments = []
  try { assignments = state.tabDocument.listAssignments?.() ?? [] } catch { assignments = [] }
  const groupIds = currentGroupEventIds(state, controllerState)
  const placements = assignments.filter((item) => groupIds.has(item.sourceEventId))
  const currentMidi = currentEventMidi(state, controllerState)
  const occupiedStrings = new Set(placements
    .filter((item) => item.sourceEventId !== controllerState.currentEventId)
    .map((item) => item.string))
  let rows
  try {
    rows = state.editorRuntime.createFixedSixStringRows({ activeString: controllerState.selectedString, placements })
  } catch {
    renderEmptySixStrings(root)
    setEditorStatus(root, 'Altı telli editör görünümü oluşturulamadı.', 'runtime-error')
    updateExportButton(root, state)
    return false
  }

  if (typeof surface.replaceChildren === 'function') surface.replaceChildren()
  else surface.textContent = ''
  const header = createElement(root, 'div', { className: 'guitar-tab-fretboard-header' })
  header.setAttribute('role', 'row')
  header.appendChild(createElement(root, 'span', { className: 'guitar-tab-fretboard-string-heading', textContent: 'Tel' }))
  for (let fret = 0; fret < FRET_COUNT; fret += 1) {
    header.appendChild(createElement(root, 'span', { className: 'guitar-tab-fret-number', textContent: String(fret) }))
  }
  surface.appendChild(header)

  for (const rowModel of rows) {
    const suffix = rowModel.fret === null ? '' : ` · perde ${rowModel.fret}`
    const row = createElement(root, 'div', {
      className: `guitar-tab-string-row${rowModel.active ? ' active' : ''}${rowModel.fret === null ? '' : ' assigned'}`,
      textContent: '',
    })
    row.setAttribute('role', 'row')
    row.dataset.string = String(rowModel.string)
    if (rowModel.sourceEventId) row.dataset.sourceEventId = rowModel.sourceEventId
    if (rowModel.active) row.setAttribute('aria-current', 'true')
    row.appendChild(createElement(root, 'span', {
      className: 'guitar-tab-fretboard-string-label',
      textContent: `${STRING_LABELS[rowModel.string - 1] ?? `${rowModel.string} · ${rowModel.label}`}${suffix}`,
    }))
    for (let fret = 0; fret < FRET_COUNT; fret += 1) {
      const position = createElement(root, 'button', {
        className: `guitar-tab-fret-position${rowModel.fret === fret ? ' assigned' : ''}${rowModel.active ? ' active-string' : ''}`,
        textContent: rowModel.fret === fret ? String(fret) : '',
      })
      position.type = 'button'
      position.tabIndex = -1
      position.dataset.string = String(rowModel.string)
      position.dataset.fret = String(fret)
      position.setAttribute('aria-label', `Tel ${rowModel.string}, perde ${fret}`)
      position.setAttribute('aria-pressed', rowModel.fret === fret ? 'true' : 'false')
      const stringAvailable = !occupiedStrings.has(rowModel.string)
      const pitchMatches = currentMidi === null
        || STANDARD_TUNING_MIDI[rowModel.string - 1] + fret === currentMidi
      position.disabled = !pitchMatches || !stringAvailable
      position.setAttribute('aria-disabled', pitchMatches && stringAvailable ? 'false' : 'true')
      if (!pitchMatches || !stringAvailable) position.className += ' unavailable'
      position.addEventListener?.('click', async () => {
        if (!pitchMatches || !stringAvailable) return
        await assignFretboardPosition(root, rowModel.string, fret)
      })
      row.appendChild(position)
    }
    surface.appendChild(row)
  }

  const fretText = controllerState.fretBuffer ? controllerState.fretBuffer : '—'
  const playablePositions = currentMidi === null || STANDARD_TUNING_MIDI.some((openMidi) => currentMidi >= openMidi && currentMidi <= openMidi + FRET_COUNT - 1)
  setEditorStatus(
    root,
    playablePositions
      ? `Aktif nota: ${controllerState.currentEventId} · Tel ${controllerState.selectedString} · Perde ${fretText}. Uygun noktaya dokunun veya tıklayın.`
      : `Aktif nota: ${controllerState.currentEventId}. Nota standart akortta ilk 21 perde içinde bulunmuyor.`,
    playablePositions ? 'ready' : 'unplayable-note',
  )
  updateExportButton(root, state)
  return true
}

function createAuthoringState(editorRuntime, sourceSession, canonicalNotes, rendererCanonicalNotes = canonicalNotes) {
  if (
    typeof editorRuntime?.createTabAssignmentDocument !== 'function'
    || typeof editorRuntime?.createKeyboardController !== 'function'
    || typeof editorRuntime?.createFixedSixStringRows !== 'function'
    || !sourceSession?.groups?.length
  ) return null
  try {
    const tabDocument = editorRuntime.createTabAssignmentDocument(sourceSession)
    const keyboardController = editorRuntime.createKeyboardController({ sourceSession, document: tabDocument })
    const targetResolver = createGuitarTabRendererTargetResolver(sourceSession, rendererCanonicalNotes)
    return { tabDocument, keyboardController, targetResolver }
  } catch {
    return null
  }
}

async function synchronizeAuthoringSelectionNow(root, state) {
  if (!state?.rendererRuntime || !state?.adapters) return false
  const isCurrent = () => workspaceStates.get(root) === state
  if (!isCurrent()) return false
  const controllerState = currentControllerState(state)
  const target = controllerState ? state.targetResolver.resolve(controllerState.currentEventId) : null
  try { await state.adapters.clearHighlights(state.rendererRuntime) } catch {}
  if (!isCurrent()) return false
  if (!target) {
    state.notationSynchronized = false
    return false
  }
  try {
    await state.adapters.moveCursor(state.rendererRuntime, { partId: target.partId, measureIndex: target.measureIndex })
    if (!isCurrent()) return false
    await state.adapters.highlightNote(state.rendererRuntime, target)
    if (!isCurrent()) return false
    state.notationSynchronized = true
    return true
  } catch {
    if (!isCurrent()) return false
    state.notationSynchronized = false
    try { await state.adapters.clearHighlights(state.rendererRuntime) } catch {}
    return false
  }
}

function synchronizeAuthoringSelection(root, state) {
  const previous = targetSynchronizationQueues.get(root) ?? Promise.resolve()
  const current = previous.catch(() => false)
    .then(() => synchronizeAuthoringSelectionNow(root, state))
  targetSynchronizationQueues.set(root, current)
  return current.finally(() => {
    if (targetSynchronizationQueues.get(root) === current) {
      targetSynchronizationQueues.delete(root)
    }
  })
}

function isAuthoringKey(event) {
  const key = event?.key ?? ''
  if (EDITOR_KEYS.has(key) || /^[0-9]$/.test(key)) return true
  if (!event?.ctrlKey) return false
  const lower = key.toLowerCase()
  return lower === 'z' || lower === 'y'
}

function assignmentErrorMessage(error) {
  const text = typeof error?.message === 'string' ? error.message : ''
  if (/duplicate string/i.test(text)) return 'Aynı anda çalınan notalarda aynı tel iki kez kullanılamaz.'
  if (/invalid guitar position/i.test(text)) return `Tel/perde ataması kabul edilmedi: ${text}`
  if (/incomplete/i.test(text)) return 'Aynı anda çalınan nota grubunda tel/perde atamaları tamamlanmadı.'
  return text || 'Tel/perde işlemi kabul edilmedi.'
}

async function handleAuthoringKey(root, event) {
  if (!isAuthoringKey(event)) return false
  const state = workspaceStates.get(root)
  if (!state?.keyboardController || !state?.tabDocument) return false
  event.preventDefault?.()
  try {
    state.keyboardController.handleKey(event)
    renderAuthoringSurface(root, state)
    await synchronizeAuthoringSelection(root, state)
    return true
  } catch (error) {
    renderAuthoringSurface(root, state)
    setEditorStatus(root, assignmentErrorMessage(error), 'assignment-error')
    return false
  }
}

async function handleHistoryAction(root, action) {
  const state = workspaceStates.get(root)
  if (!state?.tabDocument || !['undo', 'redo'].includes(action)) return false
  try {
    state.tabDocument[action]()
    renderAuthoringSurface(root, state)
    await synchronizeAuthoringSelection(root, state)
    return true
  } catch {
    return false
  }
}

async function clearPreviousRender(root, adapters) {
  const previous = workspaceStates.get(root)
  if (previous?.rendererRuntime) {
    try { await adapters.clearHighlights(previous.rendererRuntime) } catch {}
    try { await adapters.clearScore(previous.rendererRuntime) } catch {}
  }
  removeScoreRuntimeFrame(root)
}

function exportFilename(sourceName) {
  const fallback = 'guitar-tab'
  const normalized = typeof sourceName === 'string' ? sourceName.trim() : ''
  const base = normalized ? normalized.replace(/\.(?:musicxml|xml)$/iu, '') : fallback
  return `${base || fallback}-guitar-tab.musicxml`
}

export function getGuitarTabTeacherWorkspaceState(root) {
  const state = workspaceStates.get(root)
  if (!state) return null
  const controllerState = currentControllerState(state)
  let assignmentCount = 0
  try { assignmentCount = state.tabDocument?.listAssignments?.().length ?? 0 } catch {}
  return Object.freeze({
    generation: state.generation,
    sourceName: state.sourceName,
    sourceSession: state.sourceSession,
    parsedScoreSummary: state.parsedScoreSummary,
    selectedRegionSummary: state.selectedRegionSummary,
    canonicalTabRegions: state.canonicalTabRegions,
    selectedRegion: state.selectedRegion,
    rendererAvailable: Boolean(state.rendererRuntime),
    authoringAvailable: Boolean(state.tabDocument && state.keyboardController),
    assignmentCount,
    currentEventId: controllerState?.currentEventId ?? null,
    selectedString: controllerState?.selectedString ?? null,
    fretBuffer: controllerState?.fretBuffer ?? '',
    notationSynchronized: state.notationSynchronized === true,
    exportReady: canExportState(state),
  })
}

export async function exportGuitarTabTeacherWorkspaceMusicXml(root, adapters = {}) {
  if (!root || typeof root.getElementById !== 'function') return Object.freeze({ ok: false, reason: 'INVALID_ROOT' })
  const state = workspaceStates.get(root)
  if (!state?.sourceXml || !state?.sourceSession || !state?.tabDocument) {
    return Object.freeze({ ok: false, reason: 'NO_SOURCE' })
  }
  if (!canExportState(state)) {
    return Object.freeze({ ok: false, reason: 'INCOMPLETE_ASSIGNMENTS' })
  }

  const normalized = state.adapters ?? normalizeAdapters(adapters)
  let musicXml
  let scoreUpload
  let handoff
  try {
    musicXml = state.editorRuntime.serializeGuitarTabMusicXml({
      sourceSession: state.sourceSession,
      document: state.tabDocument,
    })
    scoreUpload = await normalized.prepareScoreUpload({
      musicXml: state.sourceXml,
      teacherId: 'guitar-tab-workspace-local',
      draftId: state.sourceSession.sessionId,
      now: () => new Date().toISOString(),
    })
    if (workspaceStates.get(root) !== state) return Object.freeze({ ok: false, reason: 'STALE_TARGET' })
    handoff = await normalized.prepareHandoff({
      scoreUpload,
      guitarTabMusicXml: musicXml,
      draftId: state.sourceSession.sessionId,
      targetSelection: state.selectedRegion,
    })
  } catch {
    if (workspaceStates.get(root) !== state) return Object.freeze({ ok: false, reason: 'STALE_TARGET' })
    setEditorStatus(root, 'TAB MusicXML doğrulanamadı; dosya oluşturulmadı.', 'export-error')
    return Object.freeze({ ok: false, reason: 'EXPORT_VALIDATION_FAILED' })
  }

  if (workspaceStates.get(root) !== state) return Object.freeze({ ok: false, reason: 'STALE_TARGET' })
  const filename = exportFilename(state.sourceName)
  try {
    await normalized.downloadText({ filename, text: musicXml, mimeType: GUITAR_TAB_MUSICXML_MIME })
  } catch {
    if (workspaceStates.get(root) !== state) return Object.freeze({ ok: false, reason: 'STALE_TARGET' })
    setEditorStatus(root, 'TAB MusicXML doğrulandı ancak dosya indirilemedi.', 'export-error')
    return Object.freeze({ ok: false, reason: 'DOWNLOAD_FAILED' })
  }

  if (workspaceStates.get(root) !== state) return Object.freeze({ ok: false, reason: 'STALE_TARGET' })
  setEditorStatus(root, 'TAB MusicXML doğrulandı ve dışa aktarıldı.', 'export-ready')
  return Object.freeze({ ok: true, musicXml, filename, handoff })
}

export async function resetGuitarTabTeacherWorkspace(root, adapters = {}) {
  if (!root || typeof root.getElementById !== 'function') return false
  const normalized = normalizeAdapters(adapters)
  const previous = workspaceStates.get(root)
  const generation = (previous?.generation ?? 0) + 1
  await clearPreviousRender(root, normalized)
  const state = emptyState(generation)
  workspaceStates.set(root, state)
  renderTargetOptions(root, state)
  const input = root.getElementById('guitar-tab-source-input')
  if (input && 'value' in input) input.value = ''
  renderEmptySixStrings(root)
  updateExportButton(root, state)
  setEditorStatus(root, 'MusicXML yükleyerek tel/perde düzenlemeyi başlatın.', 'empty')
  setStatus(root, 'MusicXML yüklenmedi.', 'empty')
  return true
}

export async function loadGuitarTabTeacherSource(root, source, adapters = {}, options = {}) {
  if (!root || typeof root.getElementById !== 'function') return Object.freeze({ ok: false, reason: 'INVALID_ROOT' })

  const normalized = normalizeAdapters(adapters)
  const previous = workspaceStates.get(root)
  const generation = (previous?.generation ?? 0) + 1
  await clearPreviousRender(root, normalized)
  const loadingState = emptyState(generation)
  workspaceStates.set(root, loadingState)
  renderTargetOptions(root, loadingState)
  renderEmptySixStrings(root)
  setEditorStatus(root, 'MusicXML tel/perde düzenlemesi hazırlanıyor…', 'loading')
  setStatus(root, 'MusicXML yükleniyor…', 'loading')

  let payload
  try { payload = await readSource(source, options, normalized) } catch {
    if (workspaceStates.get(root)?.generation === generation) {
      setStatus(root, 'MusicXML dosyası okunamadı.', 'invalid')
      setEditorStatus(root, 'Dosya okunamadı. MusicXML dosyasını yeniden seçin.', 'invalid')
    }
    return Object.freeze({ ok: false, reason: 'SOURCE_READ_FAILED' })
  }

  let editorRuntime = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { editorRuntime = await normalized.loadEditorRuntime(root) } catch { editorRuntime = null }
    if (editorRuntime && typeof editorRuntime.createSourceSession === 'function') break
    if (attempt === 0) {
      if (workspaceStates.get(root)?.generation !== generation) {
        return Object.freeze({ ok: false, reason: 'STALE_SOURCE' })
      }
      setEditorStatus(root, 'TAB düzenleme bileşeni yeniden yükleniyor…', 'loading')
    }
  }
  if (!editorRuntime || typeof editorRuntime.createSourceSession !== 'function') {
    if (workspaceStates.get(root)?.generation === generation) {
      setStatus(root, 'Guitar TAB Editor çalışma zamanı kullanılamıyor.', 'runtime-unavailable')
      setEditorStatus(root, 'TAB düzenleme bileşeni yüklenemedi. Bağlantıyı kontrol edip dosyayı yeniden seçin.', 'runtime-unavailable')
    }
    return Object.freeze({ ok: false, reason: 'EDITOR_RUNTIME_UNAVAILABLE' })
  }

  if (workspaceStates.get(root)?.generation !== generation) {
    return Object.freeze({ ok: false, reason: 'STALE_SOURCE' })
  }

  let inventory
  let canonicalNotes
  try {
    inventory = normalized.extractScoreInventory(payload.xml)
    canonicalNotes = normalized.parseCanonicalNotes(payload.xml)
  } catch {
    if (workspaceStates.get(root)?.generation === generation) {
      renderEmptySixStrings(root)
      setStatus(root, 'MusicXML hedefleri güvenli biçimde çıkarılamadı.', 'unsupported')
      setEditorStatus(root, 'Bu MusicXML dosyasından güvenli nota hedefleri çıkarılamadı.', 'unsupported')
    }
    return Object.freeze({ ok: false, reason: 'SOURCE_UNSUPPORTED' })
  }
  if (!inventory || !Array.isArray(inventory.parts) || !Array.isArray(canonicalNotes)) {
    if (workspaceStates.get(root)?.generation === generation) {
      renderEmptySixStrings(root)
      setStatus(root, 'MusicXML hedefleri güvenli biçimde çıkarılamadı.', 'unsupported')
      setEditorStatus(root, 'Bu MusicXML dosyasından güvenli nota hedefleri çıkarılamadı.', 'unsupported')
    }
    return Object.freeze({ ok: false, reason: 'SOURCE_UNSUPPORTED' })
  }
  const canonicalTabRegions = Object.freeze(inventory.parts.flatMap((part) =>
    (part.staves ?? []).flatMap((staff) => (staff.voices ?? []).filter((voice) => voice.pitchedEventCount > 0).map((voice) => Object.freeze({
      partId: part.partId,
      partIndex: part.partIndex,
      staff: staff.staff,
      voice: voice.voice,
      partName: part.name,
      pitchedEventCount: voice.pitchedEventCount,
    }))),
  ))
  const targetResolution = resolveGuitarTabTargetSelection(inventory)
  const selectedRegion = targetResolution.state === 'resolved' ? targetResolution.targetSelection : null
  const parsedScoreSummary = inventory ? Object.freeze({
    partCount: inventory.parts.length,
    regionCount: canonicalTabRegions.length,
    pitchedEventCount: canonicalTabRegions.reduce((sum, region) => sum + region.pitchedEventCount, 0),
  }) : null
  const pendingState = {
    ...emptyState(generation),
    sourceName: payload.name,
    sourceXml: payload.xml,
    parsedScoreSummary,
    canonicalTabRegions,
    selectedRegion,
    inventory,
    canonicalNotes,
    editorRuntime,
    adapters: normalized,
  }
  workspaceStates.set(root, pendingState)
  renderTargetOptions(root, pendingState)
  if (selectedRegion) {
    const activated = await activateTarget(root, pendingState, selectedRegion)
    if (!activated) {
      if (workspaceStates.get(root)?.generation === generation && !workspaceStates.get(root)?.sourceSession) {
        return Object.freeze({ ok: false, reason: 'SOURCE_UNSUPPORTED' })
      }
      return Object.freeze({ ok: false, reason: 'STALE_SOURCE' })
    }
  }
  else {
    renderEmptySixStrings(root)
    setEditorStatus(root, canonicalTabRegions.length
      ? 'Birden fazla nota bölgesi var. Düzenlemek için TAB hedef bölgesini seçin.'
      : 'Bu MusicXML içinde TAB’a aktarılabilecek nota bulunamadı.', 'target-required')
    setStatus(root, canonicalTabRegions.length
      ? 'MusicXML yüklendi; TAB hedefini seçin. Belirsiz hedef otomatik seçilmedi.'
      : 'Bu MusicXML içinde kullanılabilir TAB bölgesi yok.', 'target-required')
  }
  if (workspaceStates.get(root)?.generation !== generation) return Object.freeze({ ok: false, reason: 'STALE_SOURCE' })
  let rendererRuntime = null
  try {
    rendererRuntime = await normalized.loadScoreRuntime(root)
    if (!rendererRuntime) throw new Error('renderer unavailable')
    await normalized.renderScore(rendererRuntime, payload.xml, {
      ticket: nextRenderTicket(), pageMode: 'continuous', autoResize: true, drawTitle: true, drawComposer: true,
    })
  } catch {
    const currentState = workspaceStates.get(root)
    if (currentState?.generation !== generation) {
      return Object.freeze({ ok: false, reason: 'STALE_SOURCE' })
    }
    removeScoreRuntimeFrame(root)
    setStatus(root, `${payload.name} yüklendi. Nota görünümü kullanılamadı; TAB çalışma alanı kullanılabilir.`, 'renderer-unavailable')
    return Object.freeze({ ok: true, sourceSession: currentState.sourceSession ?? null, rendererAvailable: false })
  }

  if (workspaceStates.get(root)?.generation !== generation) {
    try { await normalized.clearScore(rendererRuntime) } catch {}
    return Object.freeze({ ok: false, reason: 'STALE_SOURCE' })
  }

  const currentState = workspaceStates.get(root)
  currentState.rendererRuntime = rendererRuntime
  if (currentState.selectedRegion) await synchronizeAuthoringSelection(root, currentState)
  else {
    setEditorStatus(root, canonicalTabRegions.length
      ? 'Nota görünümü hazır. Düzenlemek için TAB hedef bölgesini seçin.'
      : 'Nota görünümü hazır; bu dosyada TAB’a aktarılabilecek nota bulunamadı.', 'target-required')
    setStatus(root, canonicalTabRegions.length
      ? 'Nota görünümü hazır. TAB için hedef bölge seçin.'
      : 'Nota görünümü hazır; kullanılabilir TAB bölgesi yok.', 'target-required')
  }
  return Object.freeze({ ok: true, sourceSession: currentState.sourceSession, rendererAvailable: true })
}

function bindWorkspaceControls(root) {
  if (workspaceBindings.has(root)) return
  const sourceInput = root.getElementById('guitar-tab-source-input')
  const targetSelect = root.getElementById('guitar-tab-target-region')
  const resetButton = root.getElementById('guitar-tab-source-reset')
  const editorSurface = root.getElementById('guitar-tab-editor-surface')
  const undoButton = root.getElementById('guitar-tab-undo')
  const redoButton = root.getElementById('guitar-tab-redo')
  const exportButton = root.getElementById('guitar-tab-export')
  sourceInput?.addEventListener?.('change', async () => {
    const file = sourceInput.files?.[0]
    if (file) {
      sourceInput.value = ''
      await loadGuitarTabTeacherSource(root, file)
    }
  })
  targetSelect?.addEventListener?.('change', async () => { await handleTargetChange(root, targetSelect.value) })
  resetButton?.addEventListener?.('click', async () => { await resetGuitarTabTeacherWorkspace(root) })
  editorSurface?.addEventListener?.('keydown', async (event) => { await handleAuthoringKey(root, event) })
  undoButton?.addEventListener?.('click', async () => { await handleHistoryAction(root, 'undo') })
  redoButton?.addEventListener?.('click', async () => { await handleHistoryAction(root, 'redo') })
  exportButton?.addEventListener?.('click', async () => { await exportGuitarTabTeacherWorkspaceMusicXml(root) })
  workspaceBindings.add(root)
}

export function ensureGuitarTabTeacherWorkspace(root, panel) {
  if (!root || typeof root.getElementById !== 'function' || typeof root.createElement !== 'function' || !panel?.appendChild) return null
  const existing = root.getElementById('guitar-tab-teacher-workspace')
  if (existing) { bindWorkspaceControls(root); return existing }

  const workspace = createElement(root, 'section', { id: 'guitar-tab-teacher-workspace', className: 'guitar-tab-teacher-workspace' })
  workspace.setAttribute('aria-labelledby', 'guitar-tab-workspace-heading')
  workspace.appendChild(createElement(root, 'h3', { id: 'guitar-tab-workspace-heading', textContent: 'Gitar TAB çalışma alanı' }))

  const sourceControls = createElement(root, 'div', { className: 'guitar-tab-source-controls' })
  const sourceLabel = createElement(root, 'label', { textContent: 'MusicXML yükle' })
  sourceLabel.setAttribute('for', 'guitar-tab-source-input')
  sourceControls.appendChild(sourceLabel)
  const sourceInput = createElement(root, 'input', { id: 'guitar-tab-source-input', className: 'guitar-tab-source-input' })
  sourceInput.type = 'file'
  sourceInput.setAttribute('accept', '.xml,.musicxml,.mxl,text/xml,application/xml,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml,application/zip')
  sourceControls.appendChild(sourceInput)
  const targetLabel = createElement(root, 'label', { textContent: 'TAB hedef bölgesi' })
  targetLabel.setAttribute('for', 'guitar-tab-target-region')
  sourceControls.appendChild(targetLabel)
  const targetSelect = createElement(root, 'select', { id: 'guitar-tab-target-region', className: 'guitar-tab-target-region' })
  targetSelect.setAttribute('aria-describedby', 'guitar-tab-source-status')
  sourceControls.appendChild(targetSelect)
  const resetButton = createElement(root, 'button', { id: 'guitar-tab-source-reset', className: 'guitar-tab-source-reset', textContent: 'Sıfırla' })
  resetButton.type = 'button'
  sourceControls.appendChild(resetButton)
  workspace.appendChild(sourceControls)

  const sourceStatus = createElement(root, 'div', { id: 'guitar-tab-source-status', className: 'guitar-tab-source-status', textContent: 'MusicXML yüklenmedi.' })
  sourceStatus.setAttribute('role', 'status'); sourceStatus.setAttribute('aria-live', 'polite'); sourceStatus.dataset.state = 'empty'
  workspace.appendChild(sourceStatus)

  const scoreRegion = createElement(root, 'section', { className: 'guitar-tab-score-region' })
  scoreRegion.appendChild(createElement(root, 'h4', { textContent: 'Nota görünümü' }))
  const scoreSurface = createElement(root, 'div', { id: 'guitar-tab-score-surface', className: 'guitar-tab-score-surface' })
  scoreSurface.setAttribute('aria-readonly', 'true'); scoreSurface.setAttribute('aria-label', 'Yüklenen MusicXML için salt okunur nota görünümü')
  scoreRegion.appendChild(scoreSurface); workspace.appendChild(scoreRegion)

  const editorRegion = createElement(root, 'section', { className: 'guitar-tab-editor-region' })
  editorRegion.appendChild(createElement(root, 'h4', { textContent: '6 telli TAB çalışma alanı' }))
  const toolbar = createElement(root, 'div', { className: 'guitar-tab-editor-toolbar' })
  const undoButton = createElement(root, 'button', { id: 'guitar-tab-undo', className: 'guitar-tab-history-btn', textContent: 'Geri al' })
  undoButton.type = 'button'
  const redoButton = createElement(root, 'button', { id: 'guitar-tab-redo', className: 'guitar-tab-history-btn', textContent: 'Yinele' })
  redoButton.type = 'button'
  const exportButton = createElement(root, 'button', { id: 'guitar-tab-export', className: 'guitar-tab-export-btn', textContent: 'TAB MusicXML dışa aktar' })
  exportButton.type = 'button'
  exportButton.disabled = true
  exportButton.setAttribute('aria-disabled', 'true')
  toolbar.appendChild(undoButton); toolbar.appendChild(redoButton); toolbar.appendChild(exportButton); editorRegion.appendChild(toolbar)
  const editorStatus = createElement(root, 'div', { id: 'guitar-tab-editor-status', className: 'guitar-tab-editor-status', textContent: 'MusicXML yükleyerek tel/perde düzenlemeyi başlatın.' })
  editorStatus.setAttribute('role', 'status'); editorStatus.setAttribute('aria-live', 'polite'); editorStatus.dataset.state = 'empty'
  editorRegion.appendChild(editorStatus)
  const editorSurface = createElement(root, 'div', { id: 'guitar-tab-editor-surface', className: 'guitar-tab-editor-surface' })
  editorSurface.setAttribute('aria-label', 'Altı telli gitar klavyesi; etkin nota için uygun tel ve perde noktalarını seçin')
  editorSurface.setAttribute('role', 'group')
  editorSurface.setAttribute('tabindex', '0')
  editorRegion.appendChild(editorSurface)
  workspace.appendChild(editorRegion)
  panel.appendChild(workspace)
  workspaceStates.set(root, emptyState(0))
  renderEmptySixStrings(root)
  bindWorkspaceControls(root)
  return workspace
}
