// Package 3G — deterministic Standard MIDI File export from canonical NoteObject[].
//
// This module is intentionally dependency-free and read-only. It does not
// reparse MusicXML, repair OMR, infer instrumentation, or mutate NoteObjects.
// MIDI export is treated as a playback artifact, so the production-facing
// wrapper requires the existing Package 2D playback gate to ACCEPT the exact
// canonical array identity before bytes are generated.

import {
  buildTieChains,
  resolveBeats,
  tieChainBeats,
} from '../../noteTheory.js'
import {
  QUALITY_GATE_DECISION,
  resolveAppPlaybackGate,
} from './appQualityGate.js'

export const MIDI_PPQ = 480
export const MIDI_DEFAULT_TEMPO = 120
export const MIDI_DEFAULT_VELOCITY = 64
export const MIDI_GRACE_PLAYBACK_BEATS = 0.125
export const MIDI_MIME_TYPE = 'audio/midi'

const MAX_VLQ = 0x0fffffff
const MAX_TEMPO_US_PER_QUARTER = 0xffffff

function stripTrailingDotsAndSpaces(value) {
  let end = value.length
  while (end > 0) {
    const char = value[end - 1]
    if (char !== '.' && char !== ' ') break
    end -= 1
  }
  return value.slice(0, end)
}

function assertCanonicalNotes(notes) {
  if (!Array.isArray(notes) || notes.length === 0) {
    throw new TypeError('MIDI export requires a non-empty canonical NoteObject array.')
  }
}

function assertTempo(tempo) {
  if (!Number.isFinite(tempo) || tempo <= 0) {
    throw new RangeError('MIDI tempo must be a positive finite BPM value.')
  }
  const microseconds = Math.round(60000000 / tempo)
  if (microseconds < 1 || microseconds > MAX_TEMPO_US_PER_QUARTER) {
    throw new RangeError('MIDI tempo is outside the encodable range.')
  }
  return microseconds
}

function assertPpq(ppq) {
  if (!Number.isInteger(ppq) || ppq <= 0 || ppq > 0x7fff) {
    throw new RangeError('MIDI PPQ must be an integer from 1 to 32767.')
  }
}

function noteMeasureIndex(note) {
  return Number.isInteger(note?.measureIndex) && note.measureIndex >= 0
    ? note.measureIndex
    : null
}

function noteStartBeat(note) {
  return Number.isFinite(note?.startBeat) && note.startBeat >= 0
    ? note.startBeat
    : null
}

function noteOwnBeats(note) {
  if (note?.isGrace === true) return 0
  const beats = resolveBeats(note)
  return Number.isFinite(beats) && beats > 0 ? beats : null
}

/**
 * Build cumulative measure offsets only from observed canonical timing evidence.
 * No meter length is guessed. A missing physical measure therefore fails closed
 * instead of being silently compressed out of the MIDI timeline.
 */
export function buildCanonicalMeasureOffsets(notes) {
  assertCanonicalNotes(notes)

  const groups = new Map()
  let partIndex = null

  for (const note of notes) {
    if (!note || typeof note !== 'object' || Array.isArray(note)) {
      throw new TypeError('MIDI export received a malformed NoteObject.')
    }

    const measureIndex = noteMeasureIndex(note)
    const startBeat = noteStartBeat(note)
    if (measureIndex === null || startBeat === null) {
      throw new TypeError('MIDI export requires canonical measureIndex and startBeat.')
    }

    if (!Number.isInteger(note.partIndex) || note.partIndex < 0) {
      throw new TypeError('MIDI export requires canonical partIndex.')
    }
    if (partIndex === null) partIndex = note.partIndex
    if (note.partIndex !== partIndex) {
      throw new TypeError('MIDI export supports exactly one canonical part at a time.')
    }

    const measureKey = typeof note.measureKey === 'string' ? note.measureKey.trim() : ''
    if (!measureKey) {
      throw new TypeError('MIDI export requires canonical measureKey.')
    }

    let group = groups.get(measureIndex)
    if (!group) {
      group = { measureIndex, measureKey, maxEndBeat: 0 }
      groups.set(measureIndex, group)
    } else if (group.measureKey !== measureKey) {
      throw new TypeError('Conflicting canonical measure identity in MIDI input.')
    }

    const beats = noteOwnBeats(note)
    if (note.isGrace !== true && beats === null) {
      throw new TypeError('MIDI export requires positive canonical duration evidence.')
    }
    group.maxEndBeat = Math.max(group.maxEndBeat, startBeat + (beats ?? 0))
  }

  const ordered = [...groups.values()].sort((a, b) => a.measureIndex - b.measureIndex)
  if (ordered[0]?.measureIndex !== 0) {
    throw new TypeError('MIDI export cannot infer missing leading measures.')
  }

  for (let index = 0; index < ordered.length; index += 1) {
    if (ordered[index].measureIndex !== index) {
      throw new TypeError('MIDI export cannot infer a missing physical measure.')
    }
    if (!(ordered[index].maxEndBeat > 0)) {
      throw new TypeError('MIDI export cannot infer duration for an empty measure.')
    }
  }

  const offsets = new Map()
  let cumulativeBeat = 0
  for (const group of ordered) {
    offsets.set(group.measureIndex, cumulativeBeat)
    cumulativeBeat += group.maxEndBeat
  }

  return Object.freeze({
    partIndex,
    totalBeats: cumulativeBeat,
    measures: Object.freeze(ordered.map((group) => Object.freeze({
      measureIndex: group.measureIndex,
      measureKey: group.measureKey,
      offsetBeat: offsets.get(group.measureIndex),
      durationBeats: group.maxEndBeat,
    }))),
    offsets,
  })
}

