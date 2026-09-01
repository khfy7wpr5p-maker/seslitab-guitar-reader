// S07 — inline teacher note inspector + correction orchestration.
//
// Presentation/orchestration only. Package 8 remains the immutable revision and
// approval authority; Stage F remains the canonicalization, corrected MusicXML,
// structural revalidation and rerender authority; S06 remains the exact selected
// note identity gate. This module never edits source notes in place and never
// treats a correction as approval.

import {
  getPackage3MeasureSnapshot,
  subscribePackage3Measures,
} from '../package3MeasureBridge.js'
import {
  approveTeacherUiCurrentRevision,
  ensureTeacherPanel,
  getTeacherUiWorkspace,
  startTeacherWorkspace,
  undoTeacherUiRevision,
  applyTeacherUiCorrection,
} from './package8TeacherUi.js'
import {
  assessStageFRevisionLifecycle,
} from './services/stageFRevisionLifecycle.js'
import {
  getTeacherWorkspaceApplicableApproval,
} from './services/teacherWorkspaceModel.js'
import {
  STAGE_E_EDIT_FIELD,
  validateStageEEditValue,
} from './services/stageEVisualNoteEdit.js'
import { buildStageS07InlineInspectorModel } from './services/stageS07InlineInspector.js'
import {
  renderStageFRevisionLifecycle,
  verifyAndRerenderStageF,
} from './stageFRevisionLifecycleUi.js'
import {
  renderStageS06SelectionStatus,
  syncStageS06RevisionBinding,
} from './stageS06ExactSelectionUi.js'

const states = new WeakMap()

const SCORE_STATE = Object.freeze({
  SOURCE: 'source',
  VERIFIED: 'verified',
  REVALIDATING: 'revalidating',
  BLOCKED: 'blocked',
})

function stateFor(root) {
  let state = states.get(root)
  if (!state) {
    state = {
      busy: false,
      starting: false,
      scoreState: SCORE_STATE.SOURCE,
      lastNotes: null,
      unsubscribe: null,
    }
    states.set(root, state)
  }
  return state
}

function setStatus(root, text, { assertive = false } = {}) {
  const status = root.getElementById?.('stage-s07-inline-status')
  if (status) {
    status.textContent = text
    status.setAttribute('role', assertive ? 'alert' : 'status')
    status.setAttribute('aria-live', assertive ? 'assertive' : 'polite')
  }
  const globalLive = root.getElementById?.('aria-live-region')
  if (globalLive) globalLive.textContent = text
}

function setScoreState(root, nextState) {
  const state = stateFor(root)
  state.scoreState = nextState
  const workspace = root.getElementById?.('stage-s05-score-workspace')
  const scoreColumn = root.getElementById?.('stage-s05-score-column')
  workspace?.setAttribute?.('data-stage-s07-score-state', nextState)
  scoreColumn?.setAttribute?.('aria-busy', nextState === SCORE_STATE.REVALIDATING ? 'true' : 'false')
  return nextState
}

function secureActorLabel() {
  const randomUUID = globalThis.crypto?.randomUUID
  if (typeof randomUUID !== 'function') {
    throw new Error('Güvenli çalışma alanı kimliği üretilemiyor.')
  }
  return `score-inspector-session-${randomUUID.call(globalThis.crypto)}`
}

function ensureInlineWorkspace(root) {
  const existing = getTeacherUiWorkspace(root)
  if (existing) return existing

  const snapshot = getPackage3MeasureSnapshot()
  if (!Array.isArray(snapshot.notes) || snapshot.notes.length === 0) return null

  const state = stateFor(root)
  if (state.starting) return null
  state.starting = true
  try {
    ensureTeacherPanel(root)
    const actor = root.getElementById?.('teacher-actor-id')
    if (!actor) return null

    const previous = typeof actor.value === 'string' ? actor.value : ''
    const generated = previous.trim() === ''
    if (generated) actor.value = secureActorLabel()
    const workspace = startTeacherWorkspace(root)
    if (generated) actor.value = ''
    if (workspace) {
      setScoreState(root, SCORE_STATE.SOURCE)
      syncStageS06RevisionBinding(root)
    }
    return workspace
  } catch (error) {
    setStatus(root, `Düzeltme çalışma alanı hazırlanamadı: ${error?.message ?? 'güvenli kimlik üretilemedi'}`, { assertive: true })
    return null
  } finally {
    state.starting = false
  }
}

