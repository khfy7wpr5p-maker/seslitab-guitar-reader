// Stage H — bounded audible score preview routing.
//
// Package 2D remains the quality authority for definitive downstream products.
// Playback is different: when SesliTab already has a canonical NoteObject[] it
// may audibly preview exactly those notes even when OMR quality is REVIEW/BLOCK.
// Such playback is explicitly non-definitive and never upgrades quality,
// authorizes instrument outputs, approves a revision, or infers missing music.

import {
  QUALITY_GATE_DECISION,
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
  REVIEW_ACTION: 'Önizlemeyi Dinle',
  REVIEW_NOTICE: 'OMR önizlemesi — hatalar olabilir',
  REVIEW_WITHHELD_NOTICE: 'Önizleme kullanılamıyor',
  BLOCKED_NOTICE: 'Çalınabilir nota bulunamadı',
})

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

function previewRoute(reason, gate = null) {
  return frozenRoute({
    mode: STAGE_H_PLAYBACK_MODE.REVIEW_PREVIEW,
    reason,
    gate,
  })
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
    // Quality-gate availability must not remove the user's ability to hear the
    // already parsed notes. The preview remains explicitly non-definitive.
    return previewRoute('playback-quality-gate-unavailable-preview-only')
  }

  if (gate?.decision === QUALITY_GATE_DECISION.ACCEPT) {
    const exactConsumerAuthorization = (
      gate.allowed === true &&
      gate.definitive === true &&
      gate.automaticAllowed === true
    )
    if (exactConsumerAuthorization) {
      return frozenRoute({
        mode: STAGE_H_PLAYBACK_MODE.DEFINITIVE,
        reason: gate.reason,
        gate,
      })
    }

    // A malformed ACCEPT cannot be treated as definitive, but the existing
    // canonical notes may still be heard as a non-definitive preview.
    return previewRoute('quality-gate-accept-permission-mismatch-preview-only', gate)
  }

  // REVIEW and BLOCK continue to govern definitive products (Guitar TAB,
  // Violin, sharing, etc.) elsewhere. They do not suppress audible preview of
  // the exact NoteObject[] already present in SesliTab.
  return previewRoute(gate?.reason ?? 'quality-gate-non-accept-preview-only', gate ?? null)
}