/**
 * Create absolute beat-domain sounding events from canonical notes.
 * Ties have one attack with summed canonical member duration; rests advance the
 * measure evidence but produce no note event; chord members retain the same
 * startBeat. Grace duration deliberately reuses the existing playback policy
 * (0.125 beat) rather than introducing a new MIDI-only timing guess.
 */
export function buildCanonicalMidiTimeline(notes) {
  const measureLayout = buildCanonicalMeasureOffsets(notes)
  const { attacks, chains } = buildTieChains(notes)
  const chainMap = new Map()
  for (const chain of chains) {
    for (const member of chain) chainMap.set(member, chain)
  }

  const events = []

  for (const note of attacks) {
    if (note.isRest === true) continue

    if (!Number.isInteger(note.midi) || note.midi < 0 || note.midi > 127) {
      throw new RangeError('MIDI export requires an integer pitch from 0 to 127.')
    }

    const measureIndex = noteMeasureIndex(note)
    const startBeat = noteStartBeat(note)
    const measureOffset = measureLayout.offsets.get(measureIndex)
    if (!Number.isFinite(measureOffset) || startBeat === null) {
      throw new TypeError('MIDI export could not resolve canonical note timing.')
    }

    const chain = chainMap.get(note)
    const durationBeats = note.isGrace === true
      ? MIDI_GRACE_PLAYBACK_BEATS
      : (chain ? tieChainBeats(chain) : noteOwnBeats(note))

    if (!Number.isFinite(durationBeats) || durationBeats <= 0) {
      throw new TypeError('MIDI export requires positive performed duration.')
    }

    events.push(Object.freeze({
      note,
      midi: note.midi,
      startBeat: measureOffset + startBeat,
      durationBeats,
      endBeat: measureOffset + startBeat + durationBeats,
      isGrace: note.isGrace === true,
    }))
  }

  if (events.length === 0) {
    throw new TypeError('MIDI export requires at least one pitched sounding event.')
  }

  events.sort((a, b) => (
    a.startBeat - b.startBeat ||
    a.midi - b.midi ||
    a.endBeat - b.endBeat
  ))

  return Object.freeze({
    ppq: MIDI_PPQ,
    totalBeats: Math.max(measureLayout.totalBeats, ...events.map((event) => event.endBeat)),
    events: Object.freeze(events),
    measures: measureLayout.measures,
  })
}

function uint16(value) {
  return [(value >>> 8) & 0xff, value & 0xff]
}

function uint32(value) {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]
}

function ascii(value) {
  return [...value].map((char) => char.charCodeAt(0))
}

export function encodeVariableLength(value) {
  if (!Number.isInteger(value) || value < 0 || value > MAX_VLQ) {
    throw new RangeError('MIDI delta-time is outside the VLQ range.')
  }

  let buffer = value & 0x7f
  const bytes = []
  while ((value >>= 7) > 0) {
    buffer <<= 8
    buffer |= ((value & 0x7f) | 0x80)
  }
  while (true) {
    bytes.push(buffer & 0xff)
    if (buffer & 0x80) buffer >>= 8
    else break
  }
  return bytes
}

