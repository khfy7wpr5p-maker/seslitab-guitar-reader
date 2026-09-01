// STI-10/11/12 — production SMuFL keypad orchestration.
//
// One serialized pipeline owns keypad writes. Renderer hits remain owned by
// PR-B; Editor Core owns keypad mutation; Package 8 owns immutable product
// history; SesliTab structural revalidation must pass before rerender/current
// selection is rebound.

import {
  clearPackage3NoteSelection,
  getPackage3MeasureSnapshot,
  selectPackage3MeasureKey,
  selectPackage3NoteIndex,
  subscribePackage3Measures,
} from '../package3MeasureBridge.js'
import {
  getTeacherUiWorkspace,
  refreshTeacherUiAfterConflict,
  setTeacherUiAuthoritativeHistory,
} from './package8TeacherUi.js'
import {
  getTeacherWorkspaceApplicableApproval,
  getTeacherWorkspaceCurrentRevision,
} from './services/teacherWorkspaceModel.js'
import { resolveMusicXmlSourceForNotes } from './services/musicXmlSourceRegistry.js'
import {
  registerPrDProductMusicXml,
  resolvePrDProductMusicXml,
} from './services/editorPrDRevisionMusicXmlRegistry.js'
import {
  commitPrDProductRevision,
  currentPrDRevisionMusicXml,
  revalidatePrDEditorMusicXml,
  restorePrDProductRevision,
  validatePrDRestoredRevisionMusicXml,
} from './services/editorPrDProductPipeline.js'
import {
  commitPrDEditorAction,
  createPrDEditorSessionContext,
} from './services/editorPrDSession.js'
import { materializePrDEditorSessionMusicXml } from './services/editorPrDNotationBridge.js'
import {
  ADVANCED_EDITOR_KEYPAD_ACTION_IDS,
  BASIC_EDITOR_KEYPAD_ACTION_IDS,
  readEditorKeypadManifest,
} from './services/editorKeypadIntegration.js'
import {
  deriveScoreNoteRefForCanonicalNote,
} from './services/scoreNoteIdentity.js'
import {
  isStageS06SelectionCurrent,
  stageS06SelectionMatchesRevision,
} from './services/stageS06SelectionIdentity.js'
import {
  loadStagePrCSmuflPresentation,
  renderStagePrCKeypadShell,
} from './stagePrCKeypadUi.js'
import { activateScoreView, syncScoreNoteHighlight } from './scoreViewUi.js'
import { bindStagePrBEditorSelection } from './stagePrBEditorSelectionUi.js'
import { syncStageS06RevisionBinding } from './stageS06ExactSelectionUi.js'
import { syncStageS07VerifiedSelectionProjection } from './stageS07VerifiedSelectionProjection.js'

export const STAGE_PR_D_KEYPAD_VERSION = '1.0.0'
const EDITOR_RUNTIME_SRC = '/st-score-editor-core-runtime/st-score-editor-core.runtime.js'
const BASIC_ACTIONS = new Set(BASIC_EDITOR_KEYPAD_ACTION_IDS)
const ADVANCED_ACTIONS = new Set(ADVANCED_EDITOR_KEYPAD_ACTION_IDS)
const states = new WeakMap()
const runtimeLoads = new WeakMap()

function stateFor(root) {
  let state = states.get(root)
  if (!state) {
    state = {
      busy: false,
      presentation: null,
      manifest: null,
      pendingTarget: null,
      unsubscribe: null,
      keyHandler: null,
      lastError: null,
    }
    states.set(root, state)
  }
  return state
}

function secureId(root, prefix) {
  const randomUUID = root?.defaultView?.crypto?.randomUUID ?? globalThis.crypto?.randomUUID
  const scope = root?.defaultView?.crypto ?? globalThis.crypto
  if (typeof randomUUID !== 'function') throw new Error('Güvenli keypad revision kimliği üretilemiyor.')
  return `${prefix}-${randomUUID.call(scope)}`
}

