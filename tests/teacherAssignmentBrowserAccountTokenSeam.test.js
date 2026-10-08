import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createTeacherAssignmentBrowserComposition,
} from '../src/teacherAssignmentBrowserBootstrap.js'

const ENV = Object.freeze({
  VITE_SESLITAB_FIREBASE_API_KEY: 'public-web-key',
  VITE_SESLITAB_FIREBASE_AUTH_DOMAIN:
    'project-a.firebaseapp.com',
  VITE_SESLITAB_FIREBASE_PROJECT_ID: 'project-a',
  VITE_SESLITAB_SECURE_DELIVERY_API_URL:
    'https://delivery.example.test/api/secure-delivery/v1',
})

function sdkHarness(user) {
  const auth = {
    currentUser: user,
    async authStateReady() {},
  }
  return {
    auth,
    sdk: {
      getApps() { return [] },
      initializeApp(_config, name) { return { name } },
      getAuth() { return auth },
    },
  }
}

test('browser bootstrap exposes a bounded fresh-token seam for Account Service without exposing Firebase UID as account authority', async () => {
  let tokenCalls = 0
  const user = {
    uid: 'provider-uid-private',
    async getIdToken() {
      tokenCalls += 1
      return `token-${tokenCalls}`
    },
  }
  const h = sdkHarness(user)

  const result = await createTeacherAssignmentBrowserComposition({
    env: ENV,
    firebaseSdk: h.sdk,
    fetchImpl: async () => {
      throw new Error('unused')
    },
  })

  assert.equal(result.ok, true)
  assert.equal(typeof result.getIdToken, 'function')
  assert.equal(await result.getIdToken(), 'token-1')
  assert.equal(await result.getIdToken(), 'token-2')
  assert.equal('firebaseUid' in result, false)
  assert.equal('teacherId' in result, false)

  h.auth.currentUser = {
    uid: 'different-provider-uid',
    async getIdToken() { return 'must-not-return' },
  }
  await assert.rejects(
    result.getIdToken(),
    /teacher-auth-required/,
  )
})
