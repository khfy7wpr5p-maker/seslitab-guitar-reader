import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getChordBoardVoicings,
} from '../src/services/chordBoardCatalog.js'
import {
  createTeacherAssignmentProductionComposition,
} from '../src/teacherAssignmentProductionComposition.js'
import {
  createFakeDocument,
} from './support/fakeTeacherPoolDom.js'

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve))
}

function mountHarness() {
  const document = createFakeDocument()
  const host = document.createElement('div')
  const results = document.createElement('section')
  results.hidden = true
  let convertedTarget = null
  let draftCounter = 0
  const calls = {
    pieces: 0,
    requests: 0,
    pieceActions: [],
    requestActions: [],
    conversions: [],
  }

  const root = {
    createElement: document.createElement,
    createTextNode: document.createTextNode,
    getElementById(id) {
      if (id === 'teacher-assignment-composer-host') return host
      if (id === 'results-section') return results
      return null
    },
  }

  const composition = createTeacherAssignmentProductionComposition({
    authenticatedTeacher: Object.freeze({ teacherId: 'teacher-a' }),
    secureDeliveryClient: {
      async listTeacherRoster() {
        return Object.freeze([
          Object.freeze({
            studentId: 'student-a',
            displayNameOrNickname: 'Ada',
          }),
        ])
      },
      async prepareAssignments() {
        return Object.freeze([])
      },
      async deliverAssignments() {
        return Object.freeze([])
      },
      async createTeacherPiece() {
        return Object.freeze({})
      },
      async listTeacherPieces() {
        calls.pieces += 1
        const base = [
          Object.freeze({
            actionKey: 'piece-active',
            title: 'Aktif Etüt',
            displayNameOrNickname: 'Ada',
            state: 'ACTIVE',
            revoked: false,
            assignedAt: '2026-10-04T08:00:00Z',
            contentSummary: Object.freeze({ score: true, chordCount: 0 }),
          }),
          Object.freeze({
            actionKey: 'piece-repertoire',
            title: 'Repertuar Etüdü',
            displayNameOrNickname: 'Ece',
            state: 'REPERTOIRE',
            revoked: false,
            assignedAt: '2026-10-04T07:00:00Z',
            contentSummary: Object.freeze({ score: true, chordCount: 2 }),
          }),
        ]
        if (convertedTarget) {
          base.push(Object.freeze({
            actionKey: 'piece-converted',
            title: 'Yeni Etüt',
            displayNameOrNickname: 'Ada',
            state: convertedTarget,
            revoked: false,
            assignedAt: '2026-10-04T09:30:00Z',
            contentSummary: Object.freeze({ score: false, chordCount: 1 }),
          }))
        }
        return Object.freeze(base)
      },
      async listTeacherWorkRequests() {
        calls.requests += 1
        if (convertedTarget) return Object.freeze([])
        return Object.freeze([
          Object.freeze({
            actionKey: 'request-a',
            title: 'Yeni Etüt',
            displayNameOrNickname: 'Ada',
            state: 'PENDING',
            revoked: false,
            requestedAt: '2026-10-04T09:00:00Z',
            contentSummary: null,
          }),
        ])
      },
      async applyPieceAction(actionKey, action) {
        calls.pieceActions.push([actionKey, action])
        return Object.freeze({})
      },
      async applyTeacherWorkRequestAction(actionKey, action) {
        calls.requestActions.push([actionKey, action])
        return Object.freeze({})
      },
      async convertTeacherWorkRequest(actionKey, targetState, composerDraft) {
        calls.conversions.push({ actionKey, targetState, composerDraft })
        convertedTarget = targetState
        return Object.freeze({
          actionKey,
          title: 'Yeni Etüt',
          state: 'CONVERTED',
          targetState,
          updatedAt: '2026-10-04T09:30:00Z',
        })
      },
    },
    now: () => '2026-10-04T09:30:00Z',
    createDraftId: () => {
      draftCounter += 1
      return `draft-ses156-${draftCounter}`
    },
  })

  const handle = composition.mountAssignmentSurface({
    root,
    teacherId: 'teacher-a',
  })

  return { host, results, calls, handle }
}

function primaryTabs(host) {
  return host.querySelectorAll(
    '.teacher-assignment-workspace__primary-tab',
  )
}

function managementTabs(host) {
  return host.querySelectorAll(
    '.teacher-assignment-workspace__management-tab',
  )
}

async function openManagement(host) {
  await primaryTabs(host)[1].dispatchEventAsync({ type: 'click' })
  await nextTurn()
}

function addDefaultChord(host) {
  const symbol = host.querySelector('select[name="chordSymbol"]')
  const voicing = host.querySelector('select[name="chordVoicing"]')
  const add = host.querySelectorAll('button').find(
    (button) => button.textContent === 'Akoru Ekle',
  )
  symbol.value = 'Am'
  symbol.dispatchEvent({ type: 'change' })
  voicing.value = getChordBoardVoicings('Am')[0].voicingFingerprint
  add.dispatchEvent({ type: 'click' })
}

async function submitComposer(host) {
  await host.querySelector('form').dispatchEventAsync({
    type: 'submit',
    preventDefault() {},
  })
  await nextTurn()
}

