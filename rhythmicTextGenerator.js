// Rhythmic Text Generator for SesliTab
// Converts NoteObject array to Turkish rhythmic text output.

import {
  STRING_NAMES,
  DURATION_TYPES,
  durationLabel,
  durationBeats,
  durationBeatsText,
  noteName,
  ACCIDENTALS,
  resolveBeats,
} from './noteTheory.js'

import { fretToText } from './tabParser.js'
import { publishPackage3Notes } from './package3MeasureBridge.js'

// Beat count to Turkish text mapping
const BEATS_TO_TEXT = {
  4: 'dört vuruş',
  3: 'üç vuruş',
  2: 'iki vuruş',
  1.5: 'bir buçuk vuruş',
  1: 'bir vuruş',
  0.75: 'üç çeyrek vuruş',
  0.5: 'yarım vuruş',
  0.375: 'yarım çeyrek vuruş',
  0.25: 'çeyrek vuruş',
  0.125: 'sekizde bir vuruş',
}

/**
 * Convert beats value to Turkish text
 * @param {number} beats
 * @returns {string}
 */
export function beatsToTurkishText(beats) {
  // Try exact match first
  if (BEATS_TO_TEXT[beats]) {
    return BEATS_TO_TEXT[beats]
  }
  // Fallback for fractional values
  if (beats >= 1) {
    return `${beats} vuruş`
  }
  // For small fractions
  const fractionMap = {
    0.75: 'üç çeyrek vuruş',
    0.5: 'yarım vuruş',
    0.375: 'yarım çeyrek vuruş',
    0.25: 'çeyrek vuruş',
    0.125: 'sekizde bir vuruş',
    0.0625: 'onaltıda bir vuruş',
    0.03125: 'otuzikide bir vuruş',
    0.015625: 'altmışdörtte bir vuruş',
    0.0078125: 'yüzyirmisekizde bir vuruş',
    0.00390625: 'ikiyüzellialtıda bir vuruş',
    0.001953125: 'beşyüzonikide bir vuruş',
    0.0009765625: 'biniyirmidörtte bir vuruş',
  }
  return fractionMap[beats] || `${beats} vuruş`
}

/**
 * Resolve the normalized beat value for a note or rest.
 * Delegates to the canonical resolveBeats in noteTheory.js so that
 * rhythmic text and playback share one source of truth.
 * @param {NoteObject} note
 * @returns {number}
 */
function resolveBeatsLocal(note) {
  return resolveBeats(note)
}

/**
 * Format a single note as Turkish text
 * @param {NoteObject} note
 * @returns {string}
 */
export function formatNoteAsText(note) {
  // Handle rests
  if (note.isRest) {
    const restLabel = durationLabel(note.duration || note.restType || 'quarter')
    const beatsVal = resolveBeatsLocal(note)
    const beatsText = beatsToTurkishText(beatsVal)
    return `${restLabel}, sus, ${beatsText}`
  }

  const parts = []

  // String/fret info if available
  if (note.stringLetter && note.fret !== undefined && note.fret !== null) {
    const telName = STRING_NAMES[note.stringLetter] || `${note.stringLetter} tel`
    const perdeText = fretToText(note.fret)
    parts.push(`${telName} tel ${perdeText}`)
  }

  // Note name
  let noteNameText = note.noteName || ''
  if (!noteNameText && note.stringLetter) {
    noteNameText = noteName(note.stringLetter, note.fret)
  }
  if (noteNameText) {
    // Add accidental if present
    if (note.accidental && ACCIDENTALS[note.accidental]) {
      const accSymbol = ACCIDENTALS[note.accidental].symbol
      if (accSymbol && !noteNameText.includes(accSymbol)) {
        // Don't add if already in name
      }
    }
    parts.push(`${noteNameText} notası`)
  }

  // Duration
  const durLabel = durationLabel(note.duration)
  parts.push(durLabel)

  // Beat count
  const beatsVal = resolveBeatsLocal(note)
  const beatsText = beatsToTurkishText(beatsVal)
  parts.push(beatsText)

  // Tie information (accessible announcement)
  if (note.tieStart && note.tieStop) {
    parts.push('uzatma bağı devamı')
  } else if (note.tieStart) {
    parts.push('uzatma bağı başlangıcı')
  } else if (note.tieStop) {
    parts.push('uzatma bağı sonu')
  }

  return parts.join(', ')
}

/**
 * Generate Turkish rhythmic text from NoteObject array
 * @param {NoteObject[]} notes - Array of NoteObject
 * @returns {string} Formatted Turkish text
 */
