// Package 2E-B — read-only golden MusicXML comparator.
//
// Safety boundary:
// - reads only a repository-owned, teacher-verified golden MusicXML;
// - never invokes or configures Audiveris;
// - never rewrites MusicXML or repairs/merges musical data;
// - physical measure identity is partIndex + measureIndex, not visible number;
// - ambiguous event alignment becomes REVIEW_REQUIRED instead of a guessed error.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseMusicXml, parseMusicXmlWithStructure } from '../musicXmlParser.js'
import { OMR_BENCHMARK_MEASUREMENT_STATE } from './omrBenchmark.js'
import {
  OMR_BENCHMARK_GOLDEN_REFERENCES,
  OMR_FIXTURE_EVIDENCE_STATE,
} from './omrBenchmarkFixtureInventory.js'

export const OMR_GOLDEN_COMPARATOR_SCHEMA_VERSION = 1
export const OMR_GOLDEN_COMPARISON_KIND = 'teacher-verified-golden-musicxml-comparison'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCALE = 1e9

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function normalizedNumber(value) {
  return Number.isFinite(value) ? Math.round(value * SCALE) / SCALE : null
}

function parseForComparison(xml, side) {
  if (typeof xml !== 'string' || xml.trim() === '') {
    return { ok: false, reason: `${side}_MUSICXML_EMPTY`, parsed: null }
  }

  // parseMusicXml() is the existing production parser that calculates ordered
  // note onsets through note/backup/forward processing. The structural parser
  // supplies physical measure metadata only. Package 2E-B does not change either.
  const canonical = parseMusicXml(xml)
  const structural = parseMusicXmlWithStructure(xml)
  if (!canonical || canonical.error || !structural || structural.error) {
    return { ok: false, reason: `${side}_MUSICXML_PARSE_FAILED`, parsed: null }
  }

  return {
    ok: true,
    reason: null,
    parsed: {
      notes: canonical.notes || [],
      measureMetadata: structural.measureMetadata || [],
    },
  }
}

