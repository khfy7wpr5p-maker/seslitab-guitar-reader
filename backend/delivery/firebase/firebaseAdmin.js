import {
  deleteApp,
  initializeApp,
} from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const EMULATOR_PROJECT_ID = 'demo-seslitab-td06'

export function createFirebaseAdminServices({
  emulator = false,
  projectId,
  appName = 'seslitab-secure-delivery',
} = {}) {
  if (!emulator) {
    throw new Error(
      'secure-delivery-firebase-production-not-authorized',
    )
  }
  if (projectId !== EMULATOR_PROJECT_ID) {
    throw new Error(
      'secure-delivery-firebase-emulator-project-mismatch',
    )
  }
  if (
    !process.env.FIRESTORE_EMULATOR_HOST ||
    !process.env.FIREBASE_AUTH_EMULATOR_HOST
  ) {
    throw new Error(
      'secure-delivery-firebase-emulator-hosts-required',
    )
  }

  const app = initializeApp(
    { projectId },
    appName,
  )
  const auth = getAuth(app)
  const firestore = getFirestore(app)

  return Object.freeze({
    app,
    auth,
    firestore,
    async delete() {
      await deleteApp(app)
    },
  })
}

export { EMULATOR_PROJECT_ID }
