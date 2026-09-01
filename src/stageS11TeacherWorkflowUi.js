// S11 — presentation-only teacher workflow simplification.
//
// Package 8 remains the immutable revision/history/approval authority and S07
// remains the exact selected-note correction orchestration. This layer removes
// the duplicate technical teacher tab from the normal workflow, keeps its
// controls mounted but hidden for the existing safe orchestration seams, and
// compacts repeated explanation without adding identity or authority.

export const STAGE_S11_COPY = Object.freeze({
  conciseHelp: 'Bir alanı değiştirip kaydedin. Yeni sürüm yeniden doğrulanır; düzeltme öğretmen onayı değildir.',
  detailsSummary: 'Düzeltme ve onay hakkında',
  detailsText: 'Her düzeltme yeni immutable sürüm oluşturur. Geri al geçmişi silmez; yeni bir sürüm oluşturur. Öğretmen onayı yalnız exact current revision için ayrı bir işlemdir; kalite kapısı veya öğrenciyle paylaşım izni değildir.',
})

const focusBoundRoots = new WeakSet()

function validRoot(root) {
  return root &&
    typeof root.getElementById === 'function' &&
    typeof root.createElement === 'function'
}

function hideTechnicalTeacherSurface(root) {
  const tab = root.getElementById('teacher-tab-btn')
  const panel = root.getElementById('tab-teacher')
  if (!panel) return false

  if (tab) {
    tab.hidden = true
    tab.setAttribute('aria-hidden', 'true')
    tab.setAttribute('tabindex', '-1')
    tab.setAttribute('data-stage-s11-secondary-control', 'true')
  }

  panel.hidden = true
  panel.setAttribute('aria-hidden', 'true')
  panel.setAttribute('data-stage-s11-internal-controls', 'true')
  return true
}

function ensureSafetyDetails(root, inspector) {
  let details = root.getElementById('stage-s11-workflow-details')
  if (details) return details

  details = root.createElement('details')
  details.id = 'stage-s11-workflow-details'
  details.className = 'stage-s11-workflow-details'

  const summary = root.createElement('summary')
  summary.textContent = STAGE_S11_COPY.detailsSummary

  const body = root.createElement('p')
  body.id = 'stage-s11-workflow-details-text'
  body.textContent = STAGE_S11_COPY.detailsText

  details.appendChild(summary)
  details.appendChild(body)
  inspector.appendChild(details)
  return details
}

function focusWorkflowStatus(root) {
  const status = root.getElementById('stage-s07-inline-status')
  if (status && typeof status.focus === 'function') status.focus()
}

function focusWhenPrimaryActionSettles(root) {
  const workspace = root.getElementById('stage-s05-score-workspace')
  if (workspace?.getAttribute?.('data-stage-s07-score-state') !== 'revalidating') {
    queueMicrotask(() => focusWorkflowStatus(root))
    return
  }

  const Observer = root.defaultView?.MutationObserver ?? globalThis.MutationObserver
  if (typeof Observer !== 'function') return
  const observer = new Observer(() => {
    if (workspace.getAttribute?.('data-stage-s07-score-state') === 'revalidating') return
    observer.disconnect()
    focusWorkflowStatus(root)
  })
  observer.observe(workspace, { attributes: true, attributeFilter: ['data-stage-s07-score-state'] })
}

function bindPrimaryFocusRestoration(root, inspector) {
  if (focusBoundRoots.has(root) || typeof inspector.addEventListener !== 'function') return
  focusBoundRoots.add(root)
  inspector.addEventListener('click', (event) => {
    const target = event.target?.closest?.(
      '.stage-s07-apply-field, #stage-s07-undo-btn, #stage-s07-approve-btn',
    )
    if (!target) return
    focusWhenPrimaryActionSettles(root)
  })
}

function configurePrimaryInspector(root) {
  const inspector = root.getElementById('stage-s07-inline-teacher-inspector')
  if (!inspector) return false

  inspector.classList?.add?.('stage-s11-primary-teacher-workflow')
  inspector.setAttribute('data-stage-s11-primary-workflow', 'ready')

  const placeholder = root.getElementById('stage-s05-score-inspector-placeholder')
  if (placeholder) placeholder.hidden = true

  const help = root.getElementById('stage-s07-inline-help')
  if (help) help.textContent = STAGE_S11_COPY.conciseHelp

  const status = root.getElementById('stage-s07-inline-status')
  if (status) {
    status.setAttribute('tabindex', '-1')
    status.setAttribute('aria-atomic', 'true')
  }

  const actions = inspector.querySelector?.('.stage-s07-inline-actions') ?? null
  if (actions) actions.setAttribute('aria-label', 'Geri alma ve exact sürüm onayı')

  const undo = root.getElementById('stage-s07-undo-btn')
  if (undo) undo.textContent = 'Geri al'

  ensureSafetyDetails(root, inspector)
  bindPrimaryFocusRestoration(root, inspector)
  return true
}

export function applyStageS11TeacherWorkflowUi(root = document) {
  if (!validRoot(root)) return false
  if (!hideTechnicalTeacherSurface(root)) return false
  if (!configurePrimaryInspector(root)) return false

  const workspace = root.getElementById('stage-s05-score-workspace')
  workspace?.setAttribute?.('data-stage-s11-teacher-workflow', 'ready')
  return true
}

export function initStageS11TeacherWorkflowUi(root = document) {
  const init = () => applyStageS11TeacherWorkflowUi(root)
  if (root?.readyState === 'loading') {
    root.addEventListener?.('DOMContentLoaded', init, { once: true })
    return true
  }
  return init()
}
