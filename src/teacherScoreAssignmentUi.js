function element(root, tag, className = '') {
  const node = root.createElement(tag)
  if (className) node.className = className
  return node
}

export function mountTeacherScoreAssignmentUi({
  root = document,
  host,
  controller,
  workspace,
  sourceNotes,
} = {}) {
  if (!host?.appendChild) {
    throw new TypeError(
      'host must be a DOM container.',
    )
  }
  if (
    !controller ||
    typeof controller.getViewModel !== 'function' ||
    typeof controller.prepare !== 'function'
  ) {
    throw new TypeError(
      'controller must provide getViewModel() and prepare().',
    )
  }
  if (!Array.isArray(sourceNotes)) {
    throw new TypeError(
      'sourceNotes must be an array.',
    )
  }

  const section = element(
    root,
    'section',
    'teacher-score-assignment',
  )

  const heading = element(root, 'h2')
  heading.textContent = 'Ödevi Hazırla'

  const form = element(
    root,
    'form',
    'teacher-score-assignment__form',
  )

  const studentList = element(
    root,
    'div',
    'teacher-score-assignment__students',
  )

  const commonLabel = element(
    root,
    'label',
    'teacher-score-assignment__common-note',
  )
  const commonLabelText = element(root, 'span')
  commonLabelText.textContent = 'Ortak not'
  const commonNote = element(root, 'textarea')
  commonNote.name = 'commonTeacherNote'
  commonLabel.appendChild(commonLabelText)
  commonLabel.appendChild(commonNote)

  const submit = element(root, 'button')
  submit.type = 'submit'
  submit.textContent = 'Ödevi Hazırla'

  const status = element(
    root,
    'div',
    'teacher-score-assignment__status',
  )
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')

  form.appendChild(studentList)
  form.appendChild(commonLabel)
  form.appendChild(submit)
  section.appendChild(heading)
  section.appendChild(form)
  section.appendChild(status)
  host.appendChild(section)

  function renderStudents(rows) {
    studentList.replaceChildren()

    for (const row of rows) {
      const wrapper = element(
        root,
        'div',
        'teacher-score-assignment__student',
      )
      wrapper.dataset.studentId =
        row.studentId

      const selected = element(root, 'input')
      selected.type = 'checkbox'
      selected.name = 'selectedStudentIds'
      selected.value = row.studentId
      selected.id =
        `teacher-score-assignment-${row.studentId}`

      const name = element(root, 'span')
      name.textContent =
        row.displayNameOrNickname

      const overrideEnabled =
        element(root, 'input')
      overrideEnabled.type = 'checkbox'
      overrideEnabled.name =
        'teacherNoteOverrideEnabled'
      overrideEnabled.dataset.studentId =
        row.studentId
      overrideEnabled.hidden = true

      const overrideLabel =
        element(root, 'span')
      overrideLabel.textContent =
        'Öğrenciye özel not'
      overrideLabel.hidden = true

      const override =
        element(root, 'textarea')
      override.name = 'teacherNoteOverride'
      override.dataset.studentId =
        row.studentId
      override.hidden = true

      function sync() {
        overrideEnabled.hidden =
          !selected.checked
        overrideLabel.hidden =
          !selected.checked
        override.hidden = !(
          selected.checked &&
          overrideEnabled.checked
        )
      }

      selected.addEventListener(
        'change',
        sync,
      )
      overrideEnabled.addEventListener(
        'change',
        sync,
      )

      wrapper.appendChild(selected)
      wrapper.appendChild(name)
      wrapper.appendChild(
        overrideEnabled,
      )
      wrapper.appendChild(overrideLabel)
      wrapper.appendChild(override)
      studentList.appendChild(wrapper)
    }
  }

  function checkedInputs(name) {
    return studentList
      .querySelectorAll(
        'input[type="checkbox"]:checked',
      )
      .filter(
        (node) => node.name === name,
      )
  }

  function selectedStudentIds() {
    return checkedInputs(
      'selectedStudentIds',
    ).map((node) => node.value)
  }

  function selectedOverrides(
    studentIds,
  ) {
    const selected =
      new Set(studentIds)
    const enabled = checkedInputs(
      'teacherNoteOverrideEnabled',
    ).filter(
      (node) =>
        selected.has(
          node.dataset.studentId,
        ),
    )
    const textareas =
      studentList.querySelectorAll(
        'textarea[name="teacherNoteOverride"]',
      )

    return enabled.map((node) => {
      const textarea = textareas.find(
        (candidate) =>
          candidate.dataset.studentId ===
          node.dataset.studentId,
      )

      return {
        studentId:
          node.dataset.studentId,
        teacherNote:
          textarea?.value ?? '',
      }
    })
  }

  function refresh() {
    const view =
      controller.getViewModel()
    renderStudents(view.students)
    return view
  }

  form.addEventListener(
    'submit',
    (event) => {
      event.preventDefault()

      const studentIds =
        selectedStudentIds()
      const result = controller.prepare({
        workspace,
        sourceNotes,
        studentIds,
        commonTeacherNote:
          commonNote.value,
        teacherNoteOverrides:
          selectedOverrides(
            studentIds,
          ),
      })

      status.textContent =
        result.message
    },
  )

  refresh()

  return Object.freeze({
    refresh,
    destroy() {
      section.remove()
    },
  })
}
