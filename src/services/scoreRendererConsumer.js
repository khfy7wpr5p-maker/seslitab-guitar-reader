// SesliTab score-view consumer boundary.
//
// This module deliberately knows only the ST-owned runtime contract exposed by
// st-score-rendering-layer. It must not import OpenSheetMusicDisplay or treat
// rendering output as musical authority.

import { isRealmSafePlainObject } from './realmSafePlainObject.js'
import { validateRendererScoreNoteRef } from './scoreNoteIdentity.js'

export const ST_SCORE_RENDERER_CONTRACT_VERSION = '0.2.0'
export const ST_SCORE_RENDERER_REVIEWED_REVISION = 'a8961e0e68a950cbe980162e23c09f23f0ce5d0a'
export const SCORE_VIEW_MAX_MUSICXML_BYTES = 5 * 1024 * 1024
export const SCORE_VIEW_MAX_PART_ID_CHARS = 128
export const SCORE_RENDER_MISS_REASONS = Object.freeze([
  'NO_ELEMENT_AT_POINT',
  'OUTSIDE_RENDER_CONTAINER',
  'UNMAPPED_ELEMENT',
  'AMBIGUOUS_OWNERSHIP',
  'NO_NOTE_OWNER',
])
export const SCORE_RENDER_DIAGNOSTIC = Object.freeze({
  NO_ELEMENT_AT_POINT: 'RENDERER_MISS_NO_ELEMENT_AT_POINT',
  OUTSIDE_RENDER_CONTAINER: 'RENDERER_MISS_OUTSIDE_RENDER_CONTAINER',
  UNMAPPED_ELEMENT: 'RENDERER_MISS_UNMAPPED_ELEMENT',
  AMBIGUOUS_OWNERSHIP: 'RENDERER_MISS_AMBIGUOUS_OWNERSHIP',
  NO_NOTE_OWNER: 'RENDERER_MISS_NO_NOTE_OWNER',
  STALE_RENDER: 'RENDERER_STALE_RENDER_EVIDENCE',
  NO_CURRENT_RENDER: 'RENDERER_NO_CURRENT_RENDER_EVIDENCE',
  INVALID_EVIDENCE: 'RENDERER_INVALID_DETAILED_HIT_EVIDENCE',
})

const MISS_REASON_SET = new Set(SCORE_RENDER_MISS_REASONS)
const renderEvidenceByHost = new WeakMap()

function utf8Length(value) {
  return new TextEncoder().encode(value).byteLength
}

function validOpaqueEvidenceText(value, max = 256) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && value === value.trim() && !value.includes('\0')
}

function freezeCurrentEvidence(value) {
  if (!isRealmSafePlainObject(value) || !validOpaqueEvidenceText(value.renderEpoch, 128)) return null
  const sourceId = value.sourceId
  if (sourceId !== undefined && !validOpaqueEvidenceText(sourceId, 256)) return null
  return sourceId === undefined
    ? Object.freeze({ renderEpoch: value.renderEpoch })
    : Object.freeze({ renderEpoch: value.renderEpoch, sourceId })
}

function sameRenderEvidence(expected, observed) {
  if (!expected || !observed) return false
  if (expected.renderEpoch !== observed.renderEpoch) return false
  if (Object.prototype.hasOwnProperty.call(expected, 'sourceId')) {
    return observed.sourceId === expected.sourceId
  }
  return observed.sourceId === undefined
}

function requirePoint(point) {
  if (!isRealmSafePlainObject(point) || !Number.isFinite(point.clientX) || !Number.isFinite(point.clientY)) return null
  return Object.freeze({ clientX: point.clientX, clientY: point.clientY })
}

