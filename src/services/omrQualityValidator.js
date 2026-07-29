// OMR Quality Validator — measure duration validation.
//
// The structured path keeps a stable identity for every measure:
// partId + measureIndex. MusicXML's displayed measure number is only a
// label and may repeat inside a part or across parallel parts.

import { resolveBeats } from '../../noteTheory.js'
import { buildMeasureTimeline } from './musicXmlMeasureTimeline.js'

export const QUALITY_THRESHOLDS = {
  tolerance: 0.01,
  errorDifferenceThreshold: 1.0,
  errorRatioThreshold: 0.20,
}

function getMeasureKey(value) {
  if (value?.measureKey) return value.measureKey
  if (value?.partId !== undefined && Number.isFinite(value?.measureIndex)) {
    return `${value.partId}:${value.measureIndex}`
  }
  return `legacy:${value?.measureNumber ?? value?.number ?? 1}`
}

function calculateExpectedBeats(timeSig) {
  if (!timeSig) return null
  return timeSig.beats * (4 / timeSig.beatType)
}

function calculateActualBeats(indexedNotes, chordNoteFlags) {
  const voiceDurations = new Map()

  for (const { note, index } of indexedNotes) {
    if (chordNoteFlags && chordNoteFlags[index]) continue
    const voice = note.voice ?? 1
    const beats = resolveBeats(note)
    voiceDurations.set(voice, (voiceDurations.get(voice) || 0) + beats)
  }

  let max = 0
  for (const duration of voiceDurations.values()) {
    if (duration > max) max = duration
  }
  return max
}

function isStructuredMeasure(value) {
  return !!value && (
    !!value.measureKey ||
    (value.partId !== undefined && value.partId !== null) ||
    Number.isFinite(value.measureIndex)
  )
}

function selectValidatedPartId(parsedScore, options) {
  if (options.validateAllParts) return null
  if (options.partId) return options.partId
  if (parsedScore?.primaryPartId) return parsedScore.primaryPartId

  const parts = parsedScore?.parts || []
  if (parts.length > 0) {
    return [...parts]
      .sort((a, b) =>
        ((b.pitchedNoteCount || 0) - (a.pitchedNoteCount || 0)) ||
        ((b.measureCount || 0) - (a.measureCount || 0)) ||
        ((a.partIndex || 0) - (b.partIndex || 0))
      )[0].partId
  }

  const firstStructuredItem = [
    ...(parsedScore?.measureMetadata || []),
    ...(parsedScore?.measureEvents || []),
    ...(parsedScore?.notes || []),
  ].find((item) => item?.partId)

  return firstStructuredItem?.partId ?? null
}

function belongsToSelectedPart(value, validatedPartId, validateAllParts) {
  if (validateAllParts || validatedPartId === null) return true
  return value?.partId === undefined || value?.partId === validatedPartId
}

function getTimeSignatureForMeasure(descriptor, timeSignatures) {
  if (!timeSignatures || timeSignatures.length === 0) return null

  const candidates = timeSignatures
    .filter((ts) => {
      if (descriptor.partId === null || descriptor.partId === undefined) {
        return ts.partId === undefined || ts.partId === null
      }
      return ts.partId === undefined || ts.partId === descriptor.partId
    })
    .sort((a, b) => {
      const aPosition = Number.isFinite(a.measureIndex) ? a.measureIndex : a.measureNumber
      const bPosition = Number.isFinite(b.measureIndex) ? b.measureIndex : b.measureNumber
      return aPosition - bPosition
    })

  let active = null
  const descriptorPosition = Number.isFinite(descriptor.measureIndex)
    ? descriptor.measureIndex
    : descriptor.measureNumber

  for (const timeSignature of candidates) {
    const signaturePosition = Number.isFinite(timeSignature.measureIndex)
      ? timeSignature.measureIndex
      : timeSignature.measureNumber
    if (signaturePosition <= descriptorPosition) active = timeSignature
    else break
  }

  return active
}

function buildStructuredDescriptors(parsedScore, timeline, validatedPartId, validateAllParts) {
  const descriptors = []
  const seen = new Set()

  const add = (value, metadata = null) => {
    if (!belongsToSelectedPart(value, validatedPartId, validateAllParts)) return
    const measureKey = getMeasureKey(value)
    if (seen.has(measureKey)) return
    seen.add(measureKey)
    descriptors.push({
      measureKey,
      measureNumber: value.measureNumber ?? value.number ?? 1,
      partId: value.partId ?? null,
      partIndex: Number.isFinite(value.partIndex) ? value.partIndex : null,
      measureIndex: Number.isFinite(value.measureIndex) ? value.measureIndex : null,
      metadata: metadata || value,
    })
  }

  for (const metadata of parsedScore.measureMetadata || []) add(metadata, metadata)
  for (const measure of timeline?.measures || []) add(measure)
  for (const note of parsedScore.notes || []) add(note)

  descriptors.sort(compareMeasurePosition)
  return descriptors
}

