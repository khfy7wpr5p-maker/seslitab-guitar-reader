// Provider factory — selects the active OMR provider based on config.
//
// Server-side selection order:
//   1. process.env.OMR_PROVIDER (explicit)
//   2. GATEWAY_CONFIG.defaultProvider
//   3. "mock" (safe default)

import { assertProvider } from './IOmrProvider.js'
import mockProvider from './MockProvider.js'
import audiverisProvider from './AudiverisProvider.js'
import httpOmrProvider from './HttpOmrProvider.js'
import { GATEWAY_CONFIG } from '../config/gatewayConfig.js'

const registry = { mock: mockProvider, audiveris: audiverisProvider, http: httpOmrProvider }

const envProvider = (process.env.OMR_PROVIDER || '').trim().toLowerCase()
const configuredName = envProvider || GATEWAY_CONFIG.defaultProvider || 'mock'

if (envProvider && !registry[envProvider]) {
  throw new Error(
    `Unknown OMR_PROVIDER="${envProvider}". Valid options: ${Object.keys(registry).join(', ')}. ` +
    `Falling back is disabled for explicit configuration.`
  )
}

const activeProvider = registry[configuredName] || registry.mock
assertProvider(activeProvider, configuredName)

export function getProvider() { return activeProvider }
export function getProviderByName(name) {
  const p = registry[name]
  if (!p) throw new Error(`Unknown provider: ${name}`)
  return p
}
export function getProviderName() { return configuredName }
export function listProviders() { return Object.keys(registry) }
