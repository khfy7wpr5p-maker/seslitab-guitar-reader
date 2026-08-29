import test from 'node:test'
import assert from 'node:assert/strict'

import {
  SCORE_VIEW_MAX_MUSICXML_BYTES,
  ST_SCORE_RENDERER_CONTRACT_VERSION,
  ST_SCORE_RENDERER_REVIEWED_REVISION,
  clearScoreView,
  renderScoreView,
  resolveStScoreRuntime,
  validateScoreViewMusicXml,
} from '../src/services/scoreRendererConsumer.js'

test('score renderer consumer pins the reviewed ST boundary', () => {
  assert.equal(ST_SCORE_RENDERER_CONTRACT_VERSION, '0.2.0')
  assert.equal(ST_SCORE_RENDERER_REVIEWED_REVISION, '717c0c2f32cebf11350104020d9d12ff88c59e94')
})

test('MusicXML validation is bounded and fail closed', () => {
  assert.throws(() => validateScoreViewMusicXml(null), TypeError)
  assert.throws(() => validateScoreViewMusicXml('   '), TypeError)
  assert.throws(() => validateScoreViewMusicXml('<score>\0</score>'), TypeError)
  assert.throws(
    () => validateScoreViewMusicXml('x'.repeat(SCORE_VIEW_MAX_MUSICXML_BYTES + 1)),
    RangeError,
  )
  assert.equal(validateScoreViewMusicXml('<score-partwise/>'), '<score-partwise/>')
})

test('runtime resolution accepts only the ST-owned host shape', () => {
  assert.equal(resolveStScoreRuntime({}), null)
  assert.equal(resolveStScoreRuntime({ __ST_SCORE_RENDER_HOST__: {} }), null)

  const host = {
    renderMusicXml() {},
    dispose() {},
  }
  assert.equal(resolveStScoreRuntime({ __ST_SCORE_RENDER_HOST__: host }), host)
})

test('renderScoreView forwards only the bounded ST runtime payload', async () => {
  let captured = null
  const host = {
    async renderMusicXml(payload) {
      captured = payload
      return { ok: true }
    },
    async dispose() {},
  }

  const musicxml = '<score-partwise version="4.0"></score-partwise>'
  const result = await renderScoreView(host, musicxml, {
    ticket: '42',
    pageMode: 'page',
    autoResize: false,
    drawTitle: false,
    drawComposer: false,
  })

  assert.deepEqual(result, { ok: true })
  assert.deepEqual(captured, {
    contractVersion: '0.2.0',
    musicxml,
    pageMode: 'page',
    autoResize: false,
    drawTitle: false,
    drawComposer: false,
    ticket: '42',
  })
})

test('renderScoreView rejects missing runtime and malformed tickets', async () => {
  await assert.rejects(() => renderScoreView(null, '<score-partwise/>'), TypeError)
  await assert.rejects(
    () => renderScoreView({ renderMusicXml() {} }, '<score-partwise/>', { ticket: '0' }),
    TypeError,
  )
})

test('clearScoreView delegates disposal without inventing authority', async () => {
  let disposed = 0
  const host = {
    async dispose() { disposed += 1 },
  }
  assert.equal(await clearScoreView(host), true)
  assert.equal(disposed, 1)
  assert.equal(await clearScoreView(null), false)
})
