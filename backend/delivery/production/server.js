import {
  createSecureDeliveryProductionHttpApp,
} from './httpApp.js'
import {
  runSecureDeliveryProductionAcceptance,
} from './secureDeliveryProductionAcceptance.js'

function enabled(value) {
  return (
    String(value ?? '')
      .trim()
      .toLowerCase() === 'true'
  )
}

export async function startSecureDeliveryServer({
  env = process.env,
  createHttpApp =
    createSecureDeliveryProductionHttpApp,
  runAcceptance =
    runSecureDeliveryProductionAcceptance,
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
    typeof runAcceptance !== 'function' ||
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

  let resolveAcceptance
  const acceptancePromise =
    new Promise((resolve) => {
      resolveAcceptance = resolve
    })

  const server = listen(
    app,
    port,
    '0.0.0.0',
    () => {
      console.log(
        '[Secure Delivery] production server listening',
      )

      if (
        !enabled(
          env
            .SECURE_DELIVERY_PRODUCTION_ACCEPTANCE_BOOTSTRAP,
        )
      ) {
        resolveAcceptance(
          Object.freeze({
            ran: false,
            outcome: 'disabled',
          }),
        )
        return
      }

      Promise.resolve()
        .then(() =>
          runAcceptance({
            env,
            port,
          }),
        )
        .catch(() => {
          console.error(
            JSON.stringify({
              event:
                'secure_delivery_production_acceptance',
              outcome:
                'failed',
            }),
          )
          return Object.freeze({
            ran: true,
            outcome: 'failed',
          })
        })
        .then(resolveAcceptance)
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
    waitForAcceptance:
      () => acceptancePromise,
    mode:
      'secure-delivery-production',
  })
}
