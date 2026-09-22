function element(root, tag, className = '') {
  const node = root.createElement(tag)
  if (className) node.className = className
  return node
}

function labeledField(root, {
  labelText,
  name,
  required = false,
  multiline = false,
}) {
  const wrap = element(
    root,
    'label',
    'teacher-pool-publishing__field',
  )
  const label = element(root, 'span')
  label.textContent = labelText

  const control = element(
    root,
    multiline ? 'textarea' : 'input',
  )
  control.name = name
  if (required) control.required = true

  wrap.appendChild(label)
  wrap.appendChild(control)
  return { wrap, control }
}

export function mountTeacherPoolPublishingUi({
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
    typeof controller.publish !== 'function' ||
    typeof controller.revoke !== 'function'
  ) {
    throw new TypeError(
      'controller must provide getViewModel(), publish() and revoke().',
    )
  }

  const section = element(
    root,
    'section',
    'teacher-pool-publishing',
  )
  section.setAttribute(
    'aria-labelledby',
    'teacher-pool-publishing-heading',
  )

  const heading = element(root, 'h2')
  heading.id = 'teacher-pool-publishing-heading'
  heading.textContent = 'Havuza Gönder'

  const form = element(
    root,
    'form',
    'teacher-pool-publishing__form',
  )
  const title = labeledField(root, {
    labelText: 'Başlık',
    name: 'title',
    required: true,
  })
  const shortDescription = labeledField(root, {
    labelText: 'Kısa açıklama',
    name: 'shortDescription',
    required: true,
  })
  const detail = labeledField(root, {
    labelText: 'Ayrıntı',
    name: 'detailText',
    multiline: true,
  })

  const audience = element(
    root,
    'fieldset',
    'teacher-pool-publishing__audience',
  )
  const legend = element(root, 'legend')
  legend.textContent = 'Hedef'
  audience.appendChild(legend)

  const all = element(root, 'input')
  all.type = 'radio'
  all.name = 'audienceMode'
  all.value = 'ALL'
  all.checked = true

  const allLabel = element(root, 'label')
  allLabel.appendChild(all)
  allLabel.appendChild(
    root.createTextNode('Tüm öğrenciler'),
  )

  const selected = element(root, 'input')
  selected.type = 'radio'
  selected.name = 'audienceMode'
  selected.value = 'SELECTED'

  const selectedLabel = element(root, 'label')
  selectedLabel.appendChild(selected)
  selectedLabel.appendChild(
    root.createTextNode('Seçili öğrenciler'),
  )

  audience.appendChild(allLabel)
  audience.appendChild(selectedLabel)

  const students = element(
    root,
    'div',
    'teacher-pool-publishing__students',
  )
  students.hidden = true

  const submit = element(root, 'button')
  submit.type = 'submit'
  submit.textContent = 'Havuza Gönder'

  const status = element(
    root,
    'div',
    'teacher-pool-publishing__status',
  )
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')

  const history = element(
    root,
    'div',
    'teacher-pool-publishing__history',
  )

  form.appendChild(title.wrap)
  form.appendChild(shortDescription.wrap)
  form.appendChild(detail.wrap)
  form.appendChild(audience)
  form.appendChild(students)
  form.appendChild(submit)

  section.appendChild(heading)
  section.appendChild(form)
  section.appendChild(status)
  section.appendChild(history)
  host.appendChild(section)

  function checkedStudentIds() {
    return [
      ...students.querySelectorAll(
        'input[type="checkbox"]:checked',
      ),
    ].map((input) => input.value)
  }

  function renderStudents(rows) {
    students.replaceChildren()
    for (const row of rows) {
      const label = element(root, 'label')
      const checkbox = element(root, 'input')
      checkbox.type = 'checkbox'
      checkbox.value = row.studentId
      checkbox.name = 'selectedStudentIds'
      checkbox.id =
        `teacher-pool-student-${row.studentId}`

      const name = element(root, 'span')
      name.textContent = row.displayNameOrNickname

      label.appendChild(checkbox)
      label.appendChild(name)
      students.appendChild(label)
    }
  }

  function renderHistory(records) {
    history.replaceChildren()

    for (const record of records) {
      const article = element(root, 'article')
      article.dataset.poolItemId =
        record.item.poolItemId

      const titleNode = element(root, 'h3')
      titleNode.textContent = record.item.title
      article.appendChild(titleNode)

      const state = element(root, 'span')
      state.textContent =
        record.revokedAt === null ? 'Aktif' : 'Geri çekildi'
      article.appendChild(state)

      if (record.revokedAt === null) {
        const revoke = element(root, 'button')
        revoke.type = 'button'
        revoke.textContent = 'Geri Çek'
        revoke.addEventListener('click', () => {
          const result = controller.revoke(
            record.item.poolItemId,
          )
          status.textContent = result.message
          if (result.ok) refresh()
        })
        article.appendChild(revoke)
      }

      history.appendChild(article)
    }
  }

  function refresh() {
    const view = controller.getViewModel()
    renderStudents(view.students)
    renderHistory(view.publications)
    students.hidden = !selected.checked
    return view
  }

  function syncAudience() {
    students.hidden = !selected.checked
  }

  all.addEventListener('change', syncAudience)
  selected.addEventListener('change', syncAudience)

  form.addEventListener('submit', (event) => {
    event.preventDefault()

    const result = controller.publish({
      title: title.control.value,
      shortDescription:
        shortDescription.control.value,
      detailText: detail.control.value,
      audienceMode:
        selected.checked ? 'SELECTED' : 'ALL',
      selectedStudentIds:
        selected.checked ? checkedStudentIds() : [],
    })

    status.textContent = result.message
    if (result.ok) refresh()
  })

  refresh()

  return Object.freeze({
    refresh,
    destroy() {
      section.remove()
    },
  })
}
