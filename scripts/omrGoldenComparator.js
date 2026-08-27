// Package 2E-B — read-only golden MusicXML comparator.
//
// This comparator measures exact musical-event differences against one of the
// repository's teacher-verified golden MusicXML references. It does not invoke
// Audiveris, preprocess images, rewrite MusicXML, repair missing data, or merge
// notes from multiple OMR outputs.
//
// Alignment policy is intentionally conservative:
// 1. physical measures align by partIndex + measureIndex, never visible number;
// 2. exact event matches are removed first;
// 3. a remaining pair is classified as pitch/duration/voice error only when
//    exactly one golden and one generated event occupy the same strict location;
// 4. multiple unmatched events at the same location are alignment-ambiguous and
//    detailed error counts become REVIEW_REQUIRED rather than guessed.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseMusicXmlWithStructure } from '../musicXmlParser.js'
import { OMR_BENCHMARK_MEASUREMENT_STATE } from './omrBenchmark.js'
import {
  OMR_BENCHMARK_GOLDEN_REFERENCES,
  OMR_FIXTURE_EVIDENCE_STATE,
} from './omrBenchmarkFixtureInventory.js'

export const OMR_GOLDEN_COMPARATOR_SCHEMA_VERSION = 1
export const OMR_GOLDEN_COMPARISON_KIND = 'teacher-verified-golden-musicxml-comparison'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NUMBER_SCALE = 1e9

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function normalizeNumber(value) {
  if (!Number.isFinite(value)) return null
  return Math.round(value * NUMBER_SCALE) / NUMBER_SCALE
}

function compareNumber(a, b) {
  return normalizeNumber(a) === normalizeNumber(b)
}

function parseOrFailure(xml, side) {
  if (typeof xml !== 'string' || xml.trim() === '') {
    return { ok: false, reason: `${side}_MUSICXML_EMPTY`, parsed: null }
  }
  const parsed = parseMusicXmlWithStructure(xml)
  if (!parsed || parsed.error) {
    return { ok: false, reason: `${side}_MUSICXML_PARSE_FAILED`, parsed: null }
  }
  return { ok: true, reason: null, parsed }
}

function resolveTeacherVerifiedReference(goldenReferenceId) {
  if (typeof goldenReferenceId !== 'string' || goldenReferenceId.trim() === '') {
    throw new TypeError('goldenReferenceId must be a non-empty string.')
  }
  const reference = OMR_BENCHMARK_GOLDEN_REFERENCES.find(
    (fixture) => fixture.fixtureId === goldenReferenceId.trim(),
  )
  if (!reference) throw new Error(`unknown-omr-golden-reference:${goldenReferenceId}`)
  if (reference.evidenceState !== OMR_FIXTURE_EVIDENCE_STATE.TEACHER_VERIFIED) {
    throw new Error(`unverified-omr-golden-reference:${goldenReferenceId}`)
  }
  return reference
}

function eventPitch(event) {
  if (event?.isRest) return null
  return {
    step: event?.step ?? null,
    alter: Number.isFinite(event?.alter) ? event.alter : 0,
    octave: Number.isFinite(event?.octave) ? event.octave : null,
  }
}

function eventSemanticShape(event) {
  return {
    startBeat: normalizeNumber(event?.startBeat),
    beats: normalizeNumber(event?.beats),
    voice: event?.voice ?? null,
    staff: event?.staff ?? null,
    isRest: Boolean(event?.isRest),
    isGrace: Boolean(event?.isGrace),
    isChordNote: Boolean(event?.isChordNote),
    dotCount: Number.isFinite(event?.dotCount) ? event.dotCount : 0,
    tieStart: Boolean(event?.tieStart),
    tieStop: Boolean(event?.tieStop),
    tieContinue: Boolean(event?.tieContinue),
    pitch: eventPitch(event),
  }
}

function exactEventKey(event) {
  return JSON.stringify(eventSemanticShape(event))
}