export function validateScoreViewMusicXml(musicxml) {
  if (typeof musicxml !== 'string') {
    throw new TypeError('Nota görünümü için MusicXML metni gereklidir.')
  }
  if (!musicxml.trim()) {
    throw new TypeError('Nota görünümü için boş MusicXML kabul edilmez.')
  }
  if (musicxml.includes('\0')) {
    throw new TypeError('Nota görünümü MusicXML içinde NUL karakteri kabul etmez.')
  }
  if (utf8Length(musicxml) > SCORE_VIEW_MAX_MUSICXML_BYTES) {
    throw new RangeError('Nota görünümü MusicXML boyut sınırını aşıyor.')
  }
  return musicxml
}

export function validateScoreCursorTarget(target) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    throw new TypeError('Nota görünümü cursor hedefi nesne olmalıdır.')
  }
  const partId = typeof target.partId === 'string' ? target.partId.trim() : ''
  if (!partId || partId.length > SCORE_VIEW_MAX_PART_ID_CHARS) {
    throw new TypeError('Nota görünümü cursor partId değeri geçersiz.')
  }
  const measureIndex = target.measureIndex
  if (!Number.isSafeInteger(measureIndex) || measureIndex < 0) {
    throw new RangeError('Nota görünümü cursor measureIndex değeri geçersiz.')
  }
  return Object.freeze({ partId, measureIndex })
}

export function resolveStScoreRuntime(globalScope = globalThis) {
  const host = globalScope?.__ST_SCORE_RENDER_HOST__
  if (!host || typeof host !== 'object') return null
  if (typeof host.renderMusicXml !== 'function') return null
  if (typeof host.moveCursor !== 'function') return null
  if (typeof host.hitTestNote !== 'function') return null
  // JSON3 pins a completed runtime where detailed hit evidence is mandatory.
  // Do not silently downgrade this reviewed runtime to legacy null-only hits.
  if (typeof host.hitTestNoteDetailed !== 'function') return null
  if (typeof host.highlight !== 'function') return null
  if (typeof host.clearHighlights !== 'function') return null
  if (typeof host.dispose !== 'function') return null
  return host
}

export function getCurrentScoreRenderEvidence(host) {
  return host && typeof host === 'object' ? renderEvidenceByHost.get(host) ?? null : null
}

export async function renderScoreView(host, musicxml, options = {}) {
  if (!host || typeof host.renderMusicXml !== 'function') {
    throw new TypeError('ST score renderer runtime bağlı değil.')
  }

  const source = validateScoreViewMusicXml(musicxml)
  const ticket = String(options.ticket ?? '1')
  if (!/^[1-9][0-9]{0,18}$/.test(ticket)) {
    throw new TypeError('Nota görünümü render ticket değeri geçersiz.')
  }

  renderEvidenceByHost.delete(host)
  try {
    const result = await host.renderMusicXml({
      contractVersion: ST_SCORE_RENDERER_CONTRACT_VERSION,
      musicxml: source,
      pageMode: options.pageMode === 'page' ? 'page' : 'continuous',
      autoResize: options.autoResize !== false,
      drawTitle: options.drawTitle !== false,
      drawComposer: options.drawComposer !== false,
      ticket,
    })
    const current = freezeCurrentEvidence(result)
    if (!current) {
      throw new TypeError('ST score renderer başarılı render için current renderEpoch/source evidence üretmedi.')
    }
    renderEvidenceByHost.set(host, current)
    return result
  } catch (error) {
    renderEvidenceByHost.delete(host)
    throw error
  }
}

export async function moveScoreCursor(host, target) {
  if (!host || typeof host.moveCursor !== 'function') {
    throw new TypeError('ST score renderer cursor runtime bağlı değil.')
  }
  return host.moveCursor(validateScoreCursorTarget(target))
}

