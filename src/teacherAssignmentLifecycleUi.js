function element(root, tag, className = '') {
  const node = root.createElement(tag)
  if (className) node.className = className
  return node
}

export function mountTeacherAssignmentLifecycleUi({
  root = document,
  host,
  controller,
} = {}) {
  if (!host?.appendChild) {
    throw new TypeError(
      'host must be a DOM container.',
    )
  }
  if (
    !controller ||
    typeof controller.getViewModel !== 'function' ||
    typeof controller.markCompleted !== 'function' ||
    typeof controller.moveToRepertoire !== 'function' ||
    typeof controller.revoke !== 'function'
  ) {
    throw new TypeError(
      'controller must provide getViewModel(), markCompleted(), moveToRepertoire() and revoke().',
    )
  }

  const section = element(
    root,
    'section',
    'teacher-assignment-lifecycle',
  )
  section.setAttribute(
    'aria-labelledby',
    'teacher-assignment-lifecycle-heading',
  )

  const heading = element(root, 'h2')
  heading.id =
    'teacher-assignment-lifecycle-heading'
  heading.textContent = 'Ödev Yönetimi'

  const status = element(
    root,
    'div',
    'teacher-assignment-lifecycle__status',
  )
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')

  const list = element(
    root,
    'div',
    'teacher-assignment-lifecycle__list',
  )

  section.appendChild(heading)
  section.appendChild(status)
  section.appendChild(list)
  host.appendChild(section)

  function actionButton(label, operation) {
    const button = element(root, 'button')
    button.type = 'button'
    button.textContent = label
    button.addEventListener(
      'click',
      () => {
        const result = operation()
        status.textContent = result.message
        if (result.ok) {
          refresh()
        }
      },
    )
    return button
  }

  function stateText(row) {
    if (row.revoked) {
      return 'Geri çekildi'
    }
    if (row.state === 'ACTIVE') {
      return 'Aktif'
    }
    if (row.state === 'COMPLETED') {
      return 'Tamamlandı'
    }
    return 'Repertuar'
  }

  function renderRows(rows) {
    list.replaceChildren()

    for (const row of rows) {
      const article = element(
        root,
        'article',
        'teacher-assignment-lifecycle__item',
      )
      article.dataset.assignmentId =
        row.assignmentId

      const student = element(root, 'h3')
      student.textContent =
        row.displayNameOrNickname
      article.appendChild(student)

      if (row.teacherNote) {
        const note = element(root, 'p')
        note.textContent = row.teacherNote
        article.appendChild(note)
      }

      const state = element(
        root,
        'span',
        'teacher-assignment-lifecycle__state',
      )
      state.textContent = stateText(row)
      article.appendChild(state)

      if (!row.revoked) {
        if (row.state === 'ACTIVE') {
          article.appendChild(
            actionButton(
              'Tamamlandı',
              () =>
                controller.markCompleted(
                  row.assignmentId,
                ),
            ),
          )
        } else if (
          row.state === 'COMPLETED'
        ) {
          article.appendChild(
            actionButton(
              'Repertuara Ekle',
              () =>
                controller.moveToRepertoire(
                  row.assignmentId,
                ),
            ),
          )
        }

        article.appendChild(
          actionButton(
            'Geri Çek',
            () =>
              controller.revoke(
                row.assignmentId,
              ),
          ),
        )
      }

      list.appendChild(article)
    }
  }

  function refresh() {
    const view = controller.getViewModel()

    if (
      !view ||
      !Array.isArray(view.assignments)
    ) {
      throw new TypeError(
        'controller getViewModel() must return assignments.',
      )
    }

    renderRows(view.assignments)
    return view
  }

  refresh()

  return Object.freeze({
    refresh,
    destroy() {
      section.remove()
    },
  })
}
