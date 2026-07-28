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
    const parts = doc.querySelectorAll('part')

    for (const part of parts) {
      const measures = part.querySelectorAll('measure')
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

  // Voice
  const voiceEl = noteEl.querySelector('voice')
  const voice = voiceEl ? parseInt(voiceEl.textContent, 10) || 1 : 1

  // Staff
  const staffEl = noteEl.querySelector('staff')
  const staff = staffEl ? parseInt(staffEl.textContent, 10) || 1 : 1

  // Tie detection: <tie type="start|stop"/> and <notations><tied type="start|stop"/></notations>
  // Slurs (<slur>) are NOT ties and must be ignored.
  let tieStart = false
  let tieStop = false

  const tieEls = noteEl.querySelectorAll(':scope > tie')
  for (const t of tieEls) {
    const type = t.getAttribute('type')
    if (type === 'start') tieStart = true
    if (type === 'stop') tieStop = true
  }

  const tiedEls = noteEl.querySelectorAll('notations tied')
  for (const t of tiedEls) {
    const type = t.getAttribute('type')
    if (type === 'start') tieStart = true
    if (type === 'stop') tieStop = true
  }

  // Chord detection: <chord/> means this note is a continuation of a chord
  // (same onset as the previous note). The first note of a chord does NOT
  // have <chord/> and remains isChordNote: false.
  const isChordNote = noteEl.querySelector('chord') !== null

  // Check if this is a rest
  const rest = noteEl.querySelector('rest')
  if (rest) {
    const type = noteEl.querySelector('type')
    const durationText = type ? type.textContent : 'quarter'
    const baseBeats = getDurationBeats(durationText)
    const dotCount = noteEl.querySelectorAll('dot').length
    const dottedBeats = applyDots(baseBeats, dotCount)
    // For rests, prefer duration/divisions when available
    const beats = resolveNoteBeats(durationValue, divisions, dottedBeats)
    return {
      isRest: true,
      isChordNote,
      measure,
      startBeat,
      duration: beatsToDurationId(beats),
      beats,
      durationValue,
      divisions,
      dotCount,
      voice,
      staff,
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

  let playbackMidi = null

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
    playbackMidi = result.playbackMidi
  }

  // Get duration
  const typeEl = noteEl.querySelector('type')
  const durationText = typeEl ? typeEl.textContent : 'quarter'
  const baseBeats = getDurationBeats(durationText)

  // Check for dots
  const dotCount = noteEl.querySelectorAll('dot').length
  const dottedBeats = applyDots(baseBeats, dotCount)

  // Canonical beat resolution: prefer duration/divisions, fall back to type+dot
  const beats = resolveNoteBeats(durationValue, divisions, dottedBeats)
  const durationId = beatsToDurationId(beats)

  // Map string number to letter
  const stringLetter = getStringLetter(stringNum)
  const noteNameVal = noteName(stringLetter, fret)

  // Calculate frequency: use the original written-pitch MIDI (not the
  // octave-lowered mapping MIDI) so playback pitch is preserved.
  const midiVal = playbackMidi !== null ? playbackMidi : noteToMidi(stringLetter, fret)
  const freq = playbackMidi !== null ? midiToFrequency(playbackMidi) : noteFrequency(stringLetter, fret)

  // Determine tie continuation (start but not stop = pure start;
  // stop but not start = pure stop; both = start+stop in same note)
  const tieContinue = tieStart && tieStop

  return {
    measure,
    isChordNote,
    string: stringLetter,
    fret,
    noteName: noteNameVal,
    frequency: freq,
    midi: midiVal,
    duration: durationId,
    beats,
    durationValue,
    divisions,
    dotCount,
    startBeat,
    voice,
    staff,
    step,
    alter,
    octave,
    tieStart,
    tieStop,
    tieContinue,
    confidence: 0.85,
    confidenceReason: technical ? 'MusicXML teknik bilgi' : 'MusicXML perdeden hesaplandı',
  }
}

// Canonical beat resolution for the parser.
// Priority: duration/divisions > type+dot > 0 (never silently 1)
function resolveNoteBeats(durationValue, divisions, fallbackBeats) {
  if (
    typeof durationValue === 'number' && Number.isFinite(durationValue) && durationValue > 0 &&
    typeof divisions === 'number' && Number.isFinite(divisions) && divisions > 0
  ) {
    return durationValue / divisions
  }
  if (typeof fallbackBeats === 'number' && fallbackBeats > 0) {
    return fallbackBeats
  }
  return 0
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
  return durations[normalized] || 0
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

// Convert pitch to approximate guitar position.
// Guitar notation sounds one octave lower than written, so the
// mapping pitch is playbackMidi - 12.  The original playbackMidi is
// returned alongside so the caller can compute the correct sounding
// frequency without overwriting the display string/fret.
// Returns { string: letter, fret: number, playbackMidi: number }
function pitchToGuitarPosition(step, alter, octave) {
  // MIDI note calculation from written pitch
  const stepToMidi = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
  const playbackMidi = (octave + 1) * 12 + stepToMidi[step] + alter

  // Mapping pitch: one octave lower for guitar string/fret selection
  const mappingMidi = playbackMidi - 12

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
    const fret = mappingMidi - openMidi[i]
    if (fret >= 0 && fret <= 24 && fret < minFret) {
      minFret = fret
      bestString = i + 1
      bestFret = fret
    }
  }

  return { string: bestString, fret: bestFret, playbackMidi }
}

// ── Structural parser ──────────────────────────────────────────
//
// parseMusicXmlWithStructure(xml) returns the same flat note array as
// parseMusicXml(xml), plus structural metadata required by the OMR
// Quality Validator. The existing parseMusicXml is unchanged; this
// function reuses the same parseNote/parseMeasure logic and adds
// parallel extraction of time signatures, divisions, backup/forward
// elements, measure metadata, and an ordered event list.
//
// Return shape:
//   {
//     notes,              // same NoteObject[] as parseMusicXml
//     timeSignatures,     // [{ measureNumber, beats, beatType, symbol? }]
//     divisionsByMeasure, // [{ measureNumber, divisions }]
//     measureMetadata,    // [{ measureNumber, implicit, nonControlling, width }]
//     measureEvents,      // [{ measureNumber, sequenceIndex, type, ... }]
//   }

export function parseMusicXmlWithStructure(musicXmlString) {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(musicXmlString, 'application/xml')
    const parseError = doc.querySelector('parsererror')
    if (parseError) {
      return { notes: [], error: 'Geçersiz MusicXML formatı' }
    }

    const notes = []
    const timeSignatures = []
    const divisionsByMeasure = []
    const measureMetadata = []
    const measureEvents = []

    const parts = doc.querySelectorAll('part')

    for (const part of parts) {
      const measures = part.querySelectorAll('measure')
      let measureNumber = 0
      let currentDivisions = null

      for (const measure of measures) {
        measureNumber = parseInt(measure.getAttribute('number')) || (measureNumber + 1)

        // ── Divisions ──
        const attrsEl = measure.querySelector('attributes')
        if (attrsEl) {
          const divEl = attrsEl.querySelector('divisions')
          if (divEl) {
            currentDivisions = parseInt(divEl.textContent, 10) || currentDivisions
          }
        }
        divisionsByMeasure.push({ measureNumber, divisions: currentDivisions })

        // ── Time signatures ──
        const timeEls = measure.querySelectorAll('time')
        for (const timeEl of timeEls) {
          const beatsEl = timeEl.querySelector('beats')
          const beatTypeEl = timeEl.querySelector('beat-type')
          const symbol = timeEl.getAttribute('symbol')
          if (beatsEl && beatTypeEl) {
            const ts = {
              measureNumber,
              beats: parseInt(beatsEl.textContent, 10) || 4,
              beatType: parseInt(beatTypeEl.textContent, 10) || 4,
            }
            if (symbol) ts.symbol = symbol
            timeSignatures.push(ts)
          }
        }

        // ── Measure metadata ──
        const implicit = measure.getAttribute('implicit') === 'yes'
        const nonControlling = measure.getAttribute('non-controlling') === 'yes'
        const width = measure.getAttribute('width')
        measureMetadata.push({
          measureNumber,
          implicit,
          nonControlling,
          width: width || null,
        })

        // ── Ordered event list ──
        let sequenceIndex = 0

        // Attributes changes (divisions, time, key, clef)
        const attributesEl = measure.querySelector('attributes')
        if (attributesEl) {
          measureEvents.push({
            measureNumber,
            sequenceIndex,
            type: 'attributes',
          })
          sequenceIndex++
        }

        // Iterate direct children in source order: note, backup, forward
        const measureChildren = measure.children || []
        for (const child of measureChildren) {
          const tag = child.tagName || child.tag
          if (tag === 'note') {
            const noteData = parseNote(child, measureNumber, 0, currentDivisions)
            if (noteData) {
              notes.push(noteData)
              measureEvents.push({
                measureNumber,
                sequenceIndex,
                type: 'note',
                isChordNote: noteData.isChordNote || false,
                isRest: noteData.isRest || false,
                voice: noteData.voice,
                staff: noteData.staff,
                beats: noteData.beats,
                durationValue: noteData.durationValue,
                divisions: noteData.divisions,
              })
              sequenceIndex++
            }
          } else if (tag === 'backup') {
            const durEl = child.querySelector('duration')
            const durationDivisions = durEl ? parseInt(durEl.textContent, 10) : 0
            measureEvents.push({
              measureNumber,
              sequenceIndex,
              type: 'backup',
              durationDivisions,
            })
            sequenceIndex++
          } else if (tag === 'forward') {
            const durEl = child.querySelector('duration')
            const durationDivisions = durEl ? parseInt(durEl.textContent, 10) : 0
            measureEvents.push({
              measureNumber,
              sequenceIndex,
              type: 'forward',
              durationDivisions,
            })
            sequenceIndex++
          }
        }
      }
    }

    return {
      notes,
      timeSignatures,
      divisionsByMeasure,
      measureMetadata,
      measureEvents,
    }
  } catch (err) {
    return { notes: [], error: err.message || 'MusicXML parse hatası' }
  }
}