function resolveReference(goldenReferenceId) {
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

function pitch(event) {
  if (event?.isRest) return null
  return {
    step: event?.step ?? null,
    alter: Number.isFinite(event?.alter) ? event.alter : 0,
    octave: Number.isFinite(event?.octave) ? event.octave : null,
  }
}

function semanticEvent(event) {
  return {
    startBeat: normalizedNumber(event?.startBeat),
    beats: normalizedNumber(event?.beats),
    voice: event?.voice ?? null,
    staff: event?.staff ?? null,
    isRest: Boolean(event?.isRest),
    isGrace: Boolean(event?.isGrace),
    isChordNote: Boolean(event?.isChordNote),
    dotCount: Number.isFinite(event?.dotCount) ? event.dotCount : 0,
    tieStart: Boolean(event?.tieStart),
    tieStop: Boolean(event?.tieStop),
    tieContinue: Boolean(event?.tieContinue),
    pitch: pitch(event),
  }
}

function exactKey(event) {
  return JSON.stringify(semanticEvent(event))
}

function locationKey(event) {
  return JSON.stringify({
    startBeat: normalizedNumber(event?.startBeat),
    staff: event?.staff ?? null,
    isRest: Boolean(event?.isRest),
    isGrace: Boolean(event?.isGrace),
    isChordNote: Boolean(event?.isChordNote),
  })
}

function measureKey(partIndex, measureIndex) {
  return `${partIndex}:${measureIndex}`
}

function collectMeasures(parsed) {
  const measures = new Map()
  for (const metadata of parsed.measureMetadata || []) {
    if (!Number.isFinite(metadata?.partIndex) || !Number.isFinite(metadata?.measureIndex)) continue
    measures.set(measureKey(metadata.partIndex, metadata.measureIndex), {
      partIndex: metadata.partIndex,
      measureIndex: metadata.measureIndex,
      visibleMeasureNumber: metadata.measureNumber ?? null,
      events: [],
    })
  }
  for (const note of parsed.notes || []) {
    if (!Number.isFinite(note?.partIndex) || !Number.isFinite(note?.measureIndex)) continue
    const key = measureKey(note.partIndex, note.measureIndex)
    if (!measures.has(key)) {
      measures.set(key, {
        partIndex: note.partIndex,
        measureIndex: note.measureIndex,
        visibleMeasureNumber: note.measure ?? null,
        events: [],
      })
    }
    measures.get(key).events.push(note)
  }
  return measures
}

function exactMeasureEqual(a, b) {
  const left = a.map(exactKey).sort()
  const right = b.map(exactKey).sort()
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function consumeExact(goldenEvents, generatedEvents) {
  const buckets = new Map()
  generatedEvents.forEach((event, index) => {
    const key = exactKey(event)
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(index)
  })

  const used = new Set()
  const unmatchedGolden = []
  let exactMatches = 0
  for (const event of goldenEvents) {
    const index = buckets.get(exactKey(event))?.find((candidate) => !used.has(candidate))
    if (index === undefined) unmatchedGolden.push(event)
    else {
      used.add(index)
      exactMatches++
    }
  }
  return {
    exactMatches,
    unmatchedGolden,
    unmatchedGenerated: generatedEvents.filter((_, index) => !used.has(index)),
  }
}

function groupByLocation(events) {
  const groups = new Map()
  for (const event of events) {
    const key = locationKey(event)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(event)
  }
  return groups
}

function pitchEqual(a, b) {
  return JSON.stringify(pitch(a)) === JSON.stringify(pitch(b))
}

function classifyMeasure(golden, generated) {
  const goldenEvents = golden?.events || []
  const generatedEvents = generated?.events || []
  const exactCorrect = exactMeasureEqual(goldenEvents, generatedEvents)
  const unmatched = consumeExact(goldenEvents, generatedEvents)
  const goldByLocation = groupByLocation(unmatched.unmatchedGolden)
  const generatedByLocation = groupByLocation(unmatched.unmatchedGenerated)
  const locations = [...new Set([...goldByLocation.keys(), ...generatedByLocation.keys()])].sort()

  const result = {
    exactCorrect,
    exactMatches: unmatched.exactMatches,
    goldenEventCount: goldenEvents.length,
    generatedEventCount: generatedEvents.length,
    missingNotes: 0,
    extraNotes: 0,
    pitchErrors: 0,
    durationErrors: 0,
    voiceErrors: 0,
    ambiguousLocations: 0,
    unclassifiedGoldenEvents: 0,
    unclassifiedGeneratedEvents: 0,
  }

  for (const location of locations) {
    const expected = goldByLocation.get(location) || []
    const actual = generatedByLocation.get(location) || []

    if (expected.length === 1 && actual.length === 1) {
      if (!pitchEqual(expected[0], actual[0]) && !expected[0].isRest && !actual[0].isRest) result.pitchErrors++
      if (normalizedNumber(expected[0].beats) !== normalizedNumber(actual[0].beats)) result.durationErrors++
      if ((expected[0].voice ?? null) !== (actual[0].voice ?? null)) result.voiceErrors++
      continue
    }

    if (expected.length === 0) {
      result.extraNotes += actual.filter((event) => !event.isRest).length
      result.unclassifiedGeneratedEvents += actual.length
      continue
    }
    if (actual.length === 0) {
      result.missingNotes += expected.filter((event) => !event.isRest).length
      result.unclassifiedGoldenEvents += expected.length
      continue
    }

    result.ambiguousLocations++
    result.unclassifiedGoldenEvents += expected.length
    result.unclassifiedGeneratedEvents += actual.length
  }
  return result
}

function metric(state, value, observedValue = undefined) {
  const result = { state, value }
  if (observedValue !== undefined) result.observedValue = observedValue
  return result
}

function failedReport(reference, generatedMusicXml, reason, goldenMusicXml = null) {
  const unknown = () => metric(OMR_BENCHMARK_MEASUREMENT_STATE.UNKNOWN, null)
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
    goldenSha256: typeof goldenMusicXml === 'string' ? sha256(goldenMusicXml) : null,
    metrics: {
      missingNotes: unknown(),
      extraNotes: unknown(),
      pitchErrors: unknown(),
      durationErrors: unknown(),
      voiceErrors: unknown(),
      fullyCorrectMeasureRate: unknown(),
    },
    alignment: { state: OMR_BENCHMARK_MEASUREMENT_STATE.UNKNOWN, ambiguousLocations: null },
    measures: [],
  })
}

