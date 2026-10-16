import assert from 'node:assert/strict'
import test from 'node:test'

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
  const calls = {
    pieces: 0,
    requests: 0,
    pieceActions: [],
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
        return Object.freeze([
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
            displayNameOrNickname: 'Ada',
            state: 'REPERTOIRE',
            revoked: false,
            assignedAt: '2026-10-04T07:00:00Z',
            contentSummary: Object.freeze({ score: true, chordCount: 0 }),
          }),
        ])
      },
      async listTeacherWorkRequests() {
        calls.requests += 1
        return Object.freeze([])
      },
      async applyPieceAction(actionKey, action) {
        calls.pieceActions.push([actionKey, action])
        return Object.freeze({})
      },
      async applyTeacherWorkRequestAction() {
        return Object.freeze({})
      },
      async convertTeacherWorkRequest() {
        return Object.freeze({})
      },
    },
    now: () => '2026-10-04T09:30:00Z',
    createDraftId: () => 'draft-piece-reconcile',
  })

  const handle = composition.mountAssignmentSurface({
    root,
    teacherId: 'teacher-a',
  })

  return { host, calls, handle }
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

test('piece repertoire transition updates the cached management snapshot without a full Piece refetch', async () => {
  const { host, calls, handle } = mountHarness()
  await nextTurn()
  await openManagement(host)

  const tabs = managementTabs(host)
  await tabs[1].dispatchEventAsync({ type: 'click' })

  const activeItem = host.querySelector(
    '.teacher-assignment-workspace__item',
  )
  const repertoireButton = activeItem
    .querySelectorAll('button')
    .find((button) => button.textContent === 'Repertuara Al')
  assert.ok(repertoireButton)

  const piecesBeforeMutation = calls.pieces
  await repertoireButton.dispatchEventAsync({ type: 'click' })

  assert.deepEqual(
    calls.pieceActions,
    [['piece-active', 'PLACE_IN_REPERTOIRE']],
  )
  assert.equal(
    calls.pieces,
    piecesBeforeMutation,
    'successful Piece transition must not refetch the full Piece list',
  )

  await tabs[2].dispatchEventAsync({ type: 'click' })
  const repertoireRows = host.querySelectorAll(
    '.teacher-assignment-workspace__item',
  )
  assert.equal(
    repertoireRows.some((row) => row.textContent.includes('Aktif Etüt')),
    true,
    'the transitioned Piece must move to the Repertuar view from local state',
  )

  handle.destroy()
})

test('piece revoke removes the cached row without a full Piece refetch', async () => {
  const { host, calls, handle } = mountHarness()
  await nextTurn()
  await openManagement(host)

  const tabs = managementTabs(host)
  await tabs[1].dispatchEventAsync({ type: 'click' })

  const activeItem = host.querySelector(
    '.teacher-assignment-workspace__item',
  )
  const removeButton = activeItem
    .querySelectorAll('button')
    .find((button) => button.textContent === 'Kaldır')
  assert.ok(removeButton)

  await removeButton.dispatchEventAsync({ type: 'click' })
  const dialog = host.querySelector('[role="alertdialog"]')
  assert.ok(dialog)
  const confirmButton = dialog
    .querySelectorAll('button')
    .find((button) => button.textContent === 'Kaldır')
  assert.ok(confirmButton)

  const piecesBeforeMutation = calls.pieces
  await confirmButton.dispatchEventAsync({ type: 'click' })

  assert.deepEqual(
    calls.pieceActions,
    [['piece-active', 'REVOKE']],
  )
  assert.equal(
    calls.pieces,
    piecesBeforeMutation,
    'successful Piece revoke must not refetch the full Piece list',
  )

  const activeRows = host.querySelectorAll(
    '.teacher-assignment-workspace__item',
  )
  assert.equal(
    activeRows.some((row) => row.textContent.includes('Aktif Etüt')),
    false,
    'the revoked Piece must disappear from local management state',
  )

  handle.destroy()
})
