// Stage L — accessible teacher-facing student/share readiness UI.
//
// This UI creates only in-memory Package 12 readiness evidence. It never sends
// score content, creates links/tokens, authenticates a recipient, persists a
// grant or claims that a student received anything.

import {
  getPackage3MeasureSnapshot,
  subscribePackage3Measures,
} from '../package3MeasureBridge.js'
import {
  ensureTeacherPanel,
  getTeacherUiWorkspace,
} from './package8TeacherUi.js'
import {
  STAGE_L_DELIVERY_STATE,
  STAGE_L_SHARE_READINESS_STATUS,
  evaluateStageLShareReadiness,
} from './services/stageLShareReadiness.js'

export const STAGE_L_SHARE_COPY = Object.freeze({
  title: 'Öğrenciyle paylaşım hazırlığı',
  recipientLabel: 'Öğrenci kayıt etiketi',
  recipientHelp:
    'Bu etiket kimlik doğrulaması değildir. Gerçek öğrenci hesabı ve güvenli teslimat bu aşamada uygulanmamıştır.',
  action: 'Bu öğrenci için paylaşım izni oluştur ve uygunluğu kontrol et',
  deliveryBoundary:
    'Uygunluk sonucu yalnız güvenlik hazırlığıdır. Bu ekranda eser gönderilmez; link, token veya öğrenci erişimi oluşturulmaz.',
})

const resultByRoot = new WeakMap()
const adaptersByRoot = new WeakMap()
const sourceNotesByRoot = new WeakMap()
const boundRoots = new WeakSet()

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
        throw new Error('Bu tarayıcı güvenli paylaşım kontrolü kimliği üretemiyor.')
      }
      return `${prefix}-${randomUUID.call(globalThis.crypto)}`
    },
    now() {
      return new Date().toISOString()
    },
  })
}

function resolveAdapter(root, overrides = {}) {
  const base = defaultMetadataAdapter()
  const adapter = Object.freeze({
    id: typeof overrides.id === 'function' ? overrides.id : base.id,
    now: typeof overrides.now === 'function' ? overrides.now : base.now,
  })
  adaptersByRoot.set(root, adapter)
  return adapter
}

function adapterFor(root) {
  return adaptersByRoot.get(root) ?? resolveAdapter(root)
}

function makeId(adapter, prefix) {
  const value = adapter.id(prefix)
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Geçerli paylaşım kontrolü kimliği üretilemedi.')
  }
  return value.trim()
}

function makeTime(adapter) {
  const value = adapter.now()
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Geçerli paylaşım kontrolü zamanı üretilemedi.')
  }
  return value.trim()
}

function createParagraph(root, id, text) {
  const paragraph = root.createElement('p')
  paragraph.id = id
  paragraph.textContent = text
  return paragraph
}

export function ensureStageLSharePanel(root = document) {
  requireRoot(root)
  ensureTeacherPanel(root)
  const existing = root.getElementById('stage-l-share-panel')
  if (existing) return existing

  const active = root.getElementById('teacher-active-workspace')
  if (!active) return null

  const section = root.createElement('section')
  section.id = 'stage-l-share-panel'
  section.className = 'stage-l-share-panel'
  section.setAttribute('aria-labelledby', 'stage-l-share-title')

  const title = root.createElement('h4')
  title.id = 'stage-l-share-title'
  title.textContent = STAGE_L_SHARE_COPY.title
  section.appendChild(title)

  section.appendChild(
    createParagraph(root, 'stage-l-share-boundary', STAGE_L_SHARE_COPY.deliveryBoundary),
  )

  const label = root.createElement('label')
  label.setAttribute('for', 'stage-l-recipient-id')
  label.textContent = STAGE_L_SHARE_COPY.recipientLabel
  section.appendChild(label)

  const recipient = root.createElement('input')
  recipient.id = 'stage-l-recipient-id'
  recipient.type = 'text'
  recipient.setAttribute('autocomplete', 'off')
  recipient.setAttribute('aria-describedby', 'stage-l-recipient-help')
  section.appendChild(recipient)

  section.appendChild(
    createParagraph(root, 'stage-l-recipient-help', STAGE_L_SHARE_COPY.recipientHelp),
  )

  const action = root.createElement('button')
  action.id = 'stage-l-share-check-btn'
  action.type = 'button'
  action.className = 'btn btn-primary'
  action.textContent = STAGE_L_SHARE_COPY.action
  section.appendChild(action)

  const status = createParagraph(
    root,
    'stage-l-share-status',
    'Paylaşım uygunluğu henüz kontrol edilmedi.',
  )
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.setAttribute('tabindex', '-1')
  section.appendChild(status)

  active.appendChild(section)
  return section
}

