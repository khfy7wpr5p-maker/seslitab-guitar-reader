import {
  applicationDefault,
  cert,
  deleteApp,
  initializeApp,
} from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const EMULATOR_PROJECT_ID = 'demo-seslitab-td06'

function productionCredential(
  localServiceAccountSigning,
) {
  const credentialPath =
    String(
      process.env
        .GOOGLE_APPLICATION_CREDENTIALS ??
        '',
    ).trim()

  return (
    localServiceAccountSigning === true &&
    credentialPath.length > 0
  )
    ? cert(credentialPath)
    : applicationDefault()
}

export function createFirebaseAdminServices({
  emulator = false,
  projectId,
  appName = 'seslitab-secure-delivery',
  productionAuthorized = false,
  localServiceAccountSigning = false,
} = {}) {
  const normalizedProjectId =
    String(projectId ?? '').trim()

  if (emulator) {
    if (
      normalizedProjectId !==
        EMULATOR_PROJECT_ID
    ) {
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
  } else {
    if (productionAuthorized !== true) {
      throw new Error(
        'secure-delivery-firebase-production-not-authorized',
      )
    }
    if (
      normalizedProjectId.length === 0 ||
      normalizedProjectId ===
        EMULATOR_PROJECT_ID
    ) {
      throw new Error(
        'secure-delivery-firebase-production-project-invalid',
      )
    }
    if (
      process.env.FIRESTORE_EMULATOR_HOST ||
      process.env.FIREBASE_AUTH_EMULATOR_HOST
    ) {
      throw new Error(
        'secure-delivery-firebase-production-emulator-hosts-forbidden',
      )
    }
  }

  const app = initializeApp(
    emulator
      ? {
          projectId:
            normalizedProjectId,
        }
      : {
          projectId:
            normalizedProjectId,
          credential:
            productionCredential(
              localServiceAccountSigning,
            ),
        },
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