function strictLocationKey(event) {
  return JSON.stringify({
    startBeat: normalizeNumber(event?.startBeat),
    staff: event?.staff ?? null,
    isRest: Boolean(event?.isRest),
    isGrace: Boolean(event?.isGrace),
    isChordNote: Boolean(event?.isChordNote),
  })
}

function measureIdentity(partIndex, measureIndex) {
  return `${partIndex}:${measureIndex}`
}

function measureDescriptor(measure) {
  return {
    partIndex: Number.isFinite(measure?.partIndex) ? measure.partIndex : null,
    measureIndex: Number.isFinite(measure?.measureIndex) ? measure.measureIndex : null,
    visibleMeasureNumber: measure?.measureNumber ?? measure?.visibleMeasureNumber ?? null,
  }
}

function collectMeasures(parsed) {
  const measures = new Map()

  for (const metadata of parsed?.measureMetadata || []) {
    const descriptor = measureDescriptor(metadata)
    if (!Number.isFinite(descriptor.partIndex) || !Number.isFinite(descriptor.measureIndex)) continue
    const key = measureIdentity(descriptor.partIndex, descriptor.measureIndex)
    if (!measures.has(key)) measures.set(key, { ...descriptor, events: [] })
  }

  for (const note of parsed?.notes || []) {
    const partIndex = Number.isFinite(note?.partIndex) ? note.partIndex : null
    const measureIndex = Number.isFinite(note?.measureIndex) ? note.measureIndex : null
    if (!Number.isFinite(partIndex) || !Number.isFinite(measureIndex)) continue
    const key = measureIdentity(partIndex, measureIndex)
    if (!measures.has(key)) {
      measures.set(key, {
        partIndex,
        measureIndex,
        visibleMeasureNumber: note?.measure ?? null,
        events: [],
      })
    }
    measures.get(key).events.push(note)
  }

  return measures
}

function sortedExactKeys(events) {
  return events.map(exactEventKey).sort()
}

function exactMeasureEqual(goldenEvents, generatedEvents) {
  const a = sortedExactKeys(goldenEvents)
  const b = sortedExactKeys(generatedEvents)
  if (a.length !== b.length) return false
  return a.every((value, index) => value === b[index])
}

function consumeExactMatches(goldenEvents, generatedEvents) {
  const generatedBuckets = new Map()
  generatedEvents.forEach((event, index) => {
    const key = exactEventKey(event)
    if (!generatedBuckets.has(key)) generatedBuckets.set(key, [])
    generatedBuckets.get(key).push(index)
  })

  const matchedGenerated = new Set()
  const unmatchedGolden = []
  let exactMatches = 0

  for (const event of goldenEvents) {
    const bucket = generatedBuckets.get(exactEventKey(event))
    const generatedIndex = bucket?.find((index) => !matchedGenerated.has(index))
    if (generatedIndex === undefined) {
      unmatchedGolden.push(event)
      continue
    }
    matchedGenerated.add(generatedIndex)
    exactMatches++
  }

  const unmatchedGenerated = generatedEvents.filter((_, index) => !matchedGenerated.has(index))
  return { exactMatches, unmatchedGolden, unmatchedGenerated }
}

function groupByLocation(events) {
  const groups = new Map()
  for (const event of events) {
    const key = strictLocationKey(event)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(event)
  }
  return groups
}

function pitchEqual(a, b) {
  return JSON.stringify(eventPitch(a)) === JSON.stringify(eventPitch(b))
}

