// Music Engine — orchestrates tabParser, noteTheory, rhythmicTextGenerator, musicXmlParser.
//
// This module is the bridge between the raw root-level analysis modules and
// the frontend UI. It exposes a single NoteObject[] shape that the voice and
// rhythm services consume, plus text/HTML generators for the output panels.

import { tabToNotes, tabToTurkish, noteFrequency } from '../../tabParser.js'
import {
  CANONICAL_NOTE_SCHEMA_VERSION,
  createNote,
  noteName,
  resolveCanonicalPitch,
  resolveCanonicalTime,
  STRING_NAMES,
  STRING_NUMBER,
} from '../../noteTheory.js'
import { generateTurkishRhythmicText, generateTurkishRhythmicHtml, generateTurkishRhythmicSpokenText, generateNotesSummary } from '../../rhythmicTextGenerator.js'
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
  return generateTurkishRhythmicSpokenText(notes)
}


// ── MusicXML canonical bridge helpers ───────────────────────────
//
// MusicXML guitar data can describe two related but different views:
// - written score pitch
// - performed/display guitar string and fret
//
// Guitar notation can be octave-transposing. For that reason the bridge
// validates written pitch and guitar position as separate candidates instead
// of silently forcing every representation into one pitch.
//
// The bridge preserves the existing consumer-facing fields. Canonical
// validation is recorded in sourceVerificationState, while the original
// parser object is copied into _raw for later review.

function hasMusicXmlBridgeValue(value) {
  return (
    value !== undefined &&
    value !== null &&
    value !== ''
  )
}

function cloneMusicXmlBridgeValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) =>
      cloneMusicXmlBridgeValue(item)
    )
  }

  if (
    value &&
    typeof value === 'object'
  ) {
    const clone = {}

    for (const [key, nestedValue] of Object.entries(value)) {
      clone[key] =
        cloneMusicXmlBridgeValue(nestedValue)
    }

    return clone
  }

  return value
}

function assignMusicXmlBridgeValue(
  target,
  key,
  value,
) {
  if (hasMusicXmlBridgeValue(value)) {
    target[key] = value
  }
}

function createMusicXmlBridgeResolution({
  valid,
  status,
  authority,
  source,
  reason = null,
  value = null,
  candidates = {},
}) {
  return {
    valid,
    status,
    authority,
    source,
    reason,
    value,
    candidates,
  }
}

function summarizeMusicXmlBridgeResolution(
  resolution,
) {
  return {
    valid: resolution.valid,
    status: resolution.status,
    authority: resolution.authority,
    source: resolution.source,
    reason: resolution.reason,
  }
}

/**
 * Validate MusicXML pitch representations without mutating the source note.
 *
 * Selection rules:
 * - matching written + guitar + MIDI data: combined candidate
 * - technical guitar data matching MIDI: guitar candidate
 * - written pitch matching MIDI: written candidate
 * - ambiguous or malformed data: invalid marker, no silent repair
 *
 * @param {Object} sourceNote
 * @returns {Object}
 */
