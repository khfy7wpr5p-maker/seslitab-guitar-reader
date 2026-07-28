// OMR Quality Validator — Phase 1: Measure Duration Validation
//
// Pure, read-only validation module. No network, storage, UI, or provider
// dependencies. Reuses the existing canonical duration resolver
// (resolveBeats from noteTheory.js) — does not create a competing
// duration calculation engine.
//
// Limitations of the current parsed model (reported, not worked around):
//   - Time signatures are not extracted by parseMusicXml. They must be
//     supplied via options.timeSignatures or parsedScore.timeSignatures.
//     When absent, measures receive status "unknown".
//   - Chord notes (<chord/>) are not detected by parseMusicXml. Without
//     options.chordNoteFlags, chord notes inflate the actual duration.
//     This limitation is noted in the reasons array.
//   - <backup> and <forward> elements are not parsed. Forward elements
//     may cause underfilling that the validator cannot account for.
//   - Pickup/anacrusis/implicit-measure metadata is not preserved.
//     When options.measureMetadata is absent, the limitation is noted.

import { resolveBeats } from '../../noteTheory.js'

export const QUALITY_THRESHOLDS = {
  tolerance: 0.01,
  errorDifferenceThreshold: 1.0,
  errorRatioThreshold: 0.20,
}

function getTimeSignatureForMeasure(measureNumber, timeSignatures) {
  if (!timeSignatures || timeSignatures.length === 0) return null
  let active = null
  for (const ts of timeSignatures) {
    if (ts.measureNumber <= measureNumber) active = ts
    else break
  }
  return active
}

function calculateExpectedBeats(timeSig) {
  if (!timeSig) return null
  return timeSig.beats * (4 / timeSig.beatType)
}

function calculateActualBeats(measureNotes, chordNoteFlags, indexOffset) {
  const voiceDurations = new Map()
  for (let i = 0; i < measureNotes.length; i++) {
    const note = measureNotes[i]
    const globalIndex = indexOffset + i
    if (chordNoteFlags && chordNoteFlags[globalIndex]) continue
    const voice = note.voice ?? 1
    const beats = resolveBeats(note)
    voiceDurations.set(voice, (voiceDurations.get(voice) || 0) + beats)
  }
  let max = 0
  for (const dur of voiceDurations.values()) {
    if (dur > max) max = dur
  }
  return max
}

