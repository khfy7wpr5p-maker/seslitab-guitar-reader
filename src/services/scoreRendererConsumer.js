// SesliTab score-view consumer boundary.
//
// This module deliberately knows only the ST-owned runtime contract exposed by
// st-score-rendering-layer. It must not import OpenSheetMusicDisplay or treat
// rendering output as musical authority.

export const ST_SCORE_RENDERER_CONTRACT_VERSION = '0.2.0'
export const ST_SCORE_RENDERER_REVIEWED_REVISION = '717c0c2f32cebf11350104020d9d12ff88c59e94'
export const SCORE_VIEW_MAX_MUSICXML_BYTES = 5 * 1024 * 1024

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

export function resolveStScoreRuntime(globalScope = globalThis) {
  const host = globalScope?.__ST_SCORE_RENDER_HOST__
  if (!host || typeof host !== 'object') return null
  if (typeof host.renderMusicXml !== 'function') return null
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

export async function clearScoreView(host) {
  if (!host || typeof host.dispose !== 'function') return false
  await host.dispose()
  return true
}
