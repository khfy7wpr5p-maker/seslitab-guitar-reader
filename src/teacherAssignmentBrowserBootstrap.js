import {
  getApps,
  initializeApp,
} from 'firebase/app'
import {
  getAuth,
} from 'firebase/auth'

import {
  createSecureDeliveryApiClient,
} from './services/secureDeliveryApiClient.js'
import {
  createTeacherAssignmentProductionComposition,
} from './teacherAssignmentProductionComposition.js'

const DEFAULT_SECURE_DELIVERY_API_URL =
  'https://st-student-api.onrender.com/api/secure-delivery/v1'
const FIREBASE_APP_NAME =
  'seslitab-teacher-assignment'

function envText(env, name) {
  const value = env?.[name]
  return typeof value === 'string'
    ? value.trim()
    : ''
}

function defaultSdk() {
  return Object.freeze({
    getApps,
    initializeApp,
    getAuth,
  })
}

function firebaseConfig(env) {
  const apiKey =
    envText(
      env,
      'VITE_SESLITAB_FIREBASE_API_KEY',
    )
  const authDomain =
    envText(
      env,
      'VITE_SESLITAB_FIREBASE_AUTH_DOMAIN',
    )
  const projectId =
    envText(
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

function unavailable(reason) {
  return Object.freeze({
    ok: false,
    reason,
    composition: null,
    secureDeliveryClient: null,
  })
}

export async function createTeacherAssignmentBrowserComposition({
  env = import.meta.env,
  firebaseSdk = defaultSdk(),
  fetchImpl = globalThis.fetch,
  now = () => new Date().toISOString(),
  createDraftId,
  root = globalThis.document,
  onAuthFailure = () => {},
} = {}) {
  if (typeof onAuthFailure !== 'function') {
    throw new TypeError(
      'onAuthFailure must be a function.',
    )
  }

  const config = firebaseConfig(env)
  if (!config) {
    return unavailable(
      'firebase-config-unavailable',
    )
  }

  if (
    typeof firebaseSdk.initializeApp !==
      'function' ||
    typeof firebaseSdk.getAuth !==
      'function'
  ) {
    throw new TypeError(
      'firebaseSdk must provide initializeApp() and getAuth().',
    )
  }

  const app =
    existingApp(firebaseSdk) ??
    firebaseSdk.initializeApp(
      config,
      FIREBASE_APP_NAME,
    )
  const auth =
    firebaseSdk.getAuth(app)

  if (
    typeof auth?.authStateReady ===
      'function'
  ) {
    await auth.authStateReady()
  }

  const user = auth?.currentUser
  const teacherId =
    typeof user?.uid === 'string'
      ? user.uid.trim()
      : ''

  if (
    teacherId.length === 0 ||
    typeof user?.getIdToken !== 'function'
  ) {
    return unavailable(
      'teacher-auth-required',
    )
  }

  const baseUrl =
    envText(
      env,
      'VITE_SESLITAB_SECURE_DELIVERY_API_URL',
    ) ||
    DEFAULT_SECURE_DELIVERY_API_URL

  async function getIdToken() {
    const current =
      auth?.currentUser
    if (
      current?.uid !== teacherId ||
      typeof current?.getIdToken !==
        'function'
    ) {
      throw new Error(
        'teacher-auth-required',
      )
    }
    return current.getIdToken()
  }

  const secureDeliveryClient =
    createSecureDeliveryApiClient({
      baseUrl,
      fetchImpl,
      onAuthFailure,
      getIdToken,
    })

  const composition =
    createTeacherAssignmentProductionComposition({
      authenticatedTeacher:
        Object.freeze({ teacherId }),
      secureDeliveryClient,
      now,
      createDraftId,
    })

  return Object.freeze({
    ok: true,
    reason: null,
    composition,
    secureDeliveryClient,
    getIdToken,
  })
}
