import assert from 'node:assert/strict'
import test from 'node:test'

import { createFakeDocument } from './support/fakeTeacherPoolDom.js'
import { getChordBoardVoicings } from '../src/services/chordBoardCatalog.js'
import {
  mountTeacherHomeworkUi,
} from '../src/teacherHomeworkUi.js'

function controllerFixture({
  sendResult = Object.freeze({
    ok: true,
    phase: 'DELIVERED_TO_STUDENT',
  }),
} = {}) {
  const calls = {
    selectMode: [],
    selectChord: [],
    send: [],
  }
  let mode = 'SCORE'
  let selectedSymbol = 'C'

  function getViewModel() {
    return Object.freeze({
      mode,
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
      score: Object.freeze({
        available: true,
        title: 'Final Etüt',
        detail: 'Smoosic son öğretmen revizyonu',
      }),
      chordBoard: Object.freeze({
        symbols: Object.freeze(['C', 'Am']),
        selectedSymbol,
        voicings: getChordBoardVoicings(selectedSymbol),
      }),
    })
  }

  return {
    calls,
    api: Object.freeze({
      getViewModel,
      selectMode(nextMode) {
        calls.selectMode.push(nextMode)
        mode = nextMode
        return getViewModel()
      },
      selectChord(symbol) {
        calls.selectChord.push(symbol)
        selectedSymbol = symbol
        return getViewModel()
      },
      async send(input) {
        calls.send.push(input)
        return sendResult
      },
    }),
  }
}

function mount(options = {}) {
  const root = createFakeDocument()
  const host = root.createElement('div')
  const controller = controllerFixture(options)
  const handle = mountTeacherHomeworkUi({
    root,
    host,
    controller: controller.api,
  })
  return { root, host, controller, handle }
}

function students(host) {
  return host.querySelectorAll(
    'input[name="selectedStudentIds"]',
  )
}