function statusText(result) {
  if (!result) return 'Paylaşım uygunluğu henüz kontrol edilmedi.'

  switch (result.status) {
    case STAGE_L_SHARE_READINESS_STATUS.READY_EXACT_REVISION:
      return `Uygunluk doğrulandı: ${result.revisionId} exact sürümü bu öğrenci etiketi için Package 12 kontrollerini geçti. Eser henüz gönderilmedi.`
    case STAGE_L_SHARE_READINESS_STATUS.APPROVAL_REQUIRED:
      return 'Paylaşım uygunluğu doğrulanmadı: geçerli exact sürüm için önce öğretmen onayı gerekir.'
    case STAGE_L_SHARE_READINESS_STATUS.SOURCE_QUALITY_NOT_ELIGIBLE:
      return 'Paylaşım uygunluğu doğrulanmadı: exact kaynak kalite/provenans kanıtı paylaşım için yeterli değil.'
    case STAGE_L_SHARE_READINESS_STATUS.CORRECTED_REVALIDATION_NOT_ELIGIBLE:
      return 'Paylaşım uygunluğu doğrulanmadı: düzeltilmiş sürümün Package 12 yeniden doğrulama kanıtı yeterli değil.'
    default:
      return 'Paylaşım uygunluğu doğrulanmadı: bu exact sürüm mevcut güvenli paylaşım kapsamı dışında.'
  }
}

export function renderStageLShareUi(root = document) {
  requireRoot(root)
  ensureStageLSharePanel(root)

  const workspace = getTeacherUiWorkspace(root)
  const result = resultByRoot.get(root) ?? null
  const action = root.getElementById('stage-l-share-check-btn')
  const recipient = root.getElementById('stage-l-recipient-id')
  const status = root.getElementById('stage-l-share-status')
  const panel = root.getElementById('stage-l-share-panel')

  if (panel) {
    panel.setAttribute('data-stage-l-delivery-state', STAGE_L_DELIVERY_STATE)
    panel.setAttribute('data-stage-l-readiness', result?.status ?? 'unchecked')
    panel.setAttribute('data-stage-l-route', result?.route ?? 'none')
  }

  if (action) action.disabled = !workspace
  if (recipient) recipient.disabled = !workspace

  if (result && workspace) {
    const currentRevision = workspace.history.revisions.at(-1)
    if (currentRevision?.revisionId !== result.revisionId) {
      resultByRoot.delete(root)
      if (panel) {
        panel.setAttribute('data-stage-l-readiness', 'unchecked')
        panel.setAttribute('data-stage-l-route', 'none')
      }
      if (status) status.textContent = 'Geçerli sürüm değişti. Önceki paylaşım uygunluğu geçersiz kılındı.'
      return null
    }
  }

  if (status) {
    status.textContent = workspace
      ? statusText(resultByRoot.get(root) ?? null)
      : 'Paylaşım hazırlığı için önce öğretmen çalışma alanını başlatın.'
  }
  return resultByRoot.get(root) ?? null
}

