// Package 2C — MusicXML quality/error-report adapter.
//
// This is a read-only diagnostic bridge. It does not alter production parsing,
// OMR output, UI consumers, playback, TTS, or Guitar TAB behavior.

import { parseMusicXmlWithStructure } from '../../musicXmlParser.js'
import { validateMusicXmlStructuralRhythm } from './musicXmlStructuralValidation.js'
import { buildQualityErrorReport } from './qualityErrorReport.js'

function failure(error) {
  return Object.freeze({
    ok: false,
    error,
    report: null,
  })
}

/**
 * Parse MusicXML, run Package 2B validation, then build the Package 2C report.
 *
 * Raw MusicXML parser notes do not establish source verification by themselves.
 * This adapter therefore always evaluates the notes produced by the same
 * MusicXML parse. It does not accept a separate note array that could become
 * detached from the validated source. A separate trusted-source bridge would
 * need its own identity/equivalence contract before it could claim verification.
 *
 * @param {string} musicXmlString
 * @param {Object} options
 * @returns {{ok: boolean, error?: string, report: Object|null}}
 */
export function buildMusicXmlQualityErrorReport(musicXmlString, options = {}) {
  if (typeof musicXmlString !== 'string' || musicXmlString.trim() === '') {
    return failure('MusicXML içeriği boş veya geçersiz.')
  }

  let structuredScore
  try {
    structuredScore = parseMusicXmlWithStructure(musicXmlString)
  } catch {
    return failure('MusicXML güvenli biçimde ayrıştırılamadı.')
  }

  if (!structuredScore || structuredScore.error) {
    return failure(structuredScore?.error || 'MusicXML güvenli biçimde ayrıştırılamadı.')
  }

  let structuralResult
  try {
    structuralResult = validateMusicXmlStructuralRhythm(
      musicXmlString,
      options.structuralOptions || {},
    )
  } catch {
    return failure('MusicXML yapısal doğrulaması güvenli biçimde tamamlanamadı.')
  }

  if (!structuralResult?.ok) {
    return failure(
      structuralResult?.error || 'MusicXML yapısal doğrulaması güvenli biçimde tamamlanamadı.',
    )
  }

  try {
    const report = buildQualityErrorReport(structuredScore, {
      structuralResult,
    })

    return Object.freeze({
      ok: true,
      error: null,
      report,
    })
  } catch {
    return failure('MusicXML kalite raporu güvenli biçimde oluşturulamadı.')
  }
}
