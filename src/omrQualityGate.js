// Runtime OMR quality gate.
//
// This service only reports structural rhythm risk. It never edits MusicXML
// and never blocks voice or rhythm playback.

import { parseMusicXmlWithStructure } from '../../musicXmlParser.js'
import { validateOmrMeasureDurations } from './omrQualityValidator.js'

export function buildOmrQualityNotice(report) {
  const suspiciousMeasures =
    (report?.warningMeasures || 0) + (report?.errorMeasures || 0)

  if (report?.qualityStatus === 'good') {
    return {
      level: 'good',
      blocksPlayback: false,
      message: `Kalite kontrolü başarılı: ${report.totalMeasures || 0} ölçünün ritmik yapısı tutarlı.`,
    }
  }

  if (report?.qualityStatus === 'unreliable') {
    return {
      level: 'error',
      blocksPlayback: false,
      message: `Bu OMR sonucu güvenilir görünmüyor: ${suspiciousMeasures} şüpheli ölçü bulundu. Çalma kullanılabilir; öğrenciye göndermeden önce öğretmen kontrolü gereklidir.`,
    }
  }

  return {
    level: 'warning',
    blocksPlayback: false,
    message: `Öğretmen kontrolü önerilir: ${suspiciousMeasures} şüpheli ölçü bulundu. Çalma durdurulmadı ve MusicXML değiştirilmedi.`,
  }
}

export function assessMusicXmlQuality(musicXmlString) {
  try {
    const parsedScore = parseMusicXmlWithStructure(musicXmlString)
    if (parsedScore?.error || !parsedScore?.notes?.length) {
      return {
        report: null,
        notice: {
          level: 'warning',
          blocksPlayback: false,
          message: 'Otomatik kalite kontrolü tamamlanamadı. Çalma kullanılabilir; öğretmen kontrolü önerilir.',
        },
      }
    }

    const report = validateOmrMeasureDurations(parsedScore)
    return {
      report,
      notice: buildOmrQualityNotice(report),
    }
  } catch {
    return {
      report: null,
      notice: {
        level: 'warning',
        blocksPlayback: false,
        message: 'Otomatik kalite kontrolü tamamlanamadı. Çalma kullanılabilir; öğretmen kontrolü önerilir.',
      },
    }
  }
}