function nowIso() {
  return new Date().toISOString()
}

function scoreState(root, value) {
  const workspace = root.getElementById?.('stage-s05-score-workspace')
  const scoreColumn = root.getElementById?.('stage-s05-score-column')
  workspace?.setAttribute?.('data-stage-s07-score-state', value)
  workspace?.setAttribute?.('data-sti-prd-keypad-active', 'true')
  scoreColumn?.setAttribute?.('aria-busy', value === 'revalidating' ? 'true' : 'false')
}

function announce(root, text, assertive = false) {
  const status = root.getElementById?.('stage-prc-keypad-status')
  if (status) {
    status.textContent = text
    status.setAttribute('role', assertive ? 'alert' : 'status')
    status.setAttribute('aria-live', assertive ? 'assertive' : 'polite')
  }
  const live = root.getElementById?.('aria-live-region')
  if (live) live.textContent = text
}

function currentWorkspaceRevision(root) {
  const workspace = getTeacherUiWorkspace(root)
  if (!workspace) return Object.freeze({ workspace: null, revision: null })
  try {
    return Object.freeze({ workspace, revision: getTeacherWorkspaceCurrentRevision(workspace) })
  } catch {
    return Object.freeze({ workspace, revision: null })
  }
}

function exactSelectionReady(snapshot, revision) {
  if (!revision || !snapshot?.selectedNoteIdentity || !Number.isSafeInteger(snapshot.selectedNoteIndex)) return false
  if (!isStageS06SelectionCurrent(snapshot, { requireRevision: true })) return false
  if (!stageS06SelectionMatchesRevision(snapshot, revision)) return false
  return ['score-editor-current-hit', 'editor-keypad-rebind'].includes(snapshot.selectedNoteIdentity.interaction)
}

async function loadEditorRuntime(root) {
  const globalScope = root?.defaultView ?? globalThis
  const existing = globalScope?.STScoreEditorCoreRuntime
  if (existing) return existing
  if (!root?.createElement) return null
  if (runtimeLoads.has(root)) return runtimeLoads.get(root)
  const promise = new Promise((resolve) => {
    const script = root.createElement('script')
    script.src = EDITOR_RUNTIME_SRC
    script.async = true
    script.setAttribute?.('data-seslitab-editor-runtime', 'true')
    script.addEventListener?.('load', () => resolve(globalScope?.STScoreEditorCoreRuntime ?? null), { once: true })
    script.addEventListener?.('error', () => resolve(null), { once: true })
    const parent = root.head ?? root.body ?? root.documentElement
    if (!parent?.appendChild) resolve(null)
    else parent.appendChild(script)
  })
  runtimeLoads.set(root, promise)
  return promise
}

async function ensurePresentation(root, state) {
  if (state.presentation && state.manifest) return true
  const runtime = await loadEditorRuntime(root)
  if (!runtime) throw new Error('Editor Core browser runtime yüklenemedi.')
  if (typeof runtime.createNotationDocument !== 'function') throw new Error('Editor Core notation rehydration contract eksik.')
  state.manifest = readEditorKeypadManifest(runtime)
  state.presentation = await loadStagePrCSmuflPresentation({
    fetchImpl: root?.defaultView?.fetch?.bind(root.defaultView) ?? globalThis.fetch,
    fontSet: root?.fonts ?? root?.defaultView?.document?.fonts,
  })
  return true
}

function rootProductXml(root, workspace, revision, snapshot) {
  const current = currentPrDRevisionMusicXml(revision)
  if (current) return current
  const rootRevision = workspace?.history?.revisions?.[0]
  if (!rootRevision || rootRevision.revisionId !== revision?.revisionId || !Array.isArray(snapshot?.notes)) return null
  const source = resolveMusicXmlSourceForNotes(snapshot.notes)
  const musicXml = source?.notes === snapshot.notes ? source.musicXml : null
  if (!musicXml) return null
  validatePrDRestoredRevisionMusicXml({
    revision: rootRevision,
    musicXml,
    DOMParserCtor: root?.defaultView?.DOMParser ?? globalThis.DOMParser,
  })
  registerPrDProductMusicXml(rootRevision, musicXml, { evidence: 'automatic-root-exact-source-revalidated' })
  return musicXml
}