function buildLegacyDescriptors(notes, measureMetadata, timeSignatures) {
  const allMeasureNumbers = new Set()
  for (const note of notes) allMeasureNumbers.add(note.measure ?? note.measureNumber ?? 1)
  for (const metadata of measureMetadata) allMeasureNumbers.add(metadata.measureNumber ?? metadata.number)
  for (const timeSignature of timeSignatures) allMeasureNumbers.add(timeSignature.measureNumber)

  let maxMeasure = 0
  for (const measureNumber of allMeasureNumbers) {
    if (measureNumber > maxMeasure) maxMeasure = measureNumber
  }
  for (let measureNumber = 1; measureNumber <= maxMeasure; measureNumber++) {
    allMeasureNumbers.add(measureNumber)
  }

  return [...allMeasureNumbers]
    .sort((a, b) => a - b)
    .map((measureNumber) => ({
      measureKey: `legacy:${measureNumber}`,
      measureNumber,
      partId: null,
      partIndex: null,
      measureIndex: null,
      metadata: measureMetadata.find(
        (metadata) => (metadata.measureNumber ?? metadata.number) === measureNumber
      ) || null,
    }))
}

function compareMeasurePosition(a, b) {
  const aPart = Number.isFinite(a.partIndex) ? a.partIndex : Number.MAX_SAFE_INTEGER
  const bPart = Number.isFinite(b.partIndex) ? b.partIndex : Number.MAX_SAFE_INTEGER
  if (aPart !== bPart) return aPart - bPart

  const aMeasure = Number.isFinite(a.measureIndex) ? a.measureIndex : a.measureNumber
  const bMeasure = Number.isFinite(b.measureIndex) ? b.measureIndex : b.measureNumber
  return aMeasure - bMeasure
}

