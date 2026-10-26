import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createTeacherAssignmentBrowserComposition,
} from '../src/teacherAssignmentBrowserBootstrap.js'

function sdkHarness({ user = null } = {}) {
  const calls = { initialize: [], tokens: 0 }
  const auth = {
    currentUser: user,
    async authStateReady() {},
  }
  return {
    calls,
    sdk: {
      getApps() { return [] },
      initializeApp(config, name) {
        calls.initialize.push({ config, name })
        return { name }
      },
      getAuth() { return auth },
    },
    auth,
  }
}

const ENV = Object.freeze({
  VITE_SESLITAB_FIREBASE_API_KEY: 'public-web-key',
  VITE_SESLITAB_FIREBASE_AUTH_DOMAIN: 'project-a.firebaseapp.com',
  VITE_SESLITAB_FIREBASE_PROJECT_ID: 'project-a',
  VITE_SESLITAB_SECURE_DELIVERY_API_URL:
    'https://st-student-api.onrender.com/api/secure-delivery/v1',
})

test('SES-141 browser bootstrap fails closed when public Firebase config is unavailable', async () => {
  const h = sdkHarness()
  const result = await createTeacherAssignmentBrowserComposition({
    env: {},
    firebaseSdk: h.sdk,
    fetchImpl: async () => {
      throw new Error('must not fetch')
    },
  })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'firebase-config-unavailable')
  assert.equal(h.calls.initialize.length, 0)
})

test('SES-141 browser bootstrap fails closed when there is no signed-in teacher', async () => {
  const h = sdkHarness()
  const result = await createTeacherAssignmentBrowserComposition({
    env: ENV,
    firebaseSdk: h.sdk,
    fetchImpl: async () => {
      throw new Error('must not fetch')
    },
  })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'teacher-auth-required')
})

test('SES-141 browser bootstrap obtains Firebase user ID token per Secure Delivery request without exposing it on the composition', async () => {
  const calls = []
  const user = {
    uid: 'teacher-a',
    async getIdToken() {
      return calls.length === 0 ? 'token-1' : 'token-2'
    },
  }
  const h = sdkHarness({ user })
  const result = await createTeacherAssignmentBrowserComposition({
    env: ENV,
    firebaseSdk: h.sdk,
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return {
        ok: true,
        status: 200,
        async json() {
          return { success: true, data: [] }
        },
      }
    },
    now: () => '2026-10-01T15:20:00Z',
    createDraftId: () => 'draft-browser',
  })

  assert.equal(result.ok, true)
  assert.equal(result.composition.authenticatedTeacher.teacherId, 'teacher-a')
  assert.equal('token' in result.composition, false)
  assert.equal('getIdToken' in result.composition, false)

  await result.secureDeliveryClient.listTeacherRoster()
  await result.secureDeliveryClient.listTeacherRoster()

  assert.equal(calls[0].init.headers.Authorization, 'Bearer token-1')
  assert.equal(calls[1].init.headers.Authorization, 'Bearer token-2')
  assert.ok(calls.every((row) =>
    row.url.startsWith('https://st-student-api.onrender.com/api/secure-delivery/v1/')
  ))
})
