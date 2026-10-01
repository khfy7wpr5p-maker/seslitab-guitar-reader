import {
  getApps,
  initializeApp,
} from 'firebase/app'
import {
  browserSessionPersistence,
  getAuth,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth'

import {
  createTeacherAssignmentBrowserComposition,
} from './teacherAssignmentBrowserBootstrap.js'

const FIREBASE_APP_NAME =
  'seslitab-teacher-assignment'
const DEFAULT_SECURE_DELIVERY_API_URL =
  'https://st-student-api.onrender.com/api/secure-delivery/v1'

export const TEACHER_AUTH_STATE =
  Object.freeze({
    BOOTSTRAPPING: 'BOOTSTRAPPING',
    CONFIG_UNAVAILABLE:
      'CONFIG_UNAVAILABLE',
    SIGNED_OUT: 'SIGNED_OUT',
    SIGNING_IN: 'SIGNING_IN',
    AUTHENTICATED: 'AUTHENTICATED',
    CONNECTING_SECURE_DELIVERY:
      'CONNECTING_SECURE_DELIVERY',
    READY: 'READY',
    SESSION_EXPIRED:
      'SESSION_EXPIRED',
    API_UNAVAILABLE:
      'API_UNAVAILABLE',
  })

function envText(env, name) {
  const value = env?.[name]
  return typeof value === 'string'
    ? value.trim()
    : ''
}

function firebaseConfig(env) {
  const apiKey = envText(
    env,
    'VITE_SESLITAB_FIREBASE_API_KEY',
  )
  const authDomain = envText(
    env,
    'VITE_SESLITAB_FIREBASE_AUTH_DOMAIN',
  )
  const projectId = envText(
    env,
    'VITE_SESLITAB_FIREBASE_PROJECT_ID',
  )
  if (!apiKey || !authDomain || !projectId) {
    return null
  }
  return Object.freeze({
    apiKey,
    authDomain,
    projectId,
  })
}

function defaultSdk() {
  return Object.freeze({
    browserSessionPersistence,
    getApps,
    initializeApp,
    getAuth,
    setPersistence,
    signInWithEmailAndPassword,
    signOut: firebaseSignOut,
  })
}

function existingApp(sdk) {
  const apps =
    typeof sdk.getApps === 'function'
      ? sdk.getApps()
      : []
  return Array.isArray(apps)
    ? apps.find(
        (app) =>
          app?.name === FIREBASE_APP_NAME,
      ) ?? null
    : null
}

function safeSnapshot(state, reason = null) {
  return Object.freeze({
    state,
    reason,
  })
}

function isInvalidCredential(error) {
  return new Set([
    'auth/invalid-credential',
    'auth/invalid-email',
    'auth/user-not-found',
    'auth/wrong-password',
  ]).has(error?.code)
}

function isExpiredSession(error) {
  return (
    error?.status === 401 ||
    error?.code === 'SESSION_EXPIRED' ||
    error?.code ===
      'secure-delivery-auth-token-invalid' ||
    error?.message ===
      'teacher-auth-required'
  )
}

async function defaultConnectSecureDelivery({
  env,
  firebaseSdk,
  fetchImpl,
  now,
  createDraftId,
  root,
}) {
  const result =
    await createTeacherAssignmentBrowserComposition({
      env,
      firebaseSdk,
      fetchImpl,
      now,
      createDraftId,
      root,
    })

  if (result.ok !== true) {
    const error = new Error(
      'teacher-auth-required',
    )
    error.code = 'SESSION_EXPIRED'
    throw error
  }

  await result.secureDeliveryClient
    .listTeacherDeliveries()

  return Object.freeze({
    composition: result.composition,
    secureDeliveryClient:
      result.secureDeliveryClient,
  })
}

export function createTeacherAuthSessionController({
  env = import.meta.env,
  firebaseSdk = defaultSdk(),
  fetchImpl = globalThis.fetch,
  now = () => new Date().toISOString(),
  createDraftId,
  root = globalThis.document,
  connectSecureDelivery =
    defaultConnectSecureDelivery,
  onReady = () => {},
  onAuthorityRevoked = () => {},
} = {}) {
  if (
    typeof connectSecureDelivery !==
      'function'
  ) {
    throw new TypeError(
      'connectSecureDelivery must be a function.',
    )
  }
  if (typeof onReady !== 'function') {
    throw new TypeError(
      'onReady must be a function.',
    )
  }
  if (
    typeof onAuthorityRevoked !==
      'function'
  ) {
    throw new TypeError(
      'onAuthorityRevoked must be a function.',
    )
  }

  let snapshot = safeSnapshot(
    TEACHER_AUTH_STATE.BOOTSTRAPPING,
  )
  let auth = null
  let prepared = false
  let authorityGranted = false
  const listeners = new Set()

  function publish(state, reason = null) {
    snapshot = safeSnapshot(
      state,
      reason,
    )
    for (const listener of listeners) {
      listener(snapshot)
    }
    return snapshot
  }

  function revokeAuthority() {
    if (!authorityGranted) return
    authorityGranted = false
    onAuthorityRevoked()
  }

  async function prepareAuth() {
    if (prepared) {
      return auth
    }

    const config = firebaseConfig(env)
    if (!config) {
      publish(
        TEACHER_AUTH_STATE
          .CONFIG_UNAVAILABLE,
        'firebase-config-unavailable',
      )
      return null
    }

    if (
      typeof firebaseSdk.initializeApp !==
        'function' ||
      typeof firebaseSdk.getAuth !==
        'function' ||
      typeof firebaseSdk.setPersistence !==
        'function'
    ) {
      throw new TypeError(
        'firebaseSdk must provide initializeApp(), getAuth() and setPersistence().',
      )
    }

    const app =
      existingApp(firebaseSdk) ??
      firebaseSdk.initializeApp(
        config,
        FIREBASE_APP_NAME,
      )
    auth = firebaseSdk.getAuth(app)

    try {
      await firebaseSdk.setPersistence(
        auth,
        firebaseSdk
          .browserSessionPersistence,
      )
    } catch {
      publish(
        TEACHER_AUTH_STATE
          .CONFIG_UNAVAILABLE,
        'session-persistence-unavailable',
      )
      return null
    }

    prepared = true
    return auth
  }

  async function connectAuthenticated() {
    if (!auth?.currentUser) {
      revokeAuthority()
      return publish(
        TEACHER_AUTH_STATE
          .SESSION_EXPIRED,
        'session-expired',
      )
    }

    publish(
      TEACHER_AUTH_STATE.AUTHENTICATED,
    )
    publish(
      TEACHER_AUTH_STATE
        .CONNECTING_SECURE_DELIVERY,
    )

    try {
      const connection =
        await connectSecureDelivery({
          auth,
          env,
          firebaseSdk,
          fetchImpl,
          now,
          createDraftId,
          root,
          secureDeliveryBaseUrl:
            envText(
              env,
              'VITE_SESLITAB_SECURE_DELIVERY_API_URL',
            ) ||
            DEFAULT_SECURE_DELIVERY_API_URL,
        })

      if (
        !connection ||
        typeof connection !== 'object'
      ) {
        throw new Error(
          'secure-delivery-connection-invalid',
        )
      }

      authorityGranted = true
      onReady(connection)
      return publish(
        TEACHER_AUTH_STATE.READY,
      )
    } catch (error) {
      revokeAuthority()
      if (isExpiredSession(error)) {
        return publish(
          TEACHER_AUTH_STATE
            .SESSION_EXPIRED,
          'session-expired',
        )
      }
      return publish(
        TEACHER_AUTH_STATE
          .API_UNAVAILABLE,
        'secure-delivery-unavailable',
      )
    }
  }

  return Object.freeze({
    getSnapshot() {
      return snapshot
    },

    subscribe(listener) {
      if (typeof listener !== 'function') {
        throw new TypeError(
          'listener must be a function.',
        )
      }
      listeners.add(listener)
      listener(snapshot)
      return () => {
        listeners.delete(listener)
      }
    },

    async start() {
      publish(
        TEACHER_AUTH_STATE.BOOTSTRAPPING,
      )
      const preparedAuth =
        await prepareAuth()
      if (!preparedAuth) {
        return snapshot
      }

      if (
        typeof preparedAuth
          .authStateReady === 'function'
      ) {
        try {
          await preparedAuth
            .authStateReady()
        } catch {
          return publish(
            TEACHER_AUTH_STATE
              .CONFIG_UNAVAILABLE,
            'auth-state-unavailable',
          )
        }
      }

      if (!preparedAuth.currentUser) {
        revokeAuthority()
        return publish(
          TEACHER_AUTH_STATE.SIGNED_OUT,
        )
      }

      return connectAuthenticated()
    },

    async signIn({
      email,
      password,
    } = {}) {
      const preparedAuth =
        await prepareAuth()
      if (!preparedAuth) {
        return snapshot
      }
      if (
        typeof firebaseSdk
          .signInWithEmailAndPassword !==
        'function'
      ) {
        throw new TypeError(
          'firebaseSdk must provide signInWithEmailAndPassword().',
        )
      }

      revokeAuthority()
      publish(
        TEACHER_AUTH_STATE.SIGNING_IN,
      )

      try {
        await firebaseSdk
          .signInWithEmailAndPassword(
            preparedAuth,
            String(email ?? '').trim(),
            String(password ?? ''),
          )
      } catch (error) {
        return publish(
          TEACHER_AUTH_STATE.SIGNED_OUT,
          isInvalidCredential(error)
            ? 'invalid-credentials'
            : 'sign-in-unavailable',
        )
      }

      return connectAuthenticated()
    },

    async signOut() {
      const preparedAuth =
        await prepareAuth()
      revokeAuthority()

      if (
        preparedAuth &&
        typeof firebaseSdk.signOut ===
          'function'
      ) {
        try {
          await firebaseSdk.signOut(
            preparedAuth,
          )
        } catch {
          return publish(
            TEACHER_AUTH_STATE
              .API_UNAVAILABLE,
            'sign-out-unavailable',
          )
        }
      }

      return publish(
        TEACHER_AUTH_STATE.SIGNED_OUT,
      )
    },
  })
}
