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
        return Object.freeze([])
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
            displayNameOrNickname: 'Ece',
            state: 'REPERTOIRE',
            revoked: false,
            assignedAt: '2026-10-04T07:00:00Z',
            contentSummary: Object.freeze({ score: true, chordCount: 2 }),
          }),
        ])
      },
      async listTeacherWorkRequests() {
        calls.requests += 1
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
      async applyPieceAction() {
        return Object.freeze({})
      },
      async applyTeacherWorkRequestAction() {
        return Object.freeze({})
      },
    },
    now: () => '2026-10-04T09:30:00Z',
    createDraftId: () => 'draft-ses156',
  })

  const handle = composition.mountAssignmentSurface({
    root,
    teacherId: 'teacher-a',
  })

  return { host, results, calls, handle }
}

test('SES-156 mounts compact Yeni Ödev / Ödev Yönetimi navigation and three management work areas', async () => {
  const { host, handle } = mountHarness()
  await nextTurn()

  const primaryTabs = host.querySelectorAll(
    '.teacher-assignment-workspace__primary-tab',
  )
  assert.deepEqual(
    primaryTabs.map((button) => button.textContent),
    ['Yeni Ödev', 'Ödev Yönetimi'],
  )

  const managementButton = primaryTabs[1]
  await managementButton.dispatchEventAsync({ type: 'click' })
  await nextTurn()

  const managementTabs = host.querySelectorAll(
    '.teacher-assignment-workspace__management-tab',
  )
  assert.deepEqual(
    managementTabs.map((button) => button.textContent),
    ['Havuz', 'Aktif Çalışma', 'Repertuar'],
  )

  handle.destroy()
})

test('SES-156 repeated Havuz / Aktif Çalışma / Repertuar switching reuses one management snapshot', async () => {
  const { host, calls, handle } = mountHarness()
  await nextTurn()

  const primaryTabs = host.querySelectorAll(
    '.teacher-assignment-workspace__primary-tab',
  )
  await primaryTabs[1].dispatchEventAsync({ type: 'click' })
  await nextTurn()

  assert.equal(calls.pieces, 1)
  assert.equal(calls.requests, 1)

  const managementTabs = host.querySelectorAll(
    '.teacher-assignment-workspace__management-tab',
  )
  for (const index of [1, 2, 0, 2, 1, 0]) {
    await managementTabs[index].dispatchEventAsync({ type: 'click' })
  }

  assert.equal(calls.pieces, 1)
  assert.equal(calls.requests, 1)

  handle.destroy()
})
