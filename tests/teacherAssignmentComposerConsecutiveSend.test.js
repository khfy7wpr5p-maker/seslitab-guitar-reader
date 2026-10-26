import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getChordBoardVoicings,
} from '../src/services/chordBoardCatalog.js'
import {
  mountTeacherAssignmentComposerUi,
} from '../src/teacherAssignmentComposerUi.js'
import {
  TEACHER_ASSIGNMENT_DELIVERY_PHASE,
} from '../src/services/teacherAssignmentDeliveryOrchestrator.js'
import {
  createFakeDocument,
} from './support/fakeTeacherPoolDom.js'

async function settle() {
  await new Promise((resolve) =>
    setImmediate(resolve),
  )
}

function exactSuccess(input) {
  return Object.freeze({
    ok: true,
    recipients: Object.freeze(
      input.studentIds.map(
        (studentId) =>
          Object.freeze({
            studentId,
            ok: true,
            phase:
              TEACHER_ASSIGNMENT_DELIVERY_PHASE
                .DELIVERED_TO_STUDENT,
            pieceLinked: true,
          }),
      ),
    ),
  })
}

function scoreFile(name, marker) {
  return Object.freeze({
    name,
    size: 100,
    async text() {
      return `<score-partwise version="4.0"><part-list/><part id="${marker}"/></score-partwise>`
    },
  })
}

function sequencedDraftIds(values) {
  let index = 0
  return () => {
    const value = values[index]
    index += 1
    if (!value) {
      throw new Error('unexpected-draft-id-request')
    }
    return value
  }
}

function harness({
  send,
  draftIds = ['draft-1', 'draft-2', 'draft-3'],
} = {}) {
  const root = createFakeDocument()
  const host = root.createElement('div')
  const calls = {
    score: [],
    send: [],
  }
  const service = {
    async loadRoster() {
      return Object.freeze([
        Object.freeze({
          studentId: 'student-a',
          displayNameOrNickname: 'Ada',
        }),
        Object.freeze({
          studentId: 'student-b',
          displayNameOrNickname: 'Bora',
        }),
      ])
    },
    async prepareScoreUpload(input) {
      calls.score.push(structuredClone(input))
      return Object.freeze({
        intake: Object.freeze({
          musicXmlFingerprint:
            'a'.repeat(64),
        }),
      })
    },
    async send(input) {
      calls.send.push(structuredClone(input))
      return send
        ? send(input, calls.send.length)
        : exactSuccess(input)
    },
  }

  const handle =
    mountTeacherAssignmentComposerUi({
      root,
      host,
      service,
      createDraftId:
        sequencedDraftIds(draftIds),
    })

  return {
    root,
    host,
    calls,
    handle,
  }
}

function submitButton(host) {
  return host
    .querySelectorAll('button')
    .find(
      (button) =>
        button.textContent ===
        'Öğrenciye Gönder',
    )
}

function addChordButton(host) {
  return host
    .querySelectorAll('button')
    .find(
      (button) =>
        button.textContent === 'Akoru Ekle',
    )
}

function selectChord(host, symbolName = 'Am') {
  const symbol = host.querySelector(
    'select[name="chordSymbol"]',
  )
  const voicing = host.querySelector(
    'select[name="chordVoicing"]',
  )
  symbol.value = symbolName
  symbol.dispatchEvent({ type: 'change' })
  voicing.value =
    getChordBoardVoicings(symbolName)[0]
      .voicingFingerprint
  addChordButton(host).dispatchEvent({
    type: 'click',
  })
}

function studentInputs(host) {
  return host.querySelectorAll(
    'input[name="studentId"]',
  )
}

async function submit(host) {
  await host
    .querySelector('form')
    .dispatchEventAsync({
      type: 'submit',
      preventDefault() {},
    })
}

