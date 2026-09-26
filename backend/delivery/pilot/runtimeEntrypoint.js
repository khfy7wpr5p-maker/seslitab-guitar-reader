export function selectSecureDeliveryServerModule(
  env = process.env,
) {
  const active =
    String(
      env
        .SECURE_DELIVERY_PRODUCTION_ACTIVATION ??
        '',
    )
      .trim()
      .toLowerCase() === 'true'

  return active
    ? '../production/server.js'
    : './legacyServer.js'
}

export async function startSelectedSecureDeliveryServer({
  env = process.env,
  importModule = (modulePath) =>
    import(modulePath),
} = {}) {
  if (typeof importModule !== 'function') {
    throw new TypeError(
      'secure-delivery-runtime-importer-required',
    )
  }

  const modulePath =
    selectSecureDeliveryServerModule(env)
  const runtime =
    await importModule(modulePath)

  if (
    !runtime ||
    typeof runtime
      .startSecureDeliveryServer !==
      'function'
  ) {
    throw new Error(
      'secure-delivery-runtime-start-function-required',
    )
  }

  return runtime
    .startSecureDeliveryServer({
      env,
    })
}
