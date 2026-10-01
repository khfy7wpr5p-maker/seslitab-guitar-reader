import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getChordBoardVoicings,
} from '../src/services/chordBoardCatalog.js'
import {
  mountTeacherAssignmentComposerUi,
} from '../src/teacherAssignmentComposerUi.js'
import {
  createFakeDocument,
} from './support/fakeTeacherPoolDom.js'

async function settle() {
  await new Promise((resolve) =>
    setImmediate(resolve),
  )
}

test('SES-141 UI supports MusicXML + exact chord + multi-student send and only reports exact success', async () => {
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
      calls.score.push(input)
      return Object.freeze({
        intake: Object.freeze({
          musicXmlFingerprint:
            'a'.repeat(64),
        }),
      })
    },
    async send(input) {
      calls.send.push(input)
      return Object.freeze({
        ok: true,
        recipients: Object.freeze(
          input.studentIds.map(
            (studentId) =>
              Object.freeze({
                studentId,
                ok: true,
                phase:
                  'delivered_to_student',
                pieceLinked: true,
              }),
          ),
        ),
      })
    },
  }

  const handle =
    mountTeacherAssignmentComposerUi({
      root,
      host,
      service,
      createDraftId: () => 'draft-ui',
    })
  await settle()

  const fileInput =
    host.querySelector(
      'input[name="scoreMusicXml"]',
    )
  fileInput.files = [
    {
      name: 'etut.musicxml',
      size: 100,
      async text() {
        return '<score-partwise version="4.0"></score-partwise>'
      },
    },
  ]
  await fileInput.dispatchEventAsync({
    type: 'change',
  })
  assert.equal(
    calls.score[0].draftId,
    'draft-ui',
  )

  const symbol =
    host.querySelector(
      'select[name="chordSymbol"]',
    )
  const voicing =
    host.querySelector(
      'select[name="chordVoicing"]',
    )
  symbol.value = 'Am'
  symbol.dispatchEvent({ type: 'change' })
  voicing.value =
    getChordBoardVoicings('Am')[0]
      .voicingFingerprint

  const add = host
    .querySelectorAll('button')
    .find(
      (button) =>
        button.textContent === 'Akoru Ekle',
    )
  add.dispatchEvent({ type: 'click' })

  const students =
    host.querySelectorAll(
      'input[name="studentId"]',
    )
  assert.equal(students.length, 2)
  students.forEach((row) => {
    row.checked = true
  })

  host.querySelector(
    'input[name="assignmentTitle"]',
  ).value = 'Etüt 1'

  const form =
    host.querySelector('form')
  await form.dispatchEventAsync({
    type: 'submit',
    preventDefault() {},
  })

  assert.equal(calls.send.length, 1)
  assert.deepEqual(
    calls.send[0].studentIds,
    ['student-a', 'student-b'],
  )
  assert.equal(
    calls.send[0].scoreUpload.intake
      .musicXmlFingerprint,
    'a'.repeat(64),
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

  handle.destroy()
  assert.equal(host.children.length, 0)
})

test('SES-141 UI fails closed when roster authority cannot load', async () => {
  const root = createFakeDocument()
  const host = root.createElement('div')
  const handle =
    mountTeacherAssignmentComposerUi({
      root,
      host,
      service: {
        async loadRoster() {
          throw new Error(
            'provider-internal-secret',
          )
        },
        async prepareScoreUpload() {
          throw new Error('unused')
        },
        async send() {
          throw new Error('unused')
        },
      },
      createDraftId: () => 'draft-fail',
    })

  await settle()
  assert.equal(
    host.querySelector(
      '.teacher-assignment-composer__roster',
    ).textContent,
    'Öğrenci listesi yüklenemedi.',
  )
  assert.doesNotMatch(
    host.textContent,
    /provider-internal-secret/,
  )
  handle.destroy()
})