function currentProductXml(root, workspace, revision, snapshot) {
  return currentPrDRevisionMusicXml(revision) ?? rootProductXml(root, workspace, revision, snapshot)
}

function historyTargets(workspace, revision) {
  if (!workspace || !revision) return Object.freeze({ undoTarget: null, redoTarget: null })
  const correction = workspace.history.correctionAuditEvents.find((event) => event.resultRevisionId === revision.revisionId) ?? null
  const restore = workspace.history.undoAuditEvents.find((event) => event.resultRevisionId === revision.revisionId) ?? null
  let undoTarget = null
  let redoTarget = null
  if (correction?.eventId?.startsWith('editor-keypad-edit-')) undoTarget = revision.parentRevisionId
  if (restore?.eventId?.startsWith('editor-keypad-redo-')) undoTarget = revision.parentRevisionId
  if (restore?.eventId?.startsWith('editor-keypad-undo-')) redoTarget = revision.parentRevisionId
  const hasXml = (targetId) => {
    const target = workspace.history.revisions.find((item) => item.revisionId === targetId)
    return Boolean(target && resolvePrDProductMusicXml(target)?.musicXml)
  }
  return Object.freeze({
    undoTarget: undoTarget && hasXml(undoTarget) ? undoTarget : null,
    redoTarget: redoTarget && hasXml(redoTarget) ? redoTarget : null,
  })
}

function appendHistoryControls(root, state, workspace, revision) {
  const shell = root.getElementById?.('stage-prc-keypad')
  if (!shell) return
  let row = root.getElementById?.('stage-prd-history-actions')
  if (row) row.remove?.()
  row = root.createElement('div')
  row.id = 'stage-prd-history-actions'
  row.className = 'stage-prd-history-actions'
  row.setAttribute('role', 'group')
  row.setAttribute('aria-label', 'Nota düzenleme geçmişi')
  const targets = historyTargets(workspace, revision)
  for (const [kind, label, target] of [
    ['undo', 'Geri al', targets.undoTarget],
    ['redo', 'Yinele', targets.redoTarget],
  ]) {
    const button = root.createElement('button')
    button.type = 'button'
    button.className = 'stage-prd-history-button'
    button.dataset.prdHistoryAction = kind
    button.textContent = label
    button.disabled = state.busy || !target
    if (target) button.addEventListener('click', (event) => {
      event.stopPropagation?.()
      void restoreHistory(root, kind, target)
    })
    row.appendChild(button)
  }
  shell.appendChild(row)
}

async function renderKeypad(root) {
  const state = stateFor(root)
  if (!root?.getElementById?.('stage-s05-score-column')) return false
  try {
    await ensurePresentation(root, state)
  } catch (error) {
    state.lastError = error
    announce(root, `Nota tuş takımı hazırlanamadı: ${error?.message ?? 'runtime hatası'}`, true)
    return false
  }
  const snapshot = getPackage3MeasureSnapshot()
  const { workspace, revision } = currentWorkspaceRevision(root)
  const ready = exactSelectionReady(snapshot, revision)
  const capturing = Boolean(state.pendingTarget)
  renderStagePrCKeypadShell(root, {
    manifest: state.manifest,
    glyphNames: state.presentation.glyphNames,
    exactSelectionReady: ready,
    productSyncPending: state.busy || capturing,
    advancedActionsReady: ready && !state.busy && !capturing,
    activePage: state.pendingTarget ? 3 : Number(root.getElementById?.('stage-prc-keypad')?.dataset?.page ?? 1),
    onAction: (actionId) => { void handleKeypadAction(root, actionId) },
  })
  appendHistoryControls(root, state, workspace, revision)
  if (state.pendingTarget) {
    const remaining = state.pendingTarget.required - state.pendingTarget.indexes.length
    announce(root, remaining > 0
      ? `${state.pendingTarget.label}: skor sırasıyla ${remaining} exact hedef daha seçin. Escape ile iptal.`
      : `${state.pendingTarget.label}: hedef tamamlandı.`)
  }
  return true
}