function ensureInspector(root) {
  const host = root.getElementById?.('stage-s05-score-inspector')
  if (!host || typeof root.createElement !== 'function') return null
  let panel = root.getElementById?.('stage-s07-inline-teacher-inspector')
  if (panel) return panel

  panel = root.createElement('section')
  panel.id = 'stage-s07-inline-teacher-inspector'
  panel.className = 'stage-s07-inline-teacher-inspector'
  panel.setAttribute('aria-labelledby', 'stage-s07-inline-heading')

  const heading = root.createElement('h4')
  heading.id = 'stage-s07-inline-heading'
  heading.textContent = 'Seçili notayı düzelt'
  panel.appendChild(heading)

  const help = root.createElement('p')
  help.id = 'stage-s07-inline-help'
  help.className = 'stage-s07-inline-help'
  help.textContent = 'Yalnız nota harfi, arıza, oktav ve süre düzenlenebilir. Her kayıt yeni immutable sürüm oluşturur; skor yalnız canonicalization ve doğrulama geçerse yenilenir. Düzeltme onay değildir.'
  panel.appendChild(help)

  const status = root.createElement('p')
  status.id = 'stage-s07-inline-status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  panel.appendChild(status)

  const fields = root.createElement('div')
  fields.id = 'stage-s07-inline-fields'
  fields.className = 'stage-s07-inline-fields'
  fields.setAttribute('aria-describedby', 'stage-s07-inline-help')
  panel.appendChild(fields)

  const actions = root.createElement('div')
  actions.className = 'stage-s07-inline-actions'
  actions.setAttribute('role', 'group')
  actions.setAttribute('aria-label', 'Sürüm işlemleri')

  const undo = root.createElement('button')
  undo.id = 'stage-s07-undo-btn'
  undo.type = 'button'
  undo.className = 'btn btn-secondary'
  undo.textContent = 'Son değişikliği geri al'
  actions.appendChild(undo)

  const approve = root.createElement('button')
  approve.id = 'stage-s07-approve-btn'
  approve.type = 'button'
  approve.className = 'btn btn-secondary'
  approve.textContent = 'Geçerli sürümü ayrıca onayla'
  actions.appendChild(approve)

  panel.appendChild(actions)
  host.appendChild(panel)
  return panel
}

function appendOption(root, select, value, text) {
  const option = root.createElement('option')
  option.value = String(value)
  option.textContent = text
  select.appendChild(option)
}

function fieldControl(root, field) {
  const row = root.createElement('div')
  row.className = 'stage-s07-inline-field'

  const id = `stage-s07-${field.field}`
  const label = root.createElement('label')
  label.setAttribute('for', id)
  label.textContent = field.label
  row.appendChild(label)

  let input
  if (field.field === STAGE_E_EDIT_FIELD.PITCH) {
    input = root.createElement('select')
    for (const step of ['C', 'D', 'E', 'F', 'G', 'A', 'B']) appendOption(root, input, step, step)
  } else if (field.field === STAGE_E_EDIT_FIELD.ACCIDENTAL) {
    input = root.createElement('select')
    for (const [value, text] of [['-2', 'Çift bemol'], ['-1', 'Bemol'], ['0', 'Doğal'], ['1', 'Diyez'], ['2', 'Çift diyez']]) {
      appendOption(root, input, value, text)
    }
  } else {
    input = root.createElement('input')
    input.type = 'number'
    input.step = '1'
    if (field.field === STAGE_E_EDIT_FIELD.OCTAVE) {
      input.min = '0'
      input.max = '9'
    } else {
      input.min = '1'
      input.max = '1000000'
    }
  }
  input.id = id
  input.dataset.stageS07Field = field.field
  input.value = String(field.value)
  row.appendChild(input)

  const save = root.createElement('button')
  save.type = 'button'
  save.className = 'btn btn-primary stage-s07-apply-field'
  save.dataset.stageS07Field = field.field
  save.textContent = `${field.label} kaydet`
  row.appendChild(save)
  return row
}