export function validateOmrMeasureDurations(parsedScore, options = {}) {
  const notes = parsedScore?.notes ?? []
  const timeSignatures = parsedScore?.timeSignatures ?? options.timeSignatures ?? []
  const measureMetadata =
    parsedScore?.measureMetadata ??
    parsedScore?.measures ??
    options.measureMetadata ??
    []
  const tolerance = options.tolerance ?? QUALITY_THRESHOLDS.tolerance
  const validateAllParts = options.validateAllParts === true
  const validatedPartId = selectValidatedPartId(parsedScore, options)

  const hasStructuredMeasures = [
    ...measureMetadata,
    ...(parsedScore?.measureEvents || []),
    ...notes,
  ].some(isStructuredMeasure)

  const hasMeasureEvents = parsedScore?.measureEvents && parsedScore.measureEvents.length > 0
  const timeline = hasMeasureEvents ? buildMeasureTimeline(parsedScore) : null

  const descriptors = hasStructuredMeasures
    ? buildStructuredDescriptors(parsedScore, timeline, validatedPartId, validateAllParts)
    : buildLegacyDescriptors(notes, measureMetadata, timeSignatures)

  const timelineByMeasure = new Map()
  for (const timelineMeasure of timeline?.measures || []) {
    timelineByMeasure.set(getMeasureKey(timelineMeasure), timelineMeasure)
  }

  const indexedNotesByMeasure = new Map()
  for (let index = 0; index < notes.length; index++) {
    const note = notes[index]
    if (!belongsToSelectedPart(note, validatedPartId, validateAllParts)) continue
    const key = hasStructuredMeasures
      ? getMeasureKey(note)
      : `legacy:${note.measure ?? note.measureNumber ?? 1}`
    if (!indexedNotesByMeasure.has(key)) indexedNotesByMeasure.set(key, [])
    indexedNotesByMeasure.get(key).push({ note, index })
  }

  const relevantNotes = [...indexedNotesByMeasure.values()].flat().map(({ note }) => note)
  const explicitChordFlags = options.chordNoteFlags ?? null
  const chordNoteFlags = explicitChordFlags ??
    (relevantNotes.some((note) => note.isChordNote)
      ? notes.map((note) => !!note.isChordNote)
      : null)
  const hasChordFlags = chordNoteFlags !== null

  const measures = []

  for (const descriptor of descriptors) {
    const indexedNotes = indexedNotesByMeasure.get(descriptor.measureKey) || []
    const timeSignature = getTimeSignatureForMeasure(descriptor, timeSignatures)
    const expectedBeats = calculateExpectedBeats(timeSignature)
    const timelineMeasure = timelineByMeasure.get(descriptor.measureKey)

    let actualBeats
    let timelineWarnings = []

    if (
      timelineMeasure &&
      typeof timelineMeasure.durationBeats === 'number' &&
      Number.isFinite(timelineMeasure.durationBeats)
    ) {
      actualBeats = timelineMeasure.durationBeats
      timelineWarnings = timelineMeasure.warnings || []
    } else if (timelineMeasure?.warnings?.length > 0) {
      actualBeats = null
      timelineWarnings = timelineMeasure.warnings
    } else {
      actualBeats = calculateActualBeats(indexedNotes, chordNoteFlags)
    }

    const metadata = descriptor.metadata
    const isImplicit = metadata?.implicit ?? false
    const isPickup = metadata?.pickup ?? false
    const reasons = []
    const identity = {
      measureKey: descriptor.measureKey,
      measureNumber: descriptor.measureNumber,
      partId: descriptor.partId,
      partIndex: descriptor.partIndex,
      measureIndex: descriptor.measureIndex,
    }

    if (!timeSignature || actualBeats === null) {
      if (!timeSignature) reasons.push('Time signature information not available')
      if (actualBeats === null) reasons.push(...timelineWarnings)
      if (!hasChordFlags && actualBeats !== null) {
        reasons.push('Chord detection not available — actual duration may be inaccurate')
      }
      measures.push({
        ...identity,
        expectedBeats: timeSignature ? expectedBeats : null,
        actualBeats: actualBeats ?? 0,
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
        ...identity,
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
    const absoluteDifference = Math.abs(difference)

    if (absoluteDifference <= tolerance) {
      measures.push({
        ...identity,
        expectedBeats,
        actualBeats,
        difference,
        status: 'valid',
        severity: 'none',
        reasons: [],
      })
      continue
    }

    reasons.push(`Measure has ${actualBeats} beats, expected ${expectedBeats}`)

    if (difference < 0) {
      if (isImplicit || isPickup) {
        reasons.push('Measure marked as implicit/pickup — not flagged as error')
      }
      if (!hasChordFlags) {
        reasons.push('Chord detection not available — actual duration may be inaccurate')
      }
      const severity = (isImplicit || isPickup)
        ? 'none'
        : (absoluteDifference >= QUALITY_THRESHOLDS.errorDifferenceThreshold ? 'error' : 'warning')
      measures.push({
        ...identity,
        expectedBeats,
        actualBeats,
        difference,
        status: 'underfilled',
        severity,
        reasons,
      })
      continue
    }

    if (!hasChordFlags) {
      reasons.push('Chord detection not available — duration may be inflated by undetected chord notes')
    }
    const severity = absoluteDifference >= QUALITY_THRESHOLDS.errorDifferenceThreshold
      ? 'error'
      : 'warning'
    measures.push({
      ...identity,
      expectedBeats,
      actualBeats,
      difference,
      status: 'overfilled',
      severity,
      reasons,
    })
  }

  measures.sort(compareMeasurePosition)

  const totalMeasures = measures.length
  const validMeasures = measures.filter((measure) => measure.status === 'valid').length
  const warningMeasures = measures.filter((measure) => measure.severity === 'warning').length
  const errorMeasures = measures.filter((measure) => measure.severity === 'error').length
  const underfilledMeasures = measures.filter((measure) => measure.status === 'underfilled').length
  const overfilledMeasures = measures.filter((measure) => measure.status === 'overfilled').length
  const emptyMeasures = measures.filter((measure) => measure.status === 'empty').length
  const unknownMeasures = measures.filter((measure) => measure.status === 'unknown').length

  const errorRatio = totalMeasures > 0 ? errorMeasures / totalMeasures : 0
  const qualityStatus =
    errorRatio >= QUALITY_THRESHOLDS.errorRatioThreshold ? 'unreliable'
      : (errorMeasures > 0 || warningMeasures > 0) ? 'review_required'
        : 'good'

  const availablePartIds = (parsedScore?.parts || [])
    .map((part) => part.partId)
    .filter(Boolean)
  const ignoredPartIds = validateAllParts || validatedPartId === null
    ? []
    : availablePartIds.filter((partId) => partId !== validatedPartId)

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
    validatedPartId,
    ignoredPartIds,
    measures,
  }
}
