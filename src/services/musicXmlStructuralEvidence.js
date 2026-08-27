// Package 2B — read-only MusicXML structural evidence extractor.
//
// This module intentionally sits beside the production MusicXML parser. It
// extracts validation-only evidence that must not change playback, TTS, OMR,
// or canonical note behavior. The source XML is never repaired or rewritten.

import { inspectMusicXml } from '../../musicXmlSecurity.js'

function parseMeasureNumber(rawNumber, fallback) {
  const parsed = Number.parseInt(rawNumber, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseIntegerLexeme(text) {
  const raw = String(text ?? '').trim()
  if (/^[+-]?\d+$/.test(raw)) {
    const value = Number(raw)
    if (Number.isSafeInteger(value)) return value
  }
  return raw || null
}

function parsePositiveIntegerDeclaration(element) {
  if (!element) {
    return Object.freeze({
      present: false,
      raw: null,
      value: null,
      valid: null,
    })
  }

  const raw = String(element.textContent ?? '').trim()
  const lexicalValue = parseIntegerLexeme(raw)
  const valid = Number.isInteger(lexicalValue) && lexicalValue > 0

  return Object.freeze({
    present: true,
    raw,
    value: valid ? lexicalValue : null,
    valid,
  })
}

function extractTupletEvidence(noteElement) {
  const timeModification = noteElement.querySelector('time-modification')
  if (!timeModification) return null

  const actual = timeModification.querySelector('actual-notes')
  const normal = timeModification.querySelector('normal-notes')
  const normalType = timeModification.querySelector('normal-type')
  const normalDots = timeModification.querySelectorAll('normal-dot')

  return Object.freeze({
    actualNotes: actual ? parseIntegerLexeme(actual.textContent) : null,
    normalNotes: normal ? parseIntegerLexeme(normal.textContent) : null,
    normalType: normalType ? String(normalType.textContent ?? '').trim() || null : null,
    normalDotCount: normalDots.length,
  })
}

function extractBeamEvidence(noteElement) {
  const beams = [...noteElement.querySelectorAll('beam')]
  if (beams.length === 0) return null

  return Object.freeze(beams.map((beam) => {
    const rawNumber = beam.getAttribute('number')
    return Object.freeze({
      number: rawNumber === null ? 1 : parseIntegerLexeme(rawNumber),
      value: String(beam.textContent ?? '').trim(),
    })
  }))
}

function freezeEntries(entries) {
  return Object.freeze(entries.map((entry) => Object.freeze(entry)))
}

/**
 * Extract validation-only structural evidence from a MusicXML document.
 *
 * @param {string} musicXmlString
 * @returns {{ ok: boolean, error?: string, divisionsDeclarations?: Object[], noteEvidence?: Object[] }}
 */
export function extractMusicXmlStructuralEvidence(musicXmlString) {
  const security = inspectMusicXml(musicXmlString)
  if (!security.ok) {
    return Object.freeze({
      ok: false,
      error: security.message,
      divisionsDeclarations: Object.freeze([]),
      noteEvidence: Object.freeze([]),
    })
  }

  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(security.xmlForParsing, 'application/xml')
    if (doc.querySelector('parsererror')) {
      return Object.freeze({
        ok: false,
        error: 'Geçersiz MusicXML formatı',
        divisionsDeclarations: Object.freeze([]),
        noteEvidence: Object.freeze([]),
      })
    }

    const divisionsDeclarations = []
    const noteEvidence = []
    const parts = [...doc.querySelectorAll('part')]

    for (let partIndex = 0; partIndex < parts.length; partIndex++) {
      const part = parts[partIndex]
      const partId = part.getAttribute('id') || `P${partIndex + 1}`
      const measures = [...part.querySelectorAll('measure')]
      let previousMeasureNumber = 0

      for (let measureIndex = 0; measureIndex < measures.length; measureIndex++) {
        const measure = measures[measureIndex]
        const measureNumber = parseMeasureNumber(
          measure.getAttribute('number'),
          previousMeasureNumber + 1,
        )
        previousMeasureNumber = measureNumber
        const measureKey = `${partId}:${measureIndex}`

        const attributes = measure.querySelector('attributes')
        const divisionsElement = attributes?.querySelector('divisions') ?? null
        const declaration = parsePositiveIntegerDeclaration(divisionsElement)

        divisionsDeclarations.push({
          partId,
          partIndex,
          measureIndex,
          measureNumber,
          measureKey,
          ...declaration,
        })

        const directNotes = [...(measure.children || [])]
          .filter((child) => (child.tagName || child.tag) === 'note')
        const notes = directNotes.length > 0
          ? directNotes
          : [...measure.querySelectorAll('note')]

        for (let noteIndex = 0; noteIndex < notes.length; noteIndex++) {
          const note = notes[noteIndex]
          noteEvidence.push({
            partId,
            partIndex,
            measureIndex,
            measureNumber,
            measureKey,
            noteIndex,
            tuplet: extractTupletEvidence(note),
            beam: extractBeamEvidence(note),
          })
        }
      }
    }

    return Object.freeze({
      ok: true,
      divisionsDeclarations: freezeEntries(divisionsDeclarations),
      noteEvidence: freezeEntries(noteEvidence),
    })
  } catch {
    return Object.freeze({
      ok: false,
      error: 'MusicXML yapısal kanıtı güvenli biçimde ayrıştırılamadı.',
      divisionsDeclarations: Object.freeze([]),
      noteEvidence: Object.freeze([]),
    })
  }
}
