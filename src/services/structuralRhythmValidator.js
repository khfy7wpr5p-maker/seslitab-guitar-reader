// Package 2B — Structural and Rhythmic Validator
//
// Read-only structural validation for parsed MusicXML. This module never
// repairs notes, changes timing, or promotes musical correctness. It consumes
// the structured parser output and emits location-rich findings that keep
// definite structural errors separate from suspected OMR/music-data errors.

import { validateOmrMeasureDurations } from './omrQualityValidator.js'
import { buildMeasureTimeline } from './musicXmlMeasureTimeline.js'

export const STRUCTURAL_FINDING_CLASS = Object.freeze({
  STRUCTURAL_ERROR: 'structural_error',
  SUSPECTED_OMR_ERROR: 'suspected_omr_error',
})

export const STRUCTURAL_FINDING_SEVERITY = Object.freeze({
  ERROR: 'error',
  WARNING: 'warning',
})

export const STRUCTURAL_FINDING_CODE = Object.freeze({
  MISSING_TIME_SIGNATURE: 'MISSING_TIME_SIGNATURE',
  INVALID_DIVISIONS: 'INVALID_DIVISIONS',
  MISSING_NOTE_DURATION: 'MISSING_NOTE_DURATION',
  INVALID_BACKUP_DURATION: 'INVALID_BACKUP_DURATION',
  INVALID_FORWARD_DURATION: 'INVALID_FORWARD_DURATION',
  BACKUP_BEFORE_MEASURE_START: 'BACKUP_BEFORE_MEASURE_START',
  MEASURE_UNDERFILLED: 'MEASURE_UNDERFILLED',
  MEASURE_OVERFILLED: 'MEASURE_OVERFILLED',
  EMPTY_MEASURE: 'EMPTY_MEASURE',
  EVENT_EXCEEDS_MEASURE_BOUNDARY: 'EVENT_EXCEEDS_MEASURE_BOUNDARY',
  VOICE_OVERLAP: 'VOICE_OVERLAP',
  CHORD_WITHOUT_BASE_NOTE: 'CHORD_WITHOUT_BASE_NOTE',
  CHORD_ONSET_MISMATCH: 'CHORD_ONSET_MISMATCH',
  TIE_STOP_WITHOUT_START: 'TIE_STOP_WITHOUT_START',
  TIE_START_WITHOUT_STOP: 'TIE_START_WITHOUT_STOP',
  INVALID_TUPLET_RATIO: 'INVALID_TUPLET_RATIO',
  INVALID_BEAM_VALUE: 'INVALID_BEAM_VALUE',
  BEAM_WITHOUT_BEGIN: 'BEAM_WITHOUT_BEGIN',
  BEAM_RESTARTED: 'BEAM_RESTARTED',
  UNCLOSED_BEAM_GROUP: 'UNCLOSED_BEAM_GROUP',
})

const VALID_BEAM_VALUES = new Set([
  'begin',
  'continue',
  'end',
  'forward hook',
  'backward hook',
])

function comparePosition(a, b) {
  const partA = Number.isFinite(a?.partIndex) ? a.partIndex : Number.MAX_SAFE_INTEGER
  const partB = Number.isFinite(b?.partIndex) ? b.partIndex : Number.MAX_SAFE_INTEGER
  if (partA !== partB) return partA - partB

  const measureA = Number.isFinite(a?.measureIndex) ? a.measureIndex : Number.MAX_SAFE_INTEGER
  const measureB = Number.isFinite(b?.measureIndex) ? b.measureIndex : Number.MAX_SAFE_INTEGER
  if (measureA !== measureB) return measureA - measureB

  const sequenceA = Number.isFinite(a?.sequenceIndex) ? a.sequenceIndex : Number.MAX_SAFE_INTEGER
  const sequenceB = Number.isFinite(b?.sequenceIndex) ? b.sequenceIndex : Number.MAX_SAFE_INTEGER
  return sequenceA - sequenceB
}

function locationFrom(value = {}) {
  return {
    partId: value.partId ?? null,
    measureKey: value.measureKey ?? null,
    measureNumber: value.measureNumber ?? value.measure ?? null,
    measureIndex: Number.isFinite(value.measureIndex) ? value.measureIndex : null,
    voice: value.voice ?? null,
    staff: value.staff ?? null,
  }
}

function createFinding({
  code,
  classification,
  severity,
  location,
  expected = null,
  actual = null,
  message,
}) {
  return Object.freeze({
    code,
    classification,
    severity,
    ...locationFrom(location),
    expected,
    actual,
    message,
  })
}