export function renderStageS07InlineInspector(root = document) {
  const panel = ensureInspector(root)
  if (!panel) return false

  const state = stateFor(root)
  const workspace = getTeacherUiWorkspace(root)
  const snapshot = getPackage3MeasureSnapshot()
  const model = buildStageS07InlineInspectorModel({ workspace, snapshot })
  const fields = root.getElementById?.('stage-s07-inline-fields')
  fields?.replaceChildren?.()

  if (!model) {
    if (fields) fields.hidden = true
    root.getElementById('stage-s07-undo-btn').disabled = true
    root.getElementById('stage-s07-approve-btn').disabled = true
    setStatus(root, 'Eser hazır olduğunda güvenli öğretmen çalışma alanı otomatik hazırlanır.')
    return true
  }

  if (model.selected) {
    for (const field of model.fields) fields?.appendChild?.(fieldControl(root, field))
    if (fields) fields.hidden = false
    if (!state.busy && state.scoreState !== SCORE_STATE.BLOCKED) {
      setStatus(root, `Nota ${model.noteIndex + 1} exact current revision ile doğrulandı. Gösterilen alanlardan birini kaydedebilirsiniz.`)
    }
  } else {
    if (fields) fields.hidden = true
    if (!state.busy && state.scoreState !== SCORE_STATE.BLOCKED) {
      setStatus(root, 'Düzeltmek için skor üzerindeki notayı seçin. Stale veya kesin eşleşmeyen seçimlerde düzenleme açılmaz.')
    }
  }

  const undo = root.getElementById('stage-s07-undo-btn')
  const approve = root.getElementById('stage-s07-approve-btn')
  if (undo) undo.disabled = state.busy || !model.canUndo
  if (approve) {
    approve.disabled = state.busy || model.approved || state.scoreState === SCORE_STATE.REVALIDATING || state.scoreState === SCORE_STATE.BLOCKED
    approve.textContent = model.approved ? 'Geçerli sürüm ayrıca onaylandı' : 'Geçerli sürümü ayrıca onayla'
  }

  panel.setAttribute('data-stage-s07-inline-inspector', 'ready')
  panel.setAttribute('data-stage-s07-score-state', state.scoreState)
  return true
}

function editableDescriptor(root, fieldName) {
  const workspace = getTeacherUiWorkspace(root)
  const snapshot = getPackage3MeasureSnapshot()
  const model = buildStageS07InlineInspectorModel({ workspace, snapshot })
  return {
    workspace,
    model,
    field: model?.fields.find((item) => item.field === fieldName) ?? null,
  }
}

