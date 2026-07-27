// Provider factory — selects the active OMR provider based on configuration.
//
// The rest of the app imports `getOmrProvider()` from here and gets the
// currently configured provider. Switching engines is a single env-var change:
//
//   OMR_PROVIDER=mock        → mockOmrProvider (development mode, demo data)
//   OMR_PROVIDER=audiveris   → audiverisProvider (real engine, TODO)
//
// No other code knows or cares which provider is active.

import { assertProvider } from './IOmrProvider.js'
import mockOmrProvider from './mockOmrProvider.js'
import audiverisProvider from './audiverisProvider.js'

// Registry of available providers, keyed by the OMR_PROVIDER config value.
const registry = {
  mock: mockOmrProvider,
  audiveris: audiverisProvider,
  // scanScore: scanScoreProvider,   // future
  // smartScore: smartScoreProvider, // future
  // playScore: playScoreProvider,   // future
}

// Read the configured provider. Vite exposes env vars prefixed with VITE_.
const configuredName = import.meta.env.VITE_OMR_PROVIDER || 'mock'

if (!registry[configuredName]) {
  console.warn(
    `[OMR] Unknown OMR_PROVIDER="${configuredName}". Falling back to "mock". ` +
    `Valid options: ${Object.keys(registry).join(', ')}.`
  )
}

const activeProvider = registry[configuredName] || registry.mock

// Validate at startup so a broken provider fails fast.
assertProvider(activeProvider, configuredName)

/**
 * Get the currently active OMR provider.
 * @returns {IOmrProvider}
 */
export function getOmrProvider() {
  return activeProvider
}

/**
 * Get the name of the currently active provider.
 * @returns {string}
 */
export function getOmrProviderName() {
  return configuredName
}

/**
 * List all registered provider names.
 * @returns {string[]}
 */
export function listOmrProviders() {
  return Object.keys(registry)
}