function getTimeSignatureForMeasure(measure, timeSignatures) {
  const candidates = (timeSignatures || [])
    .filter((signature) =>
      signature?.partId === undefined ||
      signature?.partId === null ||
      measure?.partId === undefined ||
      measure?.partId === null ||
      signature.partId === measure.partId
    )
    .sort(comparePosition)

  let active = null
  for (const signature of candidates) {
    const signatureIndex = Number.isFinite(signature.measureIndex)
      ? signature.measureIndex
      : signature.measureNumber
    const measureIndex = Number.isFinite(measure.measureIndex)
      ? measure.measureIndex
      : measure.measureNumber

    if (signatureIndex <= measureIndex) active = signature
    else break
  }
  return active
}

function expectedQuarterBeats(timeSignature) {
  if (!timeSignature) return null
  const beats = Number(timeSignature.beats)
  const beatType = Number(timeSignature.beatType)
  if (!Number.isFinite(beats) || beats <= 0 || !Number.isFinite(beatType) || beatType <= 0) {
    return null
  }
  return beats * (4 / beatType)
}

function timelineEventLocation(measure, event) {
  return {
    ...measure,
    voice: event?.voice ?? null,
    staff: event?.staff ?? null,
  }
}

function addTimelineWarnings(findings, timeline) {
  for (const measure of timeline.measures || []) {
    for (const warning of measure.warnings || []) {
      if (warning.includes('missing or invalid divisions')) {
        findings.push(createFinding({
          code: STRUCTURAL_FINDING_CODE.INVALID_DIVISIONS,
          classification: STRUCTURAL_FINDING_CLASS.STRUCTURAL_ERROR,
          severity: STRUCTURAL_FINDING_SEVERITY.ERROR,
          location: measure,
          expected: 'positive finite divisions',
          actual: measure.divisions,
          message: warning,
        }))
      } else if (warning.includes('has no valid duration')) {
        findings.push(createFinding({
          code: STRUCTURAL_FINDING_CODE.MISSING_NOTE_DURATION,
          classification: STRUCTURAL_FINDING_CLASS.STRUCTURAL_ERROR,
          severity: STRUCTURAL_FINDING_SEVERITY.ERROR,
          location: measure,
          expected: 'finite non-negative note duration or grace note',
          actual: null,
          message: warning,
        }))
      } else if (warning.includes('backup') && warning.includes('invalid duration')) {
        findings.push(createFinding({
          code: STRUCTURAL_FINDING_CODE.INVALID_BACKUP_DURATION,
          classification: STRUCTURAL_FINDING_CLASS.STRUCTURAL_ERROR,
          severity: STRUCTURAL_FINDING_SEVERITY.ERROR,
          location: measure,
          expected: 'finite non-negative backup duration',
          actual: null,
          message: warning,
        }))
      } else if (warning.includes('forward') && warning.includes('invalid duration')) {
        findings.push(createFinding({
          code: STRUCTURAL_FINDING_CODE.INVALID_FORWARD_DURATION,
          classification: STRUCTURAL_FINDING_CLASS.STRUCTURAL_ERROR,
          severity: STRUCTURAL_FINDING_SEVERITY.ERROR,
          location: measure,
          expected: 'finite non-negative forward duration',
          actual: null,
          message: warning,
        }))
      } else if (warning.includes('backup') && warning.includes('before zero')) {
        findings.push(createFinding({
          code: STRUCTURAL_FINDING_CODE.BACKUP_BEFORE_MEASURE_START,
          classification: STRUCTURAL_FINDING_CLASS.STRUCTURAL_ERROR,
          severity: STRUCTURAL_FINDING_SEVERITY.ERROR,
          location: measure,
          expected: 'cursor >= 0',
          actual: 'cursor < 0',
          message: warning,
        }))
      }
    }
  }
}