test('SES-156 mounts compact Yeni Ödev / Ödev Yönetimi navigation and three management work areas', async () => {
  const { host, handle } = mountHarness()
  await nextTurn()

  assert.deepEqual(
    primaryTabs(host).map((button) => button.textContent),
    ['Yeni Ödev', 'Ödev Yönetimi'],
  )

  await openManagement(host)
  assert.deepEqual(
    managementTabs(host).map((button) => button.textContent),
    ['Havuz', 'Aktif Çalışma', 'Repertuar'],
  )

  handle.destroy()
})

test('SES-156 repeated Havuz / Aktif Çalışma / Repertuar switching reuses one management snapshot', async () => {
  const { host, calls, handle } = mountHarness()
  await nextTurn()
  await openManagement(host)

  assert.equal(calls.pieces, 1)
  assert.equal(calls.requests, 1)

  const tabs = managementTabs(host)
  for (const index of [1, 2, 0, 2, 1, 0]) {
    await tabs[index].dispatchEventAsync({ type: 'click' })
  }

  assert.equal(calls.pieces, 1)
  assert.equal(calls.requests, 1)
  handle.destroy()
})

test('SES-156 Havuz Aktife Al enters request-bound composer mode and converts without browser recipient authority', async () => {
  const { host, calls, handle } = mountHarness()
  await nextTurn()
  await openManagement(host)

  const item = host.querySelector('.teacher-assignment-workspace__item')
  const buttons = item.querySelectorAll('button')
  assert.deepEqual(
    buttons.map((button) => button.textContent),
    ['Aktife Al', 'Doğrudan Repertuara Al', 'Kaldır'],
  )

  await buttons[0].dispatchEventAsync({ type: 'click' })
  assert.equal(primaryTabs(host)[0].getAttribute('aria-selected'), 'true')

  const title = host.querySelector('input[name="assignmentTitle"]')
  assert.equal(title.value, 'Yeni Etüt')
  assert.equal(title.disabled, true)
  addDefaultChord(host)
  await submitComposer(host)

  assert.equal(calls.conversions.length, 1)
  const conversion = calls.conversions[0]
  assert.equal(conversion.actionKey, 'request-a')
  assert.equal(conversion.targetState, 'ACTIVE')
  assert.equal(conversion.composerDraft.teacherNote, '')
  assert.equal(conversion.composerDraft.scoreUpload, null)
  assert.equal(conversion.composerDraft.guitarTabUpload, null)
  assert.equal(conversion.composerDraft.chordSnapshots.length, 1)
  assert.equal(Object.hasOwn(conversion.composerDraft, 'studentId'), false)
  assert.equal(Object.hasOwn(conversion.composerDraft, 'pieceAssignmentId'), false)

  assert.equal(calls.pieces, 2)
  assert.equal(calls.requests, 2)
  assert.equal(primaryTabs(host)[1].getAttribute('aria-selected'), 'true')
  assert.equal(managementTabs(host)[1].getAttribute('aria-selected'), 'true')

  handle.destroy()
})

test('SES-156 Havuz direct Repertuar conversion uses the same request-bound path', async () => {
  const { host, calls, handle } = mountHarness()
  await nextTurn()
  await openManagement(host)

  const item = host.querySelector('.teacher-assignment-workspace__item')
  const repertoire = item.querySelectorAll('button')[1]
  await repertoire.dispatchEventAsync({ type: 'click' })
  addDefaultChord(host)
  await submitComposer(host)

  assert.equal(calls.conversions.length, 1)
  assert.equal(calls.conversions[0].actionKey, 'request-a')
  assert.equal(calls.conversions[0].targetState, 'REPERTOIRE')
  assert.equal(managementTabs(host)[2].getAttribute('aria-selected'), 'true')

  handle.destroy()
})

test('SES-156 Piece action performs one authoritative reconcile instead of refetching on tab switches', async () => {
  const { host, calls, handle } = mountHarness()
  await nextTurn()
  await openManagement(host)

  const tabs = managementTabs(host)
  await tabs[1].dispatchEventAsync({ type: 'click' })

  const item = host.querySelector('.teacher-assignment-workspace__item')
  const repertoire = item.querySelectorAll('button')[0]
  assert.equal(repertoire.textContent, 'Repertuara Al')
  await repertoire.dispatchEventAsync({ type: 'click' })

  assert.deepEqual(
    calls.pieceActions,
    [['piece-active', 'PLACE_IN_REPERTOIRE']],
  )
  assert.equal(calls.pieces, 2)
  assert.equal(calls.requests, 2)

  await tabs[2].dispatchEventAsync({ type: 'click' })
  await tabs[1].dispatchEventAsync({ type: 'click' })
  assert.equal(calls.pieces, 2)
  assert.equal(calls.requests, 2)

  handle.destroy()
})

test('SES-156 Kaldır confirmation exposes one-way warning and Cancel-first control order', async () => {
  const { host, handle } = mountHarness()
  await nextTurn()
  await openManagement(host)

  const item = host.querySelector('.teacher-assignment-workspace__item')
  const remove = item.querySelectorAll('button')[2]
  await remove.dispatchEventAsync({ type: 'click' })

  const dialog = host.querySelector('[role="alertdialog"]')
  assert.ok(dialog)
  const dialogText = dialog.children
    .map((child) => child.textContent)
    .join(' ')
  assert.match(dialogText, /Yeni Etüt/)
  assert.match(dialogText, /Ada/)
  assert.match(dialogText, /geri alınamaz/)
  assert.deepEqual(
    dialog.querySelectorAll('button').map((button) => button.textContent),
    ['İptal', 'Kaldır'],
  )
  assert.equal(dialog.querySelectorAll('button')[0].focused, true)

  handle.destroy()
})
