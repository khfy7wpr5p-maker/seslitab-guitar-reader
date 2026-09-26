import {
  cert,
  deleteApp,
  initializeApp,
} from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const EMULATOR_PROJECT_ID =
  'demo-seslitab-td06'

export function createProductionAcceptanceAdminServices({
  projectId,
  appName =
    'ses15-production-acceptance',
  productionAuthorized = false,
} = {}) {
  const normalizedProjectId =
    String(projectId ?? '').trim()

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

  const credentialPath =
    String(
      process.env
        .GOOGLE_APPLICATION_CREDENTIALS ??
        '',
    ).trim()

  if (credentialPath.length === 0) {
    throw new Error(
      'secure-delivery-production-acceptance-service-credential-required',
    )
  }

  const app = initializeApp(
    {
      projectId:
        normalizedProjectId,
      credential:
        cert(credentialPath),
    },
    appName,
  )
  const auth = getAuth(app)
  const firestore =
    getFirestore(app)

  return Object.freeze({
    app,
    auth,
    firestore,
    async delete() {
      await deleteApp(app)
    },
  })
}
