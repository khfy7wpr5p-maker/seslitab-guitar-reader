// Package 8-T6 — accessible teacher correction/approval/history UI.
//
// UI orchestration only. Musical revision truth remains in T1-T5. This module
// never edits source notes in place, never auto-merges stale edits, and never
// treats teacher approval as quality-gate acceptance or sharing authorization.

import {
  getPackage3MeasureSnapshot,
  subscribePackage3Measures,
} from '../package3MeasureBridge.js'
import {
  TEACHER_WORKSPACE_STATE,
  applyTeacherWorkspaceCorrection,
  approveTeacherWorkspace,
  createTeacherWorkspace,
  getTeacherWorkspaceApplicableApproval,
  getTeacherWorkspaceCurrentRevision,
  listTeacherEditableFields,
  refreshTeacherWorkspace,
  undoTeacherWorkspace,
  withTeacherWorkspaceAuthoritativeHistory,
} from './services/teacherWorkspaceModel.js'

const sourceNotesByRoot = new WeakMap()
const workspaceByRoot = new WeakMap()
const adaptersByRoot = new WeakMap()

function requireRoot(root) {
  if (!root || typeof root.getElementById !== 'function' || typeof root.createElement !== 'function') {
    throw new TypeError('A document-like root is required.')
  }
  return root
}

function defaultMetadataAdapter() {
  return Object.freeze({
    id(prefix) {
      const randomUUID = globalThis.crypto?.randomUUID
      if (typeof randomUUID !== 'function') {
        throw new Error('Bu tarayıcı güvenli çalışma alanı kimliği üretemiyor.')
      }
      return `${prefix}-${randomUUID.call(globalThis.crypto)}`
    },
    now() {
      return new Date().toISOString()
    },
  })
}

function resolveAdapters(root, overrides = {}) {
  const base = defaultMetadataAdapter()
  const adapter = Object.freeze({
    id: typeof overrides.id === 'function' ? overrides.id : base.id,
    now: typeof overrides.now === 'function' ? overrides.now : base.now,
  })
  adaptersByRoot.set(root, adapter)
  return adapter
}

function adapterFor(root) {
  return adaptersByRoot.get(root) ?? resolveAdapters(root)
}

function makeId(adapter, prefix) {
  const value = adapter.id(prefix)
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Çalışma alanı için geçerli bir kimlik üretilemedi.')
  }
  return value.trim()
}

function makeTime(adapter) {
  const value = adapter.now()
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Çalışma alanı için geçerli zaman kanıtı üretilemedi.')
  }
  return value.trim()
}

function setStatus(root, text, { assertive = false, focus = false } = {}) {
  const status = root.getElementById('teacher-status')
  if (!status) return
  status.textContent = text
  status.setAttribute('aria-live', assertive ? 'assertive' : 'polite')
  if (focus && typeof status.focus === 'function') status.focus()

  const globalLive = root.getElementById('aria-live-region')
  if (globalLive) globalLive.textContent = text
}

function clearChildren(element) {
  if (!element) return
  while (element.children?.length) {
    const child = element.children[0]
    if (typeof child.remove === 'function') child.remove()
    else element.children.splice(0, 1)
  }
  element.textContent = ''
}

function appendOption(root, select, value, label) {
  const option = root.createElement('option')
  option.value = value
  option.textContent = label
  select.appendChild(option)
  return option
}

function setControlHidden(control, hidden) {
  if (control) control.hidden = Boolean(hidden)
}

function setPanelActive(root, active) {
  const panel = root.getElementById('tab-teacher')
  const button = root.getElementById('teacher-tab-btn')
  if (!panel || !button) return false
  panel.hidden = !active
  button.classList?.toggle('active', active)
  button.setAttribute('aria-selected', active ? 'true' : 'false')
  return true
}

function hideOtherResultPanels(root) {
  const known = [
    'rhythmic',
    'html',
    'notes',
    'xml',
    'guitar-tab',
    'violin',
    'chords',
    'discovery',
  ]
  for (const name of known) {
    const panel = root.getElementById(`tab-${name}`)
    if (panel) panel.hidden = true
  }

  const tabs = root.querySelectorAll?.('.tab-btn') ?? []
  for (const button of tabs) {
    if (button.id === 'teacher-tab-btn') continue
    button.classList?.toggle('active', false)
    button.setAttribute?.('aria-selected', 'false')
  }
}

