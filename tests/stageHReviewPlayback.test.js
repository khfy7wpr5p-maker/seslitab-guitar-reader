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

const NOTES = Object.freeze([])

function gateFixture({
  decision,
  reason = 'fixture',
  allowed,
  definitive,
  automaticAllowed,
  report,
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
    report: report ?? null,
    classification: Object.freeze({ blocked: Object.freeze([...blocked]) }),
    boundary: Object.freeze({ status: boundaryStatus }),
  })
}

function safeReviewGate(reason = QUALITY_GATE_REASON.SOURCE_NOT_VERIFIED) {
  return gateFixture({
    decision: QUALITY_GATE_DECISION.REVIEW,
    reason,
    report: Object.freeze({
      qualityState: 'review',
      structurallyValid: true,
      reliable: true,
      sourceVerified: false,
      reviewRequired: true,
    }),
  })
}

test('Stage H preserves ACCEPT as definitive playback', () => {
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
  assert.equal(route.automaticAllowed, true)
  assert.equal(route.blocked, false)
  assert.equal(route.teacherApproved, false)
  assert.equal(route.shareAuthorized, false)
  assert.equal(route.studentDeliveryAuthorized, false)
  assert.equal(Object.isFrozen(route), true)
})

test('Stage H exposes structurally safe REVIEW only as explicit non-definitive preview', () => {
  const route = resolveStageHPlaybackRoute(NOTES, {
    resolver: () => safeReviewGate(),
  })

  assert.equal(route.mode, STAGE_H_PLAYBACK_MODE.REVIEW_PREVIEW)
  assert.equal(route.reason, QUALITY_GATE_REASON.SOURCE_NOT_VERIFIED)
  assert.equal(route.actionText, 'İnceleme İçin Dinle')
  assert.equal(route.noticeText, 'Doğrulanmamış önizleme')
  assert.equal(route.definitivePlaybackAllowed, false)
  assert.equal(route.reviewPreviewAllowed, true)
  assert.equal(route.automaticAllowed, false)
  assert.equal(route.blocked, false)
  assert.equal(route.teacherReviewRequired, true)
  assert.equal(route.teacherApproved, false)
  assert.equal(route.shareAuthorized, false)
  assert.equal(route.studentDeliveryAuthorized, false)
})

test('Stage H permits only bounded existing REVIEW reasons for preview', () => {
  for (const reason of [
    QUALITY_GATE_REASON.SOURCE_NOT_VERIFIED,
    QUALITY_GATE_REASON.REVIEW_REQUIRED,
    QUALITY_GATE_REASON.CANONICAL_REVIEW,
  ]) {
    const route = resolveStageHPlaybackRoute(NOTES, {
      resolver: () => safeReviewGate(reason),
    })
    assert.equal(route.mode, STAGE_H_PLAYBACK_MODE.REVIEW_PREVIEW, reason)
  }

  const missingReport = resolveStageHPlaybackRoute(NOTES, {
    resolver: () => gateFixture({
      decision: QUALITY_GATE_DECISION.REVIEW,
      reason: QUALITY_GATE_REASON.REPORT_MISSING,
      report: null,
    }),
  })
  assert.equal(missingReport.mode, STAGE_H_PLAYBACK_MODE.BLOCKED)
  assert.equal(missingReport.reviewPreviewAllowed, false)
})

test('Stage H fails closed when REVIEW structural evidence is unsafe or incomplete', () => {
  const cases = [
    safeReviewGate(),
    safeReviewGate(),
    safeReviewGate(),
    safeReviewGate(),
  ].map((gate, index) => {
    if (index === 0) return { ...gate, report: { ...gate.report, structurallyValid: false } }
    if (index === 1) return { ...gate, report: { ...gate.report, reliable: false } }
    if (index === 2) return { ...gate, classification: { blocked: [{}] } }
    return { ...gate, boundary: { status: 'pending' } }
  })

  for (const gate of cases) {
    const route = resolveStageHPlaybackRoute(NOTES, { resolver: () => gate })
    assert.equal(route.mode, STAGE_H_PLAYBACK_MODE.BLOCKED)
    assert.equal(route.reviewPreviewAllowed, false)
    assert.equal(route.definitivePlaybackAllowed, false)
  }
})

test('Stage H never previews a malformed REVIEW that grants definitive permissions', () => {
  const malformed = safeReviewGate()
  const route = resolveStageHPlaybackRoute(NOTES, {
    resolver: () => ({ ...malformed, allowed: true }),
  })

  assert.equal(route.mode, STAGE_H_PLAYBACK_MODE.BLOCKED)
  assert.equal(route.reviewPreviewAllowed, false)
  assert.equal(route.definitivePlaybackAllowed, false)
})

test('Stage H keeps BLOCK hard-blocked and malformed ACCEPT fail-closed', () => {
  const blocked = resolveStageHPlaybackRoute(NOTES, {
    resolver: () => gateFixture({
      decision: QUALITY_GATE_DECISION.BLOCK,
      reason: QUALITY_GATE_REASON.STRUCTURE_NOT_VALID,
    }),
  })
  assert.equal(blocked.mode, STAGE_H_PLAYBACK_MODE.BLOCKED)
  assert.equal(blocked.noticeText, 'Kullanım engellendi')

  const malformedAccept = resolveStageHPlaybackRoute(NOTES, {
    resolver: () => gateFixture({
      decision: QUALITY_GATE_DECISION.ACCEPT,
      reason: 'malformed-accept',
      automaticAllowed: false,
    }),
  })
  assert.equal(malformedAccept.mode, STAGE_H_PLAYBACK_MODE.BLOCKED)
  assert.equal(malformedAccept.reason, 'quality-gate-accept-permission-mismatch')
})

test('Stage H fails closed for invalid notes and resolver failures', () => {
  const invalid = resolveStageHPlaybackRoute(null)
  assert.equal(invalid.mode, STAGE_H_PLAYBACK_MODE.BLOCKED)
  assert.equal(invalid.reason, 'canonical-note-array-required')

  const failed = resolveStageHPlaybackRoute(NOTES, {
    resolver: () => { throw new Error('fixture') },
  })
  assert.equal(failed.mode, STAGE_H_PLAYBACK_MODE.BLOCKED)
  assert.equal(failed.reason, 'playback-quality-gate-resolution-failed')
})