function tickForBeat(beat, ppq) {
  const tick = Math.round(beat * ppq)
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new RangeError('MIDI timeline exceeds safe tick range.')
  }
  return tick
}

/** Encode a deterministic SMF Format 0 byte stream. */
export function encodeMidiFile(notes, options = {}) {
  const tempo = options.tempo ?? MIDI_DEFAULT_TEMPO
  const ppq = options.ppq ?? MIDI_PPQ
  const velocity = options.velocity ?? MIDI_DEFAULT_VELOCITY
  const microsecondsPerQuarter = assertTempo(tempo)
  assertPpq(ppq)
  if (!Number.isInteger(velocity) || velocity < 1 || velocity > 127) {
    throw new RangeError('MIDI velocity must be an integer from 1 to 127.')
  }

  const timeline = buildCanonicalMidiTimeline(notes)
  const absoluteEvents = []
  let sequence = 0

  for (const event of timeline.events) {
    const startTick = tickForBeat(event.startBeat, ppq)
    const endTick = tickForBeat(event.endBeat, ppq)
    if (endTick <= startTick) {
      throw new RangeError('MIDI note duration collapsed to zero ticks.')
    }

    absoluteEvents.push({
      tick: startTick,
      priority: 1,
      sequence: sequence++,
      bytes: [0x90, event.midi, velocity],
    })
    absoluteEvents.push({
      tick: endTick,
      priority: 0,
      sequence: sequence++,
      bytes: [0x80, event.midi, 0],
    })
  }

  absoluteEvents.sort((a, b) => (
    a.tick - b.tick ||
    a.priority - b.priority ||
    a.bytes[1] - b.bytes[1] ||
    a.sequence - b.sequence
  ))

  const track = [
    0x00, 0xff, 0x51, 0x03,
    (microsecondsPerQuarter >>> 16) & 0xff,
    (microsecondsPerQuarter >>> 8) & 0xff,
    microsecondsPerQuarter & 0xff,
  ]

  let previousTick = 0
  for (const event of absoluteEvents) {
    const delta = event.tick - previousTick
    if (delta > MAX_VLQ) {
      throw new RangeError('MIDI event delta exceeds the SMF VLQ limit.')
    }
    track.push(...encodeVariableLength(delta), ...event.bytes)
    previousTick = event.tick
  }
  track.push(0x00, 0xff, 0x2f, 0x00)

  const header = [
    ...ascii('MThd'),
    ...uint32(6),
    ...uint16(0),
    ...uint16(1),
    ...uint16(ppq),
  ]
  const trackChunk = [
    ...ascii('MTrk'),
    ...uint32(track.length),
    ...track,
  ]

  return new Uint8Array([...header, ...trackChunk])
}

export function midiFileName(sourceName = 'seslitab') {
  const raw = String(sourceName || '').split(/[\\/]/).pop()?.trim() || 'seslitab'
  const safeName = raw
    .replace(/\.(?:musicxml|xml|pdf|mid|midi)$/i, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
  const base = stripTrailingDotsAndSpaces(safeName)
    .slice(0, 120)
    .trim()
  return `${base || 'seslitab'}.mid`
}

export function createMidiArtifact(notes, options = {}) {
  const bytes = encodeMidiFile(notes, options)
  return Object.freeze({
    bytes,
    fileName: midiFileName(options.sourceName),
    mimeType: MIDI_MIME_TYPE,
    tempo: options.tempo ?? MIDI_DEFAULT_TEMPO,
    ppq: options.ppq ?? MIDI_PPQ,
  })
}

export function createGatedMidiArtifact(notes, options = {}) {
  assertCanonicalNotes(notes)
  const resolveGate = options.resolveGate ?? resolveAppPlaybackGate
  const gate = resolveGate(notes)

  if (gate?.decision !== QUALITY_GATE_DECISION.ACCEPT) {
    return Object.freeze({
      ok: false,
      gate,
      reason: 'quality-gate-not-accepted',
      message: gate?.decision === QUALITY_GATE_DECISION.BLOCK
        ? 'MIDI dosyası oluşturulamadı: nota verisi güvenilirlik kontrolünü geçmedi.'
        : 'MIDI dosyası oluşturulamadı: nota verisi henüz doğrulanmadı.',
      artifact: null,
    })
  }

  return Object.freeze({
    ok: true,
    gate,
    reason: 'accepted',
    message: '',
    artifact: createMidiArtifact(notes, options),
  })
}
