import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  createTeacherAssignmentProductionComposition,
} from '../src/teacherAssignmentProductionComposition.js'
import {
  createFakeDocument,
} from './support/fakeTeacherPoolDom.js'

test('SES-141 production composition contains no Firebase/token/browser-persistence authority', () => {
  const source = readFileSync(
    new URL(
      '../src/teacherAssignmentProductionComposition.js',
      import.meta.url,
    ),
    'utf8',
  )
  assert.doesNotMatch(
    source,
    /firebase|Bearer\s|Authorization\s*:|localStorage|sessionStorage|indexedDB|getIdToken/i,
  )
})

test('SES-141 production composition mounts only the injected authenticated Secure Delivery seam', async () => {
  const document =
    createFakeDocument()
  const host =
    document.createElement('div')
  const results =
    document.createElement('section')
  results.hidden = true
  const root = {
    createElement:
      document.createElement,
    createTextNode:
      document.createTextNode,
    getElementById(id) {
      if (
        id ===
        'teacher-assignment-composer-host'
      ) {
        return host
      }
      if (id === 'results-section') {
        return results
      }
      return null
    },
  }

  const composition =
    createTeacherAssignmentProductionComposition({
      authenticatedTeacher:
        Object.freeze({
          teacherId: 'teacher-a',
        }),
      verifyScoreSource: async () => true,
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
      },
      now: () =>
        '2026-10-01T14:30:00Z',
      createDraftId: () =>
        'draft-composition',
    })

  assert.deepEqual(
    composition.authenticatedTeacher,
    { teacherId: 'teacher-a' },
  )

  const handle =
    composition.mountAssignmentSurface({
      root,
      teacherId: 'teacher-a',
    })
  await new Promise((resolve) =>
    setImmediate(resolve),
  )
  assert.equal(results.hidden, false)
  const mountedForm =
    host.querySelector('form')
  assert.ok(mountedForm)
  assert.equal(
    mountedForm.children[0].textContent,
    'Ödev Gönder',
  )

  handle.destroy()
  assert.equal(host.children.length, 0)
})