function addMeasureDurationFindings(findings, report) {
  for (const measure of report.measures || []) {
    if (measure.status === 'unknown' && measure.expectedBeats === null) {
      findings.push(createFinding({
        code: STRUCTURAL_FINDING_CODE.MISSING_TIME_SIGNATURE,
        classification: STRUCTURAL_FINDING_CLASS.STRUCTURAL_ERROR,
        severity: STRUCTURAL_FINDING_SEVERITY.ERROR,
        location: measure,
        expected: 'active time signature',
        actual: null,
        message: 'Time signature information is not available for this measure.',
      }))
      continue
    }

    if (measure.status === 'empty') {
      findings.push(createFinding({
        code: STRUCTURAL_FINDING_CODE.EMPTY_MEASURE,
        classification: STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR,
        severity: STRUCTURAL_FINDING_SEVERITY.ERROR,
        location: measure,
        expected: measure.expectedBeats,
        actual: 0,
        message: 'Measure contains no timed notes or rests.',
      }))
      continue
    }

    if (measure.status === 'underfilled' && measure.severity !== 'none') {
      findings.push(createFinding({
        code: STRUCTURAL_FINDING_CODE.MEASURE_UNDERFILLED,
        classification: STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR,
        severity: measure.severity,
        location: measure,
        expected: measure.expectedBeats,
        actual: measure.actualBeats,
        message: `Measure is underfilled: ${measure.actualBeats} beats, expected ${measure.expectedBeats}.`,
      }))
      continue
    }

    if (measure.status === 'overfilled') {
      findings.push(createFinding({
        code: STRUCTURAL_FINDING_CODE.MEASURE_OVERFILLED,
        classification: STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR,
        severity: measure.severity,
        location: measure,
        expected: measure.expectedBeats,
        actual: measure.actualBeats,
        message: `Measure is overfilled: ${measure.actualBeats} beats, expected ${measure.expectedBeats}.`,
      }))
    }
  }
}