async function renderExactMusicXml(root, musicXml) {
  const xmlOutput = root.getElementById?.('xml-output')
  if (!xmlOutput || typeof xmlOutput.textContent !== 'string') return false
  const original = xmlOutput.textContent
  try {
    xmlOutput.textContent = musicXml
    const rendered = await activateScoreView(root)
    if (rendered) bindStagePrBEditorSelection(root)
    return rendered
  } finally {
    xmlOutput.textContent = original
  }
}

function updateWorkspaceFromHistory(root, history) {
  setTeacherUiAuthoritativeHistory(root, history)
  return refreshTeacherUiAfterConflict(root)
}

async function rebindAfterCurrentRender(root, revision, preferredIndex) {
  scoreState(root, 'verified')
  syncStageS07VerifiedSelectionProjection(root)
  const note = revision?.content?.[preferredIndex]
  if (!note || note.isRest === true) {
    clearPackage3NoteSelection()
    return false
  }
  const rendererTarget = deriveScoreNoteRefForCanonicalNote(revision.content, preferredIndex)
  if (!rendererTarget || !selectPackage3MeasureKey(note.measureKey) || !selectPackage3NoteIndex(preferredIndex, {
    rendererTarget,
    interaction: 'editor-keypad-rebind',
  })) {
    clearPackage3NoteSelection()
    return false
  }
  await syncScoreNoteHighlight(root, getPackage3MeasureSnapshot())
  return true
}

