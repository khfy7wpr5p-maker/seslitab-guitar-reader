import test from 'node:test'
import assert from 'node:assert/strict'

import {
  SCORE_VIEW_MAX_MUSICXML_BYTES,
  SCORE_VIEW_MAX_PART_ID_CHARS,
  ST_SCORE_RENDERER_CONTRACT_VERSION,
  ST_SCORE_RENDERER_REVIEWED_REVISION,
  clearScoreHighlights,
  clearScoreView,
  getScoreViewRenderEpoch,
  highlightScoreNote,
  hitTestScoreNote,
  hitTestScoreNoteDetailed,
  moveScoreCursor,
  renderScoreView,
  resolveStScoreRuntime,
  validateDetailedScoreNoteHit,
  validateScoreCursorTarget,
  validateScoreRenderEpoch,
  validateScoreViewMusicXml,
} from '../src/services/scoreRendererConsumer.js'

test('score renderer consumer pins the reviewed current-render ST boundary', () => {
  assert.equal(ST_SCORE_RENDERER_CONTRACT_VERSION, '0.2.0')
  assert.equal(ST_SCORE_RENDERER_REVIEWED_REVISION, '5092ecf955b22042878b06e2677915cc18eb5f61')
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

test('runtime resolution requires detailed current-render evidence in the reviewed ST host shape', () => {
  assert.equal(resolveStScoreRuntime({}), null)
  assert.equal(resolveStScoreRuntime({ __ST_SCORE_RENDER_HOST__: {} }), null)
  assert.equal(resolveStScoreRuntime({
    __ST_SCORE_RENDER_HOST__: {
      renderMusicXml() {}, moveCursor() {}, hitTestNote() {}, highlight() {}, clearHighlights() {}, dispose() {},
    },
  }), null)

  const host = {
    renderMusicXml() {},
    moveCursor() {},
    hitTestNote() {},
    hitTestNoteDetailed() {},
    highlight() {},
    clearHighlights() {},
    dispose() {},
  }
  assert.equal(resolveStScoreRuntime({ __ST_SCORE_RENDER_HOST__: host }), host)
})

test('renderScoreView stores only a valid current render epoch from the reviewed runtime', async () => {
  let captured = null
  const host = {
    async renderMusicXml(payload) {
      captured = payload
      return { contractVersion: '0.2.0', pages: 1, renderEpoch: 'render-1', sourceId: '42' }
    },
  }

  const musicxml = '<score-partwise version="4.0"></score-partwise>'
  const result = await renderScoreView(host, musicxml, {
    ticket: '42',
    pageMode: 'page',
    autoResize: false,
    drawTitle: false,
    drawComposer: false,
  })

  assert.equal(result.renderEpoch, 'render-1')
  assert.equal(getScoreViewRenderEpoch(host), 'render-1')
  assert.deepEqual(captured, {
    contractVersion: '0.2.0',
    musicxml,
    pageMode: 'page',
    autoResize: false,
    drawTitle: false,
    drawComposer: false,
    ticket: '42',
  })

  await assert.rejects(
    () => renderScoreView({ renderMusicXml: async () => ({ ok: true }) }, musicxml),
    /render epoch/i,
  )
})

test('render epoch and detailed hit evidence validation are bounded plain-data only', () => {
  const ref = { partId: 'P1', measureIndex: 0, noteIndex: 2, voice: 1 }
  assert.equal(validateScoreRenderEpoch(' render-1 '), null)
  assert.equal(validateScoreRenderEpoch(''), null)
  assert.equal(validateScoreRenderEpoch('render-1'), 'render-1')
  assert.deepEqual(validateDetailedScoreNoteHit({ kind: 'HIT', renderEpoch: 'render-1', sourceId: '42', target: ref }), {
    kind: 'HIT', renderEpoch: 'render-1', sourceId: '42', target: ref,
  })
  assert.deepEqual(validateDetailedScoreNoteHit({ kind: 'MISS', renderEpoch: 'render-1', reason: 'AMBIGUOUS_OWNERSHIP' }), {
    kind: 'MISS', renderEpoch: 'render-1', reason: 'AMBIGUOUS_OWNERSHIP',
  })
  assert.equal(validateDetailedScoreNoteHit({ kind: 'MISS', renderEpoch: 'render-1', reason: 'NEAREST_NOTE' }), null)
  assert.equal(validateDetailedScoreNoteHit({ kind: 'HIT', renderEpoch: 'render-1', target: ref, dom: {} }), null)
})

test('current-render detailed hit succeeds while stale replacement evidence abstains', async () => {
  const ref = { partId: 'P1', measureIndex: 0, noteIndex: 2, voice: 1 }
  let epoch = 'render-1'
  const host = {
    async renderMusicXml() { return { contractVersion: '0.2.0', pages: 1, renderEpoch: epoch } },
    hitTestNoteDetailed(point) {
      assert.deepEqual(point, { clientX: 10, clientY: 20 })
      return { kind: 'HIT', renderEpoch: epoch, target: ref }
    },
    hitTestNote() { throw new Error('legacy hit path must not be used when detailed evidence exists') },
  }

  await renderScoreView(host, '<score-partwise/>', { ticket: '1' })
  assert.deepEqual(hitTestScoreNoteDetailed(host, { clientX: 10, clientY: 20 }), {
    kind: 'HIT', renderEpoch: 'render-1', target: ref,
  })
  assert.deepEqual(hitTestScoreNote(host, { clientX: 10, clientY: 20 }), ref)

  epoch = 'render-2'
  assert.deepEqual(hitTestScoreNoteDetailed(host, { clientX: 10, clientY: 20 }), {
    kind: 'STALE', expectedRenderEpoch: 'render-1', renderEpoch: 'render-2',
  })
  assert.equal(hitTestScoreNote(host, { clientX: 10, clientY: 20 }), null)
})

test('detailed miss evidence never becomes a canonical selection target', async () => {
  const host = {
    async renderMusicXml() { return { contractVersion: '0.2.0', pages: 1, renderEpoch: 'render-9' } },
    hitTestNoteDetailed() { return { kind: 'MISS', renderEpoch: 'render-9', reason: 'AMBIGUOUS_OWNERSHIP' } },
    hitTestNote() { throw new Error('legacy hit path must not be used') },
  }
  await renderScoreView(host, '<score-partwise/>', { ticket: '9' })
  assert.deepEqual(hitTestScoreNoteDetailed(host, { clientX: 1, clientY: 2 }), {
    kind: 'MISS', renderEpoch: 'render-9', reason: 'AMBIGUOUS_OWNERSHIP',
  })
  assert.equal(hitTestScoreNote(host, { clientX: 1, clientY: 2 }), null)
})

test('legacy helper remains fail-closed for isolated non-reviewed test hosts', () => {
  const ref = { partId: 'P1', measureIndex: 0, noteIndex: 2, voice: 1 }
  const host = {
    hitTestNote(point) {
      assert.deepEqual(point, { clientX: 10, clientY: 20 })
      return ref
    },
  }
  assert.deepEqual(hitTestScoreNote(host, { clientX: 10, clientY: 20 }), ref)
  assert.equal(hitTestScoreNote(host, { clientX: NaN, clientY: 20 }), null)
  assert.equal(hitTestScoreNote({ hitTestNote: () => ({ ...ref, voice: undefined }) }, { clientX: 1, clientY: 2 }), null)
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

test('highlight bridge accepts only exact bounded ScoreNoteRef values', async () => {
  const ref = { partId: 'P1', measureIndex: 0, noteIndex: 2, voice: 1 }
  let highlightPayload = null
  let cleared = 0
  const host = {
    async highlight(payload) { highlightPayload = payload },
    async clearHighlights() { cleared += 1 },
  }

  await highlightScoreNote(host, ref)
  assert.deepEqual(highlightPayload, { target: ref, className: 'seslitab-note-focus' })
  assert.equal(await clearScoreHighlights(host), true)
  assert.equal(cleared, 1)
  await assert.rejects(() => highlightScoreNote(host, { ...ref, voice: undefined }), TypeError)
})

test('renderScoreView rejects missing runtime and malformed tickets', async () => {
  await assert.rejects(() => renderScoreView(null, '<score-partwise/>'), TypeError)
  await assert.rejects(
    () => renderScoreView({ renderMusicXml() {} }, '<score-partwise/>', { ticket: '0' }),
    TypeError,
  )
})

test('clearScoreView clears current epoch before delegating disposal', async () => {
  let disposed = 0
  const host = {
    async renderMusicXml() { return { contractVersion: '0.2.0', pages: 1, renderEpoch: 'render-3' } },
    async dispose() { disposed += 1 },
  }
  await renderScoreView(host, '<score-partwise/>', { ticket: '3' })
  assert.equal(getScoreViewRenderEpoch(host), 'render-3')
  assert.equal(await clearScoreView(host), true)
  assert.equal(getScoreViewRenderEpoch(host), null)
  assert.equal(disposed, 1)
  assert.equal(await clearScoreView(null), false)
})
