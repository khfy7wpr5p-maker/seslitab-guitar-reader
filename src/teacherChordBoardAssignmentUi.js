function element(root, tag, className = '') {
  const node = root.createElement(tag)
  if (className) node.className = className
  return node
}

function fretText(fret) {
  if (fret === -1) return 'X'
  if (fret === 0) return '0'
  return String(fret)
}

export function mountTeacherChordBoardAssignmentUi({
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
    typeof controller.getViewModel !==
      'function' ||
    typeof controller.selectChord !==
      'function' ||
    typeof controller.assignAndDeliver !==
      'function'
  ) {
    throw new TypeError(
      'controller must provide getViewModel(), selectChord() and assignAndDeliver().',
    )
  }

  const section = element(
    root,
    'section',
    'teacher-chord-board-assignment',
  )

  const heading = element(root, 'h2')
  heading.textContent = 'Akor Ata'

  const form = element(
    root,
    'form',
    'teacher-chord-board-assignment__form',
  )

  const chordLabel = element(
    root,
    'label',
    'teacher-chord-board-assignment__chord',
  )
  const chordLabelText =
    element(root, 'span')
  chordLabelText.textContent = 'Akor'
  const chordSelect =
    element(root, 'select')
  chordSelect.name = 'chordSymbol'
  chordLabel.appendChild(
    chordLabelText,
  )
  chordLabel.appendChild(chordSelect)

  const positions = element(
    root,
    'fieldset',
    'teacher-chord-board-assignment__positions',
  )
  const positionsLegend =
    element(root, 'legend')
  positionsLegend.textContent =
    'Pozisyon'
  positions.appendChild(
    positionsLegend,
  )

  const preview = element(
    root,
    'div',
    'teacher-chord-board-assignment__preview',
  )
  preview.setAttribute(
    'aria-label',
    'Seçili akor şeması',
  )

  const students = element(
    root,
    'div',
    'teacher-chord-board-assignment__students',
  )

  const commonLabel = element(
    root,
    'label',
    'teacher-chord-board-assignment__common-note',
  )
  const commonText =
    element(root, 'span')
  commonText.textContent = 'Ortak not'
  const commonNote =
    element(root, 'textarea')
  commonNote.name = 'commonTeacherNote'
  commonLabel.appendChild(commonText)
  commonLabel.appendChild(commonNote)

  const submit = element(root, 'button')
  submit.type = 'submit'
  submit.textContent = 'Öğrenciye Ata'

  const status = element(
    root,
    'div',
    'teacher-chord-board-assignment__status',
  )
  status.setAttribute('role', 'status')
  status.setAttribute(
    'aria-live',
    'polite',
  )

  form.appendChild(chordLabel)
  form.appendChild(positions)
  form.appendChild(preview)
  form.appendChild(students)
  form.appendChild(commonLabel)
  form.appendChild(submit)
  section.appendChild(heading)
  section.appendChild(form)
  section.appendChild(status)
  host.appendChild(section)

  let selectedSnapshot = null
  let currentVoicings =
    Object.freeze([])

  function renderSymbols(view) {
    chordSelect.replaceChildren()
    for (const symbol of view.symbols) {
      const option =
        element(root, 'option')
      option.value = symbol
      option.textContent = symbol
      chordSelect.appendChild(option)
    }
    chordSelect.value =
      view.selectedSymbol
  }

  function renderPreview(snapshot) {
    preview.replaceChildren()
    selectedSnapshot = snapshot ?? null

    if (!snapshot) {
      const empty = element(root, 'p')
      empty.textContent =
        'Akor pozisyonu bulunamadı.'
      preview.appendChild(empty)
      return
    }

    const title = element(
      root,
      'strong',
      'teacher-chord-board-assignment__preview-title',
    )
    title.textContent =
      snapshot.chord.displaySymbol
    preview.appendChild(title)

    const strings = element(
      root,
      'div',
      'teacher-chord-board-assignment__strings',
    )

    for (
      let index = 0;
      index < 6;
      index += 1
    ) {
      const cell = element(
        root,
        'div',
        'teacher-chord-board-assignment__string',
      )
      const stringNumber = 6 - index
      const fret =
        snapshot.voicing.frets[index]
      const finger =
        snapshot.voicing.fingers[index]

      cell.dataset.chordString =
        String(stringNumber)
      cell.dataset.fret =
        String(fret)
      cell.dataset.finger =
        String(finger)
      cell.textContent =
        `${stringNumber}. tel: ${fretText(fret)}`
      strings.appendChild(cell)
    }

    preview.appendChild(strings)

    if (
      snapshot.voicing.barres.length > 0
    ) {
      const barreText =
        element(
          root,
          'div',
          'teacher-chord-board-assignment__barres',
        )
      barreText.textContent =
        snapshot.voicing.barres
          .map(
            (barre) =>
              `Bare ${barre.fret}. perde, ${barre.fromString}-${barre.toString}. teller`,
          )
          .join(' · ')
      preview.appendChild(barreText)
    }
  }

  function renderVoicings(
    voicings,
  ) {
    currentVoicings =
      Object.freeze([...voicings])
    positions.replaceChildren(
      positionsLegend,
    )

    for (
      let offset = 0;
      offset < currentVoicings.length;
      offset += 1
    ) {
      const snapshot =
        currentVoicings[offset]
      const label = element(
        root,
        'label',
        'teacher-chord-board-assignment__position',
      )
      const radio =
        element(root, 'input')
      radio.type = 'radio'
      radio.name =
        'voicingFingerprint'
      radio.value =
        snapshot.voicingFingerprint
      radio.checked = offset === 0

      const text = element(root, 'span')
      text.textContent =
        `Pozisyon ${offset + 1}`

      radio.addEventListener(
        'change',
        () => {
          if (!radio.checked) return
          const exact =
            currentVoicings.find(
              (candidate) =>
                candidate
                  .voicingFingerprint ===
                radio.value,
            ) ?? null
          renderPreview(exact)
        },
      )

      label.appendChild(radio)
      label.appendChild(text)
      positions.appendChild(label)
    }

    renderPreview(
      currentVoicings[0] ?? null,
    )
  }

  function renderStudents(rows) {
    students.replaceChildren()

    for (const row of rows) {
      const wrapper = element(
        root,
        'div',
        'teacher-chord-board-assignment__student',
      )
      wrapper.dataset.studentId =
        row.studentId

      const selected =
        element(root, 'input')
      selected.type = 'checkbox'
      selected.name =
        'selectedStudentIds'
      selected.value = row.studentId
      selected.id =
        `teacher-chord-board-assignment-${row.studentId}`

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
      override.name =
        'teacherNoteOverride'
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
      wrapper.appendChild(
        overrideLabel,
      )
      wrapper.appendChild(override)
      students.appendChild(wrapper)
    }
  }

  function checkedInputs(name) {
    return students
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
    const enabled =
      checkedInputs(
        'teacherNoteOverrideEnabled',
      ).filter(
        (node) =>
          selected.has(
            node.dataset.studentId,
          ),
      )
    const textareas =
      students.querySelectorAll(
        'textarea[name="teacherNoteOverride"]',
      )

    return enabled.map((node) => {
      const textarea =
        textareas.find(
          (candidate) =>
            candidate.dataset
              .studentId ===
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

  function renderView(
    view,
    {
      renderStudentList = false,
      renderSymbolList = false,
    } = {},
  ) {
    if (renderSymbolList) {
      renderSymbols(view)
    } else {
      chordSelect.value =
        view.selectedSymbol
    }
    if (renderStudentList) {
      renderStudents(view.students)
    }
    renderVoicings(view.voicings)
    return view
  }

  function refresh() {
    return renderView(
      controller.getViewModel(),
      {
        renderStudentList: true,
        renderSymbolList: true,
      },
    )
  }

  chordSelect.addEventListener(
    'change',
    () => {
      const view =
        controller.selectChord(
          chordSelect.value,
        )
      renderView(view)
    },
  )

  form.addEventListener(
    'submit',
    async (event) => {
      event.preventDefault()

      if (!selectedSnapshot) {
        status.textContent =
          'Bir akor pozisyonu seçin.'
        return
      }

      const studentIds =
        selectedStudentIds()

      try {
        const result =
          await controller
            .assignAndDeliver({
              snapshot:
                selectedSnapshot,
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
      } catch {
        status.textContent =
          'Akor ödevi işlemi tamamlanamadı.'
      }
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