function addBoundaryAndOverlapFindings(findings, structuredScore, timeline, tolerance) {
  for (const measure of timeline.measures || []) {
    if (!(typeof measure.divisions === 'number' && Number.isFinite(measure.divisions) && measure.divisions > 0)) {
      continue
    }

    const timeSignature = getTimeSignatureForMeasure(measure, structuredScore.timeSignatures || [])
    const expectedBeats = expectedQuarterBeats(timeSignature)
    const expectedDivisions = expectedBeats === null ? null : expectedBeats * measure.divisions
    const toleranceDivisions = tolerance * measure.divisions

    if (expectedDivisions !== null) {
      for (const event of measure.events || []) {
        if ((event.type === 'note' || event.type === 'forward') &&
            Number.isFinite(event.endDivisions) &&
            event.endDivisions > expectedDivisions + toleranceDivisions) {
          findings.push(createFinding({
            code: STRUCTURAL_FINDING_CODE.EVENT_EXCEEDS_MEASURE_BOUNDARY,
            classification: STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR,
            severity: STRUCTURAL_FINDING_SEVERITY.ERROR,
            location: timelineEventLocation(measure, event),
            expected: expectedBeats,
            actual: event.endDivisions / measure.divisions,
            message: 'Timed event extends beyond the active measure boundary.',
          }))
        }
      }
    }

    const groups = new Map()
    for (const event of measure.events || []) {
      if (event.type !== 'note' || event.isChordNote || event.isGrace || event.durationDivisions <= 0) continue
      const key = `${event.voice ?? 1}:${event.staff ?? 1}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(event)
    }

    for (const events of groups.values()) {
      events.sort((a, b) => a.startDivisions - b.startDivisions || a.sequenceIndex - b.sequenceIndex)
      let previous = null
      for (const event of events) {
        if (previous && event.startDivisions < previous.endDivisions - toleranceDivisions) {
          findings.push(createFinding({
            code: STRUCTURAL_FINDING_CODE.VOICE_OVERLAP,
            classification: STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR,
            severity: STRUCTURAL_FINDING_SEVERITY.ERROR,
            location: timelineEventLocation(measure, event),
            expected: previous.endDivisions / measure.divisions,
            actual: event.startDivisions / measure.divisions,
            message: 'Non-chord timed events overlap inside the same voice and staff.',
          }))
        }
        if (!previous || event.endDivisions > previous.endDivisions) previous = event
      }
    }
  }
}

function addChordFindings(findings, timeline) {
  for (const measure of timeline.measures || []) {
    const events = [...(measure.events || [])]
      .filter((event) => event.type === 'note')
      .sort((a, b) => a.sequenceIndex - b.sequenceIndex)

    let previousBase = null
    for (const event of events) {
      if (!event.isChordNote) {
        previousBase = event
        continue
      }

      const hasCompatibleBase = previousBase &&
        (previousBase.voice ?? 1) === (event.voice ?? 1) &&
        (previousBase.staff ?? 1) === (event.staff ?? 1)

      if (!hasCompatibleBase) {
        findings.push(createFinding({
          code: STRUCTURAL_FINDING_CODE.CHORD_WITHOUT_BASE_NOTE,
          classification: STRUCTURAL_FINDING_CLASS.STRUCTURAL_ERROR,
          severity: STRUCTURAL_FINDING_SEVERITY.ERROR,
          location: timelineEventLocation(measure, event),
          expected: 'preceding base note in same voice/staff',
          actual: null,
          message: 'Chord continuation has no compatible preceding base note.',
        }))
        continue
      }

      if (event.startDivisions !== previousBase.startDivisions) {
        findings.push(createFinding({
          code: STRUCTURAL_FINDING_CODE.CHORD_ONSET_MISMATCH,
          classification: STRUCTURAL_FINDING_CLASS.STRUCTURAL_ERROR,
          severity: STRUCTURAL_FINDING_SEVERITY.ERROR,
          location: timelineEventLocation(measure, event),
          expected: previousBase.startDivisions,
          actual: event.startDivisions,
          message: 'Chord continuation does not share the base note onset.',
        }))
      }
    }
  }
}

function notePitchKey(note) {
  if (note?.isRest) return null
  if (!note?.step || !Number.isFinite(Number(note?.octave))) return null
  return `${note.partId ?? ''}:${note.voice ?? 1}:${note.staff ?? 1}:${note.step}:${note.alter ?? 0}:${note.octave}`
}

function addTieFindings(findings, structuredScore) {
  const openTies = new Map()
  const notes = [...(structuredScore.notes || [])].sort(comparePosition)

  for (const note of notes) {
    const key = notePitchKey(note)
    if (!key) continue

    if (note.tieStop) {
      if (!openTies.has(key)) {
        findings.push(createFinding({
          code: STRUCTURAL_FINDING_CODE.TIE_STOP_WITHOUT_START,
          classification: STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR,
          severity: STRUCTURAL_FINDING_SEVERITY.WARNING,
          location: note,
          expected: 'earlier tie start for same pitch/voice/staff',
          actual: 'tie stop',
          message: 'Tie stop has no matching earlier tie start.',
        }))
      } else {
        openTies.delete(key)
      }
    }

    if (note.tieStart) openTies.set(key, note)
  }

  for (const note of openTies.values()) {
    findings.push(createFinding({
      code: STRUCTURAL_FINDING_CODE.TIE_START_WITHOUT_STOP,
      classification: STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR,
      severity: STRUCTURAL_FINDING_SEVERITY.WARNING,
      location: note,
      expected: 'later tie stop for same pitch/voice/staff',
      actual: 'tie start',
      message: 'Tie start has no matching later tie stop.',
    }))
  }
}

function addTupletFindings(findings, structuredScore) {
  for (const note of structuredScore.notes || []) {
    if (!note?.tuplet) continue
    const actualNotes = Number(note.tuplet.actualNotes)
    const normalNotes = Number(note.tuplet.normalNotes)
    if (!Number.isInteger(actualNotes) || actualNotes <= 0 ||
        !Number.isInteger(normalNotes) || normalNotes <= 0) {
      findings.push(createFinding({
        code: STRUCTURAL_FINDING_CODE.INVALID_TUPLET_RATIO,
        classification: STRUCTURAL_FINDING_CLASS.STRUCTURAL_ERROR,
        severity: STRUCTURAL_FINDING_SEVERITY.ERROR,
        location: note,
        expected: 'positive integer actualNotes/normalNotes',
        actual: { actualNotes: note.tuplet.actualNotes ?? null, normalNotes: note.tuplet.normalNotes ?? null },
        message: 'Tuplet time-modification ratio is missing or invalid.',
      }))
    }
  }
}

function normalizeBeamEntries(beam) {
  if (!beam) return []
  return Array.isArray(beam) ? beam : [beam]
}

function addBeamFindings(findings, structuredScore) {
  const open = new Map()
  const notes = [...(structuredScore.notes || [])].sort(comparePosition)

  for (const note of notes) {
    for (const entry of normalizeBeamEntries(note.beam)) {
      if (!entry) continue
      const number = Number(entry.number ?? 1)
      const value = String(entry.value ?? '').trim().toLowerCase()
      const location = note

      if (!Number.isInteger(number) || number <= 0 || !VALID_BEAM_VALUES.has(value)) {
        findings.push(createFinding({
          code: STRUCTURAL_FINDING_CODE.INVALID_BEAM_VALUE,
          classification: STRUCTURAL_FINDING_CLASS.STRUCTURAL_ERROR,
          severity: STRUCTURAL_FINDING_SEVERITY.ERROR,
          location,
          expected: 'positive beam number and valid beam token',
          actual: { number: entry.number ?? null, value: entry.value ?? null },
          message: 'Beam metadata is malformed.',
        }))
        continue
      }

      if (value === 'forward hook' || value === 'backward hook') continue

      const key = `${note.partId ?? ''}:${note.measureKey ?? ''}:${note.voice ?? 1}:${note.staff ?? 1}:${number}`
      if (value === 'begin') {
        if (open.has(key)) {
          findings.push(createFinding({
            code: STRUCTURAL_FINDING_CODE.BEAM_RESTARTED,
            classification: STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR,
            severity: STRUCTURAL_FINDING_SEVERITY.WARNING,
            location,
            expected: 'end existing beam before new begin',
            actual: 'begin while beam already open',
            message: 'Beam group begins again before the previous group ends.',
          }))
        }
        open.set(key, note)
      } else if (value === 'continue') {
        if (!open.has(key)) {
          findings.push(createFinding({
            code: STRUCTURAL_FINDING_CODE.BEAM_WITHOUT_BEGIN,
            classification: STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR,
            severity: STRUCTURAL_FINDING_SEVERITY.WARNING,
            location,
            expected: 'earlier beam begin',
            actual: 'continue',
            message: 'Beam continuation has no matching begin.',
          }))
        }
      } else if (value === 'end') {
        if (!open.has(key)) {
          findings.push(createFinding({
            code: STRUCTURAL_FINDING_CODE.BEAM_WITHOUT_BEGIN,
            classification: STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR,
            severity: STRUCTURAL_FINDING_SEVERITY.WARNING,
            location,
            expected: 'earlier beam begin',
            actual: 'end',
            message: 'Beam end has no matching begin.',
          }))
        } else {
          open.delete(key)
        }
      }
    }
  }

  for (const note of open.values()) {
    findings.push(createFinding({
      code: STRUCTURAL_FINDING_CODE.UNCLOSED_BEAM_GROUP,
      classification: STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR,
      severity: STRUCTURAL_FINDING_SEVERITY.WARNING,
      location: note,
      expected: 'beam end in same measure/voice/staff',
      actual: 'open beam at measure end',
      message: 'Beam group is not closed.',
    }))
  }
}

/**
 * Validate structural and rhythmic consistency without mutating input data.
 *
 * @param {Object} structuredScore output of parseMusicXmlWithStructure()
 * @param {Object} options
 * @returns {{ valid: boolean, findings: Object[], summary: Object, measureReport: Object, timeline: Object }}
 */
export function validateStructuralRhythm(structuredScore, options = {}) {
  if (!structuredScore || typeof structuredScore !== 'object' || Array.isArray(structuredScore)) {
    throw new TypeError('structuredScore must be an object')
  }

  const tolerance = Number.isFinite(options.tolerance) ? options.tolerance : 0.01
  const validateAllParts = options.validateAllParts !== false
  const findings = []

  const timeline = buildMeasureTimeline(structuredScore)
  const measureReport = validateOmrMeasureDurations(structuredScore, {
    tolerance,
    validateAllParts,
    partId: options.partId,
  })

  addTimelineWarnings(findings, timeline)
  addMeasureDurationFindings(findings, measureReport)
  addBoundaryAndOverlapFindings(findings, structuredScore, timeline, tolerance)
  addChordFindings(findings, timeline)
  addTieFindings(findings, structuredScore)
  addTupletFindings(findings, structuredScore)
  addBeamFindings(findings, structuredScore)

  const structuralErrors = findings.filter(
    (finding) => finding.classification === STRUCTURAL_FINDING_CLASS.STRUCTURAL_ERROR
  ).length
  const suspectedOmrErrors = findings.filter(
    (finding) => finding.classification === STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR
  ).length
  const errors = findings.filter(
    (finding) => finding.severity === STRUCTURAL_FINDING_SEVERITY.ERROR
  ).length
  const warnings = findings.filter(
    (finding) => finding.severity === STRUCTURAL_FINDING_SEVERITY.WARNING
  ).length

  return Object.freeze({
    valid: errors === 0,
    findings: Object.freeze(findings),
    summary: Object.freeze({
      totalFindings: findings.length,
      structuralErrors,
      suspectedOmrErrors,
      errors,
      warnings,
    }),
    measureReport,
    timeline,
  })
}