export async function applyStageS07Field(root, fieldName) {
  const state = stateFor(root)
  if (state.busy) return false

  const { workspace, model, field } = editableDescriptor(root, fieldName)
  if (!workspace || !model?.selected || !field) {
    setStatus(root, 'Düzeltme uygulanmadı: seçili nota artık exact current revision ile eşleşmiyor. Notayı yeniden seçin.', { assertive: true })
    return false
  }

  const input = root.getElementById?.(`stage-s07-${fieldName}`)
  let value
  try {
    value = validateStageEEditValue(fieldName, input?.value ?? '')
  } catch (error) {
    setStatus(root, `Düzeltme uygulanmadı: ${error?.message ?? 'geçersiz değer'}`, { assertive: true })
    return false
  }
  if (Object.is(value, field.value)) {
    setStatus(root, 'Değer değişmedi; yeni sürüm oluşturulmadı.')
    return true
  }

  const technicalSelect = root.getElementById?.('teacher-field-select')
  const technicalValue = root.getElementById?.('teacher-field-value')
  if (!technicalSelect || !technicalValue) {
    setStatus(root, 'Düzeltme uygulanmadı: immutable revision motoru hazır değil.', { assertive: true })
    return false
  }

  state.busy = true
  setScoreState(root, SCORE_STATE.REVALIDATING)
  setStatus(root, 'Düzeltme yeni immutable sürüme kaydediliyor ve skor yeniden doğrulanıyor…')
  renderStageS07InlineInspector(root)

  try {
    // Exact Stage E descriptor is re-used only as an input selector. Package 8
    // remains the sole correction/history authority.
    technicalSelect.value = field.fieldKey
    technicalValue.value = String(value)
    const next = applyTeacherUiCorrection(root)
    if (!next || next === workspace) {
      setScoreState(root, SCORE_STATE.BLOCKED)
      setStatus(root, 'Düzeltme yeni immutable sürüm olarak oluşturulamadı. Skor current olarak işaretlenmedi.', { assertive: true })
      return false
    }

    // A correction must never silently inherit/create applicable approval.
    if (getTeacherWorkspaceApplicableApproval(next)) {
      setScoreState(root, SCORE_STATE.BLOCKED)
      setStatus(root, 'Düzeltme güvenlik sınırı nedeniyle durduruldu: correction ve approval ayrımı korunamadı.', { assertive: true })
      return false
    }

    syncStageS06RevisionBinding(root)
    renderStageS06SelectionStatus(root)
    renderStageFRevisionLifecycle(root)

    const verified = await verifyAndRerenderStageF(root)
    syncStageS06RevisionBinding(root)
    renderStageS06SelectionStatus(root)
    if (!verified) {
      setScoreState(root, SCORE_STATE.BLOCKED)
      setStatus(root, 'Düzeltme revision geçmişinde korundu; ancak canonicalization/materialization/revalidation tamamlanmadığı için corrected skor current olarak gösterilmiyor.', { assertive: true })
      return false
    }

    setScoreState(root, SCORE_STATE.VERIFIED)
    setStatus(root, 'Düzeltme yeni immutable sürümde kaydedildi, yeniden doğrulandı ve skor güncellendi. Öğretmen onayı ayrı bir işlemdir.')
    return true
  } finally {
    state.busy = false
    renderStageS07InlineInspector(root)
  }
}

export async function undoStageS07LastChange(root = document) {
  const state = stateFor(root)
  if (state.busy) return false
  const workspace = getTeacherUiWorkspace(root)
  const assessment = assessStageFRevisionLifecycle(workspace)
  if (!workspace || !assessment.undoTarget) {
    setStatus(root, 'Geri alınabilecek farklı bir önceki kullanıcı değişikliği yok.', { assertive: true })
    return false
  }

  const select = root.getElementById?.('teacher-undo-select')
  if (!select) {
    setStatus(root, 'Geri alma uygulanmadı: immutable history kontrolü hazır değil.', { assertive: true })
    return false
  }

  state.busy = true
  setScoreState(root, SCORE_STATE.REVALIDATING)
  setStatus(root, 'Geri alma yeni immutable sürüm olarak oluşturuluyor ve skor yeniden doğrulanıyor…')
  renderStageS07InlineInspector(root)

  try {
    select.value = assessment.undoTarget.revisionId
    const next = undoTeacherUiRevision(root)
    if (!next || next === workspace) {
      setScoreState(root, SCORE_STATE.BLOCKED)
      setStatus(root, 'Geri alma yeni immutable sürüm olarak oluşturulamadı.', { assertive: true })
      return false
    }

    syncStageS06RevisionBinding(root)
    renderStageFRevisionLifecycle(root)
    const verified = await verifyAndRerenderStageF(root)
    syncStageS06RevisionBinding(root)
    renderStageS06SelectionStatus(root)
    if (!verified) {
      setScoreState(root, SCORE_STATE.BLOCKED)
      setStatus(root, 'Geri alma revision geçmişinde korundu; fakat revalidation tamamlanmadığı için skor current olarak gösterilmiyor.', { assertive: true })
      return false
    }

    const after = assessStageFRevisionLifecycle(getTeacherUiWorkspace(root))
    setScoreState(root, after.canRerenderSource ? SCORE_STATE.SOURCE : SCORE_STATE.VERIFIED)
    setStatus(root, 'Geri alma yeni immutable sürüm olarak tamamlandı ve skor yeniden doğrulandı.')
    return true
  } finally {
    state.busy = false
    renderStageS07InlineInspector(root)
  }
}

