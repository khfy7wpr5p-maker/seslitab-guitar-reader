export const TEACHER_HOMEWORK_MODE = Object.freeze({
  SCORE: 'SCORE',
  CHORD_BOARD: 'CHORD_BOARD',
})

const DELIVERED_PHASE = 'DELIVERED_TO_STUDENT'
const DURABLY_PREPARED_PHASE = 'DURABLY_PREPARED'

function element(root, tag, className = '') {
  const node = root.createElement(tag)
  if (className) node.className = className
  return node
}

function requiredText(value, label) {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new TypeError(
      `${label} must be non-empty text.`,
    )
  }
  return value.trim()
}

function normalizeStudents(rows) {
  if (!Array.isArray(rows)) {
    throw new TypeError(
      'view.students must be an array.',
    )
  }

  const seen = new Set()
  return Object.freeze(
    rows.map((row) => {
      const studentId = requiredText(
        row?.studentId,
        'studentId',
      )
      if (seen.has(studentId)) {
        throw new Error(
          'teacher-homework-roster-duplicate-student-id',
        )
      }
      seen.add(studentId)

      const displayNameOrNickname =
        requiredText(
          row?.displayNameOrNickname,
          'displayNameOrNickname',
        )

      return Object.freeze({
        studentId,
        displayNameOrNickname,
      })
    }),
  )
}

function normalizeScore(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new TypeError(
      'view.score must be an object.',
    )
  }

  const available = value.available === true
  return Object.freeze({
    available,
    title:
      typeof value.title === 'string'
        ? value.title.trim()
        : '',
    detail:
      typeof value.detail === 'string'
        ? value.detail.trim()
        : '',
  })
}

function normalizeChordBoard(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new TypeError(
      'view.chordBoard must be an object.',
    )
  }

  if (!Array.isArray(value.symbols)) {
    throw new TypeError(
      'view.chordBoard.symbols must be an array.',
    )
  }
  if (!Array.isArray(value.voicings)) {
    throw new TypeError(
      'view.chordBoard.voicings must be an array.',
    )
  }

  const symbols = Object.freeze(
    value.symbols.map((symbol) =>
      requiredText(symbol, 'chord symbol'),
    ),
  )
  const selectedSymbol =
    symbols.length === 0
      ? ''
      : requiredText(
          value.selectedSymbol,
          'selectedSymbol',
        )

  if (
    selectedSymbol &&
    !symbols.includes(selectedSymbol)
  ) {
    throw new Error(
      'teacher-homework-chord-symbol-mismatch',
    )
  }

  const voicings = Object.freeze([
    ...value.voicings,
  ])

  for (const snapshot of voicings) {
    requiredText(
      snapshot?.voicingFingerprint,
      'voicingFingerprint',
    )
  }

  return Object.freeze({
    symbols,
    selectedSymbol,
    voicings,
  })
}

function normalizeView(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new TypeError(
      'controller view model must be an object.',
    )
  }

  const mode = value.mode
  if (
    mode !== TEACHER_HOMEWORK_MODE.SCORE &&
    mode !==
      TEACHER_HOMEWORK_MODE.CHORD_BOARD
  ) {
    throw new Error(
      'teacher-homework-mode-invalid',
    )
  }

  return Object.freeze({
    mode,
    students: normalizeStudents(
      value.students,
    ),
    score: normalizeScore(value.score),
    chordBoard: normalizeChordBoard(
      value.chordBoard,
    ),
  })
}

function safeTeacherMessage(result) {
  if (
    result?.ok === true &&
    result?.phase === DELIVERED_PHASE
  ) {
    return 'Gönderildi.'
  }

  if (
    result?.phase === DURABLY_PREPARED_PHASE
  ) {
    return 'Gönderilemedi. Tekrar deneyin.'
  }

  const candidate =
    typeof result?.message === 'string'
      ? result.message.trim()
      : ''

  if (
    candidate.length === 0 ||
    /hazırla|prepare|deliver|güvenli teslimat/i.test(
      candidate,
    )
  ) {
    return 'Gönderilemedi. Tekrar deneyin.'
  }

  return candidate
}

