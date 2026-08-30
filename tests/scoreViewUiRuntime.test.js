import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveStScoreRuntime } from '../src/services/scoreRendererConsumer.js'

test('score view resolves only the reviewed note-capable ST-owned runtime host contract', () => {
  const host = {
    async renderMusicXml() {},
    async moveCursor() {},
    hitTestNote() {},
    async highlight() {},
    async clearHighlights() {},
    async dispose() {},
  }
  assert.equal(resolveStScoreRuntime({ __ST_SCORE_RENDER_HOST__: host }), host)
  assert.equal(resolveStScoreRuntime({}), null)
  assert.equal(resolveStScoreRuntime({ __ST_SCORE_RENDER_HOST__: { renderMusicXml() {}, dispose() {} } }), null)
  assert.equal(resolveStScoreRuntime({ __ST_SCORE_RENDER_HOST__: { renderMusicXml() {}, moveCursor() {}, dispose() {} } }), null)
  assert.equal(resolveStScoreRuntime({ __ST_SCORE_RENDER_HOST__: { ...host, hitTestNote: undefined } }), null)
  assert.equal(resolveStScoreRuntime({ __ST_SCORE_RENDER_HOST__: { ...host, highlight: undefined } }), null)
  assert.equal(resolveStScoreRuntime({ __ST_SCORE_RENDER_HOST__: { ...host, clearHighlights: undefined } }), null)
})