export function activateTeacherResultTab(root = document) {
  requireRoot(root)
  ensureTeacherPanel(root)
  hideOtherResultPanels(root)
  return setPanelActive(root, true)
}

function connectOtherTabs(root) {
  const tabs = root.querySelectorAll?.('.tab-btn') ?? []
  for (const button of tabs) {
    if (button.id === 'teacher-tab-btn' || button.dataset?.teacherHideBound === 'yes') continue
    button.dataset.teacherHideBound = 'yes'
    button.addEventListener('click', () => setPanelActive(root, false))
  }
}

function createLabeledControl(root, parent, { labelText, id, tag = 'input' }) {
  const label = root.createElement('label')
  label.setAttribute('for', id)
  label.textContent = labelText
  parent.appendChild(label)

  const control = root.createElement(tag)
  control.id = id
  parent.appendChild(control)
  return control
}

export function ensureTeacherPanel(root = document) {
  requireRoot(root)
  const existing = root.getElementById('tab-teacher')
  if (existing) return existing

  const tabs = root.querySelector?.('.result-tabs')
  const body = tabs?.parentElement
  if (!tabs || !body) return null

  const tab = root.createElement('button')
  tab.id = 'teacher-tab-btn'
  tab.type = 'button'
  tab.className = 'tab-btn'
  tab.dataset.tab = 'teacher'
  tab.setAttribute('role', 'tab')
  tab.setAttribute('aria-selected', 'false')
  tab.setAttribute('aria-controls', 'tab-teacher')
  tab.textContent = 'Öğretmen'
  tab.addEventListener('click', () => activateTeacherResultTab(root))
  tabs.appendChild(tab)

  const panel = root.createElement('section')
  panel.id = 'tab-teacher'
  panel.className = 'tab-content teacher-workspace'
  panel.hidden = true
  panel.setAttribute('role', 'tabpanel')
  panel.setAttribute('aria-labelledby', 'teacher-tab-btn')

  const title = root.createElement('h3')
  title.textContent = 'Öğretmen düzeltme ve onay çalışma alanı'
  panel.appendChild(title)

  const intro = root.createElement('p')
  intro.id = 'teacher-safety-note'
  intro.textContent = 'Bu alan otomatik kaynağı değiştirmez. Her düzeltme yeni sürüm oluşturur. Öğretmen onayı kalite kapısı veya öğrenciyle paylaşım izni değildir.'
  panel.appendChild(intro)

  const status = root.createElement('p')
  status.id = 'teacher-status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.setAttribute('tabindex', '-1')
  status.textContent = 'Öğretmen çalışma alanı için önce bir eser analiz edin.'
  panel.appendChild(status)

  const actorGroup = root.createElement('div')
  actorGroup.id = 'teacher-start-group'
  actorGroup.setAttribute('role', 'group')
  actorGroup.setAttribute('aria-labelledby', 'teacher-actor-help')
  const actor = createLabeledControl(root, actorGroup, {
    labelText: 'Öğretmen kayıt etiketi',
    id: 'teacher-actor-id',
  })
  actor.type = 'text'
  actor.setAttribute('autocomplete', 'off')
  const actorHelp = root.createElement('p')
  actorHelp.id = 'teacher-actor-help'
  actorHelp.textContent = 'Bu etiket yalnız denetim kaydı içindir; kimlik doğrulama değildir.'
  actorGroup.appendChild(actorHelp)
  const start = root.createElement('button')
  start.id = 'teacher-start-btn'
  start.type = 'button'
  start.className = 'btn btn-primary'
  start.textContent = 'Öğretmen çalışma alanını başlat'
  actorGroup.appendChild(start)
  panel.appendChild(actorGroup)

  const active = root.createElement('div')
  active.id = 'teacher-active-workspace'
  active.hidden = true

  const revisionSummary = root.createElement('p')
  revisionSummary.id = 'teacher-revision-summary'
  active.appendChild(revisionSummary)
  const approvalSummary = root.createElement('p')
  approvalSummary.id = 'teacher-approval-summary'
  active.appendChild(approvalSummary)

  const currentContent = root.createElement('pre')
  currentContent.id = 'teacher-current-content'
  currentContent.setAttribute('tabindex', '0')
  currentContent.setAttribute('aria-label', 'Geçerli öğretmen sürümünün salt okunur veri görünümü')
  active.appendChild(currentContent)

  const correction = root.createElement('fieldset')
  correction.id = 'teacher-correction-group'
  const correctionLegend = root.createElement('legend')
  correctionLegend.textContent = 'Düzeltme oluştur'
  correction.appendChild(correctionLegend)
  const fieldSelect = createLabeledControl(root, correction, {
    labelText: 'Düzeltilecek alan',
    id: 'teacher-field-select',
    tag: 'select',
  })
  const valueInput = createLabeledControl(root, correction, {
    labelText: 'Yeni değer',
    id: 'teacher-field-value',
  })
  valueInput.type = 'text'
  valueInput.setAttribute('aria-describedby', 'teacher-correction-help')
  const correctionHelp = root.createElement('p')
  correctionHelp.id = 'teacher-correction-help'
  correctionHelp.textContent = 'Yalnız mevcut ve izin verilmiş nota alanı değiştirilir. Bu işlem müzikal kalite doğrulaması veya onay değildir.'
  correction.appendChild(correctionHelp)
  const apply = root.createElement('button')
  apply.id = 'teacher-correction-btn'
  apply.type = 'button'
  apply.className = 'btn btn-primary'
  apply.textContent = 'Düzeltmeyi yeni sürüm olarak kaydet'
  correction.appendChild(apply)
  active.appendChild(correction)

  const approvalGroup = root.createElement('div')
  approvalGroup.id = 'teacher-approval-group'
  approvalGroup.setAttribute('role', 'group')
  approvalGroup.setAttribute('aria-label', 'Geçerli sürüm onayı')
  const approve = root.createElement('button')
  approve.id = 'teacher-approve-btn'
  approve.type = 'button'
  approve.className = 'btn btn-primary'
  approve.textContent = 'Geçerli sürümü öğretmen olarak onayla'
  approvalGroup.appendChild(approve)
  active.appendChild(approvalGroup)

  const undo = root.createElement('fieldset')
  undo.id = 'teacher-undo-group'
  const undoLegend = root.createElement('legend')
  undoLegend.textContent = 'Sürüm geçmişi ve geri al'
  undo.appendChild(undoLegend)
  const undoSelect = createLabeledControl(root, undo, {
    labelText: 'Geri dönülecek eski sürüm',
    id: 'teacher-undo-select',
    tag: 'select',
  })
  const undoHelp = root.createElement('p')
  undoHelp.textContent = 'Geri al eski sürümü silmez; seçilen içeriği yeni bir sürüm olarak oluşturur.'
  undo.appendChild(undoHelp)
  const undoButton = root.createElement('button')
  undoButton.id = 'teacher-undo-btn'
  undoButton.type = 'button'
  undoButton.className = 'btn btn-secondary'
  undoButton.textContent = 'Seçili eski sürüme yeni sürüm oluşturarak dön'
  undo.appendChild(undoButton)
  active.appendChild(undo)

  const history = root.createElement('ol')
  history.id = 'teacher-history-list'
  history.setAttribute('aria-label', 'Öğretmen sürüm geçmişi')
  active.appendChild(history)

  const refresh = root.createElement('button')
  refresh.id = 'teacher-refresh-btn'
  refresh.type = 'button'
  refresh.className = 'btn btn-secondary'
  refresh.hidden = true
  refresh.textContent = 'Güncel durumu yükle ve düzenlemeye devam et'
  active.appendChild(refresh)

  panel.appendChild(active)
  body.appendChild(panel)
  connectOtherTabs(root)
  return panel
}

