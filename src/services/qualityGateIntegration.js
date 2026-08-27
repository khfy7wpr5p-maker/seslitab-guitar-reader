// Package 2D — Quality Gate Integration contract.
//
// Central fail-closed policy joining Package 2A canonical consumer policy with
// Package 2C quality reports. This module is deliberately consumer-agnostic;
// production entry-point wiring is a separate Package 2D slice.

import {
  CANONICAL_CONSUMER_TYPE,
  classifyCanonicalNotesForConsumer,
} from '../../canonicalConsumerPolicy.js'
import {
  CANONICAL_CONSUMER_BOUNDARY_STATUS,
  getCanonicalConsumerBoundary,
} from '../../canonicalConsumerBindings.js'
import { QUALITY_STATE } from './qualityErrorReport.js'

export const QUALITY_GATE_DECISION = Object.freeze({
  ACCEPT: 'ACCEPT',
  REVIEW: 'REVIEW',
  BLOCK: 'BLOCK',
})

export const QUALITY_GATE_REASON = Object.freeze({
  ACCEPT_VERIFIED: 'verified-structurally-valid',
  REPORT_MISSING: 'quality-report-missing',
  REPORT_UNRELIABLE: 'quality-report-unreliable',
  STRUCTURE_NOT_VALID: 'structure-not-valid',
  SOURCE_NOT_VERIFIED: 'source-not-verified',
  REVIEW_REQUIRED: 'review-required',
  CANONICAL_REVIEW: 'canonical-review-required',
  CANONICAL_BLOCKED: 'canonical-data-blocked',
  CONSUMER_BOUNDARY_PENDING: 'consumer-boundary-pending',
})

const reportsByNotes = new WeakMap()

function assertNotes(notes) {
  if (!Array.isArray(notes)) {
    throw new TypeError('Quality gate requires a NoteObject array.')
  }
}

function assertReport(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new TypeError('Quality report must be an object.')
  }
}

export function registerQualityReportForNotes(notes, report) {
  assertNotes(notes)
  assertReport(report)
  reportsByNotes.set(notes, report)
  return report
}

export function getRegisteredQualityReport(notes) {
  assertNotes(notes)
  return reportsByNotes.get(notes) ?? null
}

export function unregisterQualityReportForNotes(notes) {
  assertNotes(notes)
  return reportsByNotes.delete(notes)
}

function decisionResult({
  consumerType,
  decision,
  reason,
  report,
  classification,
  boundary,
}) {
  const accepted = decision === QUALITY_GATE_DECISION.ACCEPT
  return Object.freeze({
    consumerType,
    decision,
    reason,
    allowed: accepted,
    definitive: accepted,
    automaticAllowed: accepted,
    report,
    classification,
    boundary,
  })
}

export function resolveQualityGateForConsumer(
  notes,
  consumerType,
  options = {},
) {
  assertNotes(notes)

  const boundary = getCanonicalConsumerBoundary(consumerType)
  const classification = classifyCanonicalNotesForConsumer(notes, consumerType)
  const report = options.report ?? getRegisteredQualityReport(notes)

  if (boundary.status !== CANONICAL_CONSUMER_BOUNDARY_STATUS.MAPPED) {
    return decisionResult({
      consumerType,
      decision: QUALITY_GATE_DECISION.BLOCK,
      reason: QUALITY_GATE_REASON.CONSUMER_BOUNDARY_PENDING,
      report,
      classification,
      boundary,
    })
  }

  if (classification.blocked.length > 0) {
    return decisionResult({
      consumerType,
      decision: QUALITY_GATE_DECISION.BLOCK,
      reason: QUALITY_GATE_REASON.CANONICAL_BLOCKED,
      report,
      classification,
      boundary,
    })
  }

  if (!report) {
    return decisionResult({
      consumerType,
      decision: QUALITY_GATE_DECISION.REVIEW,
      reason: QUALITY_GATE_REASON.REPORT_MISSING,
      report: null,
      classification,
      boundary,
    })
  }

  if (
    report.qualityState === QUALITY_STATE.UNRELIABLE ||
    report.reliable === false
  ) {
    return decisionResult({
      consumerType,
      decision: QUALITY_GATE_DECISION.BLOCK,
      reason: QUALITY_GATE_REASON.REPORT_UNRELIABLE,
      report,
      classification,
      boundary,
    })
  }

  if (report.structurallyValid !== true) {
    return decisionResult({
      consumerType,
      decision: QUALITY_GATE_DECISION.BLOCK,
      reason: QUALITY_GATE_REASON.STRUCTURE_NOT_VALID,
      report,
      classification,
      boundary,
    })
  }

  if (report.sourceVerified !== true) {
    return decisionResult({
      consumerType,
      decision: QUALITY_GATE_DECISION.REVIEW,
      reason: QUALITY_GATE_REASON.SOURCE_NOT_VERIFIED,
      report,
      classification,
      boundary,
    })
  }

  if (report.reviewRequired === true) {
    return decisionResult({
      consumerType,
      decision: QUALITY_GATE_DECISION.REVIEW,
      reason: QUALITY_GATE_REASON.REVIEW_REQUIRED,
      report,
      classification,
      boundary,
    })
  }

  if (classification.review.length > 0 || classification.definitive.length !== notes.length) {
    return decisionResult({
      consumerType,
      decision: QUALITY_GATE_DECISION.REVIEW,
      reason: QUALITY_GATE_REASON.CANONICAL_REVIEW,
      report,
      classification,
      boundary,
    })
  }

  return decisionResult({
    consumerType,
    decision: QUALITY_GATE_DECISION.ACCEPT,
    reason: QUALITY_GATE_REASON.ACCEPT_VERIFIED,
    report,
    classification,
    boundary,
  })
}

export function resolveTtsQualityGate(notes, options = {}) {
  return resolveQualityGateForConsumer(notes, CANONICAL_CONSUMER_TYPE.TTS, options)
}

export function resolvePlaybackQualityGate(notes, options = {}) {
  return resolveQualityGateForConsumer(notes, CANONICAL_CONSUMER_TYPE.PLAYBACK, options)
}

export function resolveGuitarTabQualityGate(notes, options = {}) {
  return resolveQualityGateForConsumer(notes, CANONICAL_CONSUMER_TYPE.GUITAR_TAB, options)
}

export function resolveViolinQualityGate(notes, options = {}) {
  return resolveQualityGateForConsumer(notes, CANONICAL_CONSUMER_TYPE.VIOLIN, options)
}
