// Stage I — Guitar TAB + Violin product integration.
//
// This module does not create musical evidence, fingering, TAB or quality
// decisions. It combines the existing Stage G exact-consumer route with the
// existing Package 9 / Package 10 consumer result. REVIEW/BLOCK never reach an
// instrument solver. Package 12, teacher approval and student delivery remain
// separate authorities.

import {
  resolveStageGConsumerRoute,
  STAGE_G_CONSUMER,
  STAGE_G_PRODUCT_STATE,
} from './stageGProductRouting.js'
import {
  buildQualityGatedGuitarTab,
  GUITAR_TAB_CONSUMER_STATE,
} from './guitarTabConsumer.js'
import {
  buildQualityGatedViolin,
  VIOLIN_CONSUMER_STATE,
} from './violinConsumer.js'

export const STAGE_I_INSTRUMENT = Object.freeze({
  GUITAR: 'guitar',
  VIOLIN: 'violin',
})

export const STAGE_I_PRODUCT_STATE = Object.freeze({
  EMPTY: 'empty',
  AVAILABLE: 'available',
  REVIEW_REQUIRED: 'review-required',
  BLOCKED: 'blocked',
  NOT_AVAILABLE: 'not-available',
  INVALID: 'invalid',
})

export const STAGE_I_PRODUCT_COPY = Object.freeze({
  EMPTY: 'Önce bir eser açın.',
  GUITAR_AVAILABLE: 'Otomatik kontrollerden geçti · Gitar TAB hazır',
  VIOLIN_AVAILABLE: 'Otomatik kontrollerden geçti · Keman çalışma önerisi hazır',
  REVIEW_REQUIRED: 'İnceleme gerekiyor',
  BLOCKED: 'Kullanım engellendi',
  GUITAR_NOT_AVAILABLE: 'Bu eser için güvenli Gitar TAB mevcut değil.',
  VIOLIN_NOT_AVAILABLE: 'Bu eser için güvenli keman çalışma önerisi mevcut değil.',
})

const INSTRUMENT_CONFIG = Object.freeze({
  [STAGE_I_INSTRUMENT.GUITAR]: Object.freeze({
    consumer: STAGE_G_CONSUMER.GUITAR_TAB,
    build: buildQualityGatedGuitarTab,
  }),
  [STAGE_I_INSTRUMENT.VIOLIN]: Object.freeze({
    consumer: STAGE_G_CONSUMER.VIOLIN,
    build: buildQualityGatedViolin,
  }),
})

function copyFor(instrument, state) {
  if (state === STAGE_I_PRODUCT_STATE.EMPTY) return STAGE_I_PRODUCT_COPY.EMPTY
  if (state === STAGE_I_PRODUCT_STATE.REVIEW_REQUIRED) return STAGE_I_PRODUCT_COPY.REVIEW_REQUIRED
  if (state === STAGE_I_PRODUCT_STATE.BLOCKED || state === STAGE_I_PRODUCT_STATE.INVALID) {
    return STAGE_I_PRODUCT_COPY.BLOCKED
  }
  if (instrument === STAGE_I_INSTRUMENT.GUITAR) {
    return state === STAGE_I_PRODUCT_STATE.AVAILABLE
      ? STAGE_I_PRODUCT_COPY.GUITAR_AVAILABLE
      : STAGE_I_PRODUCT_COPY.GUITAR_NOT_AVAILABLE
  }
  return state === STAGE_I_PRODUCT_STATE.AVAILABLE
    ? STAGE_I_PRODUCT_COPY.VIOLIN_AVAILABLE
    : STAGE_I_PRODUCT_COPY.VIOLIN_NOT_AVAILABLE
}

function freezeResult(instrument, state, reason = null, route = null, mode = null) {
  return Object.freeze({
    instrument,
    state,
    reason,
    statusText: copyFor(instrument, state),
    actionAllowed: state === STAGE_I_PRODUCT_STATE.AVAILABLE,
    definitiveInstrumentOutput: state === STAGE_I_PRODUCT_STATE.AVAILABLE,
    mode,
    teacherReviewRequired: state === STAGE_I_PRODUCT_STATE.REVIEW_REQUIRED,
    blocked: state === STAGE_I_PRODUCT_STATE.BLOCKED || state === STAGE_I_PRODUCT_STATE.INVALID,
    // Instrument product integration is never approval/share/delivery authority.
    teacherApproved: false,
    shareAuthorized: false,
    studentDeliveryAuthorized: false,
    stageGRoute: route,
  })
}