function selectedFieldDescriptor(root, workspace) {
  const key = root.getElementById('teacher-field-select')?.value ?? ''
  return listTeacherEditableFields(workspace).find((field) => field.key === key) ?? null
}

function fillEditorValue(root, workspace) {
  const descriptor = selectedFieldDescriptor(root, workspace)
  const input = root.getElementById('teacher-field-value')
  if (!input) return
  input.value = descriptor ? String(descriptor.value) : ''
  input.setAttribute('aria-label', descriptor ? `Yeni değer: ${descriptor.label}` : 'Yeni değer')
}

export function renderTeacherWorkspace(root = document) {
  requireRoot(root)
  ensureTeacherPanel(root)
  const notes = sourceNotesByRoot.get(root) ?? null
  const workspace = workspaceByRoot.get(root) ?? null
  const startGroup = root.getElementById('teacher-start-group')
  const active = root.getElementById('teacher-active-workspace')
  const startButton = root.getElementById('teacher-start-btn')

  if (!Array.isArray(notes)) {
    setControlHidden(startGroup, false)
    setControlHidden(active, true)
    if (startButton) startButton.disabled = true
    setStatus(root, 'Öğretmen çalışma alanı için önce bir eser analiz edin.')
    return null
  }

  if (!workspace) {
    setControlHidden(startGroup, false)
    setControlHidden(active, true)
    if (startButton) startButton.disabled = false
    setStatus(root, `Kaynak hazır: ${notes.length} nota olayı. Çalışma alanını başlatabilirsiniz.`)
    return null
  }

  setControlHidden(startGroup, true)
  setControlHidden(active, false)
  const current = getTeacherWorkspaceCurrentRevision(workspace)
  const approval = getTeacherWorkspaceApplicableApproval(workspace)
  const conflict = workspace.state === TEACHER_WORKSPACE_STATE.CONFLICT

  const revisionSummary = root.getElementById('teacher-revision-summary')
  if (revisionSummary) {
    revisionSummary.textContent = `Geçerli sürüm: ${current.revisionId}. Tür: ${current.revisionKind}. Toplam sürüm: ${workspace.history.revisions.length}.`
  }
  const approvalSummary = root.getElementById('teacher-approval-summary')
  if (approvalSummary) {
    approvalSummary.textContent = approval
      ? `Bu exact sürüm öğretmen tarafından onaylandı. Onay kaydı: ${approval.approvalId}. Bu, kalite kapısı veya paylaşım izni değildir.`
      : 'Bu exact sürüm için uygulanabilir öğretmen onayı yok.'
  }
  const content = root.getElementById('teacher-current-content')
  if (content) content.textContent = JSON.stringify(current.content, null, 2)

  const fields = listTeacherEditableFields(workspace)
  const fieldSelect = root.getElementById('teacher-field-select')
  if (fieldSelect) {
    const previous = fieldSelect.value
    clearChildren(fieldSelect)
    for (const field of fields) appendOption(root, fieldSelect, field.key, `${field.label} — mevcut: ${String(field.value)}`)
    if (fields.some((field) => field.key === previous)) fieldSelect.value = previous
    else if (fields[0]) fieldSelect.value = fields[0].key
  }
  fillEditorValue(root, workspace)

  const historyList = root.getElementById('teacher-history-list')
  const undoSelect = root.getElementById('teacher-undo-select')
  if (historyList) clearChildren(historyList)
  if (undoSelect) clearChildren(undoSelect)
  const currentIndex = workspace.history.revisions.length - 1
  for (let index = 0; index < workspace.history.revisions.length; index++) {
    const revision = workspace.history.revisions[index]
    if (historyList) {
      const item = root.createElement('li')
      const isCurrent = index === currentIndex
      item.textContent = `Sürüm ${index + 1}: ${revision.revisionId}, ${revision.revisionKind}${isCurrent ? ', geçerli sürüm' : ''}`
      historyList.appendChild(item)
    }
    if (
      undoSelect &&
      index < currentIndex &&
      revision.contentFingerprint !== current.contentFingerprint
    ) {
      appendOption(root, undoSelect, revision.revisionId, `Sürüm ${index + 1} — ${revision.revisionId}`)
    }
  }

  const correctionButton = root.getElementById('teacher-correction-btn')
  const approveButton = root.getElementById('teacher-approve-btn')
  const undoButton = root.getElementById('teacher-undo-btn')
  const refresh = root.getElementById('teacher-refresh-btn')
  if (correctionButton) correctionButton.disabled = conflict || fields.length === 0
  if (approveButton) approveButton.disabled = conflict || Boolean(approval)
  if (undoButton) undoButton.disabled = conflict || !(undoSelect?.children?.length > 0)
  if (refresh) refresh.hidden = !conflict

  if (conflict) {
    setStatus(root, `Çakışma algılandı (${workspace.conflictReason}). Hiçbir değişiklik uygulanmadı. Güncel durumu yüklemeden tekrar denenemez.`, { assertive: true, focus: true })
  }
  return workspace
}