function classifyMeasure(golden, generated) {
  const goldenEvents = golden?.events || []
  const generatedEvents = generated?.events || []
  const exactCorrect = exactMeasureEqual(goldenEvents, generatedEvents)
  const exact = consumeExactMatches(goldenEvents, generatedEvents)
  const goldenByLocation = groupByLocation(exact.unmatchedGolden)
  const generatedByLocation = groupByLocation(exact.unmatchedGenerated)
  const locationKeys = [...new Set([...goldenByLocation.keys(), ...generatedByLocation.keys()])].sort()

  let pitchErrors = 0
  let durationErrors = 0
  let voiceErrors = 0
  let missingNotes = 0
  let extraNotes = 0
  let ambiguousLocations = 0
  let unclassifiedGoldenEvents = 0
  let unclassifiedGeneratedEvents = 0

  for (const locationKey of locationKeys) {
    const goldenGroup = goldenByLocation.get(locationKey) || []
    const generatedGroup = generatedByLocation.get(locationKey) || []

    if (goldenGroup.length === 1 && generatedGroup.length === 1) {
      const expected = goldenGroup[0]
      const actual = generatedGroup[0]
      if (!pitchEqual(expected, actual) && !expected.isRest && !actual.isRest) pitchErrors++
      if (!compareNumber(expected.beats, actual.beats)) durationErrors++
      if ((expected.voice ?? null) !== (actual.voice ?? null)) voiceErrors++
      continue
    }

    if (goldenGroup.length === 0) {
      extraNotes += generatedGroup.filter((event) => !event.isRest).length
      unclassifiedGeneratedEvents += generatedGroup.length
      continue
    }
    if (generatedGroup.length === 0) {
      missingNotes += goldenGroup.filter((event) => !event.isRest).length
      unclassifiedGoldenEvents += goldenGroup.length
      continue
    }

    ambiguousLocations++
    unclassifiedGoldenEvents += goldenGroup.length
    unclassifiedGeneratedEvents += generatedGroup.length
  }

  return {
    exactCorrect,
    exactMatches: exact.exactMatches,
    goldenEventCount: goldenEvents.length,
    generatedEventCount: generatedEvents.length,
    pitchErrors,
    durationErrors,
    voiceErrors,
    missingNotes,
    extraNotes,
    ambiguousLocations,
    unclassifiedGoldenEvents,
    unclassifiedGeneratedEvents,
  }
}

function unknownMetric() {
  return { state: OMR_BENCHMARK_MEASUREMENT_STATE.UNKNOWN, value: null }
}

function measuredMetric(value) {
  return { state: OMR_BENCHMARK_MEASUREMENT_STATE.MEASURED, value }
}

function reviewMetric(observedValue) {
  return {
    state: OMR_BENCHMARK_MEASUREMENT_STATE.REVIEW_REQUIRED,
    value: null,
    observedValue,
  }
}

function failedReport(reference, generatedMusicXml, reason) {
  return deepFreeze({
    schemaVersion: OMR_GOLDEN_COMPARATOR_SCHEMA_VERSION,
    comparisonKind: OMR_GOLDEN_COMPARISON_KIND,
    state: OMR_BENCHMARK_MEASUREMENT_STATE.UNKNOWN,
    ok: false,
    reason,
    reference: {
      fixtureId: reference.fixtureId,
      evidenceState: reference.evidenceState,
      expectedMusicXml: reference.expectedMusicXml,
    },
    inputSha256: typeof generatedMusicXml === 'string' ? sha256(generatedMusicXml) : null,
    goldenSha256: null,
    metrics: {
      missingNotes: unknownMetric(),
      extraNotes: unknownMetric(),
      pitchErrors: unknownMetric(),
      durationErrors: unknownMetric(),
      voiceErrors: unknownMetric(),
      fullyCorrectMeasureRate: unknownMetric(),
    },
    alignment: {
      state: OMR_BENCHMARK_MEASUREMENT_STATE.UNKNOWN,
      ambiguousLocations: null,
    },
    measures: [],
  })
}

