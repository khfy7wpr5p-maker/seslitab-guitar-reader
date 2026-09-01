// S08 — exact score quality/error overlay projection.
//
// Package 2C remains the quality-report authority and `snapshot.notes` remains
// the exact source/quality array. S08 never transfers that evidence to a
// teacher-corrected `selectionNotes` projection. It creates note-level markers
// only from exact NoteObject-local verification plus an exact renderer target;
// measure/voice/staff structural findings remain Stage D measure/global evidence.

import {
  CANONICAL_VERIFICATION_STATUS,
  resolveCanonicalConsumptionPolicy,
} from '../../noteTheory.js'
import { deriveCanonicalNoteSelection } from './canonicalNoteSelection.js'
import {
  buildQualityOverlayModel,
  QUALITY_OVERLAY_STATE,
} from './qualityOverlay.js'

export const STAGE_S08_NOTE_STATE = Object.freeze({
  BLOCK: 'BLOCK',
  REVIEW: 'REVIEW',
  NO_ISSUE_FOUND: 'NO_ISSUE_FOUND',
  UNKNOWN: 'UNKNOWN',
})

export const STAGE_S08_NOTE_COPY = Object.freeze({
  [STAGE_S08_NOTE_STATE.BLOCK]: 'Açık problem bulundu',
  [STAGE_S08_NOTE_STATE.REVIEW]: 'İnceleme gerekiyor',
  [STAGE_S08_NOTE_STATE.NO_ISSUE_FOUND]: 'Otomatik kontrolde sorun bulunmadı',
  [STAGE_S08_NOTE_STATE.UNKNOWN]: 'Bu nota için exact kalite durumu bilinmiyor',
})

function emptyModel(reason, { stale = false } = {}) {
  return Object.freeze({
    state: STAGE_S08_NOTE_STATE.UNKNOWN,
    reason,
    stale,
    exactSourceEvidence: false,
    markers: Object.freeze([]),
    counts: Object.freeze({ block: 0, review: 0, noIssueFound: 0, unknown: 0 }),
  })
}

function reasonForInvalidNote(note) {
  const pitch = note?.sourceVerificationState?.pitch
  if (pitch?.valid === false || pitch?.status === CANONICAL_VERIFICATION_STATUS.INVALID) {
    return 'Nota perdesi canonical doğrulamada tutarsız.'
  }
  return 'Nota canonical doğrulamada geçersiz.'
}

function stateForExactNote(note, reportState) {
  let policy
  try {
    policy = resolveCanonicalConsumptionPolicy(note)
  } catch {
    return Object.freeze({
      state: STAGE_S08_NOTE_STATE.UNKNOWN,
      reason: 'Nota için canonical doğrulama durumu güvenle okunamadı.',
    })
  }

  if (policy.status === CANONICAL_VERIFICATION_STATUS.INVALID) {
    return Object.freeze({
      state: STAGE_S08_NOTE_STATE.BLOCK,
      reason: reasonForInvalidNote(note),
    })
  }

  if (policy.status !== CANONICAL_VERIFICATION_STATUS.VERIFIED || policy.definitive !== true) {
    return Object.freeze({
      state: STAGE_S08_NOTE_STATE.REVIEW,
      reason: 'Nota için kaynak doğrulaması tamamlanmadı.',
    })
  }

  if (reportState === QUALITY_OVERLAY_STATE.PASS) {
    return Object.freeze({
      state: STAGE_S08_NOTE_STATE.NO_ISSUE_FOUND,
      reason: 'Otomatik kontrolde bu nota için sorun bulunmadı; bu müzikal doğruluk garantisi değildir.',
    })
  }

  return Object.freeze({
    state: STAGE_S08_NOTE_STATE.UNKNOWN,
    reason: 'Ölçü veya eser düzeyindeki kalite bulgusu bu notaya exact olarak atanamıyor.',
  })
}

