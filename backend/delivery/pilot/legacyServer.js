import {
  createPilotFirebaseTokenVerifier,
  createStudent08PilotApp,
} from './student08Pilot.js'

const enabled =
  String(
    process.env.STUDENT08_PILOT_ENABLED ??
      '',
  ).trim().toLowerCase() === 'true'

if (!enabled) {
  throw new Error(
    'student08-pilot-disabled',
  )
}

const allowedOrigin =
  String(
    process.env
      .STUDENT08_PILOT_ALLOWED_ORIGIN ??
      '',
  ).trim()

const projectId =
  String(
    process.env
      .STUDENT08_PILOT_FIREBASE_PROJECT_ID ??
      '',
  ).trim()


function commaSeparatedValues(value) {
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

const allowedProviderSubjectHashes =
  commaSeparatedValues(
    process.env
      .STUDENT08_PILOT_ALLOWED_PROVIDER_SUBJECT_HASHES,
  )

const revokedProviderSubjectHashes =
  commaSeparatedValues(
    process.env
      .STUDENT08_PILOT_REVOKED_PROVIDER_SUBJECT_HASHES,
  )

const port = Number.parseInt(
  process.env.PORT ?? '10000',
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

const tokenVerifier =
  createPilotFirebaseTokenVerifier({
    projectId,
  })

const app = createStudent08PilotApp({
  tokenVerifier,
  allowedOrigin,
  allowedProviderSubjectHashes,
  revokedProviderSubjectHashes,
})

const server = app.listen(
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

for (const signal of [
  'SIGINT',
  'SIGTERM',
]) {
  process.on(signal, async () => {
    try {
      await close()
      process.exit(0)
    } catch {
      process.exit(1)
    }
  })
}
