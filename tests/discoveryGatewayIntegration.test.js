import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  createDiscoveryGatewayClient,
  normalizeDiscoveryGatewayBaseUrl,
} from '../backend/services/discoveryGatewayClient.js'
import { searchScores } from '../src/services/discoveryService.js'

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  })
}

test('production discovery gateway configuration requires a credential-free HTTPS root URL', () => {
  assert.equal(
    normalizeDiscoveryGatewayBaseUrl('https://scores.example.test', 'production').toString(),
    'https://scores.example.test/',
  )

  for (const value of [
    'http://scores.example.test',
    'https://user:pass@scores.example.test',
    'https://scores.example.test/path',
    'https://scores.example.test/?token=secret',
    'https://scores.example.test/#fragment',
  ]) {
    assert.throws(
      () => normalizeDiscoveryGatewayBaseUrl(value, 'production'),
      /Nota arama servisi/,
      value,
    )
  }
})

test('development permits only HTTPS or loopback HTTP discovery origins', () => {
  assert.equal(
    normalizeDiscoveryGatewayBaseUrl('http://127.0.0.1:4100', 'development').toString(),
    'http://127.0.0.1:4100/',
  )
  assert.throws(
    () => normalizeDiscoveryGatewayBaseUrl('http://192.168.1.10:4100', 'development'),
    /Güvensiz nota arama servisi adresi reddedildi/,
  )
})

test('backend client forwards only normalized search contract and clamps result count', async () => {
  let seenUrl = null
  let seenOptions = null
  const client = createDiscoveryGatewayClient({
    baseUrl: 'https://scores.example.test',
    nodeEnv: 'production',
    resultLimit: 25,
    fetchImpl: async (url, options) => {
      seenUrl = String(url)
      seenOptions = options
      return jsonResponse({ results: [], totalResults: 0, providerErrors: [] })
    },
  })

  const result = await client.search({
    query: '  Barış   Manço  ',
    filters: {
      format: 'pdf',
      catalogScope: 'turkish',
      repertoireFamily: 'contemporary',
      requiredFeatures: ['notation', 'chords', 'lyrics'],
      requiredInstruments: ['guitar'],
      attackerControlledKey: 'must-not-cross-boundary',
    },
    limit: 999,
    attackerControlledTopLevel: 'must-not-cross-boundary',
  })

  assert.equal(seenUrl, 'https://scores.example.test/v1/search')
  assert.equal(seenOptions.method, 'POST')
  assert.equal(seenOptions.redirect, 'error')
  const body = JSON.parse(seenOptions.body)
  assert.equal(body.query, 'Barış Manço')
  assert.equal(body.limit, 25)
  assert.deepEqual(body.filters, {
    format: 'pdf',
    repertoireFamily: 'contemporary',
    catalogScope: 'turkish',
    requiredFeatures: ['notation', 'chords', 'lyrics'],
    requiredInstruments: ['guitar'],
  })
  assert.equal(result.totalResults, 0)
})

test('consumer result sanitizer never exposes remote asset URLs or direct-import capability', async () => {
  const client = createDiscoveryGatewayClient({
    baseUrl: 'https://scores.example.test',
    nodeEnv: 'production',
    fetchImpl: async () => jsonResponse({
      results: [{
        id: 'provider:work:pdf',
        title: 'Example Work',
        artist: 'Example Artist',
        format: 'pdf',
        source: 'Example Provider',
        sourcePageUrl: 'https://catalog.example.test/work/1',
        assetUrl: 'https://assets.example.test/private/full-score.pdf',
        handoffMode: 'direct-import',
        rightsStatus: 'licensed',
        contentFeatures: ['notation', 'chords', 'lyrics'],
      }],
      totalResults: 1,
      providerErrors: [],
    }),
  })

  const response = await client.search({ query: 'Example Work' })
  assert.equal(response.results.length, 1)
  const result = response.results[0]
  assert.equal(Object.hasOwn(result, 'assetUrl'), false)
  assert.equal(result.canDirectImport, false)
  assert.equal(result.canOpenSource, false)
  assert.equal(result.handoffMode, 'direct-import')
})

test('external-open is exposed only for a syntactically safe HTTPS source page', async () => {
  const client = createDiscoveryGatewayClient({
    baseUrl: 'https://scores.example.test',
    nodeEnv: 'production',
    fetchImpl: async () => jsonResponse({
      results: [
        {
          id: 'safe', title: 'Safe', format: 'musicxml', source: 'Provider',
          sourcePageUrl: 'https://catalog.example.test/work/safe', handoffMode: 'external-open', rightsStatus: 'external-link-only',
        },
        {
          id: 'unsafe', title: 'Unsafe', format: 'pdf', source: 'Provider',
          sourcePageUrl: 'http://catalog.example.test/work/unsafe', handoffMode: 'external-open', rightsStatus: 'external-link-only',
        },
      ],
      providerErrors: [],
    }),
  })

  const response = await client.search({ query: 'Safe' })
  assert.equal(response.results[0].canOpenSource, true)
  assert.equal(response.results[1].sourcePageUrl, null)
  assert.equal(response.results[1].canOpenSource, false)
})

test('browser discovery service uses the same-origin SesliTab proxy and preserves no provider URL input', async () => {
  let seenUrl = null
  let seenOptions = null
  const response = await searchScores(
    { query: 'Beethoven', filters: { repertoireFamily: 'classical' }, limit: 20 },
    {
      timeoutMs: 5000,
      fetchImpl: async (url, options) => {
        seenUrl = url
        seenOptions = options
        return jsonResponse({
          success: true,
          data: { results: [], totalResults: 0, truncated: false, partial: false },
        })
      },
    },
  )

  assert.equal(seenUrl, '/api/v1/discovery/search')
  assert.equal(seenOptions.method, 'POST')
  assert.equal(response.success, true)
  assert.equal(response.totalResults, 0)
})

test('Vite entry activates discovery as an isolated UI module', () => {
  const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8')
  assert.match(main, /import '\.\/src\/discovery\.css'/)
  assert.match(main, /import '\.\/src\/discoveryUi\.js'/)

  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8')
  assert.doesNotMatch(app, /discoveryGatewayClient|SESLITAB_DISCOVERY_GATEWAY_URL/)
})