function markerFor(notes, note, noteIndex, reportState) {
  if (!note || typeof note !== 'object' || typeof note.measureKey !== 'string') return null
  const selection = deriveCanonicalNoteSelection(notes, note.measureKey, noteIndex)
  if (!selection.selected || !selection.rendererTarget) return null

  const status = stateForExactNote(note, reportState)
  return Object.freeze({
    noteIndex,
    measureKey: selection.measureKey,
    measureNoteOrdinal: selection.measureNoteOrdinal,
    visibleMeasureNumber: note.measureNumber ?? null,
    state: status.state,
    statusText: STAGE_S08_NOTE_COPY[status.state],
    reason: status.reason,
    rendererTarget: selection.rendererTarget,
  })
}

function summarize(markers) {
  const counts = { block: 0, review: 0, noIssueFound: 0, unknown: 0 }
  for (const marker of markers) {
    if (marker.state === STAGE_S08_NOTE_STATE.BLOCK) counts.block += 1
    else if (marker.state === STAGE_S08_NOTE_STATE.REVIEW) counts.review += 1
    else if (marker.state === STAGE_S08_NOTE_STATE.NO_ISSUE_FOUND) counts.noIssueFound += 1
    else counts.unknown += 1
  }
  return Object.freeze(counts)
}

/**
 * Build the read-only S08 exact-note overlay model.
 *
 * `scoreState` is the S07 presentation state (`source`, `verified`,
 * `revalidating`, `blocked`). During revalidation/block, and whenever a
 * corrected selection projection differs from the exact source array, old
 * Package 2C evidence is stale for note-level presentation and markers are
 * removed rather than inherited.
 */
export function buildStageS08ScoreQualityOverlayModel(snapshot, { scoreState = 'source' } = {}) {
  const notes = snapshot?.notes
  if (!Array.isArray(notes) || notes.length === 0) {
    return emptyModel('Henüz exact canonical nota kaynağı yok.')
  }

  const selectionNotes = Array.isArray(snapshot?.selectionNotes) ? snapshot.selectionNotes : notes
  if (scoreState === 'revalidating' || scoreState === 'blocked') {
    return emptyModel('Skor yeniden doğrulanırken eski note-level kalite işaretleri temizlendi.', { stale: true })
  }
  if (selectionNotes !== notes) {
    return emptyModel('Düzeltilmiş sürüm exact source kalite raporunu miras almaz; yeni note-level kanıt bekleniyor.', { stale: true })
  }

  let overlay
  try {
    overlay = buildQualityOverlayModel(notes)
  } catch {
    return emptyModel('Exact kalite raporu güvenle okunamadı.')
  }
  if (!overlay.report) {
    return emptyModel('Bu exact nota dizisi için kayıtlı kalite raporu yok.')
  }

  const markers = []
  for (let noteIndex = 0; noteIndex < notes.length; noteIndex++) {
    const marker = markerFor(notes, notes[noteIndex], noteIndex, overlay.state)
    if (marker) markers.push(marker)
  }
  Object.freeze(markers)

  const counts = summarize(markers)
  const aggregateState = counts.block > 0
    ? STAGE_S08_NOTE_STATE.BLOCK
    : counts.review > 0
      ? STAGE_S08_NOTE_STATE.REVIEW
      : counts.unknown > 0
        ? STAGE_S08_NOTE_STATE.UNKNOWN
        : STAGE_S08_NOTE_STATE.NO_ISSUE_FOUND

  return Object.freeze({
    state: aggregateState,
    reason: aggregateState === STAGE_S08_NOTE_STATE.NO_ISSUE_FOUND
      ? 'Exact note-level otomatik kontroller sorun göstermedi; bu müzikal doğruluk garantisi değildir.'
      : 'Exact note-level durum, yalnız mevcut canonical/source doğrulama kanıtından türetildi.',
    stale: false,
    exactSourceEvidence: true,
    markers,
    counts,
  })
}
