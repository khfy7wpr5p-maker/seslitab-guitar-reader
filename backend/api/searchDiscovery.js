import { GATEWAY_CONFIG } from '../config/gatewayConfig.js'
import { createDiscoveryGatewayClient } from '../services/discoveryGatewayClient.js'

export async function handleSearchDiscovery({
  body,
  config = GATEWAY_CONFIG.discovery,
  fetchImpl = globalThis.fetch,
} = {}) {
  // Construct lazily per request so an invalid/disabled discovery
  // configuration never prevents the core OMR backend from starting.
  const client = createDiscoveryGatewayClient({
    baseUrl: config?.baseUrl,
    timeoutMs: config?.timeoutMs,
    maxResponseBytes: config?.maxResponseBytes,
    resultLimit: config?.resultLimit,
    fetchImpl,
  })

  return client.search(body)
}
