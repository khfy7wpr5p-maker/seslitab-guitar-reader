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
// Includes dotted variants so createNote never falls back to 1 for a dotted duration.
const DURATION_TO_BEATS = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  sixteenth: 0.25,
  thirtySecond: 0.125,
  'dotted-half': 3,
  'dotted-quarter': 1.5,
  'dotted-eighth': 0.75,
  'dotted-sixteenth': 0.375,
}

/**
 * Canonical beat resolver shared by rhythmic text and playback.
 * Priority:
 *   1. valid precomputed note.beats (>0)
 *   2. durationValue / effectiveDivisions (both finite, >0)
 *   3. duration-type + dotCount lookup
 *   4. invalid → 0 (never silently 1)
 * @param {NoteObject} note
 * @returns {number}
 */
export function resolveBeats(note) {
  // Grace notes are untimed ornaments in MusicXML. Their visual note type
  // must never be used as measure duration.
  if (note?.isGrace) return 0

  if (note && typeof note.beats === 'number' && note.beats > 0) {
    return note.beats
  }
  if (
    note &&
    typeof note.durationValue === 'number' && Number.isFinite(note.durationValue) && note.durationValue > 0 &&
    typeof note.divisions === 'number' && Number.isFinite(note.divisions) && note.divisions > 0
  ) {
    return note.durationValue / note.divisions
  }
  if (note) {
    const base = DURATION_TO_BEATS[note.duration] ?? DURATION_TO_BEATS[note.restType]
    if (typeof base === 'number' && base > 0) {
      // If the duration string already includes "dotted-", the map value
      // already has one dot applied — don't apply dotCount again (double-dot bug).
      const isDotted = typeof note.duration === 'string' && note.duration.startsWith('dotted-')
      if (isDotted) return base
      return applyDots(base, note.dotCount || 0)
    }
  }
  return 0
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
    measureKey: data.measureKey ?? null,                         // Benzersiz ölçü kimliği (partId + sıra)
    measureIndex: data.measureIndex ?? null,                     // Part içindeki ölçü sırası (0 tabanlı)
    partId: data.partId ?? null,                                 // MusicXML part kimliği
    partIndex: data.partIndex ?? null,                           // MusicXML part sırası (0 tabanlı)
    startBeat: data.startBeat ?? 0,                              // Ölçü içindeki başlangıç zamanı (vuruş cinsinden)
    beatNumber: data.beatNumber ?? 1,                            // Vuruş numarası (1-4 in 4/4 time)

    // --- Duration ---
    duration: data.duration ?? 'quarter',                       // Nota süresi ID ('whole', 'half', 'quarter', 'eighth', 'sixteenth', 'thirtySecond')
    durationName: '',                                            // Nota süresi adı (auto: 'Birlik', 'İkilik', 'Dörtlük', 'Sekizlik', 'Onaltılık', 'Otuzikilik')
    beats: data.beats ?? 0,                                     // Kaç vuruş tuttuğu (parser may pre-compute)
    dotCount: data.dotCount ?? 0,                               // Noktalı nota bilgisi (0, 1, 2)
    durationValue: data.durationValue ?? null,                 // MusicXML <duration> raw value
    divisions: data.divisions ?? null,                          // Effective MusicXML <divisions> for this note

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
    step: data.step ?? null,                                    // Pitch step (C, D, E, ...)
    alter: data.alter ?? null,                                  // Chromatic alteration (-1, 0, 1)
    octave: data.octave ?? 4,                                   // Octave number

    // --- Articulations & Expressions ---
    tie: data.tie ?? null,                                       // Bağ (Tie): { start: boolean, end: boolean }
    slur: data.slur ?? null,                                     // Legato (Slur): { start: boolean, end: boolean, number: number }
    staccato: data.staccato ?? false,                           // Staccato
    accent: data.accent ?? false,                                // Accent (vurgu)

    // --- Rest ---
    isRest: data.isRest ?? false,                               // Sus işareti
    isGrace: data.isGrace ?? false,                             // Süresiz süsleme notası (<grace/>)
    restType: data.restType ?? null,                             // Sus türü ('whole', 'half', 'quarter', 'eighth', ...)

    // --- Chord ---
    isChord: data.isChord ?? false,                             // Akor bilgisi
    isChordNote: data.isChordNote ?? false,                     // <chord/> MusicXML — continuation note of a chord
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

    // --- Tie metadata (for tied notes across measures) ---
    tieStart: data.tieStart ?? false,                           // Uzatma bağı başlangıcı
    tieStop: data.tieStop ?? false,                             // Uzatma bağı sonu
    tieContinue: data.tieContinue ?? false,                     // Uzatma bağı devamı (start+stop same note)

    // --- Page (for PDF) ---
    page: data.page ?? 1,                                        // Sayfa numarası

    // --- Raw data (for debugging) ---
    _raw: data._raw ?? null,
  }

  // === AUTO-CALCULATED FIELDS ===

  // Canonical beat resolution: prefer explicit beats, then duration/divisions,
  // then type+dot lookup. Never silently fall back to 1.
  note.beats = resolveBeats(note)

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
    // Use canonical resolver for rests too — never silently fall back to 1.
    note.beats = resolveBeats(note)
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

  if (note.beats <= 0 && !note.isGrace) {
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
// TIE CHAINS
// =============================================================================

/**
 * Build tie chains from a list of notes that carry tie metadata.
 *
 * A tie chain groups consecutive notes with the same pitch (step + alter +
 * octave), voice, and staff, where the first note has tieStart and subsequent
 * notes have tieContinue and/or tieStop. The chain produces a single sounding
 * event whose total beats is the sum of all member beats.
 *
 * Rules:
 *   - tieStart creates one sounding event (one attack).
 *   - tieContinue / tieStop add their beats to that event (no new attack).
 *   - tieStop closes the chain.
 *   - Rests are never included.
 *   - Same pitch in different voices or staves does not merge.
 *   - Slurs are not ties and are ignored by this function.
 *
 * @param {NoteObject[]} notes — notes with tieStart/tieContinue/tieStop flags
 * @returns {{ attacks: NoteObject[], chains: NoteObject[][] }}
 *   attacks: notes that start a sound (untied notes + tie-start notes)
 *   chains: array of chains, each chain is an array of member notes
 */
export function buildTieChains(notes) {
  if (!notes || notes.length === 0) return { attacks: [], chains: [] }

  const attacks = []
  const chains = []
  const openChains = new Map()

  for (const note of notes) {
    if (note.isRest) {
      attacks.push(note)
      continue
    }

    const key = tieKey(note)

    if (note.tieStart && !note.tieStop) {
      const chain = [note]
      chains.push(chain)
      openChains.set(key, chain)
      attacks.push(note)
    } else if (note.tieStart && note.tieStop) {
      const chain = [note]
      chains.push(chain)
      attacks.push(note)
    } else if (note.tieStop) {
      const chain = openChains.get(key)
      if (chain) {
        chain.push(note)
        openChains.delete(key)
      } else {
        attacks.push(note)
      }
    } else if (note.tieContinue) {
      const chain = openChains.get(key)
      if (chain) {
        chain.push(note)
      } else {
        attacks.push(note)
      }
    } else {
      attacks.push(note)
    }
  }

  return { attacks, chains }
}

/**
 * Compute the total beats for a tie chain (sum of member beats).
 * @param {NoteObject[]} chain
 * @returns {number}
 */
export function tieChainBeats(chain) {
  if (!chain || chain.length === 0) return 0
  return chain.reduce((sum, n) => sum + (resolveBeats(n) || 0), 0)
}

function tieKey(note) {
  const step = note.step ?? ''
  const alter = note.alter ?? 0
  const octave = note.octave ?? 0
  const voice = note.voice ?? 1
  const staff = note.staff ?? 1
  return `${step}|${alter}|${octave}|${voice}|${staff}`
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
