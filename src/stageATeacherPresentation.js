// Stage A — presentation-only teacher workspace simplification.
//
// This module changes labels, grouping and responsive presentation only.
// Package 8 remains the authority for revision identity, audit evidence,
// correction, approval, undo and concurrency. No musical/domain state is
// created, repaired or reinterpreted here.

const observerByRoot = new WeakMap()

export const STAGE_A_TEACHER_COPY = Object.freeze({
  tab: 'Düzelt',
  title: 'Notayı İncele ve Düzelt',
  safety: 'Otomatik kaynak korunur. Kaydettiğiniz düzeltmeler ayrı kayıt olarak tutulur; onay yalnız mevcut çalışmaya bağlıdır.',
  actorLabel: 'Kayıt adı',
  actorHelp: 'Bu ad yalnız denetim kaydı içindir; kimlik doğrulama değildir.',
  start: 'Düzenlemeye Başla',
  correctionLegend: 'Düzeltme',
  correctionHelp: 'Yalnız desteklenen alan değişir. Sistem eksik veya bağlı müzik verisini tahmin etmez. Kaydın ardından yeniden doğrulama gerekir.',
  correctionSave: 'Düzeltmeyi Kaydet',
  approve: 'Eseri Onayla',
  details: 'Detaylar',
  undoLegend: 'Geçmiş ve geri alma',
  undoLabel: 'Geri alma noktası',
  undo: 'Geri Al',
})

function setText(node, value) {
  if (node && node.textContent !== value) node.textContent = value
}

function findLabel(root, controlId) {
  const labels = root.querySelectorAll?.('label') ?? []
  for (const label of labels) {
    if (label.getAttribute?.('for') === controlId) return label
  }
  return null
}

function findLegend(fieldset) {
  const children = fieldset?.children ?? []
  for (const child of children) {
    if (String(child.tagName ?? '').toLowerCase() === 'legend') return child
  }
  return null
}

export function simplifyTeacherRevisionSummary(text) {
  const value = typeof text === 'string' ? text : ''
  const count = value.match(/Toplam sürüm:\s*(\d+)/i)?.[1]
  if (count) return `Düzeltme geçmişi: ${count} kayıt.`
  if (/Geçerli sürüm:/i.test(value)) return 'Düzeltme geçmişi hazır.'
  return value
}

export function simplifyTeacherApprovalSummary(text) {
  const value = typeof text === 'string' ? text : ''
  if (/öğretmen tarafından onaylandı/i.test(value)) {
    return 'Eserin mevcut sürümü öğretmen tarafından onaylandı.'
  }
  if (/uygulanabilir öğretmen onayı yok/i.test(value)) {
    return 'Eser henüz onaylanmadı.'
  }
  return value
}

export function simplifyTeacherStatus(text) {
  const value = typeof text === 'string' ? text : ''
  if (/Öğretmen çalışma alanı için önce bir eser analiz edin/i.test(value)) {
    return 'Başlamak için önce bir eser açın.'
  }
  if (/^Kaynak hazır:.*Çalışma alanını başlatabilirsiniz/i.test(value)) {
    return 'Eser hazır. Düzenlemeye başlayabilirsiniz.'
  }
  if (/Öğretmen kayıt etiketi gereklidir/i.test(value)) return 'Kayıt adı gereklidir.'
  if (/Öğretmen çalışma alanı oluşturuldu/i.test(value)) {
    return 'Düzenleme alanı hazır. Otomatik kaynak korunuyor.'
  }
  if (/Düzeltme yeni immutable sürüm olarak kaydedildi/i.test(value)) {
    return 'Düzeltme kaydedildi. Önceki kayıt korunuyor. Bu işlem eseri otomatik olarak onaylamaz.'
  }
  if (/Geçerli exact sürüm için öğretmen onayı kaydedildi/i.test(value)) {
    return 'Eserin mevcut sürümü onaylandı. Bu onay öğrenciye gönderim izni değildir.'
  }
  if (/Eski içerik yeni immutable sürüm olarak oluşturuldu/i.test(value)) {
    return 'Geri alma tamamlandı. Önceki kayıtlar korunuyor ve eski onay yeniden etkinleşmedi.'
  }
  if (/Güncel history durumu yüklendi/i.test(value)) {
    return 'Güncel durum yüklendi. Önceki çakışan işlem otomatik olarak yeniden uygulanmadı.'
  }
  return value
}

