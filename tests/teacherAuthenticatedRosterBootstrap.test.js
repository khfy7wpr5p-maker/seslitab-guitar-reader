import assert from 'node:assert/strict'
import test from 'node:test'

import {
  TEACHER_AUTH_STATE,
  createTeacherAuthSessionController,
} from '../src/teacherAuthSessionController.js'

const ENV = Object.freeze({
  VITE_SESLITAB_FIREBASE_API_KEY:
    'public-web-key',
  VITE_SESLITAB_FIREBASE_AUTH_DOMAIN:
    'project-a.firebaseapp.com',
  VITE_SESLITAB_FIREBASE_PROJECT_ID:
    'project-a',
  VITE_SESLITAB_SECURE_DELIVERY_API_URL:
    'https://api.example.test/api/secure-delivery/v1',
})

function rosterRow() {
  return Object.freeze({
    schemaVersion: 1,
    studentId: 'student-a',
    displayNameOrNickname: 'Ada',
    active: true,
  })
}

function jsonResponse(payload, status = 200) {
  return Object.freeze({
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload
    },
  })
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise(
    (res, rej) => {
      resolve = res
      reject = rej
    },
  )
  return { promise, resolve, reject }
}

function authHarness() {
  const calls = {
    tokens: 0,
  }
  const user = {
    uid: 'provider-uid-private',
    async getIdToken() {
      calls.tokens += 1
      return `token-${calls.tokens}`
    },
  }
  const auth = {
    currentUser: user,
    async authStateReady() {},
  }
  const sdk = {
    browserSessionPersistence:
      Object.freeze({ type: 'SESSION' }),
    getApps() {
      return []
    },
    initializeApp() {
      return Object.freeze({
        name:
          'seslitab-teacher-assignment',
      })
    },
    getAuth() {
      return auth
    },
    async setPersistence() {},
    async signInWithEmailAndPassword() {
      return Object.freeze({ user })
    },
    async signOut() {
      auth.currentUser = null
    },
  }
  return { auth, calls, sdk }
}

test('SES-147 waits for authorized teacher roster before READY and mounts only after roster resolves', async () => {
  const h = authHarness()
  const rosterResponse = deferred()
  const requests = []
  let readyCalls = 0

  const controller =
    createTeacherAuthSessionController({
      env: ENV,
      firebaseSdk: h.sdk,
      async fetchImpl(url, init) {
        requests.push({ url, init })
        return rosterResponse.promise
      },
      onReady(connection) {
        readyCalls += 1
        assert.equal(
          typeof connection
            .composition
            .mountAssignmentSurface,
          'function',
        )
      },
    })

  const startPromise = controller.start()
  await new Promise((resolve) =>
    setImmediate(resolve),
  )

  assert.equal(readyCalls, 0)
  assert.equal(
    controller.getSnapshot().state,
    TEACHER_AUTH_STATE
      .CONNECTING_SECURE_DELIVERY,
  )
  assert.equal(requests.length, 1)
  assert.match(
    requests[0].url,
    /\/teacher\/roster$/,
  )
  assert.equal(
    requests[0].init.headers.Authorization,
    'Bearer token-1',
  )

  rosterResponse.resolve(
    jsonResponse({
      success: true,
      data: [rosterRow()],
    }),
  )

  const result = await startPromise

  assert.equal(
    result.state,
    TEACHER_AUTH_STATE.READY,
  )
  assert.equal(readyCalls, 1)
  assert.equal(h.calls.tokens, 1)
})

test('SES-147 roster bootstrap failure stays fail-closed and never grants composer authority', async () => {
  const h = authHarness()
  let readyCalls = 0

  const controller =
    createTeacherAuthSessionController({
      env: ENV,
      firebaseSdk: h.sdk,
      async fetchImpl() {
        return jsonResponse({
          success: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'temporary',
          },
        }, 503)
      },
      onReady() {
        readyCalls += 1
      },
    })

  const result =
    await controller.start()

  assert.equal(
    result.state,
    TEACHER_AUTH_STATE
      .API_UNAVAILABLE,
  )
  assert.equal(readyCalls, 0)
})

test('SES-147 roster 401 becomes SESSION_EXPIRED before composer mount', async () => {
  const h = authHarness()
  let readyCalls = 0

  const controller =
    createTeacherAuthSessionController({
      env: ENV,
      firebaseSdk: h.sdk,
      async fetchImpl() {
        return jsonResponse({
          success: false,
          error: {
            code: 'AUTH_REQUIRED',
            message: 'unauthorized',
          },
        }, 401)
      },
      onReady() {
        readyCalls += 1
      },
    })

  const result =
    await controller.start()

  assert.equal(
    result.state,
    TEACHER_AUTH_STATE
      .SESSION_EXPIRED,
  )
  assert.equal(
    result.reason,
    'session-expired',
  )
  assert.equal(readyCalls, 0)
})

test('SES-147 a later Secure Delivery 401 revokes mounted composer authority', async () => {
  const h = authHarness()
  let readyConnection = null
  let revoked = 0
  let requestCount = 0

  const controller =
    createTeacherAuthSessionController({
      env: ENV,
      firebaseSdk: h.sdk,
      async fetchImpl() {
        requestCount += 1
        if (requestCount === 1) {
          return jsonResponse({
            success: true,
            data: [rosterRow()],
          })
        }
        return jsonResponse({
          success: false,
          error: {
            code: 'AUTH_REQUIRED',
            message: 'unauthorized',
          },
        }, 401)
      },
      onReady(connection) {
        readyConnection = connection
      },
      onAuthorityRevoked() {
        revoked += 1
      },
    })

  const startResult =
    await controller.start()
  assert.equal(
    startResult.state,
    TEACHER_AUTH_STATE.READY,
  )
  assert.ok(readyConnection)

  await assert.rejects(
    () =>
      readyConnection
        .secureDeliveryClient
        .listTeacherDeliveries(),
  )

  assert.equal(revoked, 1)
  assert.equal(
    controller.getSnapshot().state,
    TEACHER_AUTH_STATE
      .SESSION_EXPIRED,
  )
  assert.equal(
    controller.getSnapshot().reason,
    'session-expired',
  )
  assert.equal(h.calls.tokens, 2)
})
