import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveDiscoverySearchUrl, searchScores } from '../src/services/discoveryService.js'

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

test('discovery uses configured SesliTab gateway when frontend is on another origin', async () => {
  const previous = globalThis.__DISCOVERY_GATEWAY_URL__
  globalThis.__DISCOVERY_GATEWAY_URL__ = 'https://seslitab-omr.onrender.com'

  try {
    assert.equal(
      resolveDiscoverySearchUrl(),
      'https://seslitab-omr.onrender.com/api/v1/discovery/search',
    )

    let seenUrl = null
    const response = await searchScores(
      { query: 'Beethoven', filters: {}, limit: 10 },
      {
        fetchImpl: async (url) => {
          seenUrl = url
          return jsonResponse({
            success: true,
            data: { results: [], sourceLocators: [], totalResults: 0 },
          })
        },
      },
    )

    assert.equal(seenUrl, 'https://seslitab-omr.onrender.com/api/v1/discovery/search')
    assert.equal(response.success, true)
  } finally {
    if (previous === undefined) delete globalThis.__DISCOVERY_GATEWAY_URL__
    else globalThis.__DISCOVERY_GATEWAY_URL__ = previous
  }
})

test('discovery rejects an insecure configured remote gateway', () => {
  const previous = globalThis.__DISCOVERY_GATEWAY_URL__
  globalThis.__DISCOVERY_GATEWAY_URL__ = 'http://example.com'
  try {
    assert.equal(resolveDiscoverySearchUrl(), null)
  } finally {
    if (previous === undefined) delete globalThis.__DISCOVERY_GATEWAY_URL__
    else globalThis.__DISCOVERY_GATEWAY_URL__ = previous
  }
})
