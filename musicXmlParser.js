// MusicXML Parser: Parses MusicXML and extracts guitar notes with string/fret information.
// Returns notes in the format expected by SesliTab.

import {
  STRING_NAMES, STRING_NUMBER,
  noteFrequency, noteName, durationLabel, durationBeats,
  beatsToDurationId, noteToMidi, midiToFrequency,
} from './noteTheory.js'

// Parse MusicXML string and return array of notes
// Returns: { notes: [...], error?: string }
export function parseMusicXml(musicXmlString) {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(musicXmlString, 'application/xml')
    const parseError = doc.querySelector('parsererror')
    if (parseError) {
      return { notes: [], error: 'Geçersiz MusicXML formatı' }
    }

    const notes = []
    const measures = doc.querySelectorAll('measure')
    let measureNumber = 0
    let currentDivisions = null

    for (const measure of measures) {
      measureNumber = parseInt(measure.getAttribute('number')) || (measureNumber + 1)
      const divisionsEl = measure.querySelector('attributes divisions')
      if (divisionsEl) {
        currentDivisions = parseInt(divisionsEl.textContent, 10) || currentDivisions
      }
      const measureNotes = parseMeasure(measure, measureNumber, currentDivisions)
      notes.push(...measureNotes)
    }

    return { notes }
  } catch (err) {
    return { notes: [], error: err.message || 'MusicXML parse hatası' }
  }
}

// Parse a single measure
function parseMeasure(measureEl, measureNumber, divisions) {
  const notes = []
  const noteEls = measureEl.querySelectorAll('note')
  let measureBeats = 0
  const measureStartBeat = 0 // Reset per measure for measure-relative positions

  for (const noteEl of noteEls) {
    const noteData = parseNote(noteEl, measureNumber, measureBeats, divisions)
    if (noteData) {
      notes.push(noteData)
      measureBeats += noteData.beats
    }
  }

  return notes
}

// Parse a single note element
function parseNote(noteEl, measure, startBeat, divisions) {
  const durationEl = noteEl.querySelector('duration')
  const durationValue = durationEl ? parseInt(durationEl.textContent, 10) : null

  // Check if this is a rest
  const rest = noteEl.querySelector('rest')
  if (rest) {
    const type = noteEl.querySelector('type')
    const durationText = type ? type.textContent : 'quarter'
    const baseBeats = getDurationBeats(durationText)
    const dotCount = noteEl.querySelectorAll('dot').length
    const beats = applyDots(baseBeats, dotCount)
    return {
      isRest: true,
      measure,
      startBeat,
      duration: beatsToDurationId(beats),
      beats,
      durationValue,
      divisions,
      confidence: 0.9,
      confidenceReason: 'Sus işareti',
    }
  }

  // Get pitch information
  const pitch = noteEl.querySelector('pitch')
  let step = 'C'
  let alter = 0
  let octave = 4

  if (pitch) {
    const stepEl = pitch.querySelector('step')
    const alterEl = pitch.querySelector('alter')
    const octaveEl = pitch.querySelector('octave')
    if (stepEl) step = stepEl.textContent
    if (alterEl) alter = parseInt(alterEl.textContent, 10) || 0
    if (octaveEl) octave = parseInt(octaveEl.textContent, 10) || 4
  }

  // Get technical information (string/fret for guitar)
  const technical = noteEl.querySelector('technical')
  let stringNum = 1
  let fret = 0

  if (technical) {
    const stringEl = technical.querySelector('string')
    const fretEl = technical.querySelector('fret')
    if (stringEl) stringNum = parseInt(stringEl.textContent, 10) || 1
    if (fretEl) fret = parseInt(fretEl.textContent, 10) || 0
  } else {
    // Calculate string/fret from pitch if technical not present
    const result = pitchToGuitarPosition(step, alter, octave)
    stringNum = result.string
    fret = result.fret
  }

  // Get duration
  const typeEl = noteEl.querySelector('type')
  const durationText = typeEl ? typeEl.textContent : 'quarter'
  const beats = getDurationBeats(durationText)

  // Check for dots
  const dotCount = noteEl.querySelectorAll('dot').length
  const dottedBeats = applyDots(beats, dotCount)
  const durationId = beatsToDurationId(dottedBeats)

  // Map string number to letter
  const stringLetter = getStringLetter(stringNum)
  const noteNameVal = noteName(stringLetter, fret)

  // Calculate frequency
  const freq = noteFrequency(stringLetter, fret)

  return {
    measure,
    string: stringLetter,
    fret,
    noteName: noteNameVal,
    frequency: freq,
    midi: noteToMidi(stringLetter, fret),
    duration: durationId,
    beats: dottedBeats,
    durationValue,
    divisions,
    startBeat,
    confidence: 0.85,
    confidenceReason: technical ? 'MusicXML teknik bilgi' : 'MusicXML perdeden hesaplandı',
  }
}

// Convert duration type text to beats
function getDurationBeats(typeText) {
  const durations = {
    whole: 4,
    'whole-note': 4,
    half: 2,
    'half-note': 2,
    quarter: 1,
    'quarter-note': 1,
    eighth: 0.5,
    'eighth-note': 0.5,
    '16th': 0.25,
    sixteenth: 0.25,
    '16th-note': 0.25,
    '32nd': 0.125,
    '32nd-note': 0.125,
  }
  const normalized = typeText.toLowerCase().trim()
  return durations[normalized] || 1
}

// Apply dots to duration
function applyDots(beats, dotCount) {
  let result = beats
  for (let i = 0; i < dotCount; i++) {
    result += beats * Math.pow(0.5, i + 1)
  }
  return result
}

// Map string number (1=highest E, 6=lowest E) to letter
function getStringLetter(stringNum) {
  // MusicXML convention: string 1 = highest (e)
  const letters = ['e', 'B', 'G', 'D', 'A', 'E']
  return letters[stringNum - 1] || 'e'
}

// Convert pitch to approximate guitar position
// Returns { string: letter, fret: number }
function pitchToGuitarPosition(step, alter, octave) {
  // MIDI note calculation
  const stepToMidi = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
  let midi = (octave + 1) * 12 + stepToMidi[step] + alter

  // Standard guitar tuning MIDI notes for open strings
  // e=64, B=59, G=55, D=50, A=45, E=40
  const openMidi = [64, 59, 55, 50, 45, 40]
  const letters = ['e', 'B', 'G', 'D', 'A', 'E']

  // Find the best string/fret combination
  // Prefer lower frets (easier to play)
  let bestString = 1
  let bestFret = 0
  let minFret = Infinity

  for (let i = 0; i < 6; i++) {
    const fret = midi - openMidi[i]
    if (fret >= 0 && fret <= 24 && fret < minFret) {
      minFret = fret
      bestString = i + 1
      bestFret = fret
    }
  }

  return { string: letters[bestString - 1], fret: bestFret }
}
