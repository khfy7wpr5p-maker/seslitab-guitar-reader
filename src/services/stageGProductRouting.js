// Stage G — PASS / REVIEW / BLOCK product routing.
//
// This module does not create quality evidence and does not replace Package 2D.
// It maps the existing exact-consumer quality-gate decision into bounded
// product routing. Package 12 share/student authorization remains separate.

import {
  QUALITY_GATE_DECISION,
  resolveGuitarTabQualityGate,
  resolvePlaybackQualityGate,
  resolveTtsQualityGate,
  resolveViolinQualityGate,
} from './qualityGateIntegration.js'

export const STAGE_G_PRODUCT_STATE = Object.freeze({
  PASS: 'PASS',
  REVIEW: 'REVIEW',
  BLOCK: 'BLOCK',
})

export const STAGE_G_CONSUMER = Object.freeze({
  TTS: 'tts',
  PLAYBACK: 'playback',
  GUITAR_TAB: 'guitar-tab',
  VIOLIN: 'violin',
})

const DEFAULT_RESOLVERS = Object.freeze({
  [STAGE_G_CONSUMER.TTS]: resolveTtsQualityGate,
  [STAGE_G_CONSUMER.PLAYBACK]: resolvePlaybackQualityGate,
  [STAGE_G_CONSUMER.GUITAR_TAB]: resolveGuitarTabQualityGate,
  [STAGE_G_CONSUMER.VIOLIN]: resolveViolinQualityGate,
})

const PRODUCT_COPY = Object.freeze({
  [STAGE_G_PRODUCT_STATE.PASS]: 'Otomatik kontrollerden geçti',
  [STAGE_G_PRODUCT_STATE.REVIEW]: 'Kontrol gerekiyor',
  [STAGE_G_PRODUCT_STATE.BLOCK]: 'Bu eserde önce düzeltilmesi gereken yapısal bir sorun bulundu.',
})

const PRODUCT_PRIORITY = Object.freeze({
  [STAGE_G_PRODUCT_STATE.PASS]: 0,
  [STAGE_G_PRODUCT_STATE.REVIEW]: 1,
  [STAGE_G_PRODUCT_STATE.BLOCK]: 2,
})

export function stageGProductCopy(state) {
  return PRODUCT_COPY[state] ?? PRODUCT_COPY[STAGE_G_PRODUCT_STATE.BLOCK]
}

function stateForGate(gate) {
  if (gate?.decision === QUALITY_GATE_DECISION.ACCEPT) return STAGE_G_PRODUCT_STATE.PASS
  if (gate?.decision === QUALITY_GATE_DECISION.REVIEW) return STAGE_G_PRODUCT_STATE.REVIEW
  return STAGE_G_PRODUCT_STATE.BLOCK
}

function frozenRoute({ consumer, state, reason, gate }) {
  const pass = state === STAGE_G_PRODUCT_STATE.PASS
  const review = state === STAGE_G_PRODUCT_STATE.REVIEW
  const block = state === STAGE_G_PRODUCT_STATE.BLOCK
  return Object.freeze({
    consumer,
    state,
    reason,
    statusText: stageGProductCopy(state),
    automaticProceed: pass,
    definitiveConsumerAllowed: pass,
    teacherReviewRequired: review,
    blocked: block,
    // Product routing is not approval, sharing, or student delivery authority.
    teacherApproved: false,
    shareAuthorized: false,
    studentDeliveryAuthorized: false,
    gate,
  })
}

export function resolveStageGConsumerRoute(notes, consumer, options = {}) {
  if (!Array.isArray(notes)) {
    return frozenRoute({
      consumer,
      state: STAGE_G_PRODUCT_STATE.BLOCK,
      reason: 'canonical-note-array-required',
      gate: null,
    })
  }

  const baseResolver = DEFAULT_RESOLVERS[consumer]
  if (!baseResolver) {
    return frozenRoute({
      consumer,
      state: STAGE_G_PRODUCT_STATE.BLOCK,
      reason: 'unsupported-stage-g-consumer',
      gate: null,
    })
  }

  const resolver = options.resolvers?.[consumer] ?? baseResolver
  let gate
  try {
    gate = resolver(notes, options.gateOptions?.[consumer] ?? {})
  } catch {
    return frozenRoute({
      consumer,
      state: STAGE_G_PRODUCT_STATE.BLOCK,
      reason: 'quality-gate-resolution-failed',
      gate: null,
    })
  }

  const state = stateForGate(gate)
  return frozenRoute({
    consumer,
    state,
    reason: gate?.reason ?? 'quality-gate-decision-missing',
    gate: gate ?? null,
  })
}

export function resolveStageGProductRoutes(notes, options = {}) {
  const consumers = Array.isArray(options.consumers) && options.consumers.length > 0
    ? [...options.consumers]
    : Object.values(STAGE_G_CONSUMER)

  const routes = consumers.map((consumer) => resolveStageGConsumerRoute(notes, consumer, options))
  let overallState = STAGE_G_PRODUCT_STATE.PASS
  for (const route of routes) {
    if (PRODUCT_PRIORITY[route.state] > PRODUCT_PRIORITY[overallState]) {
      overallState = route.state
    }
  }

  return Object.freeze({
    state: overallState,
    statusText: stageGProductCopy(overallState),
    automaticConsumers: Object.freeze(
      routes.filter((route) => route.automaticProceed).map((route) => route.consumer),
    ),
    reviewConsumers: Object.freeze(
      routes.filter((route) => route.teacherReviewRequired).map((route) => route.consumer),
    ),
    blockedConsumers: Object.freeze(
      routes.filter((route) => route.blocked).map((route) => route.consumer),
    ),
    routes: Object.freeze(routes),
    // Aggregate product state still cannot authorize Package 12 operations.
    teacherApproved: false,
    shareAuthorized: false,
    studentDeliveryAuthorized: false,
  })
}