export function generateTurkishRhythmicText(notes) {
  if (!notes || notes.length === 0) {
    return 'Henüz nota yok.'
  }

  // Group notes by measure
  const measures = new Map()
  for (const note of notes) {
    const measureNum = note.measureNumber || 1
    if (!measures.has(measureNum)) {
      measures.set(measureNum, [])
    }
    measures.get(measureNum).push(note)
  }

  // Sort measures
  const sortedMeasures = [...measures.keys()].sort((a, b) => a - b)

  const lines = []

  for (const measureNum of sortedMeasures) {
    const measureNotes = measures.get(measureNum)

    // Sort notes within measure by startBeat
    measureNotes.sort((a, b) => (a.startBeat || 0) - (b.startBeat || 0))

    // Add measure header
    lines.push(`Ölçü ${measureNum}.`)

    // Add each note
    for (const note of measureNotes) {
      const noteText = formatNoteAsText(note)
      lines.push(noteText)
    }
  }

  return lines.join('\n')
}

/**
 * Simplified formatter for the Rhythmic HTML output and spoken text.
 * Shows only guitar position and note name — no duration, beat, or tie text.
 * Internal note objects (duration, beats, dotCount, tie flags, etc.) are
 * never modified; this function only controls the visible/spoken string.
 * @param {NoteObject} note
 * @returns {string}
 */
export function formatNoteAsHtmlText(note) {
  if (note.isRest) {
    return 'sus'
  }

  const parts = []

  if (note.stringLetter && note.fret !== undefined && note.fret !== null) {
    const telName = STRING_NAMES[note.stringLetter] || `${note.stringLetter} tel`
    const perdeText = fretToText(note.fret)
    parts.push(`${telName} tel ${perdeText}`)
  }

  let noteNameText = note.noteName || ''
  if (!noteNameText && note.stringLetter) {
    noteNameText = noteName(note.stringLetter, note.fret)
  }
  if (noteNameText) {
    parts.push(`${noteNameText} notası`)
  }

  return parts.join(', ')
}

/**
 * Generate Turkish rhythmic text with HTML formatting
 * @param {NoteObject[]} notes - Array of NoteObject
 * @returns {string} HTML formatted output
 */
export function generateTurkishRhythmicHtml(notes) {
  if (!notes || notes.length === 0) {
    return '<p class="hint">Henüz nota bulunamadı.</p>'
  }

  // Group notes by measure
  const measures = new Map()
  for (const note of notes) {
    const measureNum = note.measureNumber || 1
    if (!measures.has(measureNum)) {
      measures.set(measureNum, [])
    }
    measures.get(measureNum).push(note)
  }

  const sortedMeasures = [...measures.keys()].sort((a, b) => a - b)
  const htmlParts = []

  for (const measureNum of sortedMeasures) {
    const measureNotes = measures.get(measureNum)
    measureNotes.sort((a, b) => (a.startBeat || 0) - (b.startBeat || 0))

    htmlParts.push(`<div class="measure-block">`)
    htmlParts.push(`<h3 class="measure-title">Ölçü ${measureNum}</h3>`)

    for (const note of measureNotes) {
      const noteText = formatNoteAsHtmlText(note)
      const lowConf = (note.confidence || 0) < 0.5
      const confTag = lowConf ? '<span class="conf-tag">kontrol gerekiyor</span>' : ''
      const noteClass = lowConf ? 'note-line note-low' : 'note-line'
      htmlParts.push(`<p class="${noteClass}">${escapeHtml(noteText)} ${confTag}</p>`)
    }

    htmlParts.push('</div>')
  }

  // Package 3 UI consumes the same exact NoteObject[] reference as this
  // existing projection. The visible HTML string remains unchanged.
  publishPackage3Notes(notes)
  return htmlParts.join('')
}

/**
 * Generate plain Turkish spoken text for the Rhythmic HTML section's TTS.
 * Reuses the same simplified formatter as the visible HTML output
 * (formatNoteAsHtmlText), so speech matches exactly what is on screen —
 * only guitar position and note name, no duration or beat descriptions.
 * Internal note objects are never modified.
 * @param {NoteObject[]} notes
 * @returns {string}
 */
export function generateTurkishRhythmicSpokenText(notes) {
  if (!notes || notes.length === 0) return 'Nota bulunamadı.'

  const phrases = notes.map((note) => formatNoteAsHtmlText(note))
  return phrases.join('. ') + '.'
}

/**
 * Generate a summary of the notes
 * @param {NoteObject[]} notes
 * @returns {string} Summary text
 */
export function generateNotesSummary(notes) {
  if (!notes || notes.length === 0) {
    return 'Nota yok.'
  }

  const total = notes.length
  const rests = notes.filter(n => n.isRest).length
  const actualNotes = total - rests
  const measures = new Set(notes.map(n => n.measureNumber || 1)).size
  const lowConf = notes.filter(n => (n.confidence || 0) < 0.5).length

  let summary = `${total} nota, ${measures} ölçü`
  if (rests > 0) {
    summary += `, ${rests} sus`
  }
  if (lowConf > 0) {
    summary += `, ${lowConf} düşük güven`
  }

  return summary
}

// HTML escape helper
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