export function invalidateStageLShareReadiness(root = document, message = null) {
  requireRoot(root)
  resultByRoot.delete(root)
  renderStageLShareUi(root)
  const status = root.getElementById('stage-l-share-status')
  if (status && message) status.textContent = message
}

export function checkStageLShareReadiness(root = document) {
  requireRoot(root)
  const workspace = getTeacherUiWorkspace(root)
  if (!workspace) {
    renderStageLShareUi(root)
    return null
  }

  const recipientId = root.getElementById('stage-l-recipient-id')?.value?.trim() ?? ''
  if (!recipientId) {
    const status = root.getElementById('stage-l-share-status')
    if (status) {
      status.textContent = 'Öğrenci kayıt etiketi gereklidir. Bu etiket kimlik doğrulaması değildir.'
      status.setAttribute('role', 'alert')
      status.setAttribute('aria-live', 'assertive')
      if (typeof status.focus === 'function') status.focus()
    }
    return null
  }

  try {
    const adapter = adapterFor(root)
    const snapshot = getPackage3MeasureSnapshot()
    const sourceNotes = sourceNotesByRoot.get(root) ?? snapshot.notes
    const result = evaluateStageLShareReadiness({
      workspace,
      sourceNotes,
      recipientId,
      authorizationId: makeId(adapter, 'stage-l-share-authorization'),
      rootQualityEvidenceId: makeId(adapter, 'stage-l-root-quality'),
      revalidationEvidenceId: makeId(adapter, 'stage-l-revalidation'),
      createdAt: makeTime(adapter),
    })
    resultByRoot.set(root, result)
    renderStageLShareUi(root)
    const status = root.getElementById('stage-l-share-status')
    if (status) {
      status.setAttribute('role', result.eligible ? 'status' : 'alert')
      status.setAttribute('aria-live', result.eligible ? 'polite' : 'assertive')
      if (typeof status.focus === 'function') status.focus()
    }
    return result
  } catch {
    resultByRoot.delete(root)
    renderStageLShareUi(root)
    const status = root.getElementById('stage-l-share-status')
    if (status) {
      status.textContent = 'Paylaşım uygunluğu güvenli biçimde doğrulanamadı. Hiçbir eser gönderilmedi ve erişim oluşturulmadı.'
      status.setAttribute('role', 'alert')
      status.setAttribute('aria-live', 'assertive')
      if (typeof status.focus === 'function') status.focus()
    }
    return null
  }
}

function bindInvalidation(root, id, message) {
  root.getElementById(id)?.addEventListener('click', () => {
    invalidateStageLShareReadiness(root, message)
  })
}

export function initStageLShareUi(root = document, adapters = {}) {
  requireRoot(root)
  ensureStageLSharePanel(root)
  resolveAdapter(root, adapters)

  if (!boundRoots.has(root)) {
    boundRoots.add(root)
    root.getElementById('stage-l-share-check-btn')?.addEventListener('click', () => {
      checkStageLShareReadiness(root)
    })

    for (const id of [
      'teacher-start-btn',
      'teacher-correction-btn',
      'teacher-approve-btn',
      'teacher-undo-btn',
      'teacher-refresh-btn',
      'reset-btn',
    ]) {
      bindInvalidation(
        root,
        id,
        'Öğretmen çalışma durumu değişti. Önceki paylaşım uygunluğu temizlendi; yeniden kontrol edin.',
      )
    }

    const initial = getPackage3MeasureSnapshot().notes
    sourceNotesByRoot.set(root, initial)
    subscribePackage3Measures(({ notes }) => {
      const previous = sourceNotesByRoot.get(root) ?? null
      sourceNotesByRoot.set(root, notes)
      if (notes !== previous) {
        invalidateStageLShareReadiness(
          root,
          'Kaynak eser değişti. Önceki paylaşım uygunluğu temizlendi; yeniden kontrol edin.',
        )
      } else {
        renderStageLShareUi(root)
      }
    })
  }

  renderStageLShareUi(root)
  return true
}