export function validateOmrMeasureDurations(parsedScore, options = {}) {
  const notes = parsedScore?.notes ?? []
  const timeSignatures = parsedScore?.timeSignatures ?? options.timeSignatures ?? []
  const measureMetadata = parsedScore?.measures ?? options.measureMetadata ?? []
  const chordNoteFlags = options.chordNoteFlags ?? null
  const tolerance = options.tolerance ?? QUALITY_THRESHOLDS.tolerance

  const hasChordFlags = chordNoteFlags !== null
  const hasMeasureMetadata = measureMetadata.length > 0

  const measuresMap = new Map()
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i]
    const measureNum = note.measure ?? note.measureNumber ?? 1
    if (!measuresMap.has(measureNum)) {
      measuresMap.set(measureNum, { notes: [], firstIndex: i })
    }
    measuresMap.get(measureNum).notes.push(note)
  }

  // Include measures that appear in metadata or time signatures but have no notes.
  const allMeasureNumbers = new Set(measuresMap.keys())
  for (const m of measureMetadata) allMeasureNumbers.add(m.number)
  for (const ts of timeSignatures) allMeasureNumbers.add(ts.measureNumber)
  // Also infer intermediate measure numbers from the max measure seen.
  let maxMeasure = 0
  for (const n of allMeasureNumbers) if (n > maxMeasure) maxMeasure = n
  for (let m = 1; m <= maxMeasure; m++) allMeasureNumbers.add(m)

  const measures = []

  for (const measureNum of allMeasureNumbers) {
    const entry = measuresMap.get(measureNum) || { notes: [], firstIndex: 0 }
    const timeSig = getTimeSignatureForMeasure(measureNum, timeSignatures)
    const expectedBeats = calculateExpectedBeats(timeSig)
    const actualBeats = calculateActualBeats(entry.notes, chordNoteFlags, entry.firstIndex)

    const meta = measureMetadata.find((m) => m.number === measureNum)
    const isImplicit = meta?.implicit ?? false
    const isPickup = meta?.pickup ?? false
    const reasons = []

    if (!timeSig) {
      reasons.push('Time signature information not available')
      if (!hasChordFlags) reasons.push('Chord detection not available — actual duration may be inaccurate')
      measures.push({
        measureNumber: measureNum,
        expectedBeats: null,
        actualBeats,
        difference: null,
        status: 'unknown',
        severity: 'none',
        reasons,
      })
      continue
    }

    if (actualBeats === 0) {
      reasons.push('Measure contains no notes or rests')
      measures.push({
        measureNumber: measureNum,
        expectedBeats,
        actualBeats: 0,
        difference: -expectedBeats,
        status: 'empty',
        severity: 'error',
        reasons,
      })
      continue
    }

    const difference = actualBeats - expectedBeats
    const absDiff = Math.abs(difference)

    if (absDiff <= tolerance) {
      measures.push({
        measureNumber: measureNum,
        expectedBeats,
        actualBeats,
        difference,
        status: 'valid',
        severity: 'none',
        reasons: [],
      })
    } else if (difference < 0) {
      reasons.push(`Measure has ${actualBeats} beats, expected ${expectedBeats}`)
      if (isImplicit || isPickup) {
        reasons.push('Measure marked as implicit/pickup — not flagged as error')
      }
      if (!hasChordFlags) {
        reasons.push('Chord detection not available — actual duration may be inaccurate')
      }
      const severity = (isImplicit || isPickup)
        ? 'none'
        : (absDiff >= QUALITY_THRESHOLDS.errorDifferenceThreshold ? 'error' : 'warning')
      measures.push({
        measureNumber: measureNum,
        expectedBeats,
        actualBeats,
        difference,
        status: 'underfilled',
        severity,
        reasons,
      })
    } else {
      reasons.push(`Measure has ${actualBeats} beats, expected ${expectedBeats}`)
      if (!hasChordFlags) {
        reasons.push('Chord detection not available — duration may be inflated by undetected chord notes')
      }
      const severity = absDiff >= QUALITY_THRESHOLDS.errorDifferenceThreshold ? 'error' : 'warning'
      measures.push({
        measureNumber: measureNum,
        expectedBeats,
        actualBeats,
        difference,
        status: 'overfilled',
        severity,
        reasons,
      })
    }
  }

  measures.sort((a, b) => a.measureNumber - b.measureNumber)

  const totalMeasures = measures.length
  const validMeasures = measures.filter((m) => m.status === 'valid').length
  const warningMeasures = measures.filter((m) => m.severity === 'warning').length
  const errorMeasures = measures.filter((m) => m.severity === 'error').length
  const underfilledMeasures = measures.filter((m) => m.status === 'underfilled').length
  const overfilledMeasures = measures.filter((m) => m.status === 'overfilled').length
  const emptyMeasures = measures.filter((m) => m.status === 'empty').length
  const unknownMeasures = measures.filter((m) => m.status === 'unknown').length

  const errorRatio = totalMeasures > 0 ? errorMeasures / totalMeasures : 0
  const qualityStatus =
    errorRatio >= QUALITY_THRESHOLDS.errorRatioThreshold ? 'unreliable'
    : (errorMeasures > 0 || warningMeasures > 0) ? 'review_required'
    : 'good'

  return {
    totalMeasures,
    validMeasures,
    warningMeasures,
    errorMeasures,
    underfilledMeasures,
    overfilledMeasures,
    emptyMeasures,
    unknownMeasures,
    qualityStatus,
    measures,
  }
}
