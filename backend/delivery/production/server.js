import {
  createSecureDeliveryProductionHttpApp,
} from './httpApp.js'

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
    'secure-delivery-production-invalid-port',
  )
}

const { app, boundary } =
  await createSecureDeliveryProductionHttpApp({
    env: process.env,
  })

const server = app.listen(
  port,
  '0.0.0.0',
  () => {
    console.log(
      '[Secure Delivery] production server listening',
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

  await boundary.close()
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