test('SES-119 mounts one Ödev Gönder surface with Nota/Akor modes, one roster and one send action', () => {
  const { host, handle } = mount()

  assert.equal(
    host.querySelectorAll(
      '.teacher-homework',
    ).length,
    1,
  )
  assert.equal(
    host.querySelector('h2').textContent,
    'Ödev Gönder',
  )
  assert.equal(
    host.querySelectorAll('form').length,
    1,
  )

  const modes = host.querySelectorAll(
    'input[name="homeworkMode"]',
  )
  assert.deepEqual(
    modes.map((node) => node.value),
    ['SCORE', 'CHORD_BOARD'],
  )
  assert.equal(modes[0].checked, true)

  const roster = students(host)
  assert.equal(roster.length, 2)
  assert.deepEqual(
    roster.map((node) => node.value),
    ['student-a', 'student-b'],
  )
  assert.deepEqual(
    host.querySelectorAll(
      '.teacher-homework__student',
    ).map(
      (row) => row.dataset.studentId,
    ),
    ['student-a', 'student-b'],
  )

  const sendButtons = host
    .querySelectorAll('button')
    .filter(
      (button) =>
        button.textContent === 'Öğrenciye Gönder',
    )
  assert.equal(sendButtons.length, 1)

  assert.equal(
    host.querySelector(
      '.teacher-homework__score-title',
    ).textContent,
    'Final Etüt',
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

test('SES-119 mode switch preserves shared roster and notes while rendering exact Chord Board choices', async () => {
  const { host, controller } = mount()

  const roster = students(host)
  roster[0].checked = true
  roster[0].dispatchEvent({
    type: 'change',
  })

  const common = host.querySelector(
    'textarea[name="commonTeacherNote"]',
  )
  common.value = 'Korunacak ortak not'

  const chordMode = host.querySelector(
    'input[name="homeworkMode"][value="CHORD_BOARD"]',
  )
  chordMode.checked = true
  await chordMode.dispatchEventAsync({
    type: 'change',
  })

  assert.deepEqual(
    controller.calls.selectMode,
    ['CHORD_BOARD'],
  )
  assert.equal(
    students(host)[0].checked,
    true,
  )
  assert.equal(
    common.value,
    'Korunacak ortak not',
  )

  const chordSelect = host.querySelector(
    'select[name="chordSymbol"]',
  )
  assert.equal(chordSelect.value, 'C')

  chordSelect.value = 'Am'
  await chordSelect.dispatchEventAsync({
    type: 'change',
  })

  assert.deepEqual(
    controller.calls.selectChord,
    ['Am'],
  )

  const positions = host.querySelectorAll(
    'input[name="voicingFingerprint"]',
  )
  assert.equal(positions.length >= 1, true)
  assert.equal(positions[0].checked, true)

  const strings = host.querySelectorAll(
    '[data-chord-string]',
  )
  assert.equal(strings.length, 6)
  assert.deepEqual(
    strings.map((node) =>
      Number(node.dataset.fret),
    ),
    [-1, 0, 2, 2, 1, 0],
  )
})

test('SES-119 submits stable student IDs, shared notes and the exact selected content through one controller action', async () => {
  const { host, controller } = mount()

  const chordMode = host.querySelector(
    'input[name="homeworkMode"][value="CHORD_BOARD"]',
  )
  chordMode.checked = true
  await chordMode.dispatchEventAsync({
    type: 'change',
  })

  const chordSelect = host.querySelector(
    'select[name="chordSymbol"]',
  )
  chordSelect.value = 'Am'
  await chordSelect.dispatchEventAsync({
    type: 'change',
  })

  const roster = students(host)
  roster[0].checked = true
  roster[0].dispatchEvent({
    type: 'change',
  })
  roster[1].checked = true
  roster[1].dispatchEvent({
    type: 'change',
  })

  const common = host.querySelector(
    'textarea[name="commonTeacherNote"]',
  )
  common.value = '60 BPM ile çalış.'

  const overrideEnabled =
    host.querySelectorAll(
      'input[name="teacherNoteOverrideEnabled"]',
    )
  overrideEnabled[1].checked = true
  overrideEnabled[1].dispatchEvent({
    type: 'change',
  })

  const overrides = host.querySelectorAll(
    'textarea[name="teacherNoteOverride"]',
  )
  overrides[1].value = 'Önce yavaş çalış.'

  await host.querySelector('form')
    .dispatchEventAsync({
      type: 'submit',
      preventDefault() {},
    })

  assert.equal(controller.calls.send.length, 1)
  assert.equal(
    controller.calls.send[0].mode,
    'CHORD_BOARD',
  )
  assert.deepEqual(
    controller.calls.send[0].studentIds,
    ['student-a', 'student-b'],
  )
  assert.equal(
    controller.calls.send[0].commonTeacherNote,
    '60 BPM ile çalış.',
  )
  assert.deepEqual(
    controller.calls.send[0]
      .teacherNoteOverrides,
    [{
      studentId: 'student-b',
      teacherNote: 'Önce yavaş çalış.',
    }],
  )
  assert.equal(
    controller.calls.send[0]
      .content.snapshot,
    getChordBoardVoicings('Am')[0],
  )
  assert.equal(
    host.querySelector(
      '.teacher-homework__status',
    ).textContent,
    'Gönderildi.',
  )
})

test('SES-119 never claims delivery for DURABLY_PREPARED and preserves retryable teacher input', async () => {
  const { host } = mount({
    sendResult: Object.freeze({
      ok: false,
      phase: 'DURABLY_PREPARED',
      message:
        '1 ödev hazırlandı ancak gönderilemedi.',
    }),
  })

  const selected = students(host)[0]
  selected.checked = true
  selected.dispatchEvent({
    type: 'change',
  })

  const common = host.querySelector(
    'textarea[name="commonTeacherNote"]',
  )
  common.value = 'Korunacak not'

  const button = host
    .querySelectorAll('button')
    .find(
      (candidate) =>
        candidate.textContent ===
          'Öğrenciye Gönder',
    )

  await host.querySelector('form')
    .dispatchEventAsync({
      type: 'submit',
      preventDefault() {},
    })

  const status = host.querySelector(
    '.teacher-homework__status',
  )
  assert.equal(
    status.textContent,
    'Gönderilemedi. Tekrar deneyin.',
  )
  assert.equal(
    /hazırlandı|prepare|deliver/i.test(
      status.textContent,
    ),
    false,
  )
  assert.equal(selected.checked, true)
  assert.equal(
    common.value,
    'Korunacak not',
  )
  assert.equal(button.disabled, false)
})

test('SES-119 destroy removes only the unified homework surface', () => {
  const root = createFakeDocument()
  const host = root.createElement('div')
  const sentinel = root.createElement('p')
  sentinel.textContent = 'koru'
  host.appendChild(sentinel)
  const controller = controllerFixture()

  const handle = mountTeacherHomeworkUi({
    root,
    host,
    controller: controller.api,
  })

  handle.destroy()

  assert.equal(
    host.children.includes(sentinel),
    true,
  )
  assert.equal(
    host.querySelector(
      '.teacher-homework',
    ),
    null,
  )
})
