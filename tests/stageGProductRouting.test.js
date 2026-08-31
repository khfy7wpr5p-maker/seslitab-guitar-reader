import test from 'node:test'
import assert from 'node:assert/strict'

import {
  STAGE_G_CONSUMER,
  STAGE_G_PRODUCT_STATE,
  resolveStageGConsumerRoute,
  resolveStageGProductRoutes,
} from '../src/services/stageGProductRouting.js'
import { QUALITY_GATE_DECISION } from '../src/services/qualityGateIntegration.js'

function gate(decision, reason = 'fixture') {
  return Object.freeze({ decision, reason })
}

function resolverFor(decision, reason = 'fixture') {
  return () => gate(decision, reason)
}

const NOTES = Object.freeze([])

test('Stage G maps ACCEPT to PASS without inventing approval/share authority', () => {
  const route = resolveStageGConsumerRoute(NOTES, STAGE_G_CONSUMER.PLAYBACK, {
    resolvers: {
      [STAGE_G_CONSUMER.PLAYBACK]: resolverFor(QUALITY_GATE_DECISION.ACCEPT, 'verified'),
    },
  })

  assert.equal(route.state, STAGE_G_PRODUCT_STATE.PASS)
  assert.equal(route.statusText, 'Otomatik kontrollerden geçti')
  assert.equal(route.automaticProceed, true)
  assert.equal(route.definitiveConsumerAllowed, true)
  assert.equal(route.teacherReviewRequired, false)
  assert.equal(route.blocked, false)
  assert.equal(route.teacherApproved, false)
  assert.equal(route.shareAuthorized, false)
  assert.equal(route.studentDeliveryAuthorized, false)
  assert.equal(Object.isFrozen(route), true)
})

test('Stage G maps REVIEW to teacher review and does not authorize definitive consumption', () => {
  const route = resolveStageGConsumerRoute(NOTES, STAGE_G_CONSUMER.TTS, {
    resolvers: {
      [STAGE_G_CONSUMER.TTS]: resolverFor(QUALITY_GATE_DECISION.REVIEW, 'source-not-verified'),
    },
  })

  assert.equal(route.state, STAGE_G_PRODUCT_STATE.REVIEW)
  assert.equal(route.statusText, 'Kontrol gerekiyor')
  assert.equal(route.automaticProceed, false)
  assert.equal(route.definitiveConsumerAllowed, false)
  assert.equal(route.teacherReviewRequired, true)
  assert.equal(route.blocked, false)
})

test('Stage G maps BLOCK to a hard product block', () => {
  const route = resolveStageGConsumerRoute(NOTES, STAGE_G_CONSUMER.GUITAR_TAB, {
    resolvers: {
      [STAGE_G_CONSUMER.GUITAR_TAB]: resolverFor(QUALITY_GATE_DECISION.BLOCK, 'structure-not-valid'),
    },
  })

  assert.equal(route.state, STAGE_G_PRODUCT_STATE.BLOCK)
  assert.match(route.statusText, /yapısal bir sorun/)
  assert.equal(route.automaticProceed, false)
  assert.equal(route.definitiveConsumerAllowed, false)
  assert.equal(route.teacherReviewRequired, false)
  assert.equal(route.blocked, true)
})

test('Stage G fails closed for invalid input, unknown consumers and resolver failures', () => {
  const invalid = resolveStageGConsumerRoute(null, STAGE_G_CONSUMER.PLAYBACK)
  assert.equal(invalid.state, STAGE_G_PRODUCT_STATE.BLOCK)
  assert.equal(invalid.reason, 'canonical-note-array-required')

  const unknown = resolveStageGConsumerRoute(NOTES, 'student-share')
  assert.equal(unknown.state, STAGE_G_PRODUCT_STATE.BLOCK)
  assert.equal(unknown.reason, 'unsupported-stage-g-consumer')

  const failed = resolveStageGConsumerRoute(NOTES, STAGE_G_CONSUMER.VIOLIN, {
    resolvers: {
      [STAGE_G_CONSUMER.VIOLIN]: () => { throw new Error('fixture') },
    },
  })
  assert.equal(failed.state, STAGE_G_PRODUCT_STATE.BLOCK)
  assert.equal(failed.reason, 'quality-gate-resolution-failed')
})

test('Stage G aggregate route uses the strictest existing consumer decision', () => {
  const model = resolveStageGProductRoutes(NOTES, {
    resolvers: {
      [STAGE_G_CONSUMER.TTS]: resolverFor(QUALITY_GATE_DECISION.ACCEPT),
      [STAGE_G_CONSUMER.PLAYBACK]: resolverFor(QUALITY_GATE_DECISION.REVIEW),
      [STAGE_G_CONSUMER.GUITAR_TAB]: resolverFor(QUALITY_GATE_DECISION.ACCEPT),
      [STAGE_G_CONSUMER.VIOLIN]: resolverFor(QUALITY_GATE_DECISION.BLOCK),
    },
  })

  assert.equal(model.state, STAGE_G_PRODUCT_STATE.BLOCK)
  assert.deepEqual(model.automaticConsumers, [STAGE_G_CONSUMER.TTS, STAGE_G_CONSUMER.GUITAR_TAB])
  assert.deepEqual(model.reviewConsumers, [STAGE_G_CONSUMER.PLAYBACK])
  assert.deepEqual(model.blockedConsumers, [STAGE_G_CONSUMER.VIOLIN])
  assert.equal(model.teacherApproved, false)
  assert.equal(model.shareAuthorized, false)
  assert.equal(model.studentDeliveryAuthorized, false)
  assert.equal(Object.isFrozen(model), true)
  assert.equal(Object.isFrozen(model.routes), true)
})
