// Stage H — bounded REVIEW playback preview routing.
//
// Package 2D remains the quality authority. This module never upgrades REVIEW
// to ACCEPT and never creates quality evidence. It only decides whether the
// existing playback consumer may be exposed as an explicitly non-definitive
// review preview when the existing gate already proves structural safety.

import {
  QUALITY_GATE_DECISION,
  QUALITY_GATE_REASON,
  resolvePlaybackQualityGate,
} from './qualityGateIntegration.js'

export const STAGE_H_PLAYBACK_MODE = Object.freeze({
  DEFINITIVE: 'DEFINITIVE',
  REVIEW_PREVIEW: 'REVIEW_PREVIEW',
  REVIEW_WITHHELD: 'REVIEW_WITHHELD',
  BLOCKED: 'BLOCKED',
})

export const STAGE_H_PLAYBACK_COPY = Object.freeze({
  DEFINITIVE_ACTION: 'Notaları Çal',
  REVIEW_ACTION: 'İnceleme İçin Dinle',
  REVIEW_NOTICE: 'Doğrulanmamış önizleme',
  REVIEW_WITHHELD_NOTICE: 'İnceleme için dinleme kullanılamıyor',
  BLOCKED_NOTICE: 'Kullanım engellendi',
})

const PREVIEW_REVIEW_REASONS = new Set([
  QUALITY_GATE_REASON.SOURCE_NOT_VERIFIED,
  QUALITY_GATE_REASON.REVIEW_REQUIRED,
  QUALITY_GATE_REASON.CANONICAL_REVIEW,
])

function frozenRoute({ mode, reason, gate }) {
  const definitive = mode === STAGE_H_PLAYBACK_MODE.DEFINITIVE
  const preview = mode === STAGE_H_PLAYBACK_MODE.REVIEW_PREVIEW
  const reviewWithheld = mode === STAGE_H_PLAYBACK_MODE.REVIEW_WITHHELD
  const blocked = mode === STAGE_H_PLAYBACK_MODE.BLOCKED

  return Object.freeze({
    mode,
    reason,
    actionText: preview || reviewWithheld
      ? STAGE_H_PLAYBACK_COPY.REVIEW_ACTION
      : STAGE_H_PLAYBACK_COPY.DEFINITIVE_ACTION,
    noticeText: preview
      ? STAGE_H_PLAYBACK_COPY.REVIEW_NOTICE
      : reviewWithheld
        ? STAGE_H_PLAYBACK_COPY.REVIEW_WITHHELD_NOTICE
        : blocked
          ? STAGE_H_PLAYBACK_COPY.BLOCKED_NOTICE
          : '',
    definitivePlaybackAllowed: definitive,
    reviewPreviewAllowed: preview,
    playbackWithheld: reviewWithheld || blocked,
    automaticAllowed: definitive,
    blocked,
    teacherReviewRequired: preview || reviewWithheld,
    // Stage H is presentation/playback routing only.
    teacherApproved: false,
    shareAuthorized: false,
    studentDeliveryAuthorized: false,
    gate,
  })
}

function reviewPreviewEvidenceIsSafe(gate) {
  if (gate?.decision !== QUALITY_GATE_DECISION.REVIEW) return false
  if (!PREVIEW_REVIEW_REASONS.has(gate?.reason)) return false

  // REVIEW must remain non-definitive. A malformed gate that grants any
  // definitive/automatic permission fails closed instead of being previewed.
  if (
    gate.allowed !== false ||
    gate.definitive !== false ||
    gate.automaticAllowed !== false
  ) {
    return false
  }

  // The trusted Package 2D playback boundary must already be mapped.
  if (gate.boundary?.status !== 'mapped') return false

  const report = gate.report
  if (!report || typeof report !== 'object' || Array.isArray(report)) return false
  if (report.structurallyValid !== true) return false
  if (report.reliable !== true) return false
  if (report.qualityState === 'unreliable') return false

  const blockedNotes = gate.classification?.blocked
  if (!Array.isArray(blockedNotes) || blockedNotes.length > 0) return false

  return true
}

export function resolveStageHPlaybackRoute(notes, options = {}) {
  if (!Array.isArray(notes)) {
    return frozenRoute({
      mode: STAGE_H_PLAYBACK_MODE.BLOCKED,
      reason: 'canonical-note-array-required',
      gate: null,
    })
  }

  const resolver = options.resolver ?? resolvePlaybackQualityGate
  let gate
  try {
    gate = resolver(notes, options.gateOptions ?? {})
  } catch {
    return frozenRoute({
      mode: STAGE_H_PLAYBACK_MODE.BLOCKED,
      reason: 'playback-quality-gate-resolution-failed',
      gate: null,
    })
  }

  if (gate?.decision === QUALITY_GATE_DECISION.ACCEPT) {
    const exactConsumerAuthorization = (
      gate.allowed === true &&
      gate.definitive === true &&
      gate.automaticAllowed === true
    )
    return frozenRoute({
      mode: exactConsumerAuthorization
        ? STAGE_H_PLAYBACK_MODE.DEFINITIVE
        : STAGE_H_PLAYBACK_MODE.BLOCKED,
      reason: exactConsumerAuthorization
        ? gate.reason
        : 'quality-gate-accept-permission-mismatch',
      gate,
    })
  }

  if (gate?.decision === QUALITY_GATE_DECISION.REVIEW) {
    return frozenRoute({
      mode: reviewPreviewEvidenceIsSafe(gate)
        ? STAGE_H_PLAYBACK_MODE.REVIEW_PREVIEW
        : STAGE_H_PLAYBACK_MODE.REVIEW_WITHHELD,
      reason: gate.reason ?? 'review-preview-evidence-insufficient',
      gate,
    })
  }

  return frozenRoute({
    mode: STAGE_H_PLAYBACK_MODE.BLOCKED,
    reason: gate?.reason ?? 'quality-gate-decision-missing',
    gate: gate ?? null,
  })
}
