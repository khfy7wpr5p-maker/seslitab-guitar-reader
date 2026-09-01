import test from 'node:test'
import assert from 'node:assert/strict'

import {
  SCORE_RENDER_DIAGNOSTIC,
  SCORE_RENDER_MISS_REASONS,
  SCORE_VIEW_MAX_MUSICXML_BYTES,
  SCORE_VIEW_MAX_PART_ID_CHARS,
  ST_SCORE_RENDERER_CONTRACT_VERSION,
  ST_SCORE_RENDERER_REVIEWED_REVISION,
  clearScoreHighlights,
  clearScoreView,
  getCurrentScoreRenderEvidence,
  highlightScoreNote,
  hitTestScoreNote,
  hitTestScoreNoteDetailed,
  moveScoreCursor,
  renderScoreView,
  resolveStScoreRuntime,
  validateScoreCursorTarget,
  validateScoreViewMusicXml,
} from '../src/services/scoreRendererConsumer.js'

test('score renderer consumer pins the reviewed ST boundary', () => {
  assert.equal(ST_SCORE_RENDERER_CONTRACT_VERSION, '0.2.0')
  assert.equal(ST_SCORE_RENDERER_REVIEWED_REVISION, 'a8961e0e68a950cbe980162e23c09f23f0ce5d0a')
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

test('runtime resolution requires the reviewed detailed-hit ST-owned host shape', () => {
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

test('renderScoreView records exact current renderEpoch/source correlation', async () => {
  let captured = null
  const host = {
    async renderMusicXml(payload) {
      captured = payload
      return { renderEpoch: 'render-1', sourceId: 'workstation:42' }
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

  assert.deepEqual(result, { renderEpoch: 'render-1', sourceId: 'workstation:42' })
  assert.deepEqual(getCurrentScoreRenderEvidence(host), { renderEpoch: 'render-1', sourceId: 'workstation:42' })
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

test('renderScoreView fails closed if successful renderer result lacks freshness evidence', async () => {
  const host = { async renderMusicXml() { return { ok: true } } }
  await assert.rejects(() => renderScoreView(host, '<score-partwise/>'), /renderEpoch\/source evidence/)
  assert.equal(getCurrentScoreRenderEvidence(host), null)
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

test('detailed hit accepts only current renderEpoch plus source correlation', async () => {
  const ref = { partId: 'P1', measureIndex: 0, noteIndex: 2, voice: 1 }
  const host = {
    async renderMusicXml() { return { renderEpoch: 'render-1', sourceId: 'workstation:7' } },
    hitTestNoteDetailed(point) {
      assert.deepEqual(point, { clientX: 10, clientY: 20 })
      return { kind: 'HIT', renderEpoch: 'render-1', sourceId: 'workstation:7', target: ref }
    },
  }
  await renderScoreView(host, '<score-partwise/>', { ticket: '7' })
  assert.deepEqual(hitTestScoreNoteDetailed(host, { clientX: 10, clientY: 20 }), {
    kind: 'HIT', renderEpoch: 'render-1', sourceId: 'workstation:7', target: ref,
  })
  assert.deepEqual(hitTestScoreNote(host, { clientX: 10, clientY: 20 }), ref)

  host.hitTestNoteDetailed = () => ({ kind: 'HIT', renderEpoch: 'render-1', sourceId: 'workstation:6', target: ref })
  const stale = hitTestScoreNoteDetailed(host, { clientX: 1, clientY: 2 })
  assert.equal(stale.kind, 'STALE')
  assert.equal(stale.diagnosticCode, SCORE_RENDER_DIAGNOSTIC.STALE_RENDER)
  assert.equal(stale.renderEpochMatch, true)
  assert.equal(stale.sourceCorrelationMatch, false)
  assert.equal(hitTestScoreNote(host, { clientX: 1, clientY: 2 }), null)
})

test('all five renderer MISS reasons remain distinct diagnostics', async () => {
  let reason = SCORE_RENDER_MISS_REASONS[0]
  const host = {
    async renderMusicXml() { return { renderEpoch: 'render-1', sourceId: 'workstation:3' } },
    hitTestNoteDetailed() { return { kind: 'MISS', renderEpoch: 'render-1', sourceId: 'workstation:3', reason } },
  }
  await renderScoreView(host, '<score-partwise/>', { ticket: '3' })
  for (const current of SCORE_RENDER_MISS_REASONS) {
    reason = current
    const result = hitTestScoreNoteDetailed(host, { clientX: 5, clientY: 6 })
    assert.equal(result.kind, 'MISS')
    assert.equal(result.reason, current)
    assert.equal(result.diagnosticCode, SCORE_RENDER_DIAGNOSTIC[current])
  }
  reason = 'UNKNOWN_REASON'
  assert.deepEqual(hitTestScoreNoteDetailed(host, { clientX: 5, clientY: 6 }), {
    kind: 'INVALID', diagnosticCode: SCORE_RENDER_DIAGNOSTIC.INVALID_EVIDENCE,
  })
})

test('note highlight accepts exact voice-present or voice-omitted ScoreNoteRef without adding identity', async () => {
  const ref = { partId: 'P1', measureIndex: 0, noteIndex: 2, voice: 1 }
  const omitted = { partId: 'P1', measureIndex: 0, noteIndex: 2 }
  let highlightPayload = null
  let cleared = 0
  const host = {
    async highlight(payload) { highlightPayload = payload },
    async clearHighlights() { cleared += 1 },
  }

  await highlightScoreNote(host, ref)
  assert.deepEqual(highlightPayload, { target: ref, className: 'seslitab-note-focus' })
  await highlightScoreNote(host, omitted)
  assert.deepEqual(highlightPayload, { target: omitted, className: 'seslitab-note-focus' })
  assert.equal(await clearScoreHighlights(host), true)
  assert.equal(cleared, 1)
  await assert.rejects(() => highlightScoreNote(host, { ...ref, pitch: 'C4' }), TypeError)
})

test('renderScoreView rejects missing runtime and malformed tickets', async () => {
  await assert.rejects(() => renderScoreView(null, '<score-partwise/>'), TypeError)
  await assert.rejects(
    () => renderScoreView({ renderMusicXml() {} }, '<score-partwise/>', { ticket: '0' }),
    TypeError,
  )
})

test('clearScoreView delegates disposal and invalidates current render evidence', async () => {
  let disposed = 0
  const host = {
    async renderMusicXml() { return { renderEpoch: 'render-1', sourceId: 'workstation:1' } },
    async dispose() { disposed += 1 },
  }
  await renderScoreView(host, '<score-partwise/>')
  assert.ok(getCurrentScoreRenderEvidence(host))
  assert.equal(await clearScoreView(host), true)
  assert.equal(disposed, 1)
  assert.equal(getCurrentScoreRenderEvidence(host), null)
  assert.equal(await clearScoreView(null), false)
})