function fretText(fret) {
  if (fret === -1) return 'X'
  if (fret === 0) return '0'
  return String(fret)
}

export function mountTeacherHomeworkUi({
  root = globalThis.document,
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
    typeof controller.selectMode !==
      'function' ||
    typeof controller.selectChord !==
      'function' ||
    typeof controller.send !== 'function'
  ) {
    throw new TypeError(
      'controller must provide getViewModel(), selectMode(), selectChord() and send().',
    )
  }

  let view = normalizeView(
    controller.getViewModel(),
  )
  let selectedSnapshot = null
  let currentVoicings = Object.freeze([])
  let sending = false

  const section = element(
    root,
    'section',
    'teacher-homework card',
  )
  const header = element(
    root,
    'div',
    'teacher-homework__header',
  )
  const heading = element(root, 'h2')
  heading.textContent = 'Ödev Gönder'
  const description = element(
    root,
    'p',
    'teacher-homework__description',
  )
  description.textContent =
    'Nota veya akor ödevini seçili öğrencilere gönderin.'
  header.appendChild(heading)
  header.appendChild(description)

  const form = element(
    root,
    'form',
    'teacher-homework__form',
  )

  const modeFieldset = element(
    root,
    'fieldset',
    'teacher-homework__mode',
  )
  const modeLegend = element(root, 'legend')
  modeLegend.textContent = 'İçerik'
  const modeOptions = element(
    root,
    'div',
    'teacher-homework__mode-options',
  )
  modeFieldset.appendChild(modeLegend)
  modeFieldset.appendChild(modeOptions)

  const contentHost = element(
    root,
    'div',
    'teacher-homework__content',
  )

  const rosterFieldset = element(
    root,
    'fieldset',
    'teacher-homework__roster',
  )
  const rosterLegend = element(root, 'legend')
  rosterLegend.textContent = 'Öğrenciler'
  const studentList = element(
    root,
    'div',
    'teacher-homework__students',
  )
  rosterFieldset.appendChild(rosterLegend)
  rosterFieldset.appendChild(studentList)

  const commonLabel = element(
    root,
    'label',
    'teacher-homework__common-note',
  )
  const commonLabelText =
    element(root, 'span')
  commonLabelText.textContent =
    'Öğretmen notu'
  const commonNote = element(
    root,
    'textarea',
  )
  commonNote.name = 'commonTeacherNote'
  commonNote.id =
    'teacher-homework-common-note'
  commonLabel.appendChild(commonLabelText)
  commonLabel.appendChild(commonNote)

  const actions = element(
    root,
    'div',
    'teacher-homework__actions',
  )
  const submit = element(
    root,
    'button',
    'btn btn-primary teacher-homework__submit',
  )
  submit.type = 'submit'
  submit.textContent = 'Öğrenciye Gönder'
  actions.appendChild(submit)

  const status = element(
    root,
    'div',
    'teacher-homework__status',
  )
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.setAttribute('aria-atomic', 'true')

  form.appendChild(modeFieldset)
  form.appendChild(contentHost)
  form.appendChild(rosterFieldset)
  form.appendChild(commonLabel)
  form.appendChild(actions)
  form.appendChild(status)
  section.appendChild(header)
  section.appendChild(form)
  host.appendChild(section)

  const modeInputs = new Map()

  function syncModeInputs(mode) {
    for (const [
      value,
      input,
    ] of modeInputs.entries()) {
      input.checked = value === mode
    }
  }

  function renderModeOptions() {
    modeOptions.replaceChildren()
    modeInputs.clear()

    for (const [value, labelText] of [
      [TEACHER_HOMEWORK_MODE.SCORE, 'Nota'],
      [
        TEACHER_HOMEWORK_MODE.CHORD_BOARD,
        'Akor',
      ],
    ]) {
      const label = element(
        root,
        'label',
        'teacher-homework__mode-option',
      )
      const input = element(root, 'input')
      input.type = 'radio'
      input.name = 'homeworkMode'
      input.value = value
      input.checked = value === view.mode

      const text = element(root, 'span')
      text.textContent = labelText

      input.addEventListener(
        'change',
        () => {
          if (!input.checked) return
          view = normalizeView(
            controller.selectMode(value),
          )
          syncModeInputs(view.mode)
          renderContent()
        },
      )

      label.appendChild(input)
      label.appendChild(text)
      modeOptions.appendChild(label)
      modeInputs.set(value, input)
    }
  }

  function renderPreview(snapshot, preview) {
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
      'teacher-homework__chord-title',
    )
    title.textContent =
      snapshot.chord?.displaySymbol ?? ''
    preview.appendChild(title)

    const strings = element(
      root,
      'div',
      'teacher-homework__chord-strings',
    )

    for (
      let index = 0;
      index < 6;
      index += 1
    ) {
      const cell = element(
        root,
        'div',
        'teacher-homework__chord-string',
      )
      const stringNumber = 6 - index
      const fret =
        snapshot.voicing?.frets?.[index]
      const finger =
        snapshot.voicing?.fingers?.[index]

      cell.dataset.chordString =
        String(stringNumber)
      cell.dataset.fret = String(fret)
      cell.dataset.finger =
        String(finger)
      cell.textContent =
        `${stringNumber}. tel: ${fretText(fret)}`
      strings.appendChild(cell)
    }

    preview.appendChild(strings)
  }

  function renderScore() {
    selectedSnapshot = null
    currentVoicings = Object.freeze([])

    const card = element(
      root,
      'div',
      'teacher-homework__score',
    )

    if (!view.score.available) {
      const unavailable = element(root, 'p')
      unavailable.textContent =
        'Gönderilecek nota hazır değil.'
      card.appendChild(unavailable)
      contentHost.appendChild(card)
      return
    }

    const title = element(
      root,
      'strong',
      'teacher-homework__score-title',
    )
    title.textContent =
      view.score.title ||
      'Smoosic son öğretmen revizyonu'
    card.appendChild(title)

    if (view.score.detail) {
      const detail = element(
        root,
        'p',
        'teacher-homework__score-detail',
      )
      detail.textContent = view.score.detail
      card.appendChild(detail)
    }

    contentHost.appendChild(card)
  }

  function renderChordBoard() {
    const block = element(
      root,
      'div',
      'teacher-homework__chord-board',
    )
    const chordLabel = element(
      root,
      'label',
      'teacher-homework__chord-select',
    )
    const chordLabelText =
      element(root, 'span')
    chordLabelText.textContent = 'Akor'
    const chordSelect = element(
      root,
      'select',
    )
    chordSelect.name = 'chordSymbol'

    for (const symbol of view.chordBoard.symbols) {
      const option = element(root, 'option')
      option.value = symbol
      option.textContent = symbol
      chordSelect.appendChild(option)
    }
    chordSelect.value =
      view.chordBoard.selectedSymbol
    chordLabel.appendChild(chordLabelText)
    chordLabel.appendChild(chordSelect)
    block.appendChild(chordLabel)

    const positions = element(
      root,
      'fieldset',
      'teacher-homework__positions',
    )
    const legend = element(root, 'legend')
    legend.textContent = 'Pozisyon'
    positions.appendChild(legend)

    const preview = element(
      root,
      'div',
      'teacher-homework__chord-preview',
    )
    preview.setAttribute(
      'aria-label',
      'Seçili akor şeması',
    )

    currentVoicings =
      view.chordBoard.voicings

    for (
      let index = 0;
      index < currentVoicings.length;
      index += 1
    ) {
      const snapshot =
        currentVoicings[index]
      const label = element(
        root,
        'label',
        'teacher-homework__position',
      )
      const radio = element(root, 'input')
      radio.type = 'radio'
      radio.name = 'voicingFingerprint'
      radio.value =
        snapshot.voicingFingerprint
      radio.checked = index === 0

      const text = element(root, 'span')
      text.textContent =
        `Pozisyon ${index + 1}`

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
          renderPreview(exact, preview)
        },
      )

      label.appendChild(radio)
      label.appendChild(text)
      positions.appendChild(label)
    }

    chordSelect.addEventListener(
      'change',
      () => {
        view = normalizeView(
          controller.selectChord(
            chordSelect.value,
          ),
        )
        renderContent()
      },
    )

    block.appendChild(positions)
    block.appendChild(preview)
    contentHost.appendChild(block)

    renderPreview(
      currentVoicings[0] ?? null,
      preview,
    )
  }

  function renderContent() {
    contentHost.replaceChildren()

    if (
      view.mode ===
      TEACHER_HOMEWORK_MODE.SCORE
    ) {
      renderScore()
      return
    }

    renderChordBoard()
  }

  function renderStudents(rows, preserved) {
    studentList.replaceChildren()

    if (rows.length === 0) {
      const empty = element(root, 'p')
      empty.textContent =
        'Gönderim için öğrenci bulunamadı.'
      studentList.appendChild(empty)
      return
    }

    for (const row of rows) {
      const wrapper = element(
        root,
        'div',
        'teacher-homework__student',
      )
      wrapper.dataset.studentId =
        row.studentId

      const selectionLabel = element(
        root,
        'label',
        'teacher-homework__student-select',
      )
      const selected = element(
        root,
        'input',
      )
      selected.type = 'checkbox'
      selected.name = 'selectedStudentIds'
      selected.value = row.studentId
      selected.id =
        `teacher-homework-student-${row.studentId}`

      const name = element(root, 'span')
      name.textContent =
        row.displayNameOrNickname
      selectionLabel.appendChild(selected)
      selectionLabel.appendChild(name)

      const overrideArea = element(
        root,
        'div',
        'teacher-homework__override',
      )
      const overrideToggleLabel =
        element(root, 'label')
      const overrideEnabled =
        element(root, 'input')
      overrideEnabled.type = 'checkbox'
      overrideEnabled.name =
        'teacherNoteOverrideEnabled'
      overrideEnabled.dataset.studentId =
        row.studentId
      const overrideToggleText =
        element(root, 'span')
      overrideToggleText.textContent =
        'Öğrenciye özel not'
      overrideToggleLabel.appendChild(
        overrideEnabled,
      )
      overrideToggleLabel.appendChild(
        overrideToggleText,
      )

      const overrideLabel =
        element(root, 'label')
      const overrideLabelText =
        element(root, 'span')
      overrideLabelText.textContent =
        'Özel not'
      const override = element(
        root,
        'textarea',
      )
      override.name =
        'teacherNoteOverride'
      override.dataset.studentId =
        row.studentId
      overrideLabel.appendChild(
        overrideLabelText,
      )
      overrideLabel.appendChild(override)
      overrideArea.appendChild(
        overrideToggleLabel,
      )
      overrideArea.appendChild(
        overrideLabel,
      )

      function sync() {
        overrideArea.hidden =
          !selected.checked
        overrideLabel.hidden = !(
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

      const prior =
        preserved?.get(row.studentId)
      if (prior) {
        selected.checked = prior.selected
        overrideEnabled.checked =
          prior.overrideEnabled
        override.value = prior.overrideText
      }

      sync()
      wrapper.appendChild(selectionLabel)
      wrapper.appendChild(overrideArea)
      studentList.appendChild(wrapper)
    }
  }

  function studentRows() {
    return Array.from(
      studentList.children,
    ).filter(
      (node) =>
        typeof node?.dataset?.studentId ===
        'string',
    )
  }

  function captureStudentState() {
    const result = new Map()
    for (const row of studentRows()) {
      const selected = row.querySelector(
        'input[name="selectedStudentIds"]',
      )
      const overrideEnabled =
        row.querySelector(
          'input[name="teacherNoteOverrideEnabled"]',
        )
      const override = row.querySelector(
        'textarea[name="teacherNoteOverride"]',
      )
      result.set(
        row.dataset.studentId,
        Object.freeze({
          selected:
            selected?.checked === true,
          overrideEnabled:
            overrideEnabled?.checked ===
            true,
          overrideText:
            override?.value ?? '',
        }),
      )
    }
    return result
  }

  function selectedStudentIds() {
    return studentRows()
      .map((row) =>
        row.querySelector(
          'input[name="selectedStudentIds"]',
        ),
      )
      .filter(
        (node) => node?.checked === true,
      )
      .map((node) => node.value)
  }

  function selectedOverrides(studentIds) {
    const selected = new Set(studentIds)
    const overrides = []

    for (const row of studentRows()) {
      const studentId =
        row.dataset.studentId
      if (!selected.has(studentId)) {
        continue
      }

      const enabled = row.querySelector(
        'input[name="teacherNoteOverrideEnabled"]',
      )
      if (enabled?.checked !== true) {
        continue
      }

      const textarea = row.querySelector(
        'textarea[name="teacherNoteOverride"]',
      )
      overrides.push(
        Object.freeze({
          studentId,
          teacherNote:
            textarea?.value ?? '',
        }),
      )
    }

    return Object.freeze(overrides)
  }

  function refresh() {
    const preserved =
      captureStudentState()
    view = normalizeView(
      controller.getViewModel(),
    )
    syncModeInputs(view.mode)
    renderStudents(
      view.students,
      preserved,
    )
    renderContent()
    return view
  }

  form.addEventListener(
    'submit',
    async (event) => {
      event.preventDefault()
      if (sending) return

      const studentIds =
        selectedStudentIds()

      if (studentIds.length === 0) {
        status.textContent =
          'En az bir öğrenci seçin.'
        return
      }

      if (
        view.mode ===
          TEACHER_HOMEWORK_MODE.SCORE &&
        !view.score.available
      ) {
        status.textContent =
          'Gönderilecek nota hazır değil.'
        return
      }

      if (
        view.mode ===
          TEACHER_HOMEWORK_MODE
            .CHORD_BOARD &&
        !selectedSnapshot
      ) {
        status.textContent =
          'Bir akor pozisyonu seçin.'
        return
      }

      const content =
        view.mode ===
        TEACHER_HOMEWORK_MODE.SCORE
          ? Object.freeze({
              type:
                TEACHER_HOMEWORK_MODE.SCORE,
            })
          : Object.freeze({
              type:
                TEACHER_HOMEWORK_MODE
                  .CHORD_BOARD,
              snapshot: selectedSnapshot,
            })

      const input = Object.freeze({
        mode: view.mode,
        studentIds: Object.freeze([
          ...studentIds,
        ]),
        commonTeacherNote:
          commonNote.value,
        teacherNoteOverrides:
          selectedOverrides(studentIds),
        content,
      })

      sending = true
      submit.disabled = true
      status.textContent = 'Gönderiliyor…'

      try {
        const result =
          await controller.send(input)
        status.textContent =
          safeTeacherMessage(result)
      } catch {
        status.textContent =
          'Gönderilemedi. Tekrar deneyin.'
      } finally {
        sending = false
        submit.disabled = false
      }
    },
  )

  renderModeOptions()
  renderStudents(view.students)
  renderContent()

  return Object.freeze({
    refresh,
    destroy() {
      section.remove()
    },
  })
}
