// Note theory helpers for SesliTab
// Maps (string, fret) -> Turkish note name and frequency,
// and defines note durations used in the teacher review screen.
// Includes the core NoteObject data model used throughout the application.

import { fretToText } from './tabParser.js'

// =============================================================================
// STRING & FRETTING
// =============================================================================

// String letter -> Turkish ordinal name
export const STRING_NAMES = {
  e: 'birinci',
  B: 'ikinci',
  G: 'üçüncü',
  D: 'dördüncü',
  A: 'beşinci',
  E: 'altıncı',
}

// String letter -> string number (1..6)
export const STRING_NUMBER = { e: 1, B: 2, G: 3, D: 4, A: 5, E: 6 }

// String number -> letter
export const STRING_LETTER = ['e', 'B', 'G', 'D', 'A', 'E']

// Standard tuning open-string frequencies (Hz)
const OPEN_STRING_FREQ = {
  e: 329.63, // E4
  B: 246.94, // B3
  G: 196.00, // G3
  D: 146.83, // D3
  A: 110.00, // A2
  E: 82.41,  // E2
}

// Standard tuning open-string MIDI note numbers
const OPEN_STRING_MIDI = {
  e: 64, // E4
  B: 59, // B3
  G: 55, // G3
  D: 50, // D3
  A: 45, // A2
  E: 40, // E2
}

// Open-string pitch classes (semitone offset from C)
const OPEN_STRING_PITCH_CLASS = {
  e: 4,  // Mi
  B: 11, // Si
  G: 7,  // Sol
  D: 2,  // Re
  A: 9,  // La
  E: 4,  // Mi
}

// =============================================================================
// NOTE NAMES (Turkish Solfege)
// =============================================================================

// Chromatic scale note names in Turkish solfege
const CHROMATIC_TR = [
  'Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa',
  'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si',
]

// Chromatic with flats (for bemol)
const CHROMATIC_TR_FLAT = [
  'Do', 'Reb', 'Re', 'Mib', 'Mi', 'Fa',
  'Solb', 'Sol', 'Lab', 'La', 'Sib', 'Si',
]

export function noteFrequency(stringLetter, fret) {
  const base = OPEN_STRING_FREQ[stringLetter]
  if (!base) return null
  const n = parseInt(fret, 10)
  if (Number.isNaN(n)) return null
  return base * Math.pow(2, n / 12)
}

export function noteName(stringLetter, fret) {
  const base = OPEN_STRING_PITCH_CLASS[stringLetter]
  if (base === undefined) return ''
  const n = parseInt(fret, 10)
  if (Number.isNaN(n)) return ''
  return CHROMATIC_TR[(base + n) % 12]
}

// =============================================================================
// DURATIONS
// =============================================================================

// Note duration types with Turkish names and beat values
export const DURATION_TYPES = {
  whole:     { id: 'whole',     label: 'birlik nota',    beats: 4,    beatsText: 'dört vuruş',    symbol: '\uE1D2', name: 'Birlik' },
  half:      { id: 'half',      label: 'ikilik nota',    beats: 2,    beatsText: 'iki vuruş',     symbol: '\uE1D3', name: 'İkilik' },
  quarter:   { id: 'quarter',   label: 'dörtlük nota',   beats: 1,    beatsText: 'bir vuruş',     symbol: '\uE1D5', name: 'Dörtlük' },
  eighth:    { id: 'eighth',    label: 'sekizlik nota',  beats: 0.5,  beatsText: 'yarım vuruş',   symbol: '\uE1D7', name: 'Sekizlik' },
  sixteenth: { id: 'sixteenth', label: 'on altılık nota', beats: 0.25, beatsText: 'çeyrek vuruş',   symbol: '\u1D15', name: 'Onaltılık' },
  thirtySecond: { id: 'thirtySecond', label: 'otuz ikilik nota', beats: 0.125, beatsText: 'sekizde bir vuruş', symbol: '\uE1DB', name: 'Otuzikilik' },
  // Dotted variants
  'dotted-half':      { id: 'dotted-half',      label: 'noktalı ikilik nota',    beats: 3,    beatsText: 'üç vuruş',     symbol: '\uE1D3\uE1E7', name: 'Noktalı İkilik' },
  'dotted-quarter':   { id: 'dotted-quarter',   label: 'noktalı dörtlük nota',  beats: 1.5,  beatsText: 'bir buçuk vuruş', symbol: '\uE1D5\uE1E7', name: 'Noktalı Dörtlük' },
  'dotted-eighth':    { id: 'dotted-eighth',    label: 'noktalı sekizlik nota', beats: 0.75, beatsText: 'üç çeyrek vuruş', symbol: '\uE1D7\uE1E7', name: 'Noktalı Sekizlik' },
  'dotted-sixteenth': { id: 'dotted-sixteenth', label: 'noktalı onaltılık nota', beats: 0.375, beatsText: 'yarım çeyrek vuruş', symbol: '\u1D15\uE1E7', name: 'Noktalı Onaltılık' },
}

