import {
  createSecureDeliveryProductionHttpApp,
} from './httpApp.js'
import {
  runSecureDeliveryProductionAcceptance,
} from './secureDeliveryProductionAcceptance.js'
import {
  runSecureDeliveryProductionProvisioningBootstrap,
} from './secureDeliveryProductionProvisioningBootstrap.js'

function enabled(value) {
  return (
    String(value ?? '')
      .trim()
      .toLowerCase() === 'true'
  )
}

function provisioningEnabled(value) {
  const mode =
    String(value ?? '')
      .trim()
      .toLowerCase()
  return (
    mode === 'dry-run' ||
    mode === 'apply'
  )
}

function disabledResult() {
  return Object.freeze({
    ran: false,
    outcome: 'disabled',
  })
}

export async function startSecureDeliveryServer({
  env = process.env,
  createHttpApp =
    createSecureDeliveryProductionHttpApp,
  runAcceptance =
    runSecureDeliveryProductionAcceptance,
  runProvisioningBootstrap =
    runSecureDeliveryProductionProvisioningBootstrap,
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
    typeof runProvisioningBootstrap !==
      'function' ||
    typeof listen !== 'function'
  ) {
    throw new TypeError(
      'secure-delivery-production-runtime-dependency-invalid',
    )
  }

  const acceptanceRequested =
    enabled(
      env
        .SECURE_DELIVERY_PRODUCTION_ACCEPTANCE_BOOTSTRAP,
    )
  const provisioningRequested =
    provisioningEnabled(
      env
        .SECURE_DELIVERY_PRODUCTION_PROVISIONING_BOOTSTRAP,
    )

  if (
    acceptanceRequested &&
    provisioningRequested
  ) {
    throw new Error(
      'secure-delivery-production-bootstrap-modes-mutually-exclusive',
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

  let resolveProvisioning
  const provisioningPromise =
    new Promise((resolve) => {
      resolveProvisioning = resolve
    })

  const server = listen(
    app,
    port,
    '0.0.0.0',
    () => {
      console.log(
        '[Secure Delivery] production server listening',
      )

      if (!acceptanceRequested) {
        resolveAcceptance(
          disabledResult(),
        )
      } else {
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
      }

      if (!provisioningRequested) {
        resolveProvisioning(
          disabledResult(),
        )
      } else {
        Promise.resolve()
          .then(() =>
            runProvisioningBootstrap({
              env,
            }),
          )
          .catch(() => {
            console.error(
              JSON.stringify({
                event:
                  'secure_delivery_production_provisioning_bootstrap',
                outcome:
                  'failed',
              }),
            )
            return Object.freeze({
              ran: true,
              outcome: 'failed',
            })
          })
          .then(resolveProvisioning)
      }
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
    waitForProvisioning:
      () => provisioningPromise,
    mode:
      'secure-delivery-production',
  })
}