async function executeCommittedAction(root, actionId, productIndexes = null) {
  const state = stateFor(root)
  if (state.busy) return false
  const snapshot = getPackage3MeasureSnapshot()
  const { workspace, revision } = currentWorkspaceRevision(root)
  if (!workspace || !revision || !exactSelectionReady(snapshot, revision)) {
    announce(root, 'Düzenleme uygulanmadı: exact current nota seçimi gerekiyor.', true)
    return false
  }
  const musicXml = currentProductXml(root, workspace, revision, snapshot)
  if (!musicXml) {
    announce(root, 'Düzenleme uygulanmadı: current product revision için exact MusicXML kanıtı yok.', true)
    return false
  }

  state.busy = true
  state.pendingTarget = null
  scoreState(root, 'revalidating')
  await renderKeypad(root)
  announce(root, 'Düzenleme Editor Core ile atomik uygulanıyor ve skor yeniden doğrulanıyor…')

  const identity = Object.freeze({
    version: '1.0.0',
    transactionId: secureId(root, 'editor-keypad-tx'),
    nextRevisionId: secureId(root, 'editor-keypad-revision'),
  })
  try {
    const runtime = await loadEditorRuntime(root)
    const context = await createPrDEditorSessionContext({
      package3Snapshot: snapshot,
      teacherRevision: revision,
      musicXml,
      editorRuntime: runtime,
      cryptoScope: root?.defaultView?.crypto ?? globalThis.crypto,
      DOMParserCtor: root?.defaultView?.DOMParser ?? globalThis.DOMParser,
    })
    const committed = commitPrDEditorAction(context, actionId, { identity, productIndexes })
    const materializedXml = materializePrDEditorSessionMusicXml({
      session: committed.session,
      teacherRevision: revision,
      musicXml,
      mapping: committed.mapping,
      DOMParserCtor: root?.defaultView?.DOMParser ?? globalThis.DOMParser,
      XMLSerializerCtor: root?.defaultView?.XMLSerializer ?? globalThis.XMLSerializer,
    })
    const revalidated = revalidatePrDEditorMusicXml({
      musicXml: materializedXml,
      currentRevision: revision,
      changedIndexes: committed.changedIndexes,
      DOMParserCtor: root?.defaultView?.DOMParser ?? globalThis.DOMParser,
    })
    const product = commitPrDProductRevision({
      workspace,
      revalidated,
      revisionId: identity.nextRevisionId,
      eventId: secureId(root, 'editor-keypad-edit-event'),
      operationIdPrefix: secureId(root, 'editor-keypad-operation'),
      createdAt: nowIso(),
    })
    if (!product.ok) throw new Error(`Immutable product revision conflict: ${product.reason ?? 'unknown'}.`)

    const nextWorkspace = updateWorkspaceFromHistory(root, product.result.history)
    const current = getTeacherWorkspaceCurrentRevision(nextWorkspace)
    if (current.revisionId !== identity.nextRevisionId) throw new Error('Package 8 current revision did not advance to the exact Editor revision id.')
    if (getTeacherWorkspaceApplicableApproval(nextWorkspace)) throw new Error('New keypad revision inherited an old approval; pipeline stopped.')
    syncStageS06RevisionBinding(root)

    const rendered = await renderExactMusicXml(root, product.musicXml)
    if (!rendered) throw new Error('Revalidated product MusicXML could not be rendered with a fresh renderer result.')
    await rebindAfterCurrentRender(root, current, committed.selectedNoteIndex)
    announce(root, 'Düzenleme yeni immutable sürümde kaydedildi, doğrulandı ve skor güncellendi.')
    return true
  } catch (error) {
    state.lastError = error
    scoreState(root, 'blocked')
    announce(root, `Düzenleme current olarak uygulanmadı: ${error?.message ?? 'fail-closed hata'}`, true)
    return false
  } finally {
    state.busy = false
    await renderKeypad(root)
  }
}

function startAdvancedCapture(root, actionId) {
  const state = stateFor(root)
  const snapshot = getPackage3MeasureSnapshot()
  const { revision } = currentWorkspaceRevision(root)
  if (!exactSelectionReady(snapshot, revision)) {
    announce(root, 'Advanced düzenleme için önce exact current notayı seçin.', true)
    return false
  }
  const required = actionId === 'tuplet.triplet' ? 3 : 2
  const label = actionId === 'tuplet.triplet' ? 'Üçleme' : actionId === 'tie.edit' ? 'Uzatma bağı' : 'Deyim bağı'
  state.pendingTarget = {
    actionId,
    label,
    required,
    revisionId: revision.revisionId,
    indexes: [snapshot.selectedNoteIndex],
  }
  void renderKeypad(root)
  return true
}

async function handleKeypadAction(root, actionId) {
  if (BASIC_ACTIONS.has(actionId)) return executeCommittedAction(root, actionId)
  if (ADVANCED_ACTIONS.has(actionId)) return startAdvancedCapture(root, actionId)
  announce(root, `Desteklenmeyen keypad action: ${actionId}`, true)
  return false
}

function observeExplicitTarget(root, snapshot) {
  const state = stateFor(root)
  const pending = state.pendingTarget
  if (!pending || state.busy || !Number.isSafeInteger(snapshot?.selectedNoteIndex)) return
  const { revision } = currentWorkspaceRevision(root)
  if (!revision || revision.revisionId !== pending.revisionId || !exactSelectionReady(snapshot, revision)) {
    state.pendingTarget = null
    announce(root, 'Advanced hedef seçimi revision değiştiği için iptal edildi.', true)
    void renderKeypad(root)
    return
  }
  const index = snapshot.selectedNoteIndex
  if (pending.indexes.includes(index)) return
  pending.indexes.push(index)
  if (pending.indexes.length < pending.required) {
    void renderKeypad(root)
    return
  }
  const indexes = Object.freeze([...pending.indexes])
  const actionId = pending.actionId
  state.pendingTarget = null
  void executeCommittedAction(root, actionId, indexes)
}

