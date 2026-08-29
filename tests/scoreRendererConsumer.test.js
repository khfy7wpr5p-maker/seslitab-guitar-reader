import test from 'node:test'
import assert from 'node:assert/strict'

import {
  SCORE_VIEW_MAX_MUSICXML_BYTES,
  SCORE_VIEW_MAX_PART_ID_CHARS,
  ST_SCORE_RENDERER_CONTRACT_VERSION,
  ST_SCORE_RENDERER_REVIEWED_REVISION,
  clearScoreView,
  moveScoreCursor,
  renderScoreView,
  resolveStScoreRuntime,
  validateScoreCursorTarget,
  validateScoreViewMusicXml,
} from '../src/services/scoreRendererConsumer.js'

test('score renderer consumer pins the reviewed ST boundary', () => {
  assert.equal(ST_SCORE_RENDERER_CONTRACT_VERSION, '0.2.0')
  assert.equal(ST_SCORE_RENDERER_REVIEWED_REVISION, '8b469b7f40a4dbea9c097cda49a79dff132071cb')
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

test('cursor target validation is bounded and preserves canonical locator only', () => {
  assert.throws(() => validateScoreCursorTarget(null), TypeError)
  assert.throws(() => validateScoreCursorTarget({ partId: '', measureIndex: 0 }), TypeError)
  assert.throws(
    () => validateScoreCursorTarget({ partId: 'x'.repeat(SCORE_VIEW_MAX_PART_ID_CHARS + 1), measureIndex: 0 }),
    TypeError,
  )
  assert.throws(() => validateScoreCursorTarget({ partId: 'P1', measureIndex: -1 }), RangeError)
  assert.deepEqual(validateScoreCursorTarget({ partId: ' P1 ', measureIndex: 3, ignored: true }), {
    partId: 'P1',
    measureIndex: 3,
  })
})

test('runtime resolution accepts only the cursor-capable ST-owned host shape', () => {
  assert.equal(resolveStScoreRuntime({}), null)
  assert.equal(resolveStScoreRuntime({ __ST_SCORE_RENDER_HOST__: {} }), null)
  assert.equal(resolveStScoreRuntime({
    __ST_SCORE_RENDER_HOST__: { renderMusicXml() {}, dispose() {} },
  }), null)

  const host = {
    renderMusicXml() {},
    moveCursor() {},
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
    async moveCursor() {},
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

test('moveScoreCursor forwards only bounded canonical renderer target', async () => {
  let captured = null
  const host = {
    async moveCursor(payload) {
      captured = payload
      return { ok: true }
    },
  }
  const result = await moveScoreCursor(host, { partId: ' P2 ', measureIndex: 4, ignored: 'x' })
  assert.deepEqual(result, { ok: true })
  assert.deepEqual(captured, { partId: 'P2', measureIndex: 4 })
  await assert.rejects(() => moveScoreCursor({}, { partId: 'P1', measureIndex: 0 }), TypeError)
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
