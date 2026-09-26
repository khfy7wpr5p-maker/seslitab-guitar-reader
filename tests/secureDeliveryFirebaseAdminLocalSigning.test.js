import assert from 'node:assert/strict'
import {
  generateKeyPairSync,
} from 'node:crypto'
import {
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  createFirebaseAdminServices,
} from '../backend/delivery/firebase/firebaseAdmin.js'
import {
  createSecureDeliveryAcceptanceLocalSigner,
} from '../backend/delivery/production/secureDeliveryAcceptanceLocalSigner.js'

test('production acceptance local signer uses explicit service-account credential for local custom-token signing', async () => {
  const {
    privateKey,
  } = generateKeyPairSync(
    'rsa',
    {
      modulusLength: 2048,
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
    },
  )

  const projectId =
    'st-student-local-signing-test'
  const clientEmail =
    'local-signer@st-student-local-signing-test.iam.gserviceaccount.com'
  const directory =
    await mkdtemp(
      join(
        tmpdir(),
        'seslitab-firebase-admin-',
      ),
    )
  const credentialPath =
    join(
      directory,
      'service-account.json',
    )
  const previousCredentialPath =
    process.env
      .GOOGLE_APPLICATION_CREDENTIALS
  const previousFirestoreEmulatorHost =
    process.env
      .FIRESTORE_EMULATOR_HOST
  const previousAuthEmulatorHost =
    process.env
      .FIREBASE_AUTH_EMULATOR_HOST
  let admin

  try {
    await writeFile(
      credentialPath,
      JSON.stringify({
        type: 'service_account',
        project_id: projectId,
        private_key_id:
          'test-key-id',
        private_key: privateKey,
        client_email: clientEmail,
        client_id:
          '123456789012345678901',
        auth_uri:
          'https://accounts.google.com/o/oauth2/auth',
        token_uri:
          'https://oauth2.googleapis.com/token',
      }),
      'utf8',
    )

    process.env
      .GOOGLE_APPLICATION_CREDENTIALS =
      credentialPath
    delete process.env
      .FIRESTORE_EMULATOR_HOST
    delete process.env
      .FIREBASE_AUTH_EMULATOR_HOST

    admin =
      createSecureDeliveryAcceptanceLocalSigner({
        projectId,
        credentialPath,
        appName:
          'seslitab-local-signing-test',
      })

    const customToken =
      await admin.auth
        .createCustomToken(
          'local-signing-student',
        )

    const segments =
      customToken.split('.')
    assert.equal(
      segments.length,
      3,
    )

    const payload =
      JSON.parse(
        Buffer.from(
          segments[1],
          'base64url',
        ).toString('utf8'),
      )

    assert.equal(
      payload.iss,
      clientEmail,
    )
    assert.equal(
      payload.sub,
      clientEmail,
    )
    assert.equal(
      payload.uid,
      'local-signing-student',
    )
  } finally {
    if (admin) {
      await admin.delete()
    }

    if (
      previousCredentialPath ===
      undefined
    ) {
      delete process.env
        .GOOGLE_APPLICATION_CREDENTIALS
    } else {
      process.env
        .GOOGLE_APPLICATION_CREDENTIALS =
        previousCredentialPath
    }

    if (
      previousFirestoreEmulatorHost ===
      undefined
    ) {
      delete process.env
        .FIRESTORE_EMULATOR_HOST
    } else {
      process.env
        .FIRESTORE_EMULATOR_HOST =
        previousFirestoreEmulatorHost
    }

    if (
      previousAuthEmulatorHost ===
      undefined
    ) {
      delete process.env
        .FIREBASE_AUTH_EMULATOR_HOST
    } else {
      process.env
        .FIREBASE_AUTH_EMULATOR_HOST =
        previousAuthEmulatorHost
    }

    await rm(
      directory,
      {
        recursive: true,
        force: true,
      },
    )
  }
})


test('production Firebase Admin preserves application-default credentials unless local signing is explicitly requested', async () => {
  const projectId =
    'st-student-adc-default-test'
  const previousCredentialPath =
    process.env
      .GOOGLE_APPLICATION_CREDENTIALS
  const previousFirestoreEmulatorHost =
    process.env
      .FIRESTORE_EMULATOR_HOST
  const previousAuthEmulatorHost =
    process.env
      .FIREBASE_AUTH_EMULATOR_HOST
  let admin

  try {
    process.env
      .GOOGLE_APPLICATION_CREDENTIALS =
      '/tmp/seslitab-credential-must-not-be-read.json'
    delete process.env
      .FIRESTORE_EMULATOR_HOST
    delete process.env
      .FIREBASE_AUTH_EMULATOR_HOST

    admin =
      createFirebaseAdminServices({
        emulator: false,
        projectId,
        productionAuthorized:
          true,
        appName:
          'seslitab-adc-default-test',
      })

    assert.equal(
      admin.app.options
        .credential
        ?.constructor
        ?.name,
      'ApplicationDefaultCredential',
    )
  } finally {
    if (admin) {
      await admin.delete()
    }

    if (
      previousCredentialPath ===
      undefined
    ) {
      delete process.env
        .GOOGLE_APPLICATION_CREDENTIALS
    } else {
      process.env
        .GOOGLE_APPLICATION_CREDENTIALS =
        previousCredentialPath
    }

    if (
      previousFirestoreEmulatorHost ===
      undefined
    ) {
      delete process.env
        .FIRESTORE_EMULATOR_HOST
    } else {
      process.env
        .FIRESTORE_EMULATOR_HOST =
        previousFirestoreEmulatorHost
    }

    if (
      previousAuthEmulatorHost ===
      undefined
    ) {
      delete process.env
        .FIREBASE_AUTH_EMULATOR_HOST
    } else {
      process.env
        .FIREBASE_AUTH_EMULATOR_HOST =
        previousAuthEmulatorHost
    }
  }
})
