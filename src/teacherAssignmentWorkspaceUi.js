import {
  mountTeacherAssignmentComposerUi,
} from './teacherAssignmentComposerUi.js'

const PRIMARY_VIEW = Object.freeze({
  NEW: 'NEW',
  MANAGEMENT: 'MANAGEMENT',
})

const MANAGEMENT_VIEW = Object.freeze({
  POOL: 'POOL',
  ACTIVE: 'ACTIVE',
  REPERTOIRE: 'REPERTOIRE',
})

function element(root, tag, className = '') {
  const node = root.createElement(tag)
  if (className) node.className = className
  return node
}

function requiredMethods(value, methods, label) {
  for (const method of methods) {
    if (typeof value?.[method] !== 'function') {
      throw new TypeError(
        `${label} must provide ${method}().`,
      )
    }
  }
  return value
}

function frozenRows(value, label) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array.`)
  }
  return Object.freeze([...value])
}

function contentText(summary) {
  if (!summary) return 'İçerik bekleniyor'
  const parts = []
  if (summary.score === true) parts.push('SCORE')
  const chordCount = Number.isInteger(summary.chordCount)
    ? summary.chordCount
    : 0
  if (chordCount > 0) parts.push(`${chordCount} akor`)
  return parts.length > 0 ? parts.join(' · ') : 'İçerik yok'
}

function locationText(row, kind) {
  if (kind === MANAGEMENT_VIEW.POOL) return 'Havuz'
  if (row.state === 'REPERTOIRE') return 'Repertuar'
  if (row.state === 'COMPLETED') return 'Tamamlandı'
  return 'Aktif Çalışma'
}

function visibleRows(snapshot, view) {
  if (view === MANAGEMENT_VIEW.POOL) {
    return snapshot.requests.filter(
      (row) => row?.state === 'PENDING' && row?.revoked !== true,
    )
  }
  if (view === MANAGEMENT_VIEW.REPERTOIRE) {
    return snapshot.pieces.filter(
      (row) => row?.state === 'REPERTOIRE' && row?.revoked !== true,
    )
  }
  return snapshot.pieces.filter(
    (row) =>
      ['ACTIVE', 'COMPLETED'].includes(row?.state) &&
      row?.revoked !== true,
  )
}

function nextView(map, current, direction) {
  const views = [...map.keys()]
  const index = views.indexOf(current)
  return views[(index + direction + views.length) % views.length]
}

export function mountTeacherAssignmentWorkspaceUi({
  root = globalThis.document,
  host,
  composerService,
  managementClient,
  createDraftId,
} = {}) {
  if (!host?.appendChild) {
    throw new TypeError('host must be a DOM container.')
  }
  requiredMethods(
    composerService,
    ['loadRoster', 'prepareScoreUpload', 'send'],
    'composerService',
  )
  requiredMethods(
    managementClient,
    [
      'listTeacherPieces',
      'listTeacherWorkRequests',
      'applyPieceAction',
      'applyTeacherWorkRequestAction',
      'convertTeacherWorkRequest',
    ],
    'managementClient',
  )

  let primaryView = PRIMARY_VIEW.NEW
  let managementView = MANAGEMENT_VIEW.POOL
  let managementSnapshot = null
  let snapshotPromise = null
  let destroyed = false
  let mutating = false

  const section = element(
    root,
    'section',
    'teacher-assignment-workspace',
  )
  const heading = element(root, 'h2')
  heading.textContent = 'Ödev Gönder'

  const primaryTabs = element(
    root,
    'div',
    'teacher-assignment-workspace__primary-tabs',
  )
  primaryTabs.setAttribute('role', 'tablist')
  primaryTabs.setAttribute('aria-label', 'Ödev')

  const newPanel = element(
    root,
    'div',
    'teacher-assignment-workspace__new-panel',
  )
  newPanel.id = 'teacher-assignment-new-panel'
  newPanel.setAttribute('role', 'tabpanel')
  const managementPanel = element(
    root,
    'div',
    'teacher-assignment-workspace__management-panel',
  )
  managementPanel.id = 'teacher-assignment-management-panel'
  managementPanel.setAttribute('role', 'tabpanel')

  const composerHost = element(
    root,
    'div',
    'teacher-assignment-workspace__composer',
  )
  newPanel.appendChild(composerHost)

  const managementTabs = element(
    root,
    'div',
    'teacher-assignment-workspace__management-tabs',
  )
  managementTabs.setAttribute('role', 'tablist')
  managementTabs.setAttribute(
    'aria-label',
    'Ödev Yönetimi',
  )
  const managementStatus = element(
    root,
    'div',
    'teacher-assignment-workspace__status',
  )
  managementStatus.setAttribute('role', 'status')
  managementStatus.setAttribute('aria-live', 'polite')
  managementStatus.setAttribute('aria-atomic', 'true')
  const managementList = element(
    root,
    'div',
    'teacher-assignment-workspace__list',
  )
  managementList.id = 'teacher-assignment-management-list'
  managementList.setAttribute('role', 'tabpanel')

  managementPanel.appendChild(managementTabs)
  managementPanel.appendChild(managementStatus)
  managementPanel.appendChild(managementList)

  section.appendChild(heading)
  section.appendChild(primaryTabs)
  section.appendChild(newPanel)
  section.appendChild(managementPanel)
  host.replaceChildren(section)

  const composerHandle =
    mountTeacherAssignmentComposerUi({
      root,
      host: composerHost,
      service: composerService,
      createDraftId,
    })

  const duplicateHeading =
    composerHost.querySelector('h3')
  if (duplicateHeading) duplicateHeading.hidden = true
  const intro = composerHost.querySelector(
    '.teacher-assignment-composer__intro',
  )
  if (intro) intro.hidden = true

  const primaryButtons = new Map()
  const managementButtons = new Map()

  function syncPrimaryTabs() {
    for (const [view, button] of primaryButtons) {
      const selected = view === primaryView
      button.setAttribute(
        'aria-selected',
        selected ? 'true' : 'false',
      )
      button.tabIndex = selected ? 0 : -1
    }
    newPanel.hidden =
      primaryView !== PRIMARY_VIEW.NEW
    managementPanel.hidden =
      primaryView !== PRIMARY_VIEW.MANAGEMENT
  }

  function syncManagementTabs() {
    for (const [view, button] of managementButtons) {
      const selected = view === managementView
      button.setAttribute(
        'aria-selected',
        selected ? 'true' : 'false',
      )
      button.tabIndex = selected ? 0 : -1
    }
  }

  async function loadManagementSnapshot() {
    if (managementSnapshot !== null) {
      return managementSnapshot
    }
    if (snapshotPromise !== null) {
      return snapshotPromise
    }

    const pending = Promise.all([
      managementClient.listTeacherPieces(),
      managementClient.listTeacherWorkRequests(),
    ]).then(([pieces, requests]) =>
      Object.freeze({
        pieces: frozenRows(pieces, 'teacher pieces'),
        requests: frozenRows(requests, 'teacher work requests'),
      }),
    )
    snapshotPromise = pending
    try {
      const snapshot = await pending
      if (!destroyed) managementSnapshot = snapshot
      return snapshot
    } finally {
      if (snapshotPromise === pending) {
        snapshotPromise = null
      }
    }
  }

  async function reconcileManagement({
    pieces = false,
    requests = false,
  } = {}) {
    if (managementSnapshot === null) {
      return loadManagementSnapshot()
    }
    const current = managementSnapshot
    const [nextPieces, nextRequests] = await Promise.all([
      pieces
        ? managementClient.listTeacherPieces()
        : current.pieces,
      requests
        ? managementClient.listTeacherWorkRequests()
        : current.requests,
    ])
    const snapshot = Object.freeze({
      pieces: frozenRows(nextPieces, 'teacher pieces'),
      requests: frozenRows(nextRequests, 'teacher work requests'),
    })
    if (!destroyed) managementSnapshot = snapshot
    return snapshot
  }

  function actionButton(label, operation) {
    const button = element(
      root,
      'button',
      'btn btn-secondary btn-sm',
    )
    button.type = 'button'
    button.textContent = label
    button.addEventListener('click', operation)
    return button
  }

  function closeDialog(dialog) {
    dialog.remove()
  }

  function confirmRemoval(row, operation, reconcile) {
    const dialog = element(
      root,
      'div',
      'teacher-assignment-workspace__confirm',
    )
    dialog.setAttribute('role', 'alertdialog')
    dialog.setAttribute('aria-modal', 'true')

    const title = element(root, 'h4')
    title.textContent = 'Çalışmayı kaldır?'
    const copy = element(root, 'p')
    copy.textContent =
      `${row.title} — ${row.displayNameOrNickname}. Bu işlem tek yönlüdür; geri alınamaz.`
    const cancel = actionButton('İptal', () => {
      closeDialog(dialog)
      managementStatus.textContent = 'İşlem iptal edildi.'
    })
    const confirm = actionButton('Kaldır', async () => {
      if (mutating) return
      mutating = true
      cancel.disabled = true
      confirm.disabled = true
      managementStatus.textContent = 'Kaldırılıyor.'
      try {
        await operation()
        await reconcileManagement(reconcile)
        managementStatus.textContent = 'Kaldırıldı.'
        closeDialog(dialog)
        renderManagementRows()
      } catch {
        managementStatus.textContent =
          'Kaldırılamadı. Tekrar deneyin.'
        cancel.disabled = false
        confirm.disabled = false
      } finally {
        mutating = false
      }
    })

    dialog.appendChild(title)
    dialog.appendChild(copy)
    dialog.appendChild(cancel)
    dialog.appendChild(confirm)
    managementPanel.appendChild(dialog)
    cancel.focus?.()
  }

  async function mutatePiece(row, action, successMessage) {
    if (mutating) return
    mutating = true
    managementStatus.textContent = 'Güncelleniyor.'
    try {
      await managementClient.applyPieceAction(
        row.actionKey,
        action,
      )
      await reconcileManagement({ pieces: true })
      managementStatus.textContent = successMessage
      renderManagementRows()
    } catch {
      managementStatus.textContent =
        'Güncellenemedi. Tekrar deneyin.'
    } finally {
      mutating = false
    }
  }

  function renderPieceActions(article, row) {
    if (row.state === 'ACTIVE' || row.state === 'COMPLETED') {
      article.appendChild(
        actionButton('Repertuara Al', () =>
          mutatePiece(
            row,
            'PLACE_IN_REPERTOIRE',
            'Repertuara alındı.',
          ),
        ),
      )
    }
    article.appendChild(
      actionButton('Kaldır', () =>
        confirmRemoval(
          row,
          () =>
            managementClient.applyPieceAction(
              row.actionKey,
              'REVOKE',
            ),
          { pieces: true },
        ),
      ),
    )
  }

  async function beginRequestConversion(row, targetState) {
    primaryView = PRIMARY_VIEW.NEW
    syncPrimaryTabs()
    composerHandle.startRequestConversion({
      title: row.title,
      displayNameOrNickname: row.displayNameOrNickname,
      targetState,
      onSubmit: async (composerDraft) => {
        await managementClient.convertTeacherWorkRequest(
          row.actionKey,
          targetState,
          composerDraft,
        )
        await reconcileManagement({
          pieces: true,
          requests: true,
        })
        managementView = targetState === 'REPERTOIRE'
          ? MANAGEMENT_VIEW.REPERTOIRE
          : MANAGEMENT_VIEW.ACTIVE
        syncManagementTabs()
        primaryView = PRIMARY_VIEW.MANAGEMENT
        syncPrimaryTabs()
        renderManagementRows()
        managementStatus.textContent =
          targetState === 'REPERTOIRE'
            ? 'Repertuara alındı.'
            : 'Aktif Çalışmaya alındı.'
      },
    })
  }

  function renderRequestActions(article, row) {
    article.appendChild(
      actionButton('Aktife Al', () =>
        beginRequestConversion(row, 'ACTIVE'),
      ),
    )
    article.appendChild(
      actionButton('Doğrudan Repertuara Al', () =>
        beginRequestConversion(row, 'REPERTOIRE'),
      ),
    )
    article.appendChild(
      actionButton('Kaldır', () =>
        confirmRemoval(
          row,
          () =>
            managementClient
              .applyTeacherWorkRequestAction(
                row.actionKey,
                'REJECT',
              ),
          { requests: true },
        ),
      ),
    )
  }

  function renderManagementRows() {
    managementList.replaceChildren()
    if (managementSnapshot === null) return
    const rows = visibleRows(
      managementSnapshot,
      managementView,
    )
    if (rows.length === 0) {
      const empty = element(root, 'p')
      empty.textContent = 'Bu bölümde çalışma yok.'
      managementList.appendChild(empty)
      return
    }

    for (const row of rows) {
      const article = element(
        root,
        'article',
        'teacher-assignment-workspace__item',
      )
      const title = element(root, 'h3')
      title.textContent = row.title
      const student = element(root, 'p')
      student.textContent = row.displayNameOrNickname
      const summary = element(root, 'p')
      summary.textContent = contentText(row.contentSummary)
      const state = element(root, 'p')
      state.textContent = locationText(
        row,
        managementView,
      )
      article.appendChild(title)
      article.appendChild(student)
      article.appendChild(summary)
      article.appendChild(state)

      if (managementView === MANAGEMENT_VIEW.POOL) {
        renderRequestActions(article, row)
      } else {
        renderPieceActions(article, row)
      }
      managementList.appendChild(article)
    }
  }

  async function selectPrimary(view) {
    primaryView = view
    syncPrimaryTabs()
    if (view !== PRIMARY_VIEW.MANAGEMENT) return
    if (managementSnapshot === null) {
      managementStatus.textContent = 'Ödevler yükleniyor.'
      try {
        await loadManagementSnapshot()
        if (destroyed) return
        managementStatus.textContent = ''
      } catch {
        if (!destroyed) {
          managementStatus.textContent =
            'Ödevler yüklenemedi. Tekrar deneyin.'
        }
        return
      }
    }
    renderManagementRows()
  }

  function selectManagement(view) {
    managementView = view
    syncManagementTabs()
    renderManagementRows()
  }

  function handleTabKey(event, map, current, select) {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault?.()
    const direction = event.key === 'ArrowRight' ? 1 : -1
    const view = nextView(map, current, direction)
    select(view)
    map.get(view)?.focus?.()
  }

  for (const [view, label, panelId] of [
    [PRIMARY_VIEW.NEW, 'Yeni Ödev', newPanel.id],
    [PRIMARY_VIEW.MANAGEMENT, 'Ödev Yönetimi', managementPanel.id],
  ]) {
    const button = element(
      root,
      'button',
      'tab-btn teacher-assignment-workspace__primary-tab',
    )
    button.type = 'button'
    button.setAttribute('role', 'tab')
    button.setAttribute('aria-controls', panelId)
    button.textContent = label
    button.addEventListener('click', () => {
      if (view === PRIMARY_VIEW.MANAGEMENT) {
        composerHandle.cancelRequestConversion()
      }
      void selectPrimary(view)
    })
    button.addEventListener('keydown', (event) =>
      handleTabKey(
        event,
        primaryButtons,
        primaryView,
        (next) => void selectPrimary(next),
      ),
    )
    primaryTabs.appendChild(button)
    primaryButtons.set(view, button)
  }

  for (const [view, label] of [
    [MANAGEMENT_VIEW.POOL, 'Havuz'],
    [MANAGEMENT_VIEW.ACTIVE, 'Aktif Çalışma'],
    [MANAGEMENT_VIEW.REPERTOIRE, 'Repertuar'],
  ]) {
    const button = element(
      root,
      'button',
      'tab-btn teacher-assignment-workspace__management-tab',
    )
    button.type = 'button'
    button.setAttribute('role', 'tab')
    button.setAttribute('aria-controls', managementList.id)
    button.textContent = label
    button.addEventListener('click', () =>
      selectManagement(view),
    )
    button.addEventListener('keydown', (event) =>
      handleTabKey(
        event,
        managementButtons,
        managementView,
        selectManagement,
      ),
    )
    managementTabs.appendChild(button)
    managementButtons.set(view, button)
  }

  syncPrimaryTabs()
  syncManagementTabs()

  return Object.freeze({
    refreshManagement() {
      return reconcileManagement({
        pieces: true,
        requests: true,
      }).then(() => {
        if (!destroyed) renderManagementRows()
        return managementSnapshot
      })
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      composerHandle.destroy()
      host.replaceChildren()
    },
  })
}
