import test from 'node:test'
import assert from 'node:assert/strict'

import { createDiscoveryGatewayClient } from '../backend/services/discoveryGatewayClient.js'
import {
  buildDiscoverySearchRequest,
  renderDiscoveryResults,
} from '../src/discoveryUi.js'
import { searchScores } from '../src/services/discoveryService.js'

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

test('consumer accepts web discovery results and sanitizes source locators independently', async () => {
  const client = createDiscoveryGatewayClient({
    baseUrl: 'https://scores.example.test',
    nodeEnv: 'production',
    fetchImpl: async () => jsonResponse({
      results: [{
        id: 'songsterr:1:web',
        title: 'Cambaz',
        artist: 'Mor ve Ötesi',
        format: 'web',
        source: 'Songsterr',
        sourcePageUrl: 'https://www.songsterr.com/?pattern=Cambaz',
        assetUrl: 'https://attacker.invalid/should-not-cross.tab',
        handoffMode: 'external-open',
        rightsStatus: 'external-link-only',
        contentFeatures: ['tablature', 'chords'],
      }],
      sourceLocators: [
        {
          id: 'locator:youtube',
          source: 'YouTube',
          label: 'YouTube’da dinle',
          sourcePageUrl: 'https://www.youtube.com/results?search_query=Cambaz',
          capabilities: ['audio', 'attacker-capability'],
          queryApplied: true,
          availability: 'search-unverified',
          note: 'Dinleme kaynağı.',
        },
        {
          id: 'locator:unsafe',
          source: 'Unsafe',
          label: 'Unsafe',
          sourcePageUrl: 'http://example.test/unsafe',
          capabilities: ['notation'],
        },
      ],
      totalResults: 1,
      providerErrors: [],
    }),
  })

  const response = await client.search({ query: 'Mor ve Ötesi Cambaz' })
  assert.equal(response.results.length, 1)
  assert.equal(response.results[0].format, 'web')
  assert.equal(response.results[0].canOpenSource, true)
  assert.equal(response.results[0].canDirectImport, false)
  assert.equal(Object.hasOwn(response.results[0], 'assetUrl'), false)
  assert.equal(response.sourceLocators.length, 1)
  assert.equal(response.sourceLocators[0].source, 'YouTube')
  assert.deepEqual(response.sourceLocators[0].capabilities, ['audio'])
  assert.equal(response.sourceLocators[0].availability, 'search-unverified')
})

test('browser proxy preserves source locators returned by the SesliTab backend', async () => {
  const response = await searchScores(
    { query: 'Dönence', filters: { repertoireFamily: 'contemporary' }, limit: 20 },
    {
      fetchImpl: async () => jsonResponse({
        success: true,
        data: {
          results: [],
          sourceLocators: [{
            id: 'locator:akordefteri',
            source: 'AkorDefteri',
            label: 'AkorDefteri’de ara',
            sourcePageUrl: 'https://akordefteri.com/akorlar',
            capabilities: ['chords'],
            availability: 'search-unverified',
          }],
          totalResults: 0,
          truncated: false,
          partial: false,
        },
      }),
    },
  )

  assert.equal(response.success, true)
  assert.equal(response.results.length, 0)
  assert.equal(response.sourceLocators.length, 1)
  assert.equal(response.sourceLocators[0].source, 'AkorDefteri')
})

test('default contemporary UI request does not silently require notation', () => {
  const fields = new Map([
    ['discovery-query', { value: 'Mor ve Ötesi Cambaz' }],
    ['discovery-repertoire', { value: 'contemporary' }],
    ['discovery-scope', { value: '' }],
    ['discovery-format', { value: '' }],
    ['discovery-instrument', { value: '' }],
  ])
  const root = {
    getElementById(id) { return fields.get(id) || null },
    querySelectorAll(selector) {
      if (selector !== '[data-discovery-feature]') return []
      return [
        { checked: false, value: 'notation' },
        { checked: false, value: 'chords' },
        { checked: false, value: 'lyrics' },
        { checked: false, value: 'tablature' },
      ]
    },
  }

  const built = buildDiscoverySearchRequest(root)
  assert.equal(built.valid, true)
  assert.deepEqual(built.request.filters, { repertoireFamily: 'contemporary' })
  assert.equal(Object.hasOwn(built.request.filters, 'requiredFeatures'), false)
})

test('web result renders only an external source action while locator list stays separate', () => {
  class Element {
    constructor(tagName = 'div') {
      this.tagName = tagName.toUpperCase()
      this.children = []
      this.textContent = ''
      this.hidden = false
      this.className = ''
      this.dataset = {}
      this.attributes = {}
    }
    appendChild(child) { this.children.push(child); return child }
    setAttribute(name, value) { this.attributes[name] = String(value) }
    addEventListener() {}
  }

  const nodes = {
    'discovery-results': new Element('ul'),
    'discovery-status': new Element('div'),
    'discovery-source-section': new Element('section'),
    'discovery-source-locators': new Element('ul'),
  }
  const root = {
    createElement(tagName) { return new Element(tagName) },
    getElementById(id) { return nodes[id] || null },
  }

  const count = renderDiscoveryResults(root, {
    results: [{
      title: 'Cambaz',
      artist: 'Mor ve Ötesi',
      format: 'web',
      source: 'Songsterr',
      sourcePageUrl: 'https://www.songsterr.com/?pattern=Cambaz',
      canOpenSource: true,
      handoffMode: 'external-open',
      rightsStatus: 'external-link-only',
      contentFeatures: ['tablature'],
    }],
    sourceLocators: [{
      source: 'YouTube',
      label: 'YouTube’da dinle',
      sourcePageUrl: 'https://www.youtube.com/results?search_query=Cambaz',
      capabilities: ['audio'],
      availability: 'search-unverified',
      note: 'Dinleme kaynağı.',
    }],
    totalResults: 1,
  })

  assert.equal(count, 1)
  assert.equal(nodes['discovery-source-section'].hidden, false)
  assert.equal(nodes['discovery-source-locators'].children.length, 1)
  assert.match(nodes['discovery-status'].textContent, /1 doğrudan sonuç/)
  assert.match(nodes['discovery-status'].textContent, /1 ek kaynakta arama/)

  const resultCard = nodes['discovery-results'].children[0]
  const allDescendants = []
  const visit = (node) => {
    for (const child of node.children || []) {
      allDescendants.push(child)
      visit(child)
    }
  }
  visit(resultCard)
  assert.equal(allDescendants.filter((node) => node.tagName === 'BUTTON').length, 0)
  assert.equal(allDescendants.filter((node) => node.tagName === 'A').length, 1)
})
