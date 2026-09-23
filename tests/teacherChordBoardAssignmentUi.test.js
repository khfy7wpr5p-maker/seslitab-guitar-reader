import assert from 'node:assert/strict'
import test from 'node:test'

import { getChordBoardVoicings } from '../src/services/chordBoardCatalog.js'
import { createFakeDocument } from './support/fakeTeacherPoolDom.js'

let uiApi = null
try {
  uiApi = await import(
    '../src/teacherChordBoardAssignmentUi.js'
  )
} catch {}

function requireUi() {
  assert.ok(
    uiApi,
    'TD-07 teacher chord assignment UI module must exist',
  )
  return uiApi
}

function controllerFixture({
  result = Object.freeze({
    ok: true,
    phase: 'DELIVERED_TO_STUDENT',
    assignments: Object.freeze([
      Object.freeze({
        assignmentId: 'assignment-a',
        studentId: 'student-a',
      }),
    ]),
    message: '1 akor ödevi gönderildi.',
  }),
} = {}) {
  const calls = []
  let selectedSymbol = 'C'

  function view() {
    return Object.freeze({
      students: Object.freeze([
        Object.freeze({
          studentId: 'student-a',
          displayNameOrNickname: 'Aynı Ad',
        }),
        Object.freeze({
          studentId: 'student-b',
          displayNameOrNickname: 'Aynı Ad',
        }),
      ]),
      symbols: Object.freeze(['C', 'Am']),
      selectedSymbol,
      voicings:
        selectedSymbol === 'Am'
          ? getChordBoardVoicings('Am')
          : getChordBoardVoicings('C'),
    })
  }

  return {
    calls,
    api: {
      getViewModel: view,
      selectChord(symbol) {
        selectedSymbol = symbol
        return view()
      },
      async assignAndDeliver(input) {
        calls.push(input)
        return result
      },
    },
  }
}

function mount(options = {}) {
  const root = createFakeDocument()
  const host = root.createElement('div')
  const fake = controllerFixture(options)
  const handle =
    requireUi().mountTeacherChordBoardAssignmentUi({
      root,
      host,
      controller: fake.api,
    })
  return { root, host, fake, handle }
}

function selectedStudents(host) {
  return host.querySelectorAll(
    'input[name="selectedStudentIds"]',
  )
}

test('TD-07 UI explicitly mounts Akor Ata and keeps teacher flow inside SesliTab', () => {
  const { host, handle } = mount()

  assert.equal(
    host.querySelector('h2').textContent,
    'Akor Ata',
  )
  assert.equal(
    host.querySelector(
      'select[name="chordSymbol"]',
    ).value,
    'C',
  )
  assert.equal(
    host.querySelectorAll('button')
      .some(
        (button) =>
          button.textContent ===
            'Öğrenciye Ata',
      ),
    true,
  )
  assert.equal(
    typeof handle.refresh,
    'function',
  )
  assert.equal(
    typeof handle.destroy,
    'function',
  )
})

test('TD-07 UI previews exact selected Am voicing without deriving frets from symbol', async () => {
  const { host } = mount()
  const chordSelect =
    host.querySelector(
      'select[name="chordSymbol"]',
    )
  chordSelect.value = 'Am'
  await chordSelect.dispatchEventAsync({
    type: 'change',
  })

  const positions =
    host.querySelectorAll(
      'input[name="voicingFingerprint"]',
    )
  assert.equal(positions.length >= 1, true)
  positions[0].checked = true
  await positions[0].dispatchEventAsync({
    type: 'change',
  })

  const strings =
    host.querySelectorAll(
      '[data-chord-string]',
    )
  assert.equal(strings.length, 6)
  assert.deepEqual(
    strings.map((node) =>
      Number(node.dataset.fret),
    ),
    [-1, 0, 2, 2, 1, 0],
  )
  assert.deepEqual(
    strings.map((node) =>
      Number(node.dataset.finger),
    ),
    [-1, 0, 2, 3, 1, 0],
  )
  assert.deepEqual(
    strings.map((node) =>
      Number(node.dataset.chordString),
    ),
    [6, 5, 4, 3, 2, 1],
  )
})