function classifyConsumerResult(instrument, result, route) {
  if (instrument === STAGE_I_INSTRUMENT.GUITAR) {
    if (
      result?.state === GUITAR_TAB_CONSUMER_STATE.RENDERED &&
      result.allowed === true &&
      result.definitive === true &&
      typeof result.text === 'string' &&
      result.text.trim().length > 0
    ) {
      return freezeResult(instrument, STAGE_I_PRODUCT_STATE.AVAILABLE, null, route, result.mode ?? 'basic')
    }
    if (result?.state === GUITAR_TAB_CONSUMER_STATE.REVIEW_REQUIRED) {
      return freezeResult(instrument, STAGE_I_PRODUCT_STATE.REVIEW_REQUIRED, 'instrument-consumer-review-required', route)
    }
    if (result?.state === GUITAR_TAB_CONSUMER_STATE.BLOCKED) {
      return freezeResult(instrument, STAGE_I_PRODUCT_STATE.BLOCKED, 'instrument-consumer-blocked', route)
    }
    if (result?.state === GUITAR_TAB_CONSUMER_STATE.NOT_AVAILABLE) {
      return freezeResult(instrument, STAGE_I_PRODUCT_STATE.NOT_AVAILABLE, 'instrument-output-not-available', route)
    }
    return freezeResult(instrument, STAGE_I_PRODUCT_STATE.INVALID, 'instrument-consumer-invalid', route)
  }

  if (
    result?.state === VIOLIN_CONSUMER_STATE.PROJECTED &&
    result.allowed === true &&
    result.definitive === true &&
    result.teacherApproved === false
  ) {
    return freezeResult(instrument, STAGE_I_PRODUCT_STATE.AVAILABLE, null, route, result.mode ?? 'basic')
  }
  if (result?.state === VIOLIN_CONSUMER_STATE.REVIEW_REQUIRED) {
    return freezeResult(instrument, STAGE_I_PRODUCT_STATE.REVIEW_REQUIRED, 'instrument-consumer-review-required', route)
  }
  if (result?.state === VIOLIN_CONSUMER_STATE.BLOCKED) {
    return freezeResult(instrument, STAGE_I_PRODUCT_STATE.BLOCKED, 'instrument-consumer-blocked', route)
  }
  if (result?.state === VIOLIN_CONSUMER_STATE.NOT_AVAILABLE) {
    return freezeResult(instrument, STAGE_I_PRODUCT_STATE.NOT_AVAILABLE, 'instrument-output-not-available', route)
  }
  return freezeResult(instrument, STAGE_I_PRODUCT_STATE.INVALID, 'instrument-consumer-invalid', route)
}

export function resolveStageIInstrumentProduct(notes, instrument, options = {}) {
  const config = INSTRUMENT_CONFIG[instrument]
  if (!config) {
    return freezeResult(instrument, STAGE_I_PRODUCT_STATE.INVALID, 'unsupported-stage-i-instrument')
  }

  if (!Array.isArray(notes)) {
    return freezeResult(instrument, STAGE_I_PRODUCT_STATE.INVALID, 'canonical-note-array-required')
  }
  if (notes.length === 0) {
    return freezeResult(instrument, STAGE_I_PRODUCT_STATE.EMPTY, 'canonical-note-array-empty')
  }

  const routeResolver = options.resolveStageGConsumerRoute ?? resolveStageGConsumerRoute
  let route
  try {
    route = routeResolver(notes, config.consumer, options.stageGOptions ?? {})
  } catch {
    return freezeResult(instrument, STAGE_I_PRODUCT_STATE.INVALID, 'stage-g-route-resolution-failed')
  }

  if (route?.state === STAGE_G_PRODUCT_STATE.REVIEW) {
    return freezeResult(instrument, STAGE_I_PRODUCT_STATE.REVIEW_REQUIRED, route.reason ?? 'stage-g-review', route)
  }
  if (route?.state !== STAGE_G_PRODUCT_STATE.PASS) {
    return freezeResult(instrument, STAGE_I_PRODUCT_STATE.BLOCKED, route?.reason ?? 'stage-g-block', route ?? null)
  }

  // A PASS label alone is insufficient. Stage G must explicitly authorize the
  // exact consumer before Stage I may invoke Package 9/10.
  if (route.automaticProceed !== true || route.definitiveConsumerAllowed !== true) {
    return freezeResult(instrument, STAGE_I_PRODUCT_STATE.INVALID, 'stage-g-pass-permission-mismatch', route)
  }

  const builders = options.builders ?? {}
  const build = builders[instrument] ?? config.build
  let consumerResult
  try {
    consumerResult = build(notes, options.consumerOptions?.[instrument] ?? {})
  } catch {
    return freezeResult(instrument, STAGE_I_PRODUCT_STATE.INVALID, 'instrument-consumer-failed', route)
  }

  return classifyConsumerResult(instrument, consumerResult, route)
}

export function resolveStageIInstrumentProducts(notes, options = {}) {
  const guitar = resolveStageIInstrumentProduct(notes, STAGE_I_INSTRUMENT.GUITAR, options)
  const violin = resolveStageIInstrumentProduct(notes, STAGE_I_INSTRUMENT.VIOLIN, options)
  return Object.freeze({
    guitar,
    violin,
    teacherApproved: false,
    shareAuthorized: false,
    studentDeliveryAuthorized: false,
  })
}