export function startTeacherWorkspace(root = document) {
  requireRoot(root)
  const notes = sourceNotesByRoot.get(root) ?? getPackage3MeasureSnapshot().notes
  if (!Array.isArray(notes)) {
    setStatus(root, 'Öğretmen çalışma alanı başlatılamadı: kaynak nota verisi yok.', { assertive: true })
    return null
  }
  const actorId = root.getElementById('teacher-actor-id')?.value?.trim() ?? ''
  if (!actorId) {
    setStatus(root, 'Öğretmen kayıt etiketi gereklidir.', { assertive: true, focus: true })
    return null
  }

  try {
    const adapter = adapterFor(root)
    const createdAt = makeTime(adapter)
    const automaticRevisionId = makeId(adapter, 'automatic-revision')
    const workspace = createTeacherWorkspace({
      content: notes,
      actorId,
      sourceId: makeId(adapter, 'teacher-source'),
      automaticRevisionId,
      historyId: makeId(adapter, 'teacher-history'),
      createdAt,
    })
    workspaceByRoot.set(root, workspace)
    renderTeacherWorkspace(root)
    setStatus(root, 'Öğretmen çalışma alanı oluşturuldu. Otomatik kaynak ayrı ve değiştirilemez sürüm olarak korundu.')
    return workspace
  } catch (error) {
    setStatus(root, `Öğretmen çalışma alanı başlatılamadı: ${error?.message ?? 'geçersiz kaynak'}`, { assertive: true, focus: true })
    return null
  }
}