// Legacy export for compatibility
export const NOTE_DURATIONS = [
  DURATION_TYPES.whole,
  DURATION_TYPES.half,
  DURATION_TYPES['dotted-half'],
  DURATION_TYPES.quarter,
  DURATION_TYPES.eighth,
  DURATION_TYPES.sixteenth,
]

export function durationLabel(id) {
  const d = DURATION_TYPES[id]
  return d ? d.label : id
}

export function durationBeats(id) {
  const d = DURATION_TYPES[id]
  return d ? d.beats : 1
}

export function durationBeatsText(id) {
  const d = DURATION_TYPES[id]
  return d ? d.beatsText : 'bir vuruş'
}

export function durationName(id) {
  const d = DURATION_TYPES[id]
  return d ? d.name : 'Dörtlük'
}

// Map a duration in beats to the closest note duration id.
export function beatsToDurationId(beats) {
  const b = Number(beats)
  if (Number.isNaN(b)) return 'quarter'
  let best = 'quarter'
  let bestDiff = Infinity
  for (const d of Object.values(DURATION_TYPES)) {
    const diff = Math.abs(d.beats - b)
    if (diff < bestDiff) { bestDiff = diff; best = d.id }
  }
  return best
}

// Calculate beats for a dotted duration
export function applyDots(baseBeats, dotCount) {
  let result = baseBeats
  for (let i = 0; i < dotCount; i++) {
    result += baseBeats * Math.pow(0.5, i + 1)
  }
  return result
}

// Get duration ID for a base duration with dots
export function getDurationIdWithDots(baseDuration, dotCount) {
  if (dotCount === 0) return baseDuration
  const dottedKey = `dotted-${baseDuration}`
  if (DURATION_TYPES[dottedKey]) return dottedKey
  return baseDuration
}

// =============================================================================
// TIME SIGNATURE
// =============================================================================

export const TIME_SIGNATURES = {
  '2/4': { beats: 2, beatType: 4, label: 'iki dörtlük' },
  '3/4': { beats: 3, beatType: 4, label: 'üç dörtlük' },
  '4/4': { beats: 4, beatType: 4, label: 'dört dörtlük' },
  '6/8': { beats: 6, beatType: 8, label: 'altı sekizlik' },
  '2/2': { beats: 2, beatType: 2, label: 'iki ikilik' },
}

// =============================================================================
// ACCIDENTALS
// =============================================================================

export const ACCIDENTALS = {
  sharp:   { id: 'sharp',   label: 'diyez',  symbol: '#', semitones: 1 },
  flat:    { id: 'flat',    label: 'bemol',  symbol: 'b', semitones: -1 },
  natural: { id: 'natural', label: 'natural', symbol: '',  semitones: 0 },
  doubleSharp: { id: 'doubleSharp', label: 'çift diyez', symbol: 'x', semitones: 2 },
  doubleFlat:  { id: 'doubleFlat',  label: 'çift bemol', symbol: 'bb', semitones: -2 },
}

// =============================================================================
// MIDI HELPERS
// =============================================================================

const TURKISH_NOTE_NAMES = [
  'Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa',
  'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si',
]

export function midiToNoteName(midi) {
  const n = parseInt(midi, 10)
  if (Number.isNaN(n)) return ''
  return TURKISH_NOTE_NAMES[((n % 12) + 12) % 12]
}

export function midiToFrequency(midi) {
  const n = parseInt(midi, 10)
  if (Number.isNaN(n)) return null
  return 440 * Math.pow(2, (n - 69) / 12)
}

export function noteToMidi(stringLetter, fret) {
  const base = OPEN_STRING_MIDI[stringLetter]
  if (base === undefined) return null
  const n = parseInt(fret, 10)
  if (Number.isNaN(n)) return null
  return base + n
}

// Get octave from MIDI note number
export function midiToOctave(midi) {
  return Math.floor(midi / 12) - 1
}

// =============================================================================
// NOTEOBJECT DATA MODEL
// =============================================================================

/**
 * NoteObject - Core data model for all notes in SesliTab
 *
 * This model is used by:
 * - Voice reading (sesli okuma)
 * - Rhythmic playback (ritmik çalma)
 * - Teacher review screen (öğretmen düzeltmesi)
 * - Student practice screen (öğrenci çalışma ekranı)
 *
 * @typedef {Object} NoteObject
 */