function ensureTechnicalDetails(root, active) {
  if (!active) return null
  let details = root.getElementById('teacher-technical-details')
  if (!details) {
    details = root.createElement('details')
    details.id = 'teacher-technical-details'
    details.className = 'teacher-technical-details'

    const summary = root.createElement('summary')
    summary.id = 'teacher-technical-details-summary'
    summary.textContent = STAGE_A_TEACHER_COPY.details
    details.appendChild(summary)
    active.appendChild(details)
  }

  const technicalNodes = [
    root.getElementById('teacher-current-content'),
    root.getElementById('teacher-undo-group'),
    root.getElementById('teacher-history-list'),
  ].filter(Boolean)

  for (const node of technicalNodes) {
    if (node.parentElement !== details) {
      node.parentElement?.removeChild?.(node)
      details.appendChild(node)
    }
  }

  const currentContent = root.getElementById('teacher-current-content')
  currentContent?.setAttribute?.('aria-label', 'Teknik sürüm verisi')
  return details
}

export function applyStageATeacherPresentation(root = document) {
  if (!root || typeof root.getElementById !== 'function') return false
  const panel = root.getElementById('tab-teacher')
  if (!panel) return false

  setText(root.getElementById('teacher-tab-btn'), STAGE_A_TEACHER_COPY.tab)
  const heading = panel.querySelector?.('h3') ?? null
  setText(heading, STAGE_A_TEACHER_COPY.title)
  setText(root.getElementById('teacher-safety-note'), STAGE_A_TEACHER_COPY.safety)

  setText(findLabel(root, 'teacher-actor-id'), STAGE_A_TEACHER_COPY.actorLabel)
  setText(root.getElementById('teacher-actor-help'), STAGE_A_TEACHER_COPY.actorHelp)
  setText(root.getElementById('teacher-start-btn'), STAGE_A_TEACHER_COPY.start)

  setText(findLegend(root.getElementById('teacher-correction-group')), STAGE_A_TEACHER_COPY.correctionLegend)
  setText(root.getElementById('teacher-correction-help'), STAGE_A_TEACHER_COPY.correctionHelp)
  setText(root.getElementById('teacher-correction-btn'), STAGE_A_TEACHER_COPY.correctionSave)
  setText(root.getElementById('teacher-approve-btn'), STAGE_A_TEACHER_COPY.approve)
  root.getElementById('teacher-approval-group')?.setAttribute?.('aria-label', 'Eser onayı')

  setText(findLegend(root.getElementById('teacher-undo-group')), STAGE_A_TEACHER_COPY.undoLegend)
  setText(findLabel(root, 'teacher-undo-select'), STAGE_A_TEACHER_COPY.undoLabel)
  setText(root.getElementById('teacher-undo-btn'), STAGE_A_TEACHER_COPY.undo)

  const revisionSummary = root.getElementById('teacher-revision-summary')
  if (revisionSummary) setText(revisionSummary, simplifyTeacherRevisionSummary(revisionSummary.textContent))
  const approvalSummary = root.getElementById('teacher-approval-summary')
  if (approvalSummary) setText(approvalSummary, simplifyTeacherApprovalSummary(approvalSummary.textContent))
  const status = root.getElementById('teacher-status')
  if (status) setText(status, simplifyTeacherStatus(status.textContent))

  ensureTechnicalDetails(root, root.getElementById('teacher-active-workspace'))
  return true
}

function bindPresentationObserver(root) {
  if (observerByRoot.has(root) || typeof MutationObserver !== 'function') return
  const panel = root.getElementById('tab-teacher')
  if (!panel) return

  let scheduled = false
  const observer = new MutationObserver(() => {
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      applyStageATeacherPresentation(root)
    })
  })
  observer.observe(panel, { childList: true, subtree: true, characterData: true })
  observerByRoot.set(root, observer)
}

export function initStageATeacherPresentation(root = document) {
  const init = () => {
    if (!applyStageATeacherPresentation(root)) return false
    bindPresentationObserver(root)
    return true
  }

  if (root?.readyState === 'loading') {
    root.addEventListener?.('DOMContentLoaded', init, { once: true })
    return true
  }
  return init()
}

if (typeof document !== 'undefined') initStageATeacherPresentation(document)
