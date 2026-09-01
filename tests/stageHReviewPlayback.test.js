import test from 'node:test'
import assert from 'node:assert/strict'

import {
  STAGE_H_PLAYBACK_COPY,
  STAGE_H_PLAYBACK_MODE,
  resolveStageHPlaybackRoute,
} from '../src/services/stageHReviewPlayback.js'
import {
  QUALITY_GATE_DECISION,
  QUALITY_GATE_REASON,
} from '../src/services/qualityGateIntegration.js'

const NOTES = Object.freeze([
  Object.freeze({ partId: 'P1', measureIndex: 0, voice: 1, noteName: 'Do', beats: 1 }),
])

function gateFixture({
  decision,
  reason = 'fixture',
  allowed,
  definitive,
  automaticAllowed,
  report = null,
  blocked = [],
  boundaryStatus = 'mapped',
}) {
  const accepted = decision === QUALITY_GATE_DECISION.ACCEPT
  return Object.freeze({
    decision,
    reason,
    allowed: allowed ?? accepted,
    definitive: definitive ?? accepted,
    automaticAllowed: automaticAllowed ?? accepted,
    report,
    classification: Object.freeze({ blocked: Object.freeze([...blocked]) }),
    boundary: Object.freeze({ status: boundaryStatus }),
  })
}

test('Stage H preserves exact ACCEPT as definitive playback', () => {
  const route = resolveStageHPlaybackRoute(NOTES, {
    resolver: () => gateFixture({
      decision: QUALITY_GATE_DECISION.ACCEPT,
      reason: QUALITY_GATE_REASON.ACCEPT_VERIFIED,
    }),
  })

  assert.equal(route.mode, STAGE_H_PLAYBACK_MODE.DEFINITIVE)
  assert.equal(route.actionText, STAGE_H_PLAYBACK_COPY.DEFINITIVE_ACTION)
  assert.equal(route.noticeText, '')
  assert.equal(route.definitivePlaybackAllowed, true)
  assert.equal(route.reviewPreviewAllowed, false)
  assert.equal(route.playbackWithheld, false)
  assert.equal(route.automaticAllowed, true)
  assert.equal(route.blocked, false)
  assert.equal(route.teacherApproved, false)
  assert.equal(route.shareAuthorized, false)
  assert.equal(route.studentDeliveryAuthorized, false)
  assert.equal(Object.isFrozen(route), true)
})

test('Stage H always exposes REVIEW as non-definitive audible preview when canonical notes already exist', () => {
  const cases = [
    gateFixture({
      decision: QUALITY_GATE_DECISION.REVIEW,
      reason: QUALITY_GATE_REASON.SOURCE_NOT_VERIFIED,
      report: { structurallyValid: true, reliable: true },
    }),
    gateFixture({
      decision: QUALITY_GATE_DECISION.REVIEW,
      reason: QUALITY_GATE_REASON.REPORT_MISSING,
      report: null,
    }),
    gateFixture({
      decision: QUALITY_GATE_DECISION.REVIEW,
      reason: QUALITY_GATE_REASON.CANONICAL_REVIEW,
      report: { structurallyValid: false, reliable: false },
      blocked: [{}],
      boundaryStatus: 'pending',
    }),
  ]

  for (const gate of cases) {
    const route = resolveStageHPlaybackRoute(NOTES, { resolver: () => gate })
    assert.equal(route.mode, STAGE_H_PLAYBACK_MODE.REVIEW_PREVIEW)
    assert.equal(route.actionText, 'Önizlemeyi Dinle')
    assert.equal(route.noticeText, 'OMR önizlemesi — hatalar olabilir')
    assert.equal(route.definitivePlaybackAllowed, false)
    assert.equal(route.reviewPreviewAllowed, true)
    assert.equal(route.playbackWithheld, false)
    assert.equal(route.automaticAllowed, false)
    assert.equal(route.blocked, false)
    assert.equal(route.teacherReviewRequired, true)
    assert.equal(route.teacherApproved, false)
    assert.equal(route.shareAuthorized, false)
    assert.equal(route.studentDeliveryAuthorized, false)
  }
})

test('Stage H lets quality BLOCK remain BLOCK for products while playback stays preview-only', () => {
  const gate = gateFixture({
    decision: QUALITY_GATE_DECISION.BLOCK,
    reason: QUALITY_GATE_REASON.STRUCTURE_NOT_VALID,
    report: { structurallyValid: false, reliable: false },
    blocked: [{}],
  })
  const route = resolveStageHPlaybackRoute(NOTES, { resolver: () => gate })

  assert.equal(route.gate.decision, QUALITY_GATE_DECISION.BLOCK)
  assert.equal(route.mode, STAGE_H_PLAYBACK_MODE.REVIEW_PREVIEW)
  assert.equal(route.reviewPreviewAllowed, true)
  assert.equal(route.definitivePlaybackAllowed, false)
  assert.equal(route.playbackWithheld, false)
  assert.equal(route.blocked, false)
  assert.equal(route.noticeText, STAGE_H_PLAYBACK_COPY.REVIEW_NOTICE)
})

test('Stage H demotes malformed ACCEPT to preview instead of suppressing playback', () => {
  const route = resolveStageHPlaybackRoute(NOTES, {
    resolver: () => gateFixture({
      decision: QUALITY_GATE_DECISION.ACCEPT,
      reason: 'malformed-accept',
      automaticAllowed: false,
    }),
  })

  assert.equal(route.mode, STAGE_H_PLAYBACK_MODE.REVIEW_PREVIEW)
  assert.equal(route.reason, 'quality-gate-accept-permission-mismatch-preview-only')
  assert.equal(route.definitivePlaybackAllowed, false)
  assert.equal(route.reviewPreviewAllowed, true)
})

test('Stage H keeps audible preview available when quality-gate resolution itself fails', () => {
  const route = resolveStageHPlaybackRoute(NOTES, {
    resolver: () => { throw new Error('fixture') },
  })

  assert.equal(route.mode, STAGE_H_PLAYBACK_MODE.REVIEW_PREVIEW)
  assert.equal(route.reason, 'playback-quality-gate-unavailable-preview-only')
  assert.equal(route.reviewPreviewAllowed, true)
  assert.equal(route.playbackWithheld, false)
  assert.equal(route.gate, null)
})

test('Stage H blocks only when canonical note array itself is unavailable', () => {
  const invalid = resolveStageHPlaybackRoute(null)
  assert.equal(invalid.mode, STAGE_H_PLAYBACK_MODE.BLOCKED)
  assert.equal(invalid.reason, 'canonical-note-array-required')
  assert.equal(invalid.noticeText, 'Çalınabilir nota bulunamadı')
  assert.equal(invalid.playbackWithheld, true)
  assert.equal(invalid.reviewPreviewAllowed, false)
})