export function approveStageS07CurrentRevision(root = document) {
  const state = stateFor(root)
  if (state.busy || state.scoreState === SCORE_STATE.REVALIDATING || state.scoreState === SCORE_STATE.BLOCKED) {
    setStatus(root, 'Onay kaydedilmedi: current skor doğrulama bekliyor.', { assertive: true })
    return null
  }

  const workspace = getTeacherUiWorkspace(root)
  if (!workspace) return null
  if (getTeacherWorkspaceApplicableApproval(workspace)) {
    setStatus(root, 'Geçerli exact sürüm zaten ayrıca öğretmen tarafından onaylandı.')
    return workspace
  }

  const next = approveTeacherUiCurrentRevision(root)
  if (next) setStatus(root, 'Geçerli exact sürüm ayrıca öğretmen tarafından onaylandı. Bu onay kalite kapısı veya paylaşım izni değildir.')
  renderStageS07InlineInspector(root)
  return next
}

function bindActions(root) {
  const panel = root.getElementById?.('stage-s07-inline-teacher-inspector')
  if (!panel || panel.dataset.stageS07ActionsBound === 'true') return
  panel.dataset.stageS07ActionsBound = 'true'

  panel.addEventListener('click', (event) => {
    const fieldButton = event.target?.closest?.('.stage-s07-apply-field')
    const field = fieldButton?.dataset?.stageS07Field
    if (field) {
      void applyStageS07Field(root, field)
      return
    }
    if (event.target?.closest?.('#stage-s07-undo-btn')) {
      void undoStageS07LastChange(root)
      return
    }
    if (event.target?.closest?.('#stage-s07-approve-btn')) {
      approveStageS07CurrentRevision(root)
    }
  })
}

export function applyStageS07InlineTeacherInspectorUi(root = document) {
  if (!root || typeof root.getElementById !== 'function') return false
  if (!ensureInspector(root)) return false
  bindActions(root)

  const state = stateFor(root)
  if (!state.unsubscribe) {
    state.unsubscribe = subscribePackage3Measures((snapshot) => {
      if (snapshot.notes !== state.lastNotes) {
        state.lastNotes = snapshot.notes
        setScoreState(root, SCORE_STATE.SOURCE)
      }
      ensureInlineWorkspace(root)
      syncStageS06RevisionBinding(root)
      renderStageS06SelectionStatus(root)
      renderStageS07InlineInspector(root)
    })
  }

  ensureInlineWorkspace(root)
  syncStageS06RevisionBinding(root)
  renderStageS06SelectionStatus(root)
  renderStageS07InlineInspector(root)
  return true
}

export function initStageS07InlineTeacherInspectorUi(root = document) {
  const init = () => applyStageS07InlineTeacherInspectorUi(root)
  if (root?.readyState === 'loading') {
    root.addEventListener?.('DOMContentLoaded', init, { once: true })
    return true
  }
  return init()
}
