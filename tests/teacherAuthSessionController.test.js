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
})

function user() {
  return Object.freeze({
    uid: 'provider-uid-must-stay-private',
    async getIdToken() {
      return 'token-must-stay-private'
    },
  })
}

function harness({
  initialUser = null,
  signInError = null,
} = {}) {
  const calls = {
    order: [],
    initialize: [],
    signIn: [],
    signOut: 0,
  }
  const auth = {
    currentUser: initialUser,
    async authStateReady() {
      calls.order.push('authStateReady')
    },
  }
  const persistence =
    Object.freeze({ type: 'SESSION' })

  const sdk = {
    browserSessionPersistence: persistence,
    getApps() {
      return []
    },
    initializeApp(config, name) {
      calls.initialize.push({
        config,
        name,
      })
      return { name }
    },
    getAuth() {
      return auth
    },
    async setPersistence(
      actualAuth,
      actualPersistence,
    ) {
      assert.equal(actualAuth, auth)
      assert.equal(
        actualPersistence,
        persistence,
      )
      calls.order.push('setPersistence')
    },
    async signInWithEmailAndPassword(
      actualAuth,
      email,
      password,
    ) {
      assert.equal(actualAuth, auth)
      calls.signIn.push({
        email,
        password,
      })
      if (signInError) {
        throw signInError
      }
      auth.currentUser = user()
      return Object.freeze({
        user: auth.currentUser,
      })
    },
    async signOut(actualAuth) {
      assert.equal(actualAuth, auth)
      calls.signOut += 1
      auth.currentUser = null
    },
  }

  return {
    auth,
    calls,
    sdk,
  }
}

function publicSnapshot(snapshot) {
  return JSON.stringify(snapshot)
}

test('SES-146 start fails closed as CONFIG_UNAVAILABLE without initializing Firebase', async () => {
  const h = harness()
  const controller =
    createTeacherAuthSessionController({
      env: {},
      firebaseSdk: h.sdk,
      connectSecureDelivery:
        async () => {
          throw new Error(
            'must not connect',
          )
        },
    })

  const result =
    await controller.start()

  assert.equal(
    result.state,
    TEACHER_AUTH_STATE
      .CONFIG_UNAVAILABLE,
  )
  assert.equal(
    result.reason,
    'firebase-config-unavailable',
  )
  assert.equal(
    h.calls.initialize.length,
    0,
  )
})

test('SES-146 start configures session persistence before authStateReady and restores signed-out state', async () => {
  const h = harness()
  const states = []
  const controller =
    createTeacherAuthSessionController({
      env: ENV,
      firebaseSdk: h.sdk,
      connectSecureDelivery:
        async () => {
          throw new Error(
            'must not connect',
          )
        },
    })

  controller.subscribe(
    (snapshot) => {
      states.push(snapshot.state)
    },
  )

  const result =
    await controller.start()

  assert.deepEqual(
    h.calls.order,
    [
      'setPersistence',
      'authStateReady',
    ],
  )
  assert.equal(
    result.state,
    TEACHER_AUTH_STATE.SIGNED_OUT,
  )
  assert.ok(
    states.includes(
      TEACHER_AUTH_STATE
        .BOOTSTRAPPING,
    ),
  )
  assert.ok(
    states.includes(
      TEACHER_AUTH_STATE.SIGNED_OUT,
    ),
  )
})

test('SES-146 valid Email/Password sign-in reaches READY through AUTHENTICATED and CONNECTING_SECURE_DELIVERY', async () => {
  const h = harness()
  const states = []
  let readyCalls = 0
  let connectCalls = 0

  const controller =
    createTeacherAuthSessionController({
      env: ENV,
      firebaseSdk: h.sdk,
      async connectSecureDelivery() {
        connectCalls += 1
        return Object.freeze({
          composition:
            Object.freeze({
              marker: 'composition',
            }),
          getIdToken: user().getIdToken,
        })
      },
      onReady(connection) {
        readyCalls += 1
        assert.equal(
          connection.composition.marker,
          'composition',
        )
        assert.equal(
          typeof connection.getIdToken,
          'function',
        )
      },
    })

  controller.subscribe(
    (snapshot) => {
      states.push(snapshot.state)
    },
  )

  await controller.start()
  const result =
    await controller.signIn({
      email: 'teacher@example.test',
      password:
        'not-a-real-production-secret',
    })

  assert.equal(
    h.calls.signIn.length,
    1,
  )
  assert.equal(connectCalls, 1)
  assert.equal(readyCalls, 1)
  assert.deepEqual(
    states.slice(-4),
    [
      TEACHER_AUTH_STATE.SIGNING_IN,
      TEACHER_AUTH_STATE.AUTHENTICATED,
      TEACHER_AUTH_STATE
        .CONNECTING_SECURE_DELIVERY,
      TEACHER_AUTH_STATE.READY,
    ],
  )
  assert.equal(
    result.state,
    TEACHER_AUTH_STATE.READY,
  )
})

