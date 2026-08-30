// SesliTab score-view consumer boundary.
//
// This module deliberately knows only the ST-owned runtime contract exposed by
// st-score-rendering-layer. It must not import OpenSheetMusicDisplay or treat
// rendering output as musical authority.

import { validateRendererScoreNoteRef } from './scoreNoteIdentity.js'

export const ST_SCORE_RENDERER_CONTRACT_VERSION = '0.2.0'
export const ST_SCORE_RENDERER_REVIEWED_REVISION = '583b403f43e216f6463d392b19746b032af1c948'
export const SCORE_VIEW_MAX_MUSICXML_BYTES = 5 * 1024 * 1024
export const SCORE_VIEW_MAX_PART_ID_CHARS = 128

function utf8Length(value) {
  return new TextEncoder().encode(value).byteLength
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
  if (typeof host.highlight !== 'function') return null
  if (typeof host.clearHighlights !== 'function') return null
  if (typeof host.dispose !== 'function') return null
  return host
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

  return host.renderMusicXml({
    contractVersion: ST_SCORE_RENDERER_CONTRACT_VERSION,
    musicxml: source,
    pageMode: options.pageMode === 'page' ? 'page' : 'continuous',
    autoResize: options.autoResize !== false,
    drawTitle: options.drawTitle !== false,
    drawComposer: options.drawComposer !== false,
    ticket,
  })
}

export async function moveScoreCursor(host, target) {
  if (!host || typeof host.moveCursor !== 'function') {
    throw new TypeError('ST score renderer cursor runtime bağlı değil.')
  }
  return host.moveCursor(validateScoreCursorTarget(target))
}

export function hitTestScoreNote(host, point) {
  if (!host || typeof host.hitTestNote !== 'function') return null
  if (!point || typeof point !== 'object' || Array.isArray(point)) return null
  const clientX = point.clientX
  const clientY = point.clientY
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null
  return validateRendererScoreNoteRef(host.hitTestNote({ clientX, clientY }))
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
  await host.dispose()
  return true
}