export function hitTestScoreNoteDetailed(host, point, expectedEvidence = getCurrentScoreRenderEvidence(host)) {
  if (!host || typeof host.hitTestNoteDetailed !== 'function') {
    return Object.freeze({ kind: 'INVALID', diagnosticCode: SCORE_RENDER_DIAGNOSTIC.INVALID_EVIDENCE })
  }
  const normalizedPoint = requirePoint(point)
  if (!normalizedPoint) {
    return Object.freeze({ kind: 'INVALID', diagnosticCode: SCORE_RENDER_DIAGNOSTIC.INVALID_EVIDENCE })
  }
  if (!expectedEvidence) {
    return Object.freeze({ kind: 'STALE', diagnosticCode: SCORE_RENDER_DIAGNOSTIC.NO_CURRENT_RENDER })
  }

  let raw
  try {
    raw = host.hitTestNoteDetailed(normalizedPoint)
  } catch {
    return Object.freeze({ kind: 'INVALID', diagnosticCode: SCORE_RENDER_DIAGNOSTIC.INVALID_EVIDENCE })
  }
  if (!isRealmSafePlainObject(raw) || !['HIT', 'MISS'].includes(raw.kind)) {
    return Object.freeze({ kind: 'INVALID', diagnosticCode: SCORE_RENDER_DIAGNOSTIC.INVALID_EVIDENCE })
  }

  const allowed = raw.kind === 'HIT'
    ? new Set(['kind', 'renderEpoch', 'sourceId', 'target'])
    : new Set(['kind', 'renderEpoch', 'sourceId', 'reason'])
  if (Object.keys(raw).some((key) => !allowed.has(key))) {
    return Object.freeze({ kind: 'INVALID', diagnosticCode: SCORE_RENDER_DIAGNOSTIC.INVALID_EVIDENCE })
  }
  const observed = freezeCurrentEvidence(raw)
  if (!observed) {
    return Object.freeze({ kind: 'INVALID', diagnosticCode: SCORE_RENDER_DIAGNOSTIC.INVALID_EVIDENCE })
  }
  if (!sameRenderEvidence(expectedEvidence, observed)) {
    return Object.freeze({
      kind: 'STALE',
      diagnosticCode: SCORE_RENDER_DIAGNOSTIC.STALE_RENDER,
      renderEpochMatch: observed.renderEpoch === expectedEvidence.renderEpoch,
      sourceCorrelationMatch: observed.sourceId === expectedEvidence.sourceId,
    })
  }

  if (raw.kind === 'MISS') {
    if (typeof raw.reason !== 'string' || !MISS_REASON_SET.has(raw.reason)) {
      return Object.freeze({ kind: 'INVALID', diagnosticCode: SCORE_RENDER_DIAGNOSTIC.INVALID_EVIDENCE })
    }
    return Object.freeze({
      kind: 'MISS',
      reason: raw.reason,
      diagnosticCode: SCORE_RENDER_DIAGNOSTIC[raw.reason],
      renderEpoch: observed.renderEpoch,
      ...(observed.sourceId === undefined ? {} : { sourceId: observed.sourceId }),
    })
  }

  const target = validateRendererScoreNoteRef(raw.target)
  if (!target) {
    return Object.freeze({ kind: 'INVALID', diagnosticCode: SCORE_RENDER_DIAGNOSTIC.INVALID_EVIDENCE })
  }
  return Object.freeze({
    kind: 'HIT',
    target,
    renderEpoch: observed.renderEpoch,
    ...(observed.sourceId === undefined ? {} : { sourceId: observed.sourceId }),
  })
}

export function hitTestScoreNote(host, point) {
  const detailed = hitTestScoreNoteDetailed(host, point)
  return detailed.kind === 'HIT' ? detailed.target : null
}

export async function highlightScoreNote(host, target) {
  if (!host || typeof host.highlight !== 'function') {
    throw new TypeError('ST score renderer highlight runtime bağlı değil.')
  }
  const validated = validateRendererScoreNoteRef(target)
  if (!validated) throw new TypeError('ST score renderer note hedefi geçersiz.')
  return host.highlight({ target: validated, className: 'seslitab-note-focus' })
}

export async function clearScoreHighlights(host) {
  if (!host || typeof host.clearHighlights !== 'function') return false
  await host.clearHighlights()
  return true
}

export async function clearScoreView(host) {
  if (!host || typeof host.dispose !== 'function') return false
  renderEvidenceByHost.delete(host)
  await host.dispose()
  return true
}
