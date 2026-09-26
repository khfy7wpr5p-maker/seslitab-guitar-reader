import {
  createPilotFirebaseTokenVerifier,
  createStudent08PilotApp,
} from './student08Pilot.js'

function commaSeparatedValues(value) {
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export async function startSecureDeliveryServer({
  env = process.env,
  createTokenVerifier =
    createPilotFirebaseTokenVerifier,
  createApp =
    createStudent08PilotApp,
  listen = (
    app,
    port,
    host,
    callback,
  ) => app.listen(
    port,
    host,
    callback,
  ),
} = {}) {
  const enabled =
    String(
      env.STUDENT08_PILOT_ENABLED ??
        '',
    ).trim().toLowerCase() === 'true'

  if (!enabled) {
    throw new Error(
      'student08-pilot-disabled',
    )
  }

  const allowedOrigin =
    String(
      env
        .STUDENT08_PILOT_ALLOWED_ORIGIN ??
        '',
    ).trim()

  const projectId =
    String(
      env
        .STUDENT08_PILOT_FIREBASE_PROJECT_ID ??
        '',
    ).trim()

  const allowedProviderSubjectHashes =
    commaSeparatedValues(
      env
        .STUDENT08_PILOT_ALLOWED_PROVIDER_SUBJECT_HASHES,
    )

  const revokedProviderSubjectHashes =
    commaSeparatedValues(
      env
        .STUDENT08_PILOT_REVOKED_PROVIDER_SUBJECT_HASHES,
    )

  const port = Number.parseInt(
    env.PORT ?? '10000',
    10,
  )

  if (
    !Number.isInteger(port) ||
    port <= 0 ||
    port > 65535
  ) {
    throw new Error(
      'student08-pilot-invalid-port',
    )
  }

  if (
    typeof createTokenVerifier !==
      'function' ||
    typeof createApp !== 'function' ||
    typeof listen !== 'function'
  ) {
    throw new TypeError(
      'student08-pilot-runtime-dependency-invalid',
    )
  }

  const tokenVerifier =
    createTokenVerifier({
      projectId,
    })

  const app = createApp({
    tokenVerifier,
    allowedOrigin,
    allowedProviderSubjectHashes,
    revokedProviderSubjectHashes,
  })

  const server = listen(
    app,
    port,
    '0.0.0.0',
    () => {
      console.log(
        `[Student08 Pilot] listening on 0.0.0.0:${port}`,
      )
    },
  )

  let closing = false

  async function close() {
    if (closing) return
    closing = true

    await new Promise((resolve) => {
      server.close(() => resolve())
    })

    await tokenVerifier.close()
  }

  return Object.freeze({
    app,
    server,
    close,
    mode: 'student08-pilot',
  })
}
