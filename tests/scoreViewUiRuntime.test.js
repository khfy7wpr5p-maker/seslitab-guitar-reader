import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveStScoreRuntime } from '../src/services/scoreRendererConsumer.js'

test('score view resolves only the cursor-capable ST-owned runtime host contract', () => {
  const host = {
    async renderMusicXml() {},
    async moveCursor() {},
    async dispose() {},
  }
  assert.equal(resolveStScoreRuntime({ __ST_SCORE_RENDER_HOST__: host }), host)
  assert.equal(resolveStScoreRuntime({}), null)
  assert.equal(resolveStScoreRuntime({ __ST_SCORE_RENDER_HOST__: { renderMusicXml() {}, dispose() {} } }), null)
  assert.equal(resolveStScoreRuntime({ __ST_SCORE_RENDER_HOST__: { renderMusicXml() {}, moveCursor() {} } }), null)
})
