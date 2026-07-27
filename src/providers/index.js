// Provider factory — selects the active OMR provider based on configuration.

import { assertProvider } from './IOmrProvider.js'
import mockOmrProvider from './mockOmrProvider.js'
import audiverisProvider from './audiverisProvider.js'
import gatewayProvider from './gatewayProvider.js'

const registry = {
  mock: mockOmrProvider,
  audiveris: audiverisProvider,
  gateway: gatewayProvider,
}

const configuredName = (import.meta.env && import.meta.env.VITE_OMR_PROVIDER) || 'gateway'

if (!registry[configuredName]) {
  console.warn(
    `[OMR] Unknown OMR_PROVIDER="${configuredName}". Falling back to "mock". ` +
    `Valid options: ${Object.keys(registry).join(', ')}.`
  )
}

const activeProvider = registry[configuredName] || registry.mock
assertProvider(activeProvider, configuredName)

let overrideProvider = null
export function getOmrProvider() { return overrideProvider || activeProvider }
export function setOmrProvider(p) { overrideProvider = p }
export function resetOmrProvider() { overrideProvider = null }
export function getOmrProviderName() { return configuredName }
export function listOmrProviders() { return Object.keys(registry) }