export function resolveMusicXmlBridgePitch(
  sourceNote = {},
) {
  if (
    !sourceNote ||
    typeof sourceNote !== 'object' ||
    Array.isArray(sourceNote)
  ) {
    return createMusicXmlBridgeResolution({
      valid: false,
      status: 'invalid',
      authority: 'none',
      source: 'invalid',
      reason: 'invalid-source-note',
    })
  }

  const source = sourceNote

  const stringLetter =
    hasMusicXmlBridgeValue(source.stringLetter)
      ? source.stringLetter
      : source.string

  if (source.isRest === true) {
    const restInput = {
      isRest: true,
    }

    assignMusicXmlBridgeValue(
      restInput,
      'midi',
      source.midi,
    )

    assignMusicXmlBridgeValue(
      restInput,
      'frequency',
      source.frequency,
    )

    assignMusicXmlBridgeValue(
      restInput,
      'noteName',
      source.noteName,
    )

    assignMusicXmlBridgeValue(
      restInput,
      'step',
      source.step,
    )

    assignMusicXmlBridgeValue(
      restInput,
      'alter',
      source.alter,
    )

    assignMusicXmlBridgeValue(
      restInput,
      'octave',
      source.octave,
    )

    assignMusicXmlBridgeValue(
      restInput,
      'stringLetter',
      stringLetter,
    )

    assignMusicXmlBridgeValue(
      restInput,
      'stringNumber',
      source.stringNumber,
    )

    assignMusicXmlBridgeValue(
      restInput,
      'fret',
      source.fret,
    )

    const restResult =
      resolveCanonicalPitch(restInput)

    if (restResult.valid) {
      return createMusicXmlBridgeResolution({
        valid: true,
        status: 'verified',
        authority: 'rest',
        source: restResult.source,
        value: restResult,
        candidates: {
          rest: restResult,
        },
      })
    }

    return createMusicXmlBridgeResolution({
      valid: false,
      status: 'invalid',
      authority: 'rest',
      source: restResult.source,
      reason: restResult.reason,
      candidates: {
        rest: restResult,
      },
    })
  }

  const commonInput = {}

  assignMusicXmlBridgeValue(
    commonInput,
    'midi',
    source.midi,
  )

  assignMusicXmlBridgeValue(
    commonInput,
    'frequency',
    source.frequency,
  )

  const writtenPresent =
    hasMusicXmlBridgeValue(source.step) ||
    hasMusicXmlBridgeValue(source.alter)

  const guitarStringNumberPresent =
    hasMusicXmlBridgeValue(
      source.stringNumber,
    ) &&
    source.stringNumber !== 0 &&
    source.stringNumber !== '0'

  const guitarPresent =
    hasMusicXmlBridgeValue(stringLetter) ||
    guitarStringNumberPresent

  const writtenInput = {
    ...commonInput,
  }

  if (writtenPresent) {
    assignMusicXmlBridgeValue(
      writtenInput,
      'step',
      source.step,
    )

    assignMusicXmlBridgeValue(
      writtenInput,
      'alter',
      source.alter,
    )

    assignMusicXmlBridgeValue(
      writtenInput,
      'octave',
      source.octave,
    )
  }

  const guitarInput = {
    ...commonInput,
  }

  if (guitarPresent) {
    assignMusicXmlBridgeValue(
      guitarInput,
      'stringLetter',
      stringLetter,
    )

    assignMusicXmlBridgeValue(
      guitarInput,
      'stringNumber',
      source.stringNumber,
    )

    assignMusicXmlBridgeValue(
      guitarInput,
      'fret',
      source.fret,
    )
  }

  const combinedInput = {
    ...commonInput,
  }

  if (writtenPresent) {
    Object.assign(
      combinedInput,
      writtenInput,
    )
  }

  if (guitarPresent) {
    Object.assign(
      combinedInput,
      guitarInput,
    )
  }

  const combinedResult =
    resolveCanonicalPitch(combinedInput)

  const candidates = {
    combined: combinedResult,
  }

  let writtenResult = null
  let guitarResult = null
  let midiResult = null

  if (writtenPresent) {
    writtenResult =
      resolveCanonicalPitch(writtenInput)

    candidates.written = writtenResult
  }

  if (guitarPresent) {
    guitarResult =
      resolveCanonicalPitch(guitarInput)

    candidates.guitar = guitarResult
  }

  if (
    hasMusicXmlBridgeValue(source.midi)
  ) {
    midiResult =
      resolveCanonicalPitch(commonInput)

    candidates.midi = midiResult
  }

  if (combinedResult.valid) {
    const authority =
      writtenPresent && guitarPresent
        ? 'combined'
        : writtenPresent
          ? 'written'
          : guitarPresent
            ? 'guitar'
            : 'midi'

    return createMusicXmlBridgeResolution({
      valid: true,
      status: 'verified',
      authority,
      source: combinedResult.source,
      value: combinedResult,
      candidates,
    })
  }

  const validStructuredCandidates = []

  if (writtenResult?.valid) {
    validStructuredCandidates.push({
      authority: 'written',
      value: writtenResult,
    })
  }

  if (guitarResult?.valid) {
    validStructuredCandidates.push({
      authority: 'guitar',
      value: guitarResult,
    })
  }

  if (validStructuredCandidates.length === 1) {
    const selected =
      validStructuredCandidates[0]

    return createMusicXmlBridgeResolution({
      valid: true,
      status: 'partial',
      authority: selected.authority,
      source: selected.value.source,
      reason: combinedResult.reason,
      value: selected.value,
      candidates,
    })
  }

  if (validStructuredCandidates.length > 1) {
    const uniqueMidiValues = new Set(
      validStructuredCandidates.map(
        (candidate) =>
          candidate.value.midi
      )
    )

    return createMusicXmlBridgeResolution({
      valid: false,
      status: 'invalid',
      authority: 'ambiguous',
      source: 'invalid',
      reason:
        uniqueMidiValues.size > 1
          ? 'ambiguous-pitch-candidates'
          : combinedResult.reason,
      candidates,
    })
  }

  if (midiResult?.valid) {
    return createMusicXmlBridgeResolution({
      valid: true,
      status: 'partial',
      authority: 'midi',
      source: midiResult.source,
      reason: combinedResult.reason,
      value: midiResult,
      candidates,
    })
  }

  return createMusicXmlBridgeResolution({
    valid: false,
    status: 'invalid',
    authority: 'none',
    source: 'invalid',
    reason:
      combinedResult.reason ??
      writtenResult?.reason ??
      guitarResult?.reason ??
      midiResult?.reason ??
      'missing-pitch',
    candidates,
  })
}