// Duration type to beats mapping (auto-calculated)
const DURATION_TO_BEATS = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  sixteenth: 0.25,
  thirtySecond: 0.125,
}

/**
 * Create a NoteObject with default values and auto-calculated fields
 * @param {Object} data - Partial note data
 * @returns {NoteObject} Complete note object
 */
export function createNote(data = {}) {
  const note = {
    // --- Position dans la partition ---
    measureNumber: data.measureNumber ?? data.measure ?? 1,     // Ölçü numarası (1, 2, 3, ...)
    startBeat: data.startBeat ?? 0,                              // Ölçü içindeki başlangıç zamanı (vuruş cinsinden)
    beatNumber: data.beatNumber ?? 1,                            // Vuruş numarası (1-4 in 4/4 time)

    // --- Duration ---
    duration: data.duration ?? 'quarter',                       // Nota süresi ID ('whole', 'half', 'quarter', 'eighth', 'sixteenth', 'thirtySecond')
    durationName: '',                                            // Nota süresi adı (auto: 'Birlik', 'İkilik', 'Dörtlük', 'Sekizlik', 'Onaltılık', 'Otuzikilik')
    beats: 0,                                                    // Kaç vuruş tuttuğu (auto-calculated)
    dotCount: data.dotCount ?? 0,                               // Noktalı nota bilgisi (0, 1, 2)

    // --- Pitch ---
    noteName: data.noteName ?? '',                              // Nota adı ('Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si')
    octave: data.octave ?? 4,                                   // Oktav (2, 3, 4, 5, 6)
    accidental: data.accidental ?? null,                        // Diyez/Bemol ('sharp', 'flat', 'natural', null)
    accidentalLabel: '',                                         // Accidentals Türkçe adı (auto)
    frequency: data.frequency ?? null,                          // Frekans (Hz)
    midi: data.midi ?? null,                                     // MIDI note number

    // --- Guitar Position ---
    stringNumber: data.stringNumber ?? 0,                       // Tel numarası (1-6, e=1, E=6)
    stringLetter: data.stringLetter ?? data.string ?? '',       // Tel harfi ('e', 'B', 'G', 'D', 'A', 'E')
    fret: data.fret ?? 0,                                        // Perde numarası (0-24)

    // --- MusicXML / Score Info ---
    voice: data.voice ?? 1,                                      // Voice (çok sesli müzikte)
    staff: data.staff ?? 1,                                      // Staff (staff 1 = TAB, staff 2 = standard notation)

    // --- Articulations & Expressions ---
    tie: data.tie ?? null,                                       // Bağ (Tie): { start: boolean, end: boolean }
    slur: data.slur ?? null,                                     // Legato (Slur): { start: boolean, end: boolean, number: number }
    staccato: data.staccato ?? false,                           // Staccato
    accent: data.accent ?? false,                                // Accent (vurgu)

    // --- Rest ---
    isRest: data.isRest ?? false,                               // Sus işareti
    restType: data.restType ?? null,                             // Sus türü ('whole', 'half', 'quarter', 'eighth', ...)

    // --- Chord ---
    isChord: data.isChord ?? false,                             // Akor bilgisi
    chordName: data.chordName ?? null,                          // Akor adı ('Am', 'C', 'G7', ...)
    chordNotes: data.chordNotes ?? null,                         // Akordaki diğer notalar (NoteObject[])

    // --- Tempo & Time Signature ---
    tempo: data.tempo ?? 120,                                    // Tempo (BPM)
    timeSignature: data.timeSignature ?? '4/4',                 // Ölçü işareti ('4/4', '3/4', '6/8', ...)

    // --- Repeats ---
    repeatStart: data.repeatStart ?? false,                    // Tekrar başlangıcı
    repeatEnd: data.repeatEnd ?? false,                         // Tekrar bitişi
    repeatTimes: data.repeatTimes ?? 0,                         // Kaç kere tekrar edilecek

    // --- Confidence (for OMR/parsing) ---
    confidence: data.confidence ?? 0.5,                          // Güven puanı (0.0 - 1.0)
    confidenceReason: data.confidenceReason ?? '',              // Neden düşük yüksek güven

    // --- Page (for PDF) ---
    page: data.page ?? 1,                                        // Sayfa numarası

    // --- Raw data (for debugging) ---
    _raw: data._raw ?? null,
  }

  // === AUTO-CALCULATED FIELDS ===

  // Calculate beats from duration
  const baseBeats = DURATION_TO_BEATS[note.duration] ?? 1
  note.beats = applyDots(baseBeats, note.dotCount)

  // Update duration ID if dotted
  if (note.dotCount > 0) {
    note.duration = getDurationIdWithDots(data.duration ?? 'quarter', note.dotCount)
  }

  // Duration name
  note.durationName = durationName(note.duration)

  // String number from letter if missing
  if (!note.stringNumber && note.stringLetter) {
    note.stringNumber = STRING_NUMBER[note.stringLetter] ?? 0
  }

  // String letter from number if missing
  if (!note.stringLetter && note.stringNumber) {
    note.stringLetter = STRING_LETTER[note.stringNumber - 1] ?? ''
  }

  // Note name and related from string/fret if missing
  if (!note.noteName && note.stringLetter) {
    note.noteName = noteName(note.stringLetter, note.fret)
  }

  // MIDI from string/fret
  if (note.midi === null && note.stringLetter) {
    note.midi = noteToMidi(note.stringLetter, note.fret)
  }

  // Octave from MIDI
  if (note.octave === null && note.midi !== null) {
    note.octave = midiToOctave(note.midi)
  }

  // Frequency from string/fret or MIDI
  if (note.frequency === null) {
    if (note.stringLetter && note.fret !== null) {
      note.frequency = noteFrequency(note.stringLetter, note.fret)
    } else if (note.midi !== null) {
      note.frequency = midiToFrequency(note.midi)
    }
  }

  // Accidental label
  if (note.accidental) {
    note.accidentalLabel = ACCIDENTALS[note.accidental]?.label ?? ''
  }

  // Rest duration name
  if (note.isRest && note.restType) {
    note.duration = note.restType
    note.durationName = durationName(note.restType)
    note.beats = DURATION_TO_BEATS[note.restType] ?? 1
  }

  return note
}

