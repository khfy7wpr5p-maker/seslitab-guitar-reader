import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createInMemoryStudentWorkRequestStore,
} from '../backend/delivery/repositories/inMemoryStudentWorkRequestStore.js'

test('SES-170 request store is a dedicated authority and does not expose public_pool', () => {
  const store = createInMemoryStudentWorkRequestStore()

  assert.equal(typeof store.getWorkRequest, 'function')
  assert.equal(typeof store.putWorkRequest, 'function')
  assert.equal(typeof store.listWorkRequestsForTeacher, 'function')
  assert.equal(typeof store.listActiveTeacherGrantsForStudent, 'function')
  assert.equal(typeof store.getPieceEvidence, 'function')
  assert.equal(typeof store.commitWorkRequestTransition, 'function')

  assert.equal(store.listPoolPublicationsForStudent, undefined)
})