export function applyTeacherUiCorrection(root = document) {
  requireRoot(root)
  const workspace = workspaceByRoot.get(root)
  if (!workspace) return null
  const descriptor = selectedFieldDescriptor(root, workspace)
  if (!descriptor) {
    setStatus(root, 'Düzeltilecek güvenli bir alan seçilmedi.', { assertive: true })
    return null
  }

  try {
    const adapter = adapterFor(root)
    const next = applyTeacherWorkspaceCorrection({
      workspace,
      fieldKey: descriptor.key,
      value: root.getElementById('teacher-field-value')?.value ?? '',
      revisionId: makeId(adapter, 'teacher-revision'),
      eventId: makeId(adapter, 'teacher-correction-event'),
      operationId: makeId(adapter, 'teacher-operation'),
      createdAt: makeTime(adapter),
    })
    workspaceByRoot.set(root, next)
    renderTeacherWorkspace(root)
    if (next.state === TEACHER_WORKSPACE_STATE.ACTIVE) {
      setStatus(root, 'Düzeltme yeni immutable sürüm olarak kaydedildi. Önceki sürüm değiştirilmedi; bu işlem öğretmen onayı veya kalite doğrulaması değildir.')
    }
    return next
  } catch (error) {
    setStatus(root, `Düzeltme uygulanmadı: ${error?.message ?? 'geçersiz düzeltme'}`, { assertive: true, focus: true })
    return null
  }
}

export function approveTeacherUiCurrentRevision(root = document) {
  requireRoot(root)
  const workspace = workspaceByRoot.get(root)
  if (!workspace) return null

  try {
    const adapter = adapterFor(root)
    const next = approveTeacherWorkspace({
      workspace,
      approvalId: makeId(adapter, 'teacher-approval'),
      createdAt: makeTime(adapter),
    })
    workspaceByRoot.set(root, next)
    renderTeacherWorkspace(root)
    if (next.state === TEACHER_WORKSPACE_STATE.ACTIVE) {
      setStatus(root, 'Geçerli exact sürüm için öğretmen onayı kaydedildi. Onay kalite kapısını geçmez ve öğrenci paylaşım izni değildir.')
    }
    return next
  } catch (error) {
    setStatus(root, `Onay kaydedilmedi: ${error?.message ?? 'geçersiz onay'}`, { assertive: true, focus: true })
    return null
  }
}