test('TD-07 UI submits exact snapshot stable student IDs and teacher notes asynchronously', async () => {
  const { host, fake } = mount()
  const chordSelect =
    host.querySelector(
      'select[name="chordSymbol"]',
    )
  chordSelect.value = 'Am'
  await chordSelect.dispatchEventAsync({
    type: 'change',
  })

  const positions =
    host.querySelectorAll(
      'input[name="voicingFingerprint"]',
    )
  positions[0].checked = true
  await positions[0].dispatchEventAsync({
    type: 'change',
  })

  const students = selectedStudents(host)
  students[0].checked = true
  students[0].dispatchEvent({
    type: 'change',
  })
  students[1].checked = true
  students[1].dispatchEvent({
    type: 'change',
  })

  const common = host.querySelector(
    'textarea[name="commonTeacherNote"]',
  )
  common.value = '60 BPM ile çalış.'

  const enabled =
    host.querySelectorAll(
      'input[name="teacherNoteOverrideEnabled"]',
    )
  enabled[1].checked = true
  enabled[1].dispatchEvent({
    type: 'change',
  })
  const overrides =
    host.querySelectorAll(
      'textarea[name="teacherNoteOverride"]',
    )
  overrides[1].value =
    'Önce yavaş çalış.'

  await host.querySelector('form')
    .dispatchEventAsync({
      type: 'submit',
      preventDefault() {},
    })

  assert.equal(fake.calls.length, 1)
  assert.equal(
    fake.calls[0].snapshot,
    getChordBoardVoicings('Am')[0],
  )
  assert.deepEqual(
    fake.calls[0].studentIds,
    ['student-a', 'student-b'],
  )
  assert.equal(
    fake.calls[0].commonTeacherNote,
    '60 BPM ile çalış.',
  )
  assert.deepEqual(
    fake.calls[0].teacherNoteOverrides,
    [{
      studentId: 'student-b',
      teacherNote: 'Önce yavaş çalış.',
    }],
  )
  assert.equal(
    host.querySelector(
      '.teacher-chord-board-assignment__status',
    ).textContent,
    '1 akor ödevi gönderildi.',
  )
})

test('TD-07 UI shows prepared-not-delivered wording exactly and preserves teacher input', async () => {
  const { host } = mount({
    result: Object.freeze({
      ok: false,
      phase: 'DURABLY_PREPARED',
      assignments: Object.freeze([]),
      message:
        '1 akor ödevi hazırlandı ancak gönderilemedi.',
    }),
  })

  const chordSelect = host.querySelector(
    'select[name="chordSymbol"]',
  )
  chordSelect.value = 'Am'
  await chordSelect.dispatchEventAsync({
    type: 'change',
  })

  const student = selectedStudents(host)[0]
  student.checked = true
  student.dispatchEvent({ type: 'change' })

  const note = host.querySelector(
    'textarea[name="commonTeacherNote"]',
  )
  note.value = 'Korunacak not'

  await host.querySelector('form')
    .dispatchEventAsync({
      type: 'submit',
      preventDefault() {},
    })

  const status = host.querySelector(
    '.teacher-chord-board-assignment__status',
  )
  assert.equal(
    status.textContent,
    '1 akor ödevi hazırlandı ancak gönderilemedi.',
  )
  assert.equal(
    /ödevi gönderildi\.$/i.test(
      status.textContent,
    ),
    false,
  )
  assert.equal(student.checked, true)
  assert.equal(
    note.value,
    'Korunacak not',
  )
})

test('TD-07 UI destroy removes only its own section', () => {
  const root = createFakeDocument()
  const host = root.createElement('div')
  const sentinel = root.createElement('p')
  sentinel.textContent = 'koru'
  host.appendChild(sentinel)
  const fake = controllerFixture()

  const handle =
    requireUi().mountTeacherChordBoardAssignmentUi({
      root,
      host,
      controller: fake.api,
    })

  handle.destroy()

  assert.equal(
    host.children.includes(sentinel),
    true,
  )
  assert.equal(
    host.querySelector(
      '.teacher-chord-board-assignment',
    ),
    null,
  )
})
