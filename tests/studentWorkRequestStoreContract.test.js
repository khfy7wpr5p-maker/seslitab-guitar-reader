import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createInMemorySecureDeliveryStore,
} from '../backend/delivery/repositories/inMemorySecureDeliveryStore.js'

test('SES-170 store exposes a request authority separate from public_pool', () => {
  const store = createInMemorySecureDeliveryStore()

  assert.equal(typeof store.getWorkRequest, 'function')
  assert.equal(typeof store.putWorkRequest, 'function')
  assert.equal(typeof store.listWorkRequestsForTeacher, 'function')
  assert.equal(typeof store.listTeacherStudentGrantsForStudent, 'function')
  assert.equal(typeof store.commitWorkRequestTransition, 'function')

  assert.equal(typeof store.listPoolPublicationsForStudent, 'function')
})