async function restoreHistory(root, kind, targetRevisionId) {
  const state = stateFor(root)
  if (state.busy) return false
  const { workspace, revision } = currentWorkspaceRevision(root)
  if (!workspace || !revision) return false
  const selectedIndex = getPackage3MeasureSnapshot().selectedNoteIndex
  state.busy = true
  state.pendingTarget = null
  scoreState(root, 'revalidating')
  await renderKeypad(root)
  announce(root, kind === 'redo' ? 'Yineleme yeni immutable sürüm olarak oluşturuluyor…' : 'Geri alma yeni immutable sürüm olarak oluşturuluyor…')
  try {
    const restored = restorePrDProductRevision({
      workspace,
      targetRevisionId,
      revisionId: secureId(root, `editor-keypad-${kind}-revision`),
      eventId: secureId(root, `editor-keypad-${kind}-event`),
      createdAt: nowIso(),
      DOMParserCtor: root?.defaultView?.DOMParser ?? globalThis.DOMParser,
    })
    if (!restored.ok) throw new Error(`Immutable history conflict: ${restored.reason ?? 'unknown'}.`)
    const nextWorkspace = updateWorkspaceFromHistory(root, restored.result.history)
    const current = getTeacherWorkspaceCurrentRevision(nextWorkspace)
    if (getTeacherWorkspaceApplicableApproval(nextWorkspace)) throw new Error('Undo/redo revision inherited an old approval; pipeline stopped.')
    syncStageS06RevisionBinding(root)
    const rendered = await renderExactMusicXml(root, restored.musicXml)
    if (!rendered) throw new Error('Restored immutable revision could not be rerendered.')
    if (Number.isSafeInteger(selectedIndex)) await rebindAfterCurrentRender(root, current, selectedIndex)
    else scoreState(root, 'verified')
    announce(root, kind === 'redo' ? 'Yineleme yeni immutable sürümde tamamlandı ve skor yeniden doğrulandı.' : 'Geri alma yeni immutable sürümde tamamlandı ve skor yeniden doğrulandı.')
    return true
  } catch (error) {
    state.lastError = error
    scoreState(root, 'blocked')
    announce(root, `${kind === 'redo' ? 'Yineleme' : 'Geri alma'} current olarak uygulanmadı: ${error?.message ?? 'fail-closed hata'}`, true)
    return false
  } finally {
    state.busy = false
    await renderKeypad(root)
  }
}

function installEscapeCancel(root, state) {
  if (state.keyHandler || !root?.addEventListener) return
  state.keyHandler = (event) => {
    if (event.key !== 'Escape' || !state.pendingTarget) return
    state.pendingTarget = null
    announce(root, 'Advanced hedef seçimi iptal edildi.')
    void renderKeypad(root)
  }
  root.addEventListener('keydown', state.keyHandler)
}

export function applyStagePrDKeypadIntegrationUi(root = document) {
  if (!root || typeof root.getElementById !== 'function') return false
  const state = stateFor(root)
  installEscapeCancel(root, state)
  if (!state.unsubscribe) {
    state.unsubscribe = subscribePackage3Measures((snapshot) => {
      observeExplicitTarget(root, snapshot)
      void renderKeypad(root)
    })
  }
  root.getElementById?.('stage-s05-score-workspace')?.setAttribute?.('data-sti-prd-keypad-active', 'true')
  void renderKeypad(root)
  return true
}

export function initStagePrDKeypadIntegrationUi(root = document) {
  const init = () => applyStagePrDKeypadIntegrationUi(root)
  if (root?.readyState === 'loading') {
    root.addEventListener?.('DOMContentLoaded', init, { once: true })
    return true
  }
  return init()
}
