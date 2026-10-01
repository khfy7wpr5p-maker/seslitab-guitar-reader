import {
  getChordBoardVoicings,
  listChordBoardSymbols,
} from './services/chordBoardCatalog.js'
import {
  validateMusicXmlFile,
} from './services/musicXmlFile.js'
import {
  TEACHER_ASSIGNMENT_DELIVERY_PHASE,
} from './services/teacherAssignmentDeliveryOrchestrator.js'

const CHORD_BOARD_URL =
  'https://khfy7wpr5p-maker.github.io/st-guitar-chord-board/'

function element(root, tag, className = '') {
  const node = root.createElement(tag)
  if (className) node.className = className
  return node
}

function text(root, value) {
  return root.createTextNode(String(value))
}

function createDefaultDraftId() {
  const value =
    globalThis.crypto?.randomUUID?.()
  if (
    typeof value !== 'string' ||
    value.trim() === ''
  ) {
    throw new Error(
      'assignment-composer-draft-id-unavailable',
    )
  }
  return value
}

function safeResultMessage(result) {
  const recipients =
    Array.isArray(result?.recipients)
      ? result.recipients
      : []
  if (
    result?.ok === true &&
    recipients.length > 0 &&
    recipients.every(
      (row) =>
        row?.ok === true &&
        row?.phase ===
          TEACHER_ASSIGNMENT_DELIVERY_PHASE
            .DELIVERED_TO_STUDENT &&
        row?.pieceLinked === true,
    )
  ) {
    return 'Gönderildi.'
  }
  if (
    recipients.some(
      (row) => row?.ok === true,
    )
  ) {
    return 'Bazı öğrencilere gönderildi. Gönderilemeyen öğrenciler için tekrar deneyin.'
  }
  return 'Gönderilemedi. Tekrar deneyin.'
}

