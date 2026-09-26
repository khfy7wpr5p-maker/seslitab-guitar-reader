import {
  createSecureDeliveryProductionHttpApp,
} from './httpApp.js'

export async function startSecureDeliveryServer({
  env = process.env,
  createHttpApp =
    createSecureDeliveryProductionHttpApp,
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
      'secure-delivery-production-invalid-port',
    )
  }

  if (
    typeof createHttpApp !== 'function' ||
    typeof listen !== 'function'
  ) {
    throw new TypeError(
      'secure-delivery-production-runtime-dependency-invalid',
    )
  }

  const { app, boundary } =
    await createHttpApp({
      env,
    })

  const server = listen(
    app,
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

  return Object.freeze({
    app,
    boundary,
    server,
    close,
    mode:
      'secure-delivery-production',
  })
}