test('SES-161 successful assignment rotates draft and allows a distinct second assignment in the same mounted session', async () => {
  const { host, calls, handle } = harness()
  await settle()

  const title = host.querySelector(
    'input[name="assignmentTitle"]',
  )
  const note = host.querySelector(
    'textarea[name="teacherNote"]',
  )
  const file = host.querySelector(
    'input[name="scoreMusicXml"]',
  )
  const students = studentInputs(host)

  file.files = [
    scoreFile('first.musicxml', 'first'),
  ]
  await file.dispatchEventAsync({
    type: 'change',
  })
  selectChord(host, 'Am')
  students[0].checked = true
  title.value = 'Birinci çalışma'
  note.value = 'Birinci not'
  await submit(host)

  assert.equal(calls.send.length, 1)
  assert.equal(calls.send[0].draftId, 'draft-1')
  assert.deepEqual(
    calls.send[0].studentIds,
    ['student-a'],
  )
  assert.equal(
    calls.send[0].chordSnapshots.length,
    1,
  )
  assert.equal(
    host.querySelector(
      '.teacher-assignment-composer__status',
    ).textContent,
    'Gönderildi.',
  )

  assert.equal(title.value, '')
  assert.equal(note.value, '')
  assert.equal(students[0].checked, false)
  assert.equal(
    host.querySelector(
      '.teacher-assignment-composer__selected-chords',
    ).children.length,
    0,
  )
  assert.equal(
    host.querySelector(
      '.teacher-assignment-composer__score-status',
    ).textContent,
    'MusicXML isteğe bağlıdır.',
  )

  students[1].checked = true
  title.value = 'İkinci çalışma'
  selectChord(host, 'E')
  await submit(host)

  assert.equal(calls.send.length, 2)
  assert.equal(calls.send[1].draftId, 'draft-2')
  assert.deepEqual(
    calls.send[1].studentIds,
    ['student-b'],
  )
  assert.equal(
    calls.send[1].scoreUpload,
    null,
  )
  assert.equal(
    calls.send[1].chordSnapshots.length,
    1,
  )

  handle.destroy()
})

test('SES-161 consecutive SCORE assignments prepare and send against fresh draft identities without sign-out', async () => {
  const { host, calls, handle } = harness()
  await settle()

  const file = host.querySelector(
    'input[name="scoreMusicXml"]',
  )
  const title = host.querySelector(
    'input[name="assignmentTitle"]',
  )
  const students = studentInputs(host)

  file.files = [
    scoreFile('score-one.musicxml', 'one'),
  ]
  await file.dispatchEventAsync({
    type: 'change',
  })
  students[0].checked = true
  title.value = 'Score 1'
  await submit(host)

  file.files = [
    scoreFile('score-two.musicxml', 'two'),
  ]
  await file.dispatchEventAsync({
    type: 'change',
  })
  students[0].checked = true
  title.value = 'Score 2'
  await submit(host)

  assert.deepEqual(
    calls.score.map((row) => row.draftId),
    ['draft-1', 'draft-2'],
  )
  assert.deepEqual(
    calls.send.map((row) => row.draftId),
    ['draft-1', 'draft-2'],
  )
  assert.deepEqual(
    calls.send.map((row) => row.studentIds),
    [['student-a'], ['student-a']],
  )

  handle.destroy()
})

test('SES-161 failed send preserves the same draft for safe retry and rotates only after exact success', async () => {
  const { host, calls, handle } = harness({
    send(input, attempt) {
      if (attempt === 1) {
        return Object.freeze({
          ok: false,
          recipients: Object.freeze([
            Object.freeze({
              studentId: input.studentIds[0],
              ok: false,
              phase:
                TEACHER_ASSIGNMENT_DELIVERY_PHASE
                  .LOCAL_ASSIGNMENT_ONLY,
              pieceLinked: false,
            }),
          ]),
        })
      }
      return exactSuccess(input)
    },
  })
  await settle()

  const title = host.querySelector(
    'input[name="assignmentTitle"]',
  )
  const students = studentInputs(host)
  students[0].checked = true
  title.value = 'Retry çalışması'
  selectChord(host, 'Am')

  await submit(host)
  assert.equal(
    host.querySelector(
      '.teacher-assignment-composer__status',
    ).textContent,
    'Gönderilemedi. Tekrar deneyin.',
  )
  assert.equal(title.value, 'Retry çalışması')
  assert.equal(students[0].checked, true)

  await submit(host)

  assert.deepEqual(
    calls.send.map((row) => row.draftId),
    ['draft-1', 'draft-1'],
  )
  assert.equal(
    host.querySelector(
      '.teacher-assignment-composer__status',
    ).textContent,
    'Gönderildi.',
  )
  assert.equal(title.value, '')
  assert.equal(students[0].checked, false)

  handle.destroy()
})
