import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createFlatEmbedSession,
  normalizeFlatMusicXmlExport,
} from '../src/services/flatEmbedBridge.js'

const SAMPLE_XML = '<?xml version="1.0"?><score-partwise version="4.0"></score-partwise>'

test('Flat bridge loads current MusicXML and returns edited MusicXML without canonical writes', async () => {
  const calls = []

  class FakeEmbed {
    constructor(container, config) {
      calls.push(['construct', container, config])
    }

    async ready() {
      calls.push(['ready'])
    }

    async loadMusicXML(xml) {
      calls.push(['loadMusicXML', xml])
    }

    async getMusicXML(options) {
      calls.push(['getMusicXML', options])
      return SAMPLE_XML.replace('</score-partwise>', '<!-- teacher edit --></score-partwise>')
    }
  }

  const container = {}
  const session = await createFlatEmbedSession(container, {
    appId: 'test-app-id',
    EmbedCtor: FakeEmbed,
  })

  await session.loadMusicXml(SAMPLE_XML)
  const exported = await session.exportMusicXml()

  assert.equal(calls[0][0], 'construct')
  assert.equal(calls[0][2].embedParams.mode, 'edit')
  assert.equal(calls[0][2].embedParams.appId, 'test-app-id')
  assert.deepEqual(calls[1], ['ready'])
  assert.deepEqual(calls[2], ['loadMusicXML', SAMPLE_XML])
  assert.deepEqual(calls[3], ['getMusicXML', { compressed: false }])
  assert.match(exported, /teacher edit/)
})

test('Flat bridge decodes Uint8Array MusicXML exports', () => {
  const encoded = new TextEncoder().encode(SAMPLE_XML)
  assert.equal(normalizeFlatMusicXmlExport(encoded), SAMPLE_XML)
})

test('Flat bridge refuses a session without appId', async () => {
  await assert.rejects(
    () => createFlatEmbedSession({}, { appId: '', EmbedCtor: class {} }),
    /appId is required/,
  )
})