test('SES-146 existing Firebase session restores to READY without another sign-in', async () => {
  const h = harness({
    initialUser: user(),
  })
  let connectCalls = 0

  const controller =
    createTeacherAuthSessionController({
      env: ENV,
      firebaseSdk: h.sdk,
      async connectSecureDelivery() {
        connectCalls += 1
        return Object.freeze({
          composition:
            Object.freeze({
              marker: 'restored',
            }),
          getIdToken: user().getIdToken,
        })
      },
    })

  const result =
    await controller.start()

  assert.equal(
    result.state,
    TEACHER_AUTH_STATE.READY,
  )
  assert.equal(connectCalls, 1)
  assert.equal(
    h.calls.signIn.length,
    0,
  )
})

test('SES-146 invalid credentials return a generic fail-closed state without raw Firebase error leakage', async () => {
  const error =
    new Error(
      'Firebase raw secret-ish diagnostic',
    )
  error.code = 'auth/invalid-credential'
  const h = harness({
    signInError: error,
  })

  const controller =
    createTeacherAuthSessionController({
      env: ENV,
      firebaseSdk: h.sdk,
      connectSecureDelivery:
        async () => {
          throw new Error(
            'must not connect',
          )
        },
    })

  await controller.start()
  const result =
    await controller.signIn({
      email: 'teacher@example.test',
      password: 'wrong-password',
    })

  assert.equal(
    result.state,
    TEACHER_AUTH_STATE.SIGNED_OUT,
  )
  assert.equal(
    result.reason,
    'invalid-credentials',
  )
  assert.doesNotMatch(
    publicSnapshot(result),
    /Firebase raw|wrong-password|provider-uid|token-must/,
  )
})

test('SES-146 Secure Delivery authentication failure becomes SESSION_EXPIRED', async () => {
  const h = harness({
    initialUser: user(),
  })
  const error =
    new Error('raw backend error')
  error.status = 401

  const controller =
    createTeacherAuthSessionController({
      env: ENV,
      firebaseSdk: h.sdk,
      async connectSecureDelivery() {
        throw error
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
  assert.doesNotMatch(
    publicSnapshot(result),
    /raw backend error|provider-uid|token-must/,
  )
})

test('SES-146 Secure Delivery availability failure becomes API_UNAVAILABLE', async () => {
  const h = harness({
    initialUser: user(),
  })

  const controller =
    createTeacherAuthSessionController({
      env: ENV,
      firebaseSdk: h.sdk,
      async connectSecureDelivery() {
        const error =
          new Error('network internals')
        error.status = 503
        throw error
      },
    })

  const result =
    await controller.start()

  assert.equal(
    result.state,
    TEACHER_AUTH_STATE
      .API_UNAVAILABLE,
  )
  assert.equal(
    result.reason,
    'secure-delivery-unavailable',
  )
  assert.doesNotMatch(
    publicSnapshot(result),
    /network internals|provider-uid|token-must/,
  )
})

test('SES-146 signOut revokes authority and returns to SIGNED_OUT', async () => {
  const h = harness({
    initialUser: user(),
  })
  let revoked = 0

  const controller =
    createTeacherAuthSessionController({
      env: ENV,
      firebaseSdk: h.sdk,
      async connectSecureDelivery() {
        return Object.freeze({
          composition:
            Object.freeze({
              marker: 'ready',
            }),
          getIdToken: user().getIdToken,
        })
      },
      onAuthorityRevoked() {
        revoked += 1
      },
    })

  await controller.start()
  const result =
    await controller.signOut()

  assert.equal(h.calls.signOut, 1)
  assert.equal(revoked, 1)
  assert.equal(
    result.state,
    TEACHER_AUTH_STATE.SIGNED_OUT,
  )
  assert.doesNotMatch(
    publicSnapshot(result),
    /provider-uid|token-must/,
  )
})

test('ACCOUNT-PROD-03 connection without request-time ID-token provider fails closed before READY', async () => {
  const h = harness({
    initialUser: user(),
  })
  let readyCalls = 0

  const controller =
    createTeacherAuthSessionController({
      env: ENV,
      firebaseSdk: h.sdk,
      async connectSecureDelivery() {
        return Object.freeze({
          composition:
            Object.freeze({
              marker: 'ready-without-token-provider',
            }),
        })
      },
      onReady() {
        readyCalls += 1
      },
    })

  const result =
    await controller.start()

  assert.equal(
    result.state,
    TEACHER_AUTH_STATE.API_UNAVAILABLE,
  )
  assert.equal(
    result.reason,
    'secure-delivery-unavailable',
  )
  assert.equal(readyCalls, 0)
})
