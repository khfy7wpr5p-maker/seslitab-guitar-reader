// OMR Playback Quality Gate
//
// This module never changes or repairs MusicXML. It only combines the
// duration validator result with conservative structural signals so that a
// suspicious PDF-to-OMR result is not played automatically as if it were
// trustworthy. Directly opened MusicXML files bypass this gate in app.js.

export const OMR_QUALITY_LEVELS = Object.freeze({
  RELIABLE: 'reliable',
  REVIEW_REQUIRED: 'review_required',
  UNRELIABLE: 'unreliable',
})

function countTag(xml, tagName) {
  const expression = new RegExp(`<${tagName}(?:\\s|>|\\/)`, 'gi')
  return [...xml.matchAll(expression)].length
}

function countNoteBlocksContaining(xml, tagName) {
  const noteExpression = /<note(?:\s[^>]*)?>([\s\S]*?)<\/note>/gi
  const tagExpression = new RegExp(`<${tagName}(?:\\s|>|\\/)`, 'i')
  let count = 0
  for (const match of xml.matchAll(noteExpression)) {
    if (tagExpression.test(match[1])) count++
  }
  return count
}

function collectPartMetrics(xml) {
  const parts = []
  const partExpression = /<part(?:\s[^>]*)?>([\s\S]*?)<\/part>/gi
  let partIndex = 0

  for (const match of xml.matchAll(partExpression)) {
    const content = match[1]
    parts.push({
      partIndex,
      measureCount: countTag(content, 'measure'),
      noteCount: countTag(content, 'note'),
      pitchedNoteCount: countNoteBlocksContaining(content, 'pitch'),
    })
    partIndex++
  }

  return parts
}

export function collectOmrMusicXmlMetrics(xmlString, sourceName = '') {
  const xml = String(xmlString || '')
  const parts = collectPartMetrics(xml)
  const measureCount = parts.length > 0
    ? Math.max(...parts.map((part) => part.measureCount))
    : countTag(xml, 'measure')
  const noteCount = countTag(xml, 'note')
  const dotCount = countTag(xml, 'dot')
  const beamCount = countTag(xml, 'beam')
  const shortTypeCount = [...xml.matchAll(/<type(?:\s[^>]*)?>\s*(?:16th|32nd|64th|128th)\s*<\/type>/gi)].length
  const timeSignatureCount = [...xml.matchAll(/<time(?:\s[^>]*)?>[\s\S]*?<beats(?:\s[^>]*)?>/gi)].length
  const technicalCount = countTag(xml, 'technical')
  const stringCount = countTag(xml, 'string')
  const fretCount = countTag(xml, 'fret')
  const populatedParts = parts.filter((part) => part.noteCount > 0)
  const emptyParts = parts.filter((part) => part.measureCount > 0 && part.noteCount === 0)
  const hasMatchingEmptyParallelPart = emptyParts.some((emptyPart) =>
    populatedParts.some((part) => part.measureCount === emptyPart.measureCount)
  )

  return {
    isMusicXml: /<score-(?:partwise|timewise)(?:\s|>)/i.test(xml),
    sourceLooksLikeTab: /\btab(?:s|lature)?\b/i.test(String(sourceName || '')),
    measureCount,
    noteCount,
    pitchedNoteCount: countNoteBlocksContaining(xml, 'pitch'),
    partCount: parts.length,
    populatedPartCount: populatedParts.length,
    emptyPartCount: emptyParts.length,
    hasMatchingEmptyParallelPart,
    timeSignatureCount,
    beamCount,
    shortTypeCount,
    dotCount,
    dottedNoteRatio: noteCount > 0 ? dotCount / noteCount : 0,
    technicalCount,
    stringCount,
    fretCount,
  }
}

function addReason(reasons, code, severity, message) {
  if (reasons.some((reason) => reason.code === code)) return
  reasons.push({ code, severity, message })
}

/**
 * @param {string} xmlString
 * @param {{
 *   sourceName?: string,
 *   durationValidation?: {
 *     totalMeasures?: number,
 *     validMeasures?: number,
 *     warningMeasures?: number,
 *     errorMeasures?: number,
 *     unknownMeasures?: number,
 *     qualityStatus?: string
 *   }
 * }} options
 */