/**
 * Validate MusicXML onset and duration without mutating the source note.
 *
 * MusicXML duration/divisions and parser-computed beats are treated as the
 * authoritative timing pair. Duration type remains useful display metadata,
 * but a tuplet/type disagreement is marked partial rather than silently
 * overwriting performed time.
 *
 * @param {Object} sourceNote
 * @returns {Object}
 */
export function resolveMusicXmlBridgeTime(
  sourceNote = {},
) {
  if (
    !sourceNote ||
    typeof sourceNote !== 'object' ||
    Array.isArray(sourceNote)
  ) {
    return createMusicXmlBridgeResolution({
      valid: false,
      status: 'invalid',
      authority: 'none',
      source: 'invalid',
      reason: 'invalid-source-note',
    })
  }

  const source = sourceNote
  const commonInput = {}

  assignMusicXmlBridgeValue(
    commonInput,
    'startBeat',
    source.startBeat,
  )

  assignMusicXmlBridgeValue(
    commonInput,
    'isRest',
    source.isRest,
  )

  assignMusicXmlBridgeValue(
    commonInput,
    'isGrace',
    source.isGrace,
  )

  assignMusicXmlBridgeValue(
    commonInput,
    'isChordNote',
    source.isChordNote,
  )

  const fullInput = {
    ...commonInput,
  }

  assignMusicXmlBridgeValue(
    fullInput,
    'duration',
    source.duration,
  )

  assignMusicXmlBridgeValue(
    fullInput,
    'restType',
    source.restType,
  )

  assignMusicXmlBridgeValue(
    fullInput,
    'beats',
    source.beats,
  )

  assignMusicXmlBridgeValue(
    fullInput,
    'durationValue',
    source.durationValue,
  )

  assignMusicXmlBridgeValue(
    fullInput,
    'divisions',
    source.divisions,
  )

  assignMusicXmlBridgeValue(
    fullInput,
    'dotCount',
    source.dotCount,
  )

  const fullResult =
    resolveCanonicalTime(fullInput)

  const candidates = {
    full: fullResult,
  }

  if (fullResult.valid) {
    return createMusicXmlBridgeResolution({
      valid: true,
      status: 'verified',
      authority: 'all',
      source: fullResult.source,
      value: fullResult,
      candidates,
    })
  }

  const beatsPresent =
    hasMusicXmlBridgeValue(source.beats)

  const durationMetadataPresent =
    hasMusicXmlBridgeValue(
      source.durationValue,
    ) ||
    hasMusicXmlBridgeValue(
      source.divisions,
    )

  const durationTypePresent =
    hasMusicXmlBridgeValue(
      source.duration,
    ) ||
    hasMusicXmlBridgeValue(
      source.restType,
    )

  if (
    durationMetadataPresent &&
    beatsPresent
  ) {
    const metadataWithBeatsInput = {
      ...commonInput,
    }

    assignMusicXmlBridgeValue(
      metadataWithBeatsInput,
      'beats',
      source.beats,
    )

    assignMusicXmlBridgeValue(
      metadataWithBeatsInput,
      'durationValue',
      source.durationValue,
    )

    assignMusicXmlBridgeValue(
      metadataWithBeatsInput,
      'divisions',
      source.divisions,
    )

    const metadataWithBeatsResult =
      resolveCanonicalTime(
        metadataWithBeatsInput,
      )

    candidates.durationMetadata =
      metadataWithBeatsResult

    if (metadataWithBeatsResult.valid) {
      return createMusicXmlBridgeResolution({
        valid: true,
        status: 'partial',
        authority: 'duration-metadata',
        source:
          metadataWithBeatsResult.source,
        reason: fullResult.reason,
        value: metadataWithBeatsResult,
        candidates,
      })
    }

    return createMusicXmlBridgeResolution({
      valid: false,
      status: 'invalid',
      authority: 'duration-metadata',
      source: 'invalid',
      reason:
        metadataWithBeatsResult.reason,
      candidates,
    })
  }

  if (durationMetadataPresent) {
    const metadataInput = {
      ...commonInput,
    }

    assignMusicXmlBridgeValue(
      metadataInput,
      'durationValue',
      source.durationValue,
    )

    assignMusicXmlBridgeValue(
      metadataInput,
      'divisions',
      source.divisions,
    )

    const metadataResult =
      resolveCanonicalTime(metadataInput)

    candidates.durationMetadata =
      metadataResult

    if (metadataResult.valid) {
      return createMusicXmlBridgeResolution({
        valid: true,
        status: 'partial',
        authority: 'duration-metadata',
        source: metadataResult.source,
        reason: fullResult.reason,
        value: metadataResult,
        candidates,
      })
    }

    return createMusicXmlBridgeResolution({
      valid: false,
      status: 'invalid',
      authority: 'duration-metadata',
      source: 'invalid',
      reason: metadataResult.reason,
      candidates,
    })
  }

  if (beatsPresent) {
    const beatsInput = {
      ...commonInput,
    }

    assignMusicXmlBridgeValue(
      beatsInput,
      'beats',
      source.beats,
    )

    const beatsResult =
      resolveCanonicalTime(beatsInput)

    candidates.beats = beatsResult

    if (beatsResult.valid) {
      return createMusicXmlBridgeResolution({
        valid: true,
        status: 'partial',
        authority: 'beats',
        source: beatsResult.source,
        reason: fullResult.reason,
        value: beatsResult,
        candidates,
      })
    }
  }

  if (durationTypePresent) {
    const durationTypeInput = {
      ...commonInput,
    }

    assignMusicXmlBridgeValue(
      durationTypeInput,
      'duration',
      source.duration,
    )

    assignMusicXmlBridgeValue(
      durationTypeInput,
      'restType',
      source.restType,
    )

    assignMusicXmlBridgeValue(
      durationTypeInput,
      'dotCount',
      source.dotCount,
    )

    const durationTypeResult =
      resolveCanonicalTime(
        durationTypeInput,
      )

    candidates.durationType =
      durationTypeResult

    if (durationTypeResult.valid) {
      return createMusicXmlBridgeResolution({
        valid: true,
        status: 'partial',
        authority: 'duration-type',
        source: durationTypeResult.source,
        reason: fullResult.reason,
        value: durationTypeResult,
        candidates,
      })
    }
  }

  return createMusicXmlBridgeResolution({
    valid: false,
    status: 'invalid',
    authority: 'none',
    source: 'invalid',
    reason: fullResult.reason,
    candidates,
  })
}

