if (typeof globalThis.document !== 'undefined') {
  void import('./teacherStudentManagementUi.css')
}

let managementMountSequence = 0

function requiredController(controller) {
  for (const method of [
    'getViewModel',
    'refresh',
    'createInvitation',
    'copyInvitationLink',
    'revokeInvitation',
  ]) {
    if (typeof controller?.[method] !== 'function') {
      throw new TypeError(
        `controller must provide ${method}().`,
      )
    }
  }
  return controller
}

function textNode(root, tag, text, className = '') {
  const node = root.createElement(tag)
  node.textContent = text
  node.className = className
  return node
}

function metadataText(value) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : '—'
}

function safeRows(viewModel) {
  return Array.isArray(viewModel?.rows)
    ? viewModel.rows
    : []
}

function toggleDisclosure(button, panel) {
  const expanded = button.getAttribute('aria-expanded') === 'true'
  const nextExpanded = !expanded
  button.setAttribute('aria-expanded', String(nextExpanded))
  panel.hidden = !nextExpanded
}

export function mountTeacherStudentManagementUi({
  root = globalThis.document,
  host,
  controller,
} = {}) {
  if (!root || typeof root.createElement !== 'function') {
    throw new TypeError('root must provide createElement().')
  }
  if (!host || typeof host.replaceChildren !== 'function') {
    throw new TypeError('host must provide replaceChildren().')
  }

  const trustedController = requiredController(controller)
  const mountId = ++managementMountSequence
  let destroyed = false

  function render(message = '') {
    if (destroyed) return

    const viewModel = trustedController.getViewModel()
    const rows = safeRows(viewModel)
    const section = root.createElement('section')
    section.className = 'teacher-student-management'
    section.setAttribute(
      'aria-label',
      'Öğrenci Yönetimi',
    )

    section.appendChild(
      textNode(root, 'h2', `Öğrenci Yönetimi · ${rows.length}`),
    )
    section.appendChild(
      textNode(
        root,
        'p',
        'Öğrenciyi e-posta ile davet edin ve hesap durumunu görüntüleyin.',
        'teacher-student-management__intro',
      ),
    )

    const actions = root.createElement('div')
    actions.className = 'teacher-student-management__actions'

    const invitePanelId = `teacher-student-invite-panel-${mountId}`
    const inviteToggle = textNode(
      root,
      'button',
      '+ Öğrenci Davet Et',
      'btn btn-primary teacher-student-management__invite-toggle',
    )
    inviteToggle.type = 'button'
    inviteToggle.setAttribute('aria-expanded', 'false')
    inviteToggle.setAttribute('aria-controls', invitePanelId)
    actions.appendChild(inviteToggle)

    const refresh = textNode(
      root,
      'button',
      'Yenile',
      'btn btn-secondary',
    )
    refresh.type = 'button'
    refresh.addEventListener('click', async () => {
      try {
        await trustedController.refresh()
        render('Öğrenci listesi yenilendi.')
      } catch {
        render('Öğrenci listesi yenilenemedi.')
      }
    })
    actions.appendChild(refresh)

    if (viewModel?.invitationLinkReady === true) {
      const copy = textNode(
        root,
        'button',
        'Bağlantıyı Kopyala',
        'btn btn-secondary',
      )
      copy.type = 'button'
      copy.addEventListener('click', async () => {
        try {
          await trustedController.copyInvitationLink()
          render('Davet bağlantısı kopyalandı.')
        } catch {
          render('Davet bağlantısı kopyalanamadı.')
        }
      })
      actions.appendChild(copy)
    }

    section.appendChild(actions)

    const form = root.createElement('form')
    form.id = invitePanelId
    form.className = 'teacher-student-management__invite-form'
    form.hidden = true

    const emailLabel = textNode(
      root,
      'label',
      'Öğrenci e-postası',
    )
    const email = root.createElement('input')
    email.name = 'email'
    email.type = 'email'
    email.required = true
    email.setAttribute('autocomplete', 'email')
    emailLabel.appendChild(email)

    const nameLabel = textNode(
      root,
      'label',
      'Ad / takma ad',
    )
    const displayName = root.createElement('input')
    displayName.name = 'displayNameOrNickname'
    displayName.type = 'text'
    displayName.required = true
    displayName.setAttribute('autocomplete', 'name')
    nameLabel.appendChild(displayName)

    const submit = textNode(
      root,
      'button',
      'Davet Oluştur',
      'btn btn-primary',
    )
    submit.type = 'submit'

    form.appendChild(emailLabel)
    form.appendChild(nameLabel)
    form.appendChild(submit)

    inviteToggle.addEventListener('click', () => {
      toggleDisclosure(inviteToggle, form)
    })

    form.addEventListener('submit', async (event) => {
      event?.preventDefault?.()
      try {
        await trustedController.createInvitation({
          email: email.value,
          displayNameOrNickname: displayName.value,
        })
        render('Davet bağlantısı hazır.')
      } catch {
        render('Davet oluşturulamadı.')
      }
    })

    section.appendChild(form)

    const status = textNode(
      root,
      'p',
      message,
      'teacher-student-management__status',
    )
    status.setAttribute('role', 'status')
    status.setAttribute('aria-live', 'polite')
    section.appendChild(status)

    const list = root.createElement('div')
    list.className = 'teacher-student-management__list'

    rows.forEach((row, index) => {
      const article = root.createElement('article')
      article.className = 'teacher-student-management__row'

      const detailsId = `teacher-student-details-${mountId}-${index}`
      const summary = textNode(
        root,
        'button',
        `${metadataText(row?.displayNameOrNickname)} · ${metadataText(row?.state)} · ${metadataText(row?.presenceState)}`,
        'teacher-student-management__row-summary',
      )
      summary.type = 'button'
      summary.setAttribute('aria-expanded', 'false')
      summary.setAttribute('aria-controls', detailsId)
      article.appendChild(summary)

      const details = root.createElement('div')
      details.id = detailsId
      details.className = 'teacher-student-management__row-details'
      details.hidden = true
      details.appendChild(
        textNode(root, 'p', `Durum: ${metadataText(row?.state)}`),
      )
      details.appendChild(
        textNode(
          root,
          'p',
          `Bağlantı: ${metadataText(row?.presenceState)}`,
        ),
      )
      details.appendChild(
        textNode(
          root,
          'p',
          `${Number.isSafeInteger(row?.totalSessions) ? row.totalSessions : 0} oturum`,
        ),
      )
      details.appendChild(
        textNode(
          root,
          'p',
          `Son çevrimiçi: ${metadataText(row?.lastOnlineAt)}`,
        ),
      )
      details.appendChild(
        textNode(
          root,
          'p',
          `Son oturum: ${metadataText(row?.lastSessionAt)}`,
        ),
      )
      details.appendChild(
        textNode(
          root,
          'p',
          `Davet: ${metadataText(row?.invitationStatus)}`,
        ),
      )

      if (row?.invitationStatus === 'PENDING') {
        const revoke = textNode(
          root,
          'button',
          'Daveti İptal Et',
          'btn btn-secondary',
        )
        revoke.type = 'button'
        revoke.addEventListener('click', async () => {
          try {
            await trustedController.revokeInvitation(
              row.managementId,
            )
            render('Davet iptal edildi.')
          } catch {
            render('Davet iptal edilemedi.')
          }
        })
        details.appendChild(revoke)
      }

      summary.addEventListener('click', () => {
        toggleDisclosure(summary, details)
      })

      article.appendChild(details)
      list.appendChild(article)
    })

    if (rows.length === 0) {
      list.appendChild(
        textNode(
          root,
          'p',
          'Henüz öğrenci kaydı yok.',
        ),
      )
    }

    section.appendChild(list)
    host.replaceChildren(section)
  }

  render()

  return Object.freeze({
    render,
    destroy() {
      if (destroyed) return
      destroyed = true
      host.replaceChildren()
    },
  })
}