export function compareGeneratedMusicXmlToGolden({ goldenReferenceId, generatedMusicXml } = {}) {
  const reference = resolveReference(goldenReferenceId)
  const goldenMusicXml = readFileSync(path.join(repoRoot, reference.expectedMusicXml), 'utf8')
  const golden = parseForComparison(goldenMusicXml, 'GOLDEN')
  if (!golden.ok) return failedReport(reference, generatedMusicXml, golden.reason, goldenMusicXml)
  const generated = parseForComparison(generatedMusicXml, 'GENERATED')
  if (!generated.ok) return failedReport(reference, generatedMusicXml, generated.reason, goldenMusicXml)

  const goldenMeasures = collectMeasures(golden.parsed)
  const generatedMeasures = collectMeasures(generated.parsed)
  const keys = [...new Set([...goldenMeasures.keys(), ...generatedMeasures.keys()])].sort((a, b) => {
    const [ap, am] = a.split(':').map(Number)
    const [bp, bm] = b.split(':').map(Number)
    return (ap - bp) || (am - bm)
  })

  const totals = {
    correctMeasures: 0,
    missingNotes: 0,
    extraNotes: 0,
    pitchErrors: 0,
    durationErrors: 0,
    voiceErrors: 0,
    ambiguousLocations: 0,
    unclassifiedGoldenEvents: 0,
    unclassifiedGeneratedEvents: 0,
  }
  const measures = []

  for (const key of keys) {
    const goldMeasure = goldenMeasures.get(key) || null
    const generatedMeasure = generatedMeasures.get(key) || null
    const result = classifyMeasure(goldMeasure, generatedMeasure)
    if (result.exactCorrect) totals.correctMeasures++
    for (const field of [
      'missingNotes', 'extraNotes', 'pitchErrors', 'durationErrors', 'voiceErrors',
      'ambiguousLocations', 'unclassifiedGoldenEvents', 'unclassifiedGeneratedEvents',
    ]) totals[field] += result[field]

    const [partIndex, measureIndex] = key.split(':').map(Number)
    measures.push({
      measureKey: { partIndex, measureIndex },
      goldenVisibleMeasureNumber: goldMeasure?.visibleMeasureNumber ?? null,
      generatedVisibleMeasureNumber: generatedMeasure?.visibleMeasureNumber ?? null,
      exactCorrect: result.exactCorrect,
      goldenEventCount: result.goldenEventCount,
      generatedEventCount: result.generatedEventCount,
      exactMatches: result.exactMatches,
      ambiguousLocations: result.ambiguousLocations,
    })
  }

  const detailState = totals.ambiguousLocations > 0
    ? OMR_BENCHMARK_MEASUREMENT_STATE.REVIEW_REQUIRED
    : OMR_BENCHMARK_MEASUREMENT_STATE.MEASURED
  const detail = (value) => detailState === OMR_BENCHMARK_MEASUREMENT_STATE.MEASURED
    ? metric(detailState, value)
    : metric(detailState, null, value)

  return deepFreeze({
    schemaVersion: OMR_GOLDEN_COMPARATOR_SCHEMA_VERSION,
    comparisonKind: OMR_GOLDEN_COMPARISON_KIND,
    state: detailState,
    ok: true,
    reason: totals.ambiguousLocations > 0
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
      missingNotes: detail(totals.missingNotes),
      extraNotes: detail(totals.extraNotes),
      pitchErrors: detail(totals.pitchErrors),
      durationErrors: detail(totals.durationErrors),
      voiceErrors: detail(totals.voiceErrors),
      fullyCorrectMeasureRate: {
        state: OMR_BENCHMARK_MEASUREMENT_STATE.MEASURED,
        value: keys.length === 0 ? null : totals.correctMeasures / keys.length,
        correctMeasures: totals.correctMeasures,
        totalMeasures: keys.length,
      },
    },
    alignment: {
      state: detailState,
      ambiguousLocations: totals.ambiguousLocations,
      unclassifiedGoldenEvents: totals.unclassifiedGoldenEvents,
      unclassifiedGeneratedEvents: totals.unclassifiedGeneratedEvents,
      policy: 'exact-first-then-singleton-strict-location',
    },
    measures,
  })
}