/**
 * Convert one raw MusicXML parser note into the existing NoteObject shape,
 * enriched with canonical verification metadata.
 *
 * Existing playback, TTS, rhythm, string/fret and score fields are preserved.
 * Invalid canonical data is marked; it is never silently repaired.
 *
 * @param {Object} sourceNote
 * @returns {NoteObject}
 */
export function createCanonicalMusicXmlBridgeNote(
  sourceNote = {},
) {
  const source =
    sourceNote &&
    typeof sourceNote === 'object' &&
    !Array.isArray(sourceNote)
      ? sourceNote
      : {}

  const rawSource =
    cloneMusicXmlBridgeValue(source)

  const pitchResolution =
    resolveMusicXmlBridgePitch(source)

  const timeResolution =
    resolveMusicXmlBridgeTime(source)

  const bridgeStatus =
    !pitchResolution.valid ||
    !timeResolution.valid
      ? 'invalid'
      : pitchResolution.status === 'verified' &&
          timeResolution.status === 'verified'
        ? 'verified'
        : 'partial'

  const stringLetter =
    hasMusicXmlBridgeValue(
      source.stringLetter,
    )
      ? source.stringLetter
      : source.string

  const note = createNote({
    stringLetter,
    stringNumber: source.stringNumber,
    fret: source.fret,
    noteName: source.noteName,
    midi: source.midi,
    frequency: source.frequency,
    duration: source.duration,
    measureNumber:
      source.measureNumber ??
      source.measure,
    measureKey: source.measureKey,
    measureIndex: source.measureIndex,
    partId: source.partId,
    partIndex: source.partIndex,
    startBeat: source.startBeat,
    beats: source.beats,
    durationValue: source.durationValue,
    divisions: source.divisions,
    dotCount: source.dotCount,
    confidence: source.confidence,
    confidenceReason:
      source.confidenceReason,
    isRest: source.isRest,
    isGrace: source.isGrace,
    voice: source.voice,
    staff: source.staff,
    step: source.step,
    alter: source.alter,
    octave: source.octave,
    tieStart: source.tieStart,
    tieStop: source.tieStop,
    tieContinue: source.tieContinue,
    isChordNote: source.isChordNote,
    _raw: rawSource,
  })

  return {
    ...note,
    tuplet: source.tuplet ?? null,
    beam: source.beam ?? null,
    sourceVerificationState: {
      schemaVersion:
        CANONICAL_NOTE_SCHEMA_VERSION,
      status: bridgeStatus,
      pitch:
        summarizeMusicXmlBridgeResolution(
          pitchResolution,
        ),
      time:
        summarizeMusicXmlBridgeResolution(
          timeResolution,
        ),
    },
    _raw: rawSource,
  }
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

  // SesliTab is a single-instrument reader. OMR exports can contain a
  // parallel rest-only part; use the parser-selected pitched part so the
  // second part is not appended as silence or duplicate timing.
  const sourceNotes = result.primaryPartId
    ? (result.notes || []).filter((note) => note.partId === result.primaryPartId)
    : (result.notes || [])

  // Preserve the existing NoteObject consumer shape while attaching
  // canonical validation and raw MusicXML source metadata.
  const notes = sourceNotes.map(
    createCanonicalMusicXmlBridgeNote
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
