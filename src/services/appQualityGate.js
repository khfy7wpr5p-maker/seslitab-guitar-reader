// Package 2D — production-facing MusicXML/OMR quality-gate adapter.
//
// The app already holds the exact canonical NoteObject[] and the MusicXML that
// produced it. This adapter validates that XML, builds a Package 2C report over
// the exact same note-array identity, and registers the report for Package 2D.
// It does not touch Audiveris/provider/worker/gateway behavior.

import { validateMusicXmlStructuralRhythm } from './musicXmlStructuralValidation.js'
import { buildQualityErrorReport } from './qualityErrorReport.js'
import {
  QUALITY_GATE_DECISION,
  registerQualityReportForNotes,
  resolvePlaybackQualityGate,
  resolveTtsQualityGate,
} from './qualityGateIntegration.js'

export { QUALITY_GATE_DECISION }

export const QUALITY_GATE_USER_MESSAGE = Object.freeze({
  REVIEW: 'Bu nota verisi henüz doğrulanmadı. İnceleme tamamlanmadan kesin sesli okuma veya ritmik çalma başlatılamaz.',
  BLOCK: 'Bu nota verisinde güvenilirliği etkileyen bir sorun bulundu. Sesli okuma veya ritmik çalma güvenlik için durduruldu.',
})

function failClosedReport(notes) {
  const report = Object.freeze({
    qualityState: 'unreliable',
    structurallyValid: false,
    sourceVerified: false,
    reviewRequired: true,
    reliable: false,
    automaticPlaybackAllowed: false,
    summary: Object.freeze({
      totalFindings: 0,
      errors: 1,
      warnings: 0,
      verifiedNotes: 0,
      unverifiedNotes: Array.isArray(notes) ? notes.length : 0,
    }),
    findings: Object.freeze([]),
  })
  registerQualityReportForNotes(notes, report)
  return report
}

/**
 * Build and register a report for the exact canonical array shown by the app.
 * Validation failures become an unreliable fail-closed report; they are never
 * silently downgraded to a missing-report REVIEW state.
 */
export function prepareMusicXmlQualityGate(notes, musicXmlString) {
  if (!Array.isArray(notes)) {
    throw new TypeError('Quality gate requires a NoteObject array.')
  }
  if (typeof musicXmlString !== 'string' || musicXmlString.trim() === '') {
    return failClosedReport(notes)
  }

  try {
    const structuralResult = validateMusicXmlStructuralRhythm(musicXmlString)
    if (!structuralResult?.ok) return failClosedReport(notes)

    const report = buildQualityErrorReport(
      { notes },
      { notes, structuralResult },
    )
    registerQualityReportForNotes(notes, report)
    return report
  } catch {
    return failClosedReport(notes)
  }
}

export function resolveAppTtsGate(notes) {
  return resolveTtsQualityGate(notes)
}

export function resolveAppPlaybackGate(notes) {
  return resolvePlaybackQualityGate(notes)
}

export function qualityGateUserMessage(gate) {
  if (gate?.decision === QUALITY_GATE_DECISION.BLOCK) {
    return QUALITY_GATE_USER_MESSAGE.BLOCK
  }
  if (gate?.decision === QUALITY_GATE_DECISION.REVIEW) {
    return QUALITY_GATE_USER_MESSAGE.REVIEW
  }
  return ''
}
