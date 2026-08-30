// Stage D — read-only quality overlay projection.
//
// This module projects the exact Package 2C report already bound to the exact
// canonical NoteObject[] identity. It does not infer musical truth, repair
// findings, or manufacture note-level identity that the report does not carry.

import { getRegisteredQualityReport } from './qualityGateIntegration.js'
import { QUALITY_ERROR_CODE, QUALITY_STATE } from './qualityErrorReport.js'

export const QUALITY_OVERLAY_STATE = Object.freeze({
  PASS: 'PASS',
  REVIEW: 'REVIEW',
  BLOCK: 'BLOCK',
})

const LABELS = Object.freeze({
  [QUALITY_ERROR_CODE.MEASURE_DURATION_MISMATCH]: 'Ölçü süresi beklenen yapıyla uyuşmuyor.',
  [QUALITY_ERROR_CODE.INVALID_DIVISIONS]: 'Ritim bölümlendirmesi geçerli değil.',
  [QUALITY_ERROR_CODE.TUPLET_INCOMPLETE]: 'Tuplet yapısı eksik veya tutarsız.',
  [QUALITY_ERROR_CODE.TIE_ORPHAN]: 'Bağ işaretinde eşleşmeyen başlangıç veya bitiş var.',
  [QUALITY_ERROR_CODE.VOICE_OVERLAP]: 'Aynı seste zaman çakışması bulundu.',
  [QUALITY_ERROR_CODE.SOURCE_NOT_VERIFIED]: 'Bu müzikal veri için kaynak doğrulaması tamamlanmadı.',
  [QUALITY_ERROR_CODE.OMR_NOTE_MISSING_SUSPECTED]: 'Bu ölçüde OMR tarafından atlanmış zamanlı bir olay olabilir.',
  [QUALITY_ERROR_CODE.PITCH_OUTPUT_MISMATCH]: 'Nota perdesi temsilleri birbiriyle uyuşmuyor.',
})

function freezeList(values) {
  return Object.freeze(values)
}

function overlayStateForReport(report) {
  if (!report) return QUALITY_OVERLAY_STATE.REVIEW
  if (
    report.qualityState === QUALITY_STATE.UNRELIABLE ||
    report.reliable === false ||
    report.structurallyValid !== true
  ) {
    return QUALITY_OVERLAY_STATE.BLOCK
  }
  if (report.sourceVerified !== true || report.reviewRequired === true) {
    return QUALITY_OVERLAY_STATE.REVIEW
  }
  return QUALITY_OVERLAY_STATE.PASS
}

export function qualityOverlayStatusCopy(state) {
  if (state === QUALITY_OVERLAY_STATE.PASS) return 'Otomatik kontrollerden geçti'
  if (state === QUALITY_OVERLAY_STATE.BLOCK) return 'Kullanım engellendi'
  return 'İnceleme gerekiyor'
}

function findingView(finding) {
  const errorCode = typeof finding?.errorCode === 'string' ? finding.errorCode : 'UNKNOWN'
  return Object.freeze({
    errorCode,
    severity: finding?.severity === 'error' ? 'error' : 'warning',
    classification: finding?.classification ?? null,
    partId: finding?.partId ?? null,
    measureKey: typeof finding?.measureKey === 'string' && finding.measureKey.trim()
      ? finding.measureKey
      : null,
    visibleMeasureNumber: finding?.visibleMeasureNumber ?? null,
    measureIndex: Number.isFinite(finding?.measureIndex) ? finding.measureIndex : null,
    voice: finding?.voice ?? null,
    staff: finding?.staff ?? null,
    label: LABELS[errorCode] ?? 'Kalite raporunda incelenmesi gereken bir bulgu var.',
    explanation: typeof finding?.explanation === 'string' ? finding.explanation : '',
    // Package 2C finding location intentionally does not contain a canonical
    // note identity. Stage D must not guess a note target from voice/staff/etc.
    exactNoteTarget: null,
  })
}

function measureState(findings) {
  return findings.some((finding) => finding.severity === 'error')
    ? QUALITY_OVERLAY_STATE.BLOCK
    : QUALITY_OVERLAY_STATE.REVIEW
}

export function buildQualityOverlayModel(notes, selectedMeasureKey = null) {
  if (!Array.isArray(notes)) {
    return Object.freeze({
      state: QUALITY_OVERLAY_STATE.REVIEW,
      statusText: qualityOverlayStatusCopy(QUALITY_OVERLAY_STATE.REVIEW),
      report: null,
      summary: null,
      globalFindings: freezeList([]),
      measures: freezeList([]),
      selectedMeasure: null,
    })
  }

  const report = getRegisteredQualityReport(notes)
  const state = overlayStateForReport(report)
  const findings = Array.isArray(report?.findings)
    ? report.findings.map(findingView)
    : []

  const byMeasure = new Map()
  const globalFindings = []
  for (const finding of findings) {
    if (!finding.measureKey) {
      globalFindings.push(finding)
      continue
    }
    const group = byMeasure.get(finding.measureKey) ?? []
    group.push(finding)
    byMeasure.set(finding.measureKey, group)
  }

  const measures = [...byMeasure.entries()].map(([measureKey, group]) => Object.freeze({
    measureKey,
    state: measureState(group),
    count: group.length,
    findings: freezeList([...group]),
  }))
  measures.sort((a, b) => a.measureKey.localeCompare(b.measureKey))

  const selectedMeasure = selectedMeasureKey
    ? measures.find((measure) => measure.measureKey === selectedMeasureKey) ?? null
    : null

  return Object.freeze({
    state,
    statusText: qualityOverlayStatusCopy(state),
    report,
    summary: report?.summary ?? null,
    globalFindings: freezeList(globalFindings),
    measures: freezeList(measures),
    selectedMeasure,
  })
}
