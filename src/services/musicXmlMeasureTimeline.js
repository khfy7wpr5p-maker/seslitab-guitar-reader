// MusicXML Measure Timeline Calculator
//
// Pure, isolated module. Interprets ordered MusicXML measure events
// (notes, backup, forward, attributes) using raw MusicXML divisions to
// produce exact cursor positions and measure durations.
//
// This module does NOT modify note durations, resolveBeats(), or any
// playback/MIDI/TTS/HTML behavior. It reads the structured score
// produced by parseMusicXmlWithStructure() and returns a timeline.

/**
 * Build a per-measure timeline from a structured MusicXML score.
 *
 * @param {Object} structuredScore - output of parseMusicXmlWithStructure(xml)
 * @returns {{ measures: Object[], warnings: string[] }}
 */
export function buildMeasureTimeline(structuredScore) {
  const warnings = []

  if (!structuredScore || !Array.isArray(structuredScore.measureEvents)) {
    return { measures: [], warnings: ['No measureEvents available in structured score'] }
  }

  const measureEvents = structuredScore.measureEvents
  const divisionsByMeasure = structuredScore.divisionsByMeasure || []
  const measureMetadata = structuredScore.measureMetadata || []

  // Group by the stable structural identity (part + measure sequence).
  // Displayed MusicXML measure numbers are not unique: they can repeat
  // after page/system breaks and they repeat in every part.
  const measuresMap = new Map()
  for (const meta of measureMetadata) {
    const key = getMeasureKey(meta)
    if (!measuresMap.has(key)) {
      measuresMap.set(key, { context: getMeasureContext(meta, key), events: [] })
    }
  }

  for (const evt of measureEvents) {
    const key = getMeasureKey(evt)
    if (!measuresMap.has(key)) {
      measuresMap.set(key, { context: getMeasureContext(evt, key), events: [] })
    }
    measuresMap.get(key).events.push(evt)
  }

  // Build a lookup for active divisions per measure.
  const divisionsLookup = new Map()
  for (const d of divisionsByMeasure) {
    divisionsLookup.set(getMeasureKey(d), d.divisions)
  }

  const result = []

  for (const [measureKey, entry] of measuresMap) {
    const { context, events } = entry
    const { measureNumber, partId, partIndex, measureIndex } = context

    // Sort by sequenceIndex to guarantee source order.
    events.sort((a, b) => a.sequenceIndex - b.sequenceIndex)

    const divisions = divisionsLookup.has(measureKey)
      ? divisionsLookup.get(measureKey)
      : null

    const measureWarnings = []
    const hasValidDivisions = typeof divisions === 'number' && Number.isFinite(divisions) && divisions > 0

    if (!hasValidDivisions) {
      measureWarnings.push(`Measure ${measureNumber}: missing or invalid divisions`)
    }

    let cursor = 0
    let maxCursor = 0
    let lastNonChordCursor = 0

    const timedEvents = []
    const voices = new Map()

    for (const evt of events) {
      if (evt.type === 'attributes') {
        timedEvents.push({
          type: 'attributes',
          sequenceIndex: evt.sequenceIndex,
          voice: null,
          staff: null,
          startDivisions: cursor,
          durationDivisions: 0,
          endDivisions: cursor,
          isChordNote: false,
        })
        continue
      }

      if (evt.type === 'note') {
        const isGrace = evt.isGrace === true
        const durationDivisions = typeof evt.durationValue === 'number' && Number.isFinite(evt.durationValue)
          ? evt.durationValue
          : null

        // MusicXML grace notes intentionally have no <duration>. They are
        // ornamental, do not consume measure time, and are therefore valid.
        if (durationDivisions === null && !isGrace) {
          measureWarnings.push(`Measure ${measureNumber}: note at sequence ${evt.sequenceIndex} has no valid duration`)
        }

        const noteDuration = isGrace ? 0 : (durationDivisions ?? 0)

        let startDivisions
        if (evt.isChordNote) {
          // Chord continuation: same start as the preceding non-chord note.
          startDivisions = lastNonChordCursor
        } else {
          startDivisions = cursor
          if (!isGrace) lastNonChordCursor = cursor
        }

        const endDivisions = startDivisions + noteDuration

        if (!Number.isFinite(endDivisions)) {
          measureWarnings.push(`Measure ${measureNumber}: cursor became non-finite at sequence ${evt.sequenceIndex}`)
          break
        }

        timedEvents.push({
          type: 'note',
          sequenceIndex: evt.sequenceIndex,
          voice: evt.voice ?? null,
          staff: evt.staff ?? null,
          startDivisions,
          durationDivisions: noteDuration,
          endDivisions,
          isGrace,
          isChordNote: evt.isChordNote || false,
        })

        // Track per-voice max cursor.
        const voiceKey = evt.voice ?? 1
        if (!voices.has(voiceKey)) {
          voices.set(voiceKey, { maxCursor: 0, events: [] })
        }
        const voiceEntry = voices.get(voiceKey)
        voiceEntry.events.push(timedEvents[timedEvents.length - 1])
        if (endDivisions > voiceEntry.maxCursor) {
          voiceEntry.maxCursor = endDivisions
        }

        if (!evt.isChordNote && !isGrace) {
          // Only timed, non-chord notes advance the cursor.
          cursor = endDivisions
        }

        if (cursor > maxCursor) maxCursor = cursor
        if (endDivisions > maxCursor) maxCursor = endDivisions
        continue
      }

      if (evt.type === 'backup') {
        const backupDur = typeof evt.durationDivisions === 'number' && Number.isFinite(evt.durationDivisions)
          ? evt.durationDivisions
          : null

        if (backupDur === null || backupDur < 0) {
          measureWarnings.push(`Measure ${measureNumber}: backup at sequence ${evt.sequenceIndex} has invalid duration`)
          timedEvents.push({
            type: 'backup',
            sequenceIndex: evt.sequenceIndex,
            voice: null,
            staff: null,
            startDivisions: cursor,
            durationDivisions: backupDur ?? 0,
            endDivisions: cursor,
            isChordNote: false,
          })
          continue
        }

        const newCursor = cursor - backupDur
        if (newCursor < 0) {
          measureWarnings.push(`Measure ${measureNumber}: backup at sequence ${evt.sequenceIndex} moves cursor before zero (${newCursor})`)
        }

        timedEvents.push({
          type: 'backup',
          sequenceIndex: evt.sequenceIndex,
          voice: null,
          staff: null,
          startDivisions: cursor,
          durationDivisions: backupDur,
          endDivisions: newCursor,
          isChordNote: false,
        })

        cursor = newCursor
        // Backup does not change maxCursor — it moves backward.
        continue
      }

      if (evt.type === 'forward') {
        const forwardDur = typeof evt.durationDivisions === 'number' && Number.isFinite(evt.durationDivisions)
          ? evt.durationDivisions
          : null

        if (forwardDur === null || forwardDur < 0) {
          measureWarnings.push(`Measure ${measureNumber}: forward at sequence ${evt.sequenceIndex} has invalid duration`)
          timedEvents.push({
            type: 'forward',
            sequenceIndex: evt.sequenceIndex,
            voice: null,
            staff: null,
            startDivisions: cursor,
            durationDivisions: 0,
            endDivisions: cursor,
            isChordNote: false,
          })
          continue
        }

        if (!hasValidDivisions) {
          measureWarnings.push(`Measure ${measureNumber}: forward at sequence ${evt.sequenceIndex} without valid divisions`)
        }

        const newCursor = cursor + forwardDur
        if (!Number.isFinite(newCursor)) {
          measureWarnings.push(`Measure ${measureNumber}: cursor became non-finite at forward sequence ${evt.sequenceIndex}`)
          break
        }

        timedEvents.push({
          type: 'forward',
          sequenceIndex: evt.sequenceIndex,
          voice: null,
          staff: null,
          startDivisions: cursor,
          durationDivisions: forwardDur,
          endDivisions: newCursor,
          isChordNote: false,
        })

        cursor = newCursor
        if (cursor > maxCursor) maxCursor = cursor
        continue
      }
    }

    const durationBeats = hasValidDivisions ? maxCursor / divisions : null

    result.push({
      measureKey,
      measureNumber,
      partId,
      partIndex,
      measureIndex,
      divisions: hasValidDivisions ? divisions : null,
      startCursorDivisions: 0,
      endCursorDivisions: cursor,
      maxCursorDivisions: maxCursor,
      durationBeats,
      voices: Object.fromEntries(
        [...voices.entries()].map(([k, v]) => [k, { maxCursor: v.maxCursor, events: v.events }])
      ),
      events: timedEvents,
      warnings: measureWarnings,
    })

    warnings.push(...measureWarnings)
  }

  result.sort((a, b) => {
    const aPart = Number.isFinite(a.partIndex) ? a.partIndex : Number.MAX_SAFE_INTEGER
    const bPart = Number.isFinite(b.partIndex) ? b.partIndex : Number.MAX_SAFE_INTEGER
    if (aPart !== bPart) return aPart - bPart

    const aMeasure = Number.isFinite(a.measureIndex) ? a.measureIndex : a.measureNumber
    const bMeasure = Number.isFinite(b.measureIndex) ? b.measureIndex : b.measureNumber
    return aMeasure - bMeasure
  })

  return { measures: result, warnings }
}

function getMeasureKey(value) {
  if (value?.measureKey) return value.measureKey
  if (value?.partId !== undefined && Number.isFinite(value?.measureIndex)) {
    return `${value.partId}:${value.measureIndex}`
  }
  return `legacy:${value?.measureNumber ?? value?.number ?? 1}`
}

function getMeasureContext(value, measureKey) {
  return {
    measureKey,
    measureNumber: value?.measureNumber ?? value?.number ?? 1,
    partId: value?.partId ?? null,
    partIndex: Number.isFinite(value?.partIndex) ? value.partIndex : null,
    measureIndex: Number.isFinite(value?.measureIndex) ? value.measureIndex : null,
  }
}