/**
 * Convert a NoteObject to a Turkish spoken phrase
 * @param {NoteObject} note
 * @returns {string} Turkish phrase describing the note
 */
export function noteToTurkish(note) {
  // Handle rests
  if (note.isRest) {
    const restLabel = durationLabel(note.duration || note.restType)
    return `${restLabel}, sus`
  }

  const tel = STRING_NAMES[note.stringLetter] || `${note.stringLetter} tel`
  const perde = fretToText(note.fret)
  const ad = note.noteName || noteName(note.stringLetter, note.fret)
  const sure = durationLabel(note.duration)
  const vurusText = durationBeatsText(note.duration)

  let phrase = `${tel} tel ${perde}, ${ad} notası, ${sure}, ${vurusText}`

  // Add accidental if present
  if (note.accidentalLabel) {
    phrase += ` (${note.accidentalLabel})`
  }

  return phrase
}

/**
 * Clone a NoteObject with optional overrides
 * @param {NoteObject} note
 * @param {Object} overrides
 * @returns {NoteObject}
 */
export function cloneNote(note, overrides = {}) {
  return createNote({ ...note, ...overrides })
}

/**
 * Validate a NoteObject
 * @param {NoteObject} note
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateNote(note) {
  const errors = []

  if (note.measureNumber < 1) {
    errors.push('Ölçü numarası 1\'den küçük olamaz')
  }

  if (!note.isRest) {
    if (!note.stringLetter && note.stringNumber < 1) {
      errors.push('Tel bilgisi gerekli')
    }
    if (note.fret < 0) {
      errors.push('Perde numarası negatif olamaz')
    }
  }

  if (note.beats <= 0) {
    errors.push('Vuruş süresi pozitif olmalı')
  }

  if (note.confidence < 0 || note.confidence > 1) {
    errors.push('Güven puanı 0-1 arasında olmalı')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

// =============================================================================
// COMPARISON & SORTING
// =============================================================================

/**
 * Compare two notes by time position
 * @param {NoteObject} a
 * @param {NoteObject} b
 * @returns {number} -1, 0, or 1
 */
export function compareNotesByTime(a, b) {
  if (a.page !== b.page) return a.page - b.page
  if (a.measureNumber !== b.measureNumber) return a.measureNumber - b.measureNumber
  return a.startBeat - b.startBeat
}

/**
 * Sort an array of notes by time position
 * @param {NoteObject[]} notes
 * @returns {NoteObject[]}
 */
export function sortNotesByTime(notes) {
  return [...notes].sort(compareNotesByTime)
}

// =============================================================================
// LEGACY / DEMO
// =============================================================================

// Build the demo analysis result (3 notes) requested by the task.
export function demoAnalysis() {
  return [
    createNote({ stringLetter: 'G', fret: 2, duration: 'quarter', measureNumber: 1, startBeat: 0 }),
    createNote({ stringLetter: 'B', fret: 1, duration: 'quarter', measureNumber: 1, startBeat: 1 }),
    createNote({ stringLetter: 'e', fret: 0, duration: 'half', measureNumber: 1, startBeat: 2 }),
  ]
}