export function mountTeacherAssignmentComposerUi({
  root = globalThis.document,
  host,
  service,
  createDraftId = createDefaultDraftId,
} = {}) {
  if (!host?.appendChild) {
    throw new TypeError(
      'host must be a DOM container.',
    )
  }
  if (
    !service ||
    typeof service.loadRoster !== 'function' ||
    typeof service.prepareScoreUpload !==
      'function' ||
    typeof service.send !== 'function'
  ) {
    throw new TypeError(
      'service must provide loadRoster(), prepareScoreUpload() and send().',
    )
  }
  if (typeof createDraftId !== 'function') {
    throw new TypeError(
      'createDraftId must be a function.',
    )
  }

  const draftId =
    String(createDraftId()).trim()
  if (!draftId) {
    throw new Error(
      'assignment-composer-draft-id-invalid',
    )
  }

  let scoreUpload = null
  let selectedSnapshots = []
  let destroyed = false
  let sending = false

  const form = element(
    root,
    'form',
    'teacher-assignment-composer',
  )
  form.noValidate = true

  const heading = element(root, 'h3')
  heading.textContent = 'Ödev Gönder'

  const intro = element(
    root,
    'p',
    'teacher-assignment-composer__intro',
  )
  intro.textContent =
    'MusicXML, akor çalışması veya ikisini aynı öğrenci çalışmasında gönderin.'

  const chordLink = element(
    root,
    'a',
    'teacher-assignment-composer__chord-link',
  )
  chordLink.href = CHORD_BOARD_URL
  chordLink.target = '_blank'
  chordLink.rel = 'noopener noreferrer'
  chordLink.textContent =
    'ST Guitar Chord Board’u aç'

  const titleLabel = element(root, 'label')
  titleLabel.textContent = 'Çalışma adı'
  const titleInput = element(root, 'input')
  titleInput.type = 'text'
  titleInput.name = 'assignmentTitle'
  titleInput.required = true
  titleLabel.appendChild(titleInput)

  const scoreFieldset = element(root, 'fieldset')
  const scoreLegend = element(root, 'legend')
  scoreLegend.textContent = 'SCORE — MusicXML'
  const fileInput = element(root, 'input')
  fileInput.type = 'file'
  fileInput.name = 'scoreMusicXml'
  fileInput.accept = '.xml,.musicxml'
  const scoreStatus = element(
    root,
    'div',
    'teacher-assignment-composer__score-status',
  )
  scoreStatus.setAttribute('role', 'status')
  scoreStatus.setAttribute(
    'aria-live',
    'polite',
  )
  scoreStatus.textContent =
    'MusicXML isteğe bağlıdır.'
  scoreFieldset.appendChild(scoreLegend)
  scoreFieldset.appendChild(fileInput)
  scoreFieldset.appendChild(scoreStatus)

  const chordFieldset = element(root, 'fieldset')
  const chordLegend = element(root, 'legend')
  chordLegend.textContent =
    'CHORD_BOARD — Akorlar'
  const symbolSelect = element(root, 'select')
  symbolSelect.name = 'chordSymbol'
  const voicingSelect = element(root, 'select')
  voicingSelect.name = 'chordVoicing'
  const addChord = element(
    root,
    'button',
    'btn btn-secondary btn-sm',
  )
  addChord.type = 'button'
  addChord.textContent = 'Akoru Ekle'
  const selectedList = element(
    root,
    'ul',
    'teacher-assignment-composer__selected-chords',
  )
  chordFieldset.appendChild(chordLegend)
  chordFieldset.appendChild(symbolSelect)
  chordFieldset.appendChild(voicingSelect)
  chordFieldset.appendChild(addChord)
  chordFieldset.appendChild(selectedList)

  const rosterFieldset = element(root, 'fieldset')
  const rosterLegend = element(root, 'legend')
  rosterLegend.textContent = 'Öğrenciler'
  const roster = element(
    root,
    'div',
    'teacher-assignment-composer__roster',
  )
  roster.textContent =
    'Öğrenci listesi yükleniyor.'
  rosterFieldset.appendChild(rosterLegend)
  rosterFieldset.appendChild(roster)

  const noteLabel = element(root, 'label')
  noteLabel.textContent = 'Öğretmen notu'
  const noteInput = element(root, 'textarea')
  noteInput.name = 'teacherNote'
  noteLabel.appendChild(noteInput)

  const submit = element(
    root,
    'button',
    'btn btn-primary',
  )
  submit.type = 'submit'
  submit.textContent = 'Öğrenciye Gönder'

  const status = element(
    root,
    'div',
    'teacher-assignment-composer__status',
  )
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')

  for (const node of [
    heading,
    intro,
    chordLink,
    titleLabel,
    scoreFieldset,
    chordFieldset,
    rosterFieldset,
    noteLabel,
    submit,
    status,
  ]) {
    form.appendChild(node)
  }

  function renderVoicings() {
    voicingSelect.replaceChildren()
    const snapshots =
      getChordBoardVoicings(
        symbolSelect.value,
      )
    snapshots.forEach(
      (snapshot, index) => {
        const option =
          element(root, 'option')
        option.value =
          snapshot.voicingFingerprint
        option.textContent =
          `${index + 1}. pozisyon — ${snapshot.voicing.frets.join(' ')}`
        voicingSelect.appendChild(option)
      },
    )
    if (snapshots.length > 0) {
      voicingSelect.value =
        snapshots[0].voicingFingerprint
    }
  }

  function renderChordSelection() {
    selectedList.replaceChildren()
    for (const snapshot of selectedSnapshots) {
      const item = element(root, 'li')
      item.appendChild(
        text(
          root,
          `${snapshot.chord.displaySymbol} — ${snapshot.voicing.frets.join(' ')}`,
        ),
      )
      selectedList.appendChild(item)
    }
  }

  const symbols =
    listChordBoardSymbols()
  for (const symbol of symbols) {
    const option =
      element(root, 'option')
    option.value = symbol
    option.textContent = symbol
    symbolSelect.appendChild(option)
  }
  if (symbols.length > 0) {
    symbolSelect.value = symbols[0]
  }
  renderVoicings()

  symbolSelect.addEventListener(
    'change',
    renderVoicings,
  )

  addChord.addEventListener('click', () => {
    const snapshot =
      getChordBoardVoicings(
        symbolSelect.value,
      ).find(
        (row) =>
          row.voicingFingerprint ===
          voicingSelect.value,
      )
    if (!snapshot) return
    if (
      selectedSnapshots.some(
        (row) =>
          row.voicingFingerprint ===
          snapshot.voicingFingerprint,
      )
    ) {
      status.textContent =
        'Bu akor pozisyonu zaten seçildi.'
      return
    }
    selectedSnapshots = [
      ...selectedSnapshots,
      snapshot,
    ]
    renderChordSelection()
    status.textContent =
      'Akor pozisyonu eklendi.'
  })

  fileInput.addEventListener(
    'change',
    async () => {
      scoreUpload = null
      const file = fileInput.files?.[0]
      const validation =
        validateMusicXmlFile(file)
      if (validation) {
        scoreStatus.textContent =
          validation
        return
      }
      scoreStatus.textContent =
        'MusicXML doğrulanıyor.'
      try {
        const musicXml =
          await file.text()
        scoreUpload =
          await service.prepareScoreUpload({
            musicXml,
            draftId,
          })
        scoreStatus.textContent =
          'MusicXML doğrulandı.'
      } catch {
        scoreUpload = null
        scoreStatus.textContent =
          'MusicXML doğrulanamadı.'
      }
    },
  )

  async function loadRoster() {
    try {
      const rows =
        await service.loadRoster()
      if (destroyed) return
      roster.replaceChildren()
      if (rows.length === 0) {
        roster.textContent =
          'Aktif öğrenci bulunamadı.'
        return
      }
      for (const row of rows) {
        const label = element(root, 'label')
        const input = element(root, 'input')
        input.type = 'checkbox'
        input.name = 'studentId'
        input.value = row.studentId
        label.appendChild(input)
        label.appendChild(
          text(
            root,
            row.displayNameOrNickname,
          ),
        )
        roster.appendChild(label)
      }
    } catch {
      if (!destroyed) {
        roster.textContent =
          'Öğrenci listesi yüklenemedi.'
      }
    }
  }

  form.addEventListener(
    'submit',
    async (event) => {
      event.preventDefault()
      if (sending) return

      const studentIds =
        roster
          .querySelectorAll(
            'input[type="checkbox"]:checked',
          )
          .map?.((row) => row.value) ??
        Array.from(
          roster.querySelectorAll(
            'input[type="checkbox"]:checked',
          ),
          (row) => row.value,
        )

      if (studentIds.length === 0) {
        status.textContent =
          'En az bir öğrenci seçin.'
        return
      }
      if (
        scoreUpload === null &&
        selectedSnapshots.length === 0
      ) {
        status.textContent =
          'MusicXML veya en az bir akor seçin.'
        return
      }

      const title =
        titleInput.value.trim()
      if (!title) {
        status.textContent =
          'Çalışma adını yazın.'
        return
      }

      sending = true
      submit.disabled = true
      status.textContent =
        'Gönderiliyor.'
      try {
        const result =
          await service.send({
            draftId,
            studentIds,
            title,
            teacherNote:
              noteInput.value,
            scoreUpload,
            chordSnapshots:
              selectedSnapshots,
          })
        status.textContent =
          safeResultMessage(result)
      } catch {
        status.textContent =
          'Gönderilemedi. Tekrar deneyin.'
      } finally {
        sending = false
        submit.disabled = false
      }
    },
  )

  host.replaceChildren(form)
  void loadRoster()

  return Object.freeze({
    destroy() {
      if (destroyed) return
      destroyed = true
      host.replaceChildren()
    },
  })
}
