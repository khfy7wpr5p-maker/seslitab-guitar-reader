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
