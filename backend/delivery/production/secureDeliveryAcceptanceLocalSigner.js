import {
  cert,
  deleteApp,
  initializeApp,
} from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

export function createSecureDeliveryAcceptanceLocalSigner({
  projectId,
  credentialPath =
    process.env
      .GOOGLE_APPLICATION_CREDENTIALS,
  appName =
    'ses15-production-acceptance-signer',
} = {}) {
  const normalizedProjectId =
    String(projectId ?? '').trim()
  const normalizedCredentialPath =
    String(
      credentialPath ?? '',
    ).trim()

  if (!normalizedProjectId) {
    throw new Error(
      'secure-delivery-acceptance-local-signer-project-id-required',
    )
  }

  if (!normalizedCredentialPath) {
    throw new Error(
      'secure-delivery-acceptance-local-signer-credential-path-required',
    )
  }

  const app = initializeApp(
    {
      projectId:
        normalizedProjectId,
      credential:
        cert(
          normalizedCredentialPath,
        ),
    },
    appName,
  )

  return Object.freeze({
    auth: getAuth(app),
    async delete() {
      await deleteApp(app)
    },
  })
}