export function undoTeacherUiRevision(root = document) {
  requireRoot(root)
  const workspace = workspaceByRoot.get(root)
  if (!workspace) return null
  const targetRevisionId = root.getElementById('teacher-undo-select')?.value ?? ''
  if (!targetRevisionId) {
    setStatus(root, 'Geri dönülecek eski sürüm seçilmedi.', { assertive: true })
    return null
  }

  try {
    const adapter = adapterFor(root)
    const next = undoTeacherWorkspace({
      workspace,
      targetRevisionId,
      revisionId: makeId(adapter, 'teacher-revision'),
      eventId: makeId(adapter, 'teacher-undo-event'),
      createdAt: makeTime(adapter),
    })
    workspaceByRoot.set(root, next)
    renderTeacherWorkspace(root)
    if (next.state === TEACHER_WORKSPACE_STATE.ACTIVE) {
      setStatus(root, 'Eski içerik yeni immutable sürüm olarak oluşturuldu. Geçmiş silinmedi ve eski onay yeniden etkinleşmedi.')
    }
    return next
  } catch (error) {
    setStatus(root, `Geri al uygulanmadı: ${error?.message ?? 'geçersiz hedef'}`, { assertive: true, focus: true })
    return null
  }
}

export function refreshTeacherUiAfterConflict(root = document) {
  requireRoot(root)
  const workspace = workspaceByRoot.get(root)
  if (!workspace) return null
  const next = refreshTeacherWorkspace(workspace)
  workspaceByRoot.set(root, next)
  renderTeacherWorkspace(root)
  setStatus(root, 'Güncel history durumu yüklendi. Önceki çakışan işlem otomatik olarak yeniden uygulanmadı.')
  return next
}

// Integration seam for a future persistence layer. It updates the authoritative
// history while deliberately preserving the old expectation so T5 can detect a
// stale UI. It does not perform network/storage work itself.
export function setTeacherUiAuthoritativeHistory(root, history) {
  requireRoot(root)
  const workspace = workspaceByRoot.get(root)
  if (!workspace) throw new Error('Teacher workspace is not active.')
  const next = withTeacherWorkspaceAuthoritativeHistory({ workspace, history })
  workspaceByRoot.set(root, next)
  renderTeacherWorkspace(root)
  return next
}

export function getTeacherUiWorkspace(root = document) {
  requireRoot(root)
  return workspaceByRoot.get(root) ?? null
}

export function resetTeacherUi(root = document) {
  requireRoot(root)
  workspaceByRoot.delete(root)
  sourceNotesByRoot.delete(root)
  renderTeacherWorkspace(root)
}

export function initPackage8TeacherUi(root = document, adapters = {}) {
  requireRoot(root)
  ensureTeacherPanel(root)
  resolveAdapters(root, adapters)

  root.getElementById('teacher-start-btn')?.addEventListener('click', () => startTeacherWorkspace(root))
  root.getElementById('teacher-correction-btn')?.addEventListener('click', () => applyTeacherUiCorrection(root))
  root.getElementById('teacher-approve-btn')?.addEventListener('click', () => approveTeacherUiCurrentRevision(root))
  root.getElementById('teacher-undo-btn')?.addEventListener('click', () => undoTeacherUiRevision(root))
  root.getElementById('teacher-refresh-btn')?.addEventListener('click', () => refreshTeacherUiAfterConflict(root))
  root.getElementById('teacher-field-select')?.addEventListener('change', () => {
    const workspace = workspaceByRoot.get(root)
    if (workspace) fillEditorValue(root, workspace)
  })

  const unsubscribe = subscribePackage3Measures(({ notes }) => {
    const previous = sourceNotesByRoot.get(root) ?? null
    if (notes !== previous) {
      sourceNotesByRoot.set(root, notes)
      workspaceByRoot.delete(root)
    }
    renderTeacherWorkspace(root)
  })

  root.getElementById('reset-btn')?.addEventListener('click', () => {
    workspaceByRoot.delete(root)
    renderTeacherWorkspace(root)
  })

  return unsubscribe
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initPackage8TeacherUi(document), { once: true })
  } else {
    initPackage8TeacherUi(document)
  }
}
