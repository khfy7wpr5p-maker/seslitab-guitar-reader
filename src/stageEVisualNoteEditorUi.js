import {
  getPackage3MeasureSnapshot,
  subscribePackage3Measures,
} from '../package3MeasureBridge.js'
import {
  applyTeacherUiCorrection,
  getTeacherUiWorkspace,
} from './package8TeacherUi.js'
import {
  buildStageEVisualEditModel,
  STAGE_E_EDIT_FIELD,
  validateStageEEditValue,
} from './services/stageEVisualNoteEdit.js'

const boundRoots = new WeakSet()

function ensureEditor(root) {
  const teacherPanel = root.getElementById('tab-teacher')
  if (!teacherPanel || typeof root.createElement !== 'function') return null
  let editor = root.getElementById('stage-e-visual-note-editor')
  if (editor) return editor

  editor = root.createElement('section')
  editor.id = 'stage-e-visual-note-editor'
  editor.className = 'stage-e-visual-note-editor'
  editor.hidden = true
  editor.setAttribute('aria-labelledby', 'stage-e-editor-heading')

  const heading = root.createElement('h4')
  heading.id = 'stage-e-editor-heading'
  heading.textContent = 'Seçili notayı düzelt'
  editor.appendChild(heading)

  const help = root.createElement('p')
  help.id = 'stage-e-editor-help'
  help.textContent = 'Yalnız nota harfi, arıza, oktav veya süre değiştirilebilir. Her kayıt yeni sürüm oluşturur; bağlı alanlar otomatik hesaplanmaz ve sonraki kalite doğrulaması zorunludur.'
  editor.appendChild(help)

  const status = root.createElement('p')
  status.id = 'stage-e-editor-status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  editor.appendChild(status)

  const fields = root.createElement('div')
  fields.id = 'stage-e-editor-fields'
  fields.setAttribute('role', 'group')
  fields.setAttribute('aria-describedby', 'stage-e-editor-help')
  editor.appendChild(fields)

  teacherPanel.appendChild(editor)
  return editor
}

function makeControl(root, fieldsRoot, descriptor) {
  const wrapper = root.createElement('div')
  wrapper.className = 'stage-e-editor-field'

  const id = `stage-e-${descriptor.field}`
  const label = root.createElement('label')
  label.setAttribute('for', id)
  label.textContent = descriptor.label
  wrapper.appendChild(label)

  let input
  if (descriptor.field === STAGE_E_EDIT_FIELD.PITCH) {
    input = root.createElement('select')
    for (const step of ['C', 'D', 'E', 'F', 'G', 'A', 'B']) {
      const option = root.createElement('option')
      option.value = step
      option.textContent = step
      input.appendChild(option)
    }
  } else if (descriptor.field === STAGE_E_EDIT_FIELD.ACCIDENTAL) {
    input = root.createElement('select')
    for (const [value, text] of [['-2', 'Çift bemol'], ['-1', 'Bemol'], ['0', 'Doğal'], ['1', 'Diyez'], ['2', 'Çift diyez']]) {
      const option = root.createElement('option')
      option.value = value
      option.textContent = text
      input.appendChild(option)
    }
  } else {
    input = root.createElement('input')
    input.type = 'number'
    input.step = '1'
    if (descriptor.field === STAGE_E_EDIT_FIELD.OCTAVE) {
      input.min = '0'
      input.max = '9'
    } else {
      input.min = '1'
      input.max = '1000000'
    }
  }

  input.id = id
  input.value = String(descriptor.value)
  input.dataset.stageEField = descriptor.field
  input.dataset.stageEFieldKey = descriptor.fieldKey
  wrapper.appendChild(input)

  const button = root.createElement('button')
  button.type = 'button'
  button.className = 'btn btn-primary stage-e-save-field'
  button.dataset.stageEField = descriptor.field
  button.textContent = `${descriptor.label} düzeltmesini kaydet`
  wrapper.appendChild(button)
  fieldsRoot.appendChild(wrapper)
}

export function renderStageEVisualNoteEditor(root = document, snapshot = getPackage3MeasureSnapshot()) {
  if (!root || typeof root.getElementById !== 'function') return false
  const editor = ensureEditor(root)
  if (!editor) return false
  const workspace = getTeacherUiWorkspace(root)
  const model = buildStageEVisualEditModel({ workspace, snapshot })
  const fields = root.getElementById('stage-e-editor-fields')
  const status = root.getElementById('stage-e-editor-status')

  fields?.replaceChildren()
  if (!model || model.fields.length === 0) {
    editor.hidden = true
    if (status) status.textContent = ''
    return true
  }

  for (const descriptor of model.fields) makeControl(root, fields, descriptor)
  if (status) status.textContent = `Nota ${model.noteIndex + 1} seçildi. Yalnız gösterilen alanlar değiştirilebilir.`
  editor.hidden = false
  return true
}

export function applyStageEVisualField(root, field) {
  const workspace = getTeacherUiWorkspace(root)
  const snapshot = getPackage3MeasureSnapshot()
  const model = buildStageEVisualEditModel({ workspace, snapshot })
  const descriptor = model?.fields.find((item) => item.field === field)
  const status = root.getElementById('stage-e-editor-status')
  if (!descriptor) {
    if (status) status.textContent = 'Düzeltme uygulanmadı: seçili nota veya alan artık geçerli değil.'
    return null
  }

  const input = root.getElementById(`stage-e-${field}`)
  let value
  try {
    value = validateStageEEditValue(field, input?.value ?? '')
  } catch (error) {
    if (status) status.textContent = `Düzeltme uygulanmadı: ${error.message}`
    return null
  }
  if (Object.is(value, descriptor.value)) {
    if (status) status.textContent = 'Değer değişmedi; yeni sürüm oluşturulmadı.'
    return workspace
  }

  const technicalSelect = root.getElementById('teacher-field-select')
  const technicalValue = root.getElementById('teacher-field-value')
  if (!technicalSelect || !technicalValue) {
    if (status) status.textContent = 'Düzeltme uygulanmadı: öğretmen revision yüzeyi hazır değil.'
    return null
  }

  technicalSelect.value = descriptor.fieldKey
  technicalValue.value = String(value)
  const next = applyTeacherUiCorrection(root)
  renderStageEVisualNoteEditor(root, getPackage3MeasureSnapshot())
  if (next && status) {
    status.textContent = `${descriptor.label} yeni immutable sürümde kaydedildi. Kalite doğrulaması henüz yapılmadı.`
  }
  return next
}

export function initStageEVisualNoteEditor(root = document) {
  if (!root || typeof root.getElementById !== 'function' || boundRoots.has(root)) return false
  root.getElementById('tab-teacher')?.setAttribute('data-stage-e-ready', 'true')
  boundRoots.add(root)

  subscribePackage3Measures((snapshot) => renderStageEVisualNoteEditor(root, snapshot))
  root.getElementById('teacher-start-btn')?.addEventListener('click', () => {
    renderStageEVisualNoteEditor(root, getPackage3MeasureSnapshot())
  })
  root.addEventListener?.('click', (event) => {
    const button = event.target?.closest?.('.stage-e-save-field')
    const field = button?.dataset?.stageEField
    if (!field) return
    applyStageEVisualField(root, field)
  })
  return true
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initStageEVisualNoteEditor(document), { once: true })
  } else {
    initStageEVisualNoteEditor(document)
  }
}
