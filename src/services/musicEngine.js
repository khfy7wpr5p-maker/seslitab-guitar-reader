// Music Engine — orchestrates tabParser, noteTheory, rhythmicTextGenerator, musicXmlParser.
//
// This module is the bridge between the raw root-level analysis modules and
// the frontend UI. It exposes a single NoteObject[] shape that the voice and
// rhythm services consume, plus text/HTML generators for the output panels.

import { tabToNotes, tabToTurkish, noteFrequency } from '../../tabParser.js'
import { createNote, noteName, STRING_NAMES, STRING_NUMBER, noteToTurkish } from '../../noteTheory.js'
import { generateTurkishRhythmicText, generateTurkishRhythmicHtml, generateNotesSummary } from '../../rhythmicTextGenerator.js'
import { parseMusicXml as parseXml } from '../../musicXmlParser.js'

// ── TAB → NoteObject[] ──────────────────────────────────────────

/**
 * Convert pasted TAB text into NoteObject[] using the root tabParser.
 * Each "note" from tabToNotes is an array of simultaneous hits (chord).
 * We flatten them into individual NoteObjects, marking chord members.
 *
 * @param {string} tabText
 * @returns {{ notes: NoteObject[], hasRhythm: boolean }}
 */
export function parseTabToNotes(tabText) {
  const rawHits = tabToNotes(tabText)
  if (rawHits.length === 0) return { notes: [], hasRhythm: false }

  const notes = []
  let measureNum = 1
  let beatCursor = 0
  const beatsPerMeasure = 4

  rawHits.forEach((hit, idx) => {
    const isChord = hit.length > 1
    hit.forEach((h) => {
      const note = createNote({
        stringLetter: h.string,
        fret: parseInt(h.fret, 10),
        duration: 'quarter',
        measureNumber: measureNum,
        startBeat: beatCursor,
        isChord,
        confidence: 0.7,
        confidenceReason: 'TAB analizinden dönüştürüldü',
      })
      notes.push(note)
    })

    beatCursor += 1
    if (beatCursor >= beatsPerMeasure) {
      beatCursor = 0
      measureNum++
    }
  })

  return { notes, hasRhythm: false }
}

// ── TAB → Turkish spoken text ────────────────────────────────────

/**
 * Convert TAB text to Turkish spoken phrases using tabParser.
 * @param {string} tabText
 * @returns {string}
 */
export function tabToSpokenText(tabText) {
  return tabToTurkish(tabText)
}

// ── NoteObject[] → rhythmic text ────────────────────────────────

export function notesToRhythmicText(notes) {
  return generateTurkishRhythmicText(notes)
}

// ── NoteObject[] → rhythmic HTML ────────────────────────────────

export function notesToRhythmicHtml(notes) {
  return generateTurkishRhythmicHtml(notes)
}

// ── NoteObject[] → summary ──────────────────────────────────────

export function notesToSummary(notes) {
  return generateNotesSummary(notes)
}

// ── NoteObject[] → spoken text for TTS ──────────────────────────

/**
 * Convert NoteObject[] to Turkish spoken text suitable for SpeechSynthesis.
 * Format: "Birinci tel, ikinci perde, Fa diyez notası, bir vuruş."
 * @param {NoteObject[]} notes
 * @returns {string}
 */
export function notesToSpokenText(notes) {
  if (!notes || notes.length === 0) return 'Nota bulunamadı.'

  const phrases = notes.map((note) => noteToTurkish(note))
  return phrases.join('. ') + '.'
}

// ── MusicXML → NoteObject[] ─────────────────────────────────────

/**
 * Parse MusicXML string into NoteObject[] using the root musicXmlParser.
 * @param {string} musicXmlString
 * @returns {{ notes: NoteObject[], error?: string }}
 */
export function parseMusicXmlToNotes(musicXmlString) {
  const result = parseXml(musicXmlString)
  if (result.error) return { notes: [], error: result.error }

  // Convert raw parsed notes into full NoteObjects via createNote
  const notes = (result.notes || []).map((n) =>
    createNote({
      stringLetter: n.string,
      fret: n.fret,
      noteName: n.noteName,
      duration: n.duration,
      measureNumber: n.measure,
      startBeat: n.startBeat,
      beats: n.beats,
      durationValue: n.durationValue,
      divisions: n.divisions,
      dotCount: n.dotCount,
      confidence: n.confidence,
      confidenceReason: n.confidenceReason,
      isRest: n.isRest,
      voice: n.voice,
      staff: n.staff,
      step: n.step,
      alter: n.alter,
      octave: n.octave,
      tieStart: n.tieStart,
      tieStop: n.tieStop,
      tieContinue: n.tieContinue,
    })
  )

  return { notes }
}

// ── NoteObject[] → note card data ──────────────────────────────

/**
 * Convert NoteObject[] to simplified card data for the UI grid.
 * @param {NoteObject[]} notes
 * @returns {{ pitch: string, type: string, string: string|null, fret: number|null, freq: number|null }[]}
 */
export function notesToCardData(notes) {
  return notes
    .filter((n) => !n.isRest)
    .map((n) => ({
      pitch: n.noteName || '',
      type: n.durationName || '',
      string: n.stringLetter || null,
      stringNum: n.stringNumber || null,
      fret: n.fret,
      freq: n.frequency || null,
    }))
}
