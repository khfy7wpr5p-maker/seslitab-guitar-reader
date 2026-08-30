import { getPackage3MeasureSnapshot } from '../package3MeasureBridge.js'
import {
  getTeacherUiWorkspace,
  refreshTeacherUiAfterConflict,
  setTeacherUiAuthoritativeHistory,
  undoTeacherUiRevision,
} from './package8TeacherUi.js'
import { activateScoreView } from './scoreViewUi.js'
import {
  assessStageFRevisionLifecycle,
  STAGE_F_LIFECYCLE_STATUS,
} from './services/stageFRevisionLifecycle.js'
import {
  canonicalizeStageFRevision,
  STAGE_F_CANONICALIZATION_STATUS,
} from './services/stageFCanonicalization.js'
import { materializeAndRevalidateStageFCorrectedMusicXml } from './services/stageFCorrectedMusicXml.js'

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
  explain.textContent = 'Öğretmen düzeltmesi ayrı sürüm olarak korunur. Teknik türevler ayrı sistem sürümünde hesaplanır; yalnız yeniden ayrıştırma ve yapısal doğrulama geçerse düzeltilmiş nota çizilir.'
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

function secureId(prefix) {
  const randomUUID = globalThis.crypto?.randomUUID
  if (typeof randomUUID !== 'function') {
    throw new Error('Güvenli revision kimliği üretilemiyor.')
  }
  return `${prefix}-${randomUUID.call(globalThis.crypto)}`
}

function nowIso() {
  const value = new Date().toISOString()
  if (!value) throw new Error('Doğrulama zamanı üretilemiyor.')
  return value
}

async function renderExactCorrectedMusicXml(root, musicXml) {
  const xmlOutput = root.getElementById('xml-output')
  if (!xmlOutput || typeof xmlOutput.textContent !== 'string') return false
  const original = xmlOutput.textContent
  try {
    xmlOutput.textContent = musicXml
    return await activateScoreView(root)
  } finally {
    xmlOutput.textContent = original
  }
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
    setStatus(root, 'Geçerli içerik otomatik kaynakla exact eşleşiyor. Kaynak MusicXML güvenle yeniden çizilebilir.')
  } else if (assessment.status === STAGE_F_LIFECYCLE_STATUS.CANONICALIZED_MATERIALIZATION_REQUIRED) {
    setStatus(root, 'Teknik türevler ayrı sistem sürümünde hazır. Düzeltilmiş MusicXML yeniden ayrıştırılıp yapısal olarak doğrulanmalıdır.')
  } else if (assessment.status === STAGE_F_LIFECYCLE_STATUS.CORRECTION_REVALIDATION_REQUIRED) {
    setStatus(root, 'Pitch düzeltmesi öğretmen sürümünde kayıtlı. Teknik pitch alanları ayrı sistem sürümünde türetilip doğrulanmadan görsel nota değiştirilmeyecek.')
  } else if (assessment.status === STAGE_F_LIFECYCLE_STATUS.STRUCTURAL_REVALIDATION_REQUIRED) {
    setStatus(root, 'Bu değişiklik mekanik canonicalization ve yapısal/ritmik ürün doğrulaması gerektiriyor. Kanıt oluşmadan görsel nota değiştirilmeyecek.')
  } else {
    setStatus(root, 'Geçerli revision Stage F güvenli kapsamının dışında. Görsel nota değiştirilmedi.', true)
  }
  return true
}

export async function verifyAndRerenderStageF(root = document) {
  let workspace = getTeacherUiWorkspace(root)
  let assessment = assessStageFRevisionLifecycle(workspace)

  if (assessment.status === STAGE_F_LIFECYCLE_STATUS.NO_WORKSPACE) {
    renderStageFRevisionLifecycle(root)
    return false
  }

  if (assessment.canRerenderSource) {
    const rendered = await activateScoreView(root)
    if (!rendered) {
      setStatus(root, 'Kaynak exact olsa da görsel nota yeniden oluşturulamadı. Eski renderer durumu kullanılmadı.', true)
      return false
    }
    setStatus(root, 'Kaynakla exact eşleşen nota görünümü yeniden oluşturuldu.')
    return true
  }

  const sourceNotes = getPackage3MeasureSnapshot().notes
  if (!Array.isArray(sourceNotes)) {
    setStatus(root, 'Düzeltilmiş nota doğrulanamadı: exact otomatik kaynak nota dizisi yok.', true)
    return false
  }

  try {
    const canonicalized = canonicalizeStageFRevision({
      history: workspace.history,
      expectation: workspace.expectation,
      revisionId: secureId('stage-f-canonical-revision'),
      eventId: secureId('stage-f-canonical-event'),
      operationIdPrefix: secureId('stage-f-canonical-operation'),
      createdAt: nowIso(),
    })

    if (canonicalized.status === STAGE_F_CANONICALIZATION_STATUS.CONFLICT) {
      setStatus(root, 'Doğrulama uygulanmadı: revision geçmişi değişti. Güncel çalışma alanını yenileyin.', true)
      return false
    }

    if (canonicalized.history !== workspace.history) {
      setTeacherUiAuthoritativeHistory(root, canonicalized.history)
      workspace = refreshTeacherUiAfterConflict(root)
      assessment = assessStageFRevisionLifecycle(workspace)
    }

    const materialized = materializeAndRevalidateStageFCorrectedMusicXml({
      history: workspace.history,
      sourceNotes,
      canonicalizationEvidence: canonicalized.evidence,
    })
    if (!materialized.ok || typeof materialized.musicXml !== 'string') {
      renderStageFRevisionLifecycle(root)
      setStatus(root, `Düzeltilmiş nota doğrulanamadı (${materialized.reason ?? materialized.status}). Eski kaynak corrected gibi gösterilmedi.`, true)
      return false
    }

    const rendered = await renderExactCorrectedMusicXml(root, materialized.musicXml)
    if (!rendered) {
      setStatus(root, 'Düzeltilmiş MusicXML doğrulandı ancak görsel renderer sonucu güvenle oluşturulamadı.', true)
      return false
    }

    setStatus(root, 'Düzeltme ayrı sistem sürümünde canonicalize edildi, MusicXML yeniden doğrulandı ve exact düzeltilmiş görünüm oluşturuldu.')
    return true
  } catch (error) {
    renderStageFRevisionLifecycle(root)
    setStatus(root, `Doğrulama uygulanmadı: ${error?.message ?? 'güvenli kapsam dışında'}`, true)
    return false
  }
}

export async function undoLastStageFChange(root = document) {
  const workspace = getTeacherUiWorkspace(root)
  const assessment = assessStageFRevisionLifecycle(workspace)
  if (!assessment.undoTarget) {
    setStatus(root, 'Geri alınabilecek farklı bir önceki kullanıcı değişikliği yok.', true)
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
  } else {
    setStatus(root, 'Son öğretmen değişikliği yeni immutable revision ile geri alındı. Düzeltilmiş görünüm için yeniden doğrulama gerekir.')
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