export function evaluateOmrPlaybackSafety(xmlString, options = {}) {
  const metrics = collectOmrMusicXmlMetrics(xmlString, options.sourceName)
  const validation = options.durationValidation || null
  const reasons = []

  if (!metrics.isMusicXml) {
    addReason(reasons, 'invalid_musicxml', 'critical', 'Geçerli bir MusicXML skoru bulunamadı.')
  }
  if (metrics.measureCount === 0) {
    addReason(reasons, 'no_measures', 'critical', 'MusicXML içinde ölçü bulunamadı.')
  }
  if (metrics.noteCount === 0 || metrics.pitchedNoteCount === 0) {
    addReason(reasons, 'no_pitched_notes', 'critical', 'Çalınabilir perde bilgisi bulunamadı.')
  }

  const allMeasuresUnknown = Boolean(
    validation &&
    validation.totalMeasures > 0 &&
    validation.unknownMeasures === validation.totalMeasures
  )
  if (allMeasuresUnknown) {
    addReason(
      reasons,
      'all_measure_durations_unknown',
      'critical',
      'Hiçbir ölçünün ritim süresi doğrulanamadı; ölçü işareti kaybolmuş olabilir.'
    )
  } else if ((validation?.unknownMeasures || 0) > 0) {
    addReason(
      reasons,
      'some_measure_durations_unknown',
      'warning',
      `${validation.unknownMeasures} ölçünün ritim süresi doğrulanamadı.`
    )
  }

  if (validation?.qualityStatus === 'unreliable' && !allMeasuresUnknown) {
    addReason(
      reasons,
      'duration_validation_unreliable',
      'critical',
      'Ölçü sürelerindeki hata oranı güvenli sınırı aşıyor.'
    )
  } else if (validation?.qualityStatus === 'review_required') {
    const affected = (validation.errorMeasures || 0) + (validation.warningMeasures || 0)
    addReason(
      reasons,
      'duration_validation_review',
      'warning',
      `${affected} ölçü ritim açısından gözden geçirilmeli.`
    )
  }

  if (metrics.measureCount >= 4 && metrics.timeSignatureCount === 0) {
    addReason(
      reasons,
      'missing_time_signature',
      allMeasuresUnknown ? 'critical' : 'warning',
      'Skorda ölçü işareti bulunamadı.'
    )
  }

  if (metrics.hasMatchingEmptyParallelPart) {
    addReason(
      reasons,
      'empty_parallel_part',
      'warning',
      'Paralel partilerden biri tamamen boş; TAB veya ikinci parti tanınmamış olabilir.'
    )
  }

  const denseRhythmWithoutDetail =
    metrics.noteCount >= 64 &&
    metrics.beamCount === 0 &&
    metrics.shortTypeCount === 0 &&
    metrics.dottedNoteRatio >= 0.20

  if (denseRhythmWithoutDetail) {
    addReason(
      reasons,
      'rhythm_detail_collapse',
      metrics.hasMatchingEmptyParallelPart ? 'critical' : 'warning',
      'Yoğun notaya rağmen kısa nota ve bağ çizgisi bilgileri yok; ritim ayrıntıları çökmüş olabilir.'
    )
  }

  if (
    metrics.sourceLooksLikeTab &&
    metrics.technicalCount === 0 &&
    metrics.stringCount === 0 &&
    metrics.fretCount === 0
  ) {
    addReason(
      reasons,
      'tablature_data_missing',
      'warning',
      'Dosya TAB içeriyor görünüyor fakat tel ve perde bilgileri MusicXML’e aktarılmamış.'
    )
  }

  const hasCriticalReason = reasons.some((reason) => reason.severity === 'critical')
  const level = hasCriticalReason
    ? OMR_QUALITY_LEVELS.UNRELIABLE
    : reasons.length > 0
      ? OMR_QUALITY_LEVELS.REVIEW_REQUIRED
      : OMR_QUALITY_LEVELS.RELIABLE

  return {
    level,
    autoPlaybackAllowed: level !== OMR_QUALITY_LEVELS.UNRELIABLE,
    manualOverrideAllowed:
      level === OMR_QUALITY_LEVELS.UNRELIABLE &&
      metrics.isMusicXml &&
      metrics.noteCount > 0,
    reasons,
    metrics,
    durationValidation: validation,
  }
}
