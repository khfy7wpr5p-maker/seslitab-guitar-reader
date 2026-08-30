import {
  getTeacherUiWorkspace,
  undoTeacherUiRevision,
} from './package8TeacherUi.js'
import { activateScoreView } from './scoreViewUi.js'
import {
  assessStageFRevisionLifecycle,
  STAGE_F_LIFECYCLE_STATUS,
} from './services/stageFRevisionLifecycle.js'

const boundRoots = new WeakSet()

function ensurePanel(root) {
  const teacherPanel = root.getElementById('tab-teacher')
  if (!teacherPanel || typeof root.createElement !== 'function') return null
  let panel = root.getElementById('stage-f-revision-lifecycle')
  if (panel) return panel

  panel = root.createElement('section')
  panel.id = 'stage-f-revision-lifecycle'
  panel.className = 'stage-f-revision-lifecycle'
  panel.setAttribute('aria-labelledby', 'stage-f-heading')

  const heading = root.createElement('h4')
  heading.id = 'stage-f-heading'
  heading.textContent = 'Doğrulama ve geri alma'
  panel.appendChild(heading)

  const status = root.createElement('p')
  status.id = 'stage-f-status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  panel.appendChild(status)

  const explain = root.createElement('p')
  explain.id = 'stage-f-explain'
  explain.textContent = 'Düzeltme yalnız güvenli doğrulama kanıtı varsa görsel notaya yeniden uygulanabilir. Kanıt yoksa eski kaynak görünümü doğruymuş gibi gösterilmez.'
  panel.appendChild(explain)

  const actions = root.createElement('div')
  actions.className = 'stage-f-actions'
  actions.setAttribute('role', 'group')
  actions.setAttribute('aria-describedby', 'stage-f-explain')

  const verify = root.createElement('button')
  verify.id = 'stage-f-verify-rerender-btn'
  verify.type = 'button'
  verify.className = 'btn btn-primary'
  verify.textContent = 'Doğrula ve görünümü yenile'
  actions.appendChild(verify)

  const undo = root.createElement('button')
  undo.id = 'stage-f-undo-last-btn'
  undo.type = 'button'
  undo.className = 'btn btn-secondary'
  undo.textContent = 'Son değişikliği geri al'
  actions.appendChild(undo)

  panel.appendChild(actions)
  teacherPanel.appendChild(panel)
  return panel
}

function setStatus(root, text, assertive = false) {
  const status = root.getElementById('stage-f-status')
  if (!status) return
  status.textContent = text
  status.setAttribute('role', assertive ? 'alert' : 'status')
  status.setAttribute('aria-live', assertive ? 'assertive' : 'polite')
  const globalLive = root.getElementById('aria-live-region')
  if (globalLive) globalLive.textContent = text
}

export function renderStageFRevisionLifecycle(root = document) {
  if (!root || typeof root.getElementById !== 'function') return false
  const panel = ensurePanel(root)
  if (!panel) return false

  const workspace = getTeacherUiWorkspace(root)
  const assessment = assessStageFRevisionLifecycle(workspace)
  const verify = root.getElementById('stage-f-verify-rerender-btn')
  const undo = root.getElementById('stage-f-undo-last-btn')

  if (undo) undo.disabled = !assessment.undoTarget
  if (verify) verify.disabled = assessment.status === STAGE_F_LIFECYCLE_STATUS.NO_WORKSPACE

  if (assessment.status === STAGE_F_LIFECYCLE_STATUS.NO_WORKSPACE) {
    panel.hidden = true
    return true
  }

  panel.hidden = false
  if (assessment.status === STAGE_F_LIFECYCLE_STATUS.SOURCE_EXACT) {
    setStatus(root, 'Geçerli içerik otomatik kaynakla exact eşleşiyor. Kaynak MusicXML güvenle yeniden render edilebilir.')
  } else if (assessment.status === STAGE_F_LIFECYCLE_STATUS.CORRECTION_REVALIDATION_REQUIRED) {
    setStatus(root, 'Pitch düzeltmesi yeni revision olarak kayıtlı. Package 12-T3 kanıtı ve düzeltilmiş MusicXML materialization olmadan eski kaynak görünümü yeniden çizilmeyecek.')
  } else if (assessment.status === STAGE_F_LIFECYCLE_STATUS.STRUCTURAL_REVALIDATION_REQUIRED) {
    setStatus(root, 'Bu değişiklik structural/rhythmic revalidation gerektiriyor. Package 12-T4 main üzerinde hazır olmadan görsel sonuç doğrulanmış sayılmayacak.')
  } else {
    setStatus(root, 'Geçerli revision Stage F güvenli kapsamının dışında. Görsel nota değiştirilmedi.', true)
  }
  return true
}

export async function verifyAndRerenderStageF(root = document) {
  const assessment = assessStageFRevisionLifecycle(getTeacherUiWorkspace(root))
  if (!assessment.canRerenderSource) {
    renderStageFRevisionLifecycle(root)
    setStatus(root, 'Yeniden render uygulanmadı: geçerli corrected revision için exact düzeltilmiş MusicXML kanıtı yok.', true)
    return false
  }

  const rendered = await activateScoreView(root)
  if (!rendered) {
    setStatus(root, 'Kaynak exact olsa da görsel nota yeniden oluşturulamadı. Eski renderer durumu kullanılmadı.', true)
    return false
  }
  return true
}

export async function undoLastStageFChange(root = document) {
  const workspace = getTeacherUiWorkspace(root)
  const assessment = assessStageFRevisionLifecycle(workspace)
  if (!assessment.undoTarget) {
    setStatus(root, 'Geri alınabilecek farklı bir önceki içerik yok.', true)
    return null
  }

  const select = root.getElementById('teacher-undo-select')
  if (!select) {
    setStatus(root, 'Geri alma uygulanmadı: immutable history kontrolü hazır değil.', true)
    return null
  }
  select.value = assessment.undoTarget.revisionId
  const next = undoTeacherUiRevision(root)
  renderStageFRevisionLifecycle(root)
  if (!next) return null

  const after = assessStageFRevisionLifecycle(next)
  if (after.canRerenderSource) {
    const rendered = await activateScoreView(root)
    if (!rendered) {
      setStatus(root, 'Geri alma yeni immutable revision olarak kaydedildi; kaynak görünümü yeniden oluşturulamadı.', true)
    }
  }
  return next
}

function mutationClick(event) {
  const target = event.target?.closest?.(
    '.stage-e-save-field, #teacher-correction-btn, #teacher-undo-btn, #teacher-start-btn, #teacher-refresh-btn',
  )
  return Boolean(target)
}

export function initStageFRevisionLifecycle(root = document) {
  if (!root || typeof root.getElementById !== 'function' || boundRoots.has(root)) return false
  ensurePanel(root)
  boundRoots.add(root)

  root.getElementById('stage-f-verify-rerender-btn')?.addEventListener('click', () => {
    void verifyAndRerenderStageF(root)
  })
  root.getElementById('stage-f-undo-last-btn')?.addEventListener('click', () => {
    void undoLastStageFChange(root)
  })
  root.addEventListener?.('click', (event) => {
    if (!mutationClick(event)) return
    queueMicrotask(() => renderStageFRevisionLifecycle(root))
  })

  renderStageFRevisionLifecycle(root)
  return true
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initStageFRevisionLifecycle(document), { once: true })
  } else {
    initStageFRevisionLifecycle(document)
  }
}