export function compareGeneratedMusicXmlToGolden({ goldenReferenceId, generatedMusicXml } = {}) {
  const reference = resolveTeacherVerifiedReference(goldenReferenceId)
  const goldenMusicXml = readFileSync(path.join(repoRoot, reference.expectedMusicXml), 'utf8')

  const goldenParsed = parseOrFailure(goldenMusicXml, 'GOLDEN')
  if (!goldenParsed.ok) return failedReport(reference, generatedMusicXml, goldenParsed.reason)

  const generatedParsed = parseOrFailure(generatedMusicXml, 'GENERATED')
  if (!generatedParsed.ok) return failedReport(reference, generatedMusicXml, generatedParsed.reason)

  const goldenMeasures = collectMeasures(goldenParsed.parsed)
  const generatedMeasures = collectMeasures(generatedParsed.parsed)
  const measureKeys = [...new Set([...goldenMeasures.keys(), ...generatedMeasures.keys()])]
    .sort((a, b) => {
      const [aPart, aMeasure] = a.split(':').map(Number)
      const [bPart, bMeasure] = b.split(':').map(Number)
      return (aPart - bPart) || (aMeasure - bMeasure)
    })

  const measures = []
  let correctMeasures = 0
  let pitchErrors = 0
  let durationErrors = 0
  let voiceErrors = 0
  let missingNotes = 0
  let extraNotes = 0
  let ambiguousLocations = 0
  let unclassifiedGoldenEvents = 0
  let unclassifiedGeneratedEvents = 0

  for (const measureKey of measureKeys) {
    const golden = goldenMeasures.get(measureKey) || null
    const generated = generatedMeasures.get(measureKey) || null
    const classified = classifyMeasure(golden, generated)
    if (classified.exactCorrect) correctMeasures++
    pitchErrors += classified.pitchErrors
    durationErrors += classified.durationErrors
    voiceErrors += classified.voiceErrors
    missingNotes += classified.missingNotes
    extraNotes += classified.extraNotes
    ambiguousLocations += classified.ambiguousLocations
    unclassifiedGoldenEvents += classified.unclassifiedGoldenEvents
    unclassifiedGeneratedEvents += classified.unclassifiedGeneratedEvents

    const [partIndex, measureIndex] = measureKey.split(':').map(Number)
    measures.push({
      measureKey: { partIndex, measureIndex },
      goldenVisibleMeasureNumber: golden?.visibleMeasureNumber ?? null,
      generatedVisibleMeasureNumber: generated?.visibleMeasureNumber ?? null,
      exactCorrect: classified.exactCorrect,
      goldenEventCount: classified.goldenEventCount,
      generatedEventCount: classified.generatedEventCount,
      exactMatches: classified.exactMatches,
      ambiguousLocations: classified.ambiguousLocations,
    })
  }

  const detailedState = ambiguousLocations > 0
    ? OMR_BENCHMARK_MEASUREMENT_STATE.REVIEW_REQUIRED
    : OMR_BENCHMARK_MEASUREMENT_STATE.MEASURED
  const detailMetric = detailedState === OMR_BENCHMARK_MEASUREMENT_STATE.MEASURED
    ? measuredMetric
    : reviewMetric
  const measureRate = measureKeys.length === 0 ? null : correctMeasures / measureKeys.length

  return deepFreeze({
    schemaVersion: OMR_GOLDEN_COMPARATOR_SCHEMA_VERSION,
    comparisonKind: OMR_GOLDEN_COMPARISON_KIND,
    state: detailedState,
    ok: true,
    reason: ambiguousLocations > 0
      ? 'Detailed event-error classification requires review because at least one strict location has multiple unmatched events.'
      : null,
    reference: {
      fixtureId: reference.fixtureId,
      evidenceState: reference.evidenceState,
      expectedMusicXml: reference.expectedMusicXml,
    },
    inputSha256: sha256(generatedMusicXml),
    goldenSha256: sha256(goldenMusicXml),
    metrics: {
      missingNotes: detailMetric(missingNotes),
      extraNotes: detailMetric(extraNotes),
      pitchErrors: detailMetric(pitchErrors),
      durationErrors: detailMetric(durationErrors),
      voiceErrors: detailMetric(voiceErrors),
      fullyCorrectMeasureRate: {
        state: OMR_BENCHMARK_MEASUREMENT_STATE.MEASURED,
        value: measureRate,
        correctMeasures,
        totalMeasures: measureKeys.length,
      },
    },
    alignment: {
      state: detailedState,
      ambiguousLocations,
      unclassifiedGoldenEvents,
      unclassifiedGeneratedEvents,
      policy: 'exact-first-then-singleton-strict-location',
    },
    measures,
  })
}
