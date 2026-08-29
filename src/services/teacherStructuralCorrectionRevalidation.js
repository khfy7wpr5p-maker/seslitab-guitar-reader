// Package 12-T4 — bounded structural/rhythmic post-correction revalidation.
//
// T4 extends T3 only where a teacher-corrected NoteObject snapshot can be
// mechanically revalidated against immutable structural context from the exact
// automatic root MusicXML. The old raw MusicXML is never registered or claimed
// as the source of the corrected values.
//
// Metadata only: no payload, token, authentication, persistence, network,
// OMR/Audiveris, deployment, or UI authority is introduced here.

import {
  beatsToDurationId,
  resolveCanonicalPitch,
} from '../../noteTheory.js'
import {
  GUITAR_POSITION_CANDIDATE_STATE,
  enumerateCanonicalGuitarPositionCandidates,
} from '../../guitarPositionResolver.js'
import { parseMusicXmlWithStructure } from '../../musicXmlParser.js'
import {
  extractMusicXmlStructuralEvidence,
} from './musicXmlStructuralEvidence.js'
import {
  attachStructuralEvidence,
} from './musicXmlStructuralValidation.js'
import {
  validateStructuralRhythm,
} from './structuralRhythmValidator.js'
import {
  resolveMusicXmlSourceForNotes,
} from './musicXmlSourceRegistry.js'
import {
  getCurrentTeacherRevision,
  isTeacherRevisionHistory,
} from './teacherRevisionHistory.js'
import {
  TEACHER_REVISION_KIND,
  isTeacherRevision,
} from './teacherRevisionModel.js'
import {
  TEACHER_SHARE_AUTHORIZATION_APPLICABILITY,
  evaluateTeacherShareAuthorization,
} from './teacherShareAuthorization.js'
import {
  createTeacherShareQualityEvidence,
  isTeacherShareQualityEvidenceRecord,
} from './teacherShareEligibility.js'
import {
  TEACHER_CORRECTION_REVALIDATION_SUPPORTED_FIELDS,
} from './teacherCorrectionRevalidation.js'

export const TEACHER_STRUCTURAL_REVALIDATION_SCHEMA_VERSION = 1
export const TEACHER_STRUCTURAL_REVALIDATION_STATE =
  'teacher_corrected_structural_revalidated'
export const TEACHER_STRUCTURAL_REVALIDATION_SCOPE =
  'pitch_position_structural_rhythm_v1'

const STRUCTURAL_FIELDS = Object.freeze([
  'duration',
  'beats',
  'durationValue',
  'dotCount',
  'startBeat',
  'voice',
  'staff',
  'tieStart',
  'tieStop',
  'tieContinue',
  'isChordNote',
])

export const TEACHER_STRUCTURAL_REVALIDATION_SUPPORTED_FIELDS = Object.freeze([
  ...TEACHER_CORRECTION_REVALIDATION_SUPPORTED_FIELDS,
  ...STRUCTURAL_FIELDS,
])

export const TEACHER_STRUCTURALLY_CORRECTED_SHARE_ELIGIBILITY_STATUS =
  Object.freeze({
    ELIGIBLE_STRUCTURALLY_REVALIDATED_REVISION:
      'eligible_structurally_revalidated_revision',
    AUTHORIZATION_NOT_APPLICABLE: 'authorization_not_applicable',
    RECIPIENT_MISMATCH: 'recipient_mismatch',
    REVOKED: 'revoked',
    REVALIDATION_EVIDENCE_MISSING: 'revalidation_evidence_missing',
    REVALIDATION_EVIDENCE_INVALID: 'revalidation_evidence_invalid',
    REVALIDATION_EVIDENCE_NOT_APPLICABLE:
      'revalidation_evidence_not_applicable',
    REVALIDATION_EVIDENCE_STALE: 'revalidation_evidence_stale',
    HISTORY_NOT_CURRENT: 'history_not_current',
    ROOT_QUALITY_NOT_ELIGIBLE: 'root_quality_not_eligible',
    STRUCTURAL_CONTEXT_INVALID: 'structural_context_invalid',
    UNSUPPORTED_CORRECTION_SCOPE: 'unsupported_correction_scope',
    CORRECTED_STATE_INVALID: 'corrected_state_invalid',
  })

const EVIDENCE_FIELDS = Object.freeze([
  'schemaVersion',
  'revalidationState',
  'scope',
  'evidenceId',
  'historyId',
  'sourceId',
  'sourceRevisionId',
  'rootRevisionId',
  'rootContentFingerprint',
  'rootLineageFingerprint',
  'targetRevisionId',
  'targetParentRevisionId',
  'targetCreatedAt',
  'targetContentFingerprint',
  'targetLineageFingerprint',
  'rootQualityEvidence',
  'correctionEventCount',
  'undoEventCount',
  'correctionOperationCount',
  'correctedTargets',
  'historyChainFingerprint',
  'structuralContextFingerprint',
  'structuralValidationFingerprint',
  'revalidationFingerprint',
  'createdAt',
])

const ROOT_QUALITY_COMPARE_FIELDS = Object.freeze([
  'schemaVersion',
  'evidenceState',
  'evidenceId',
  'sourceId',
  'sourceRevisionId',
  'revisionId',
  'revisionKind',
  'parentRevisionId',
  'parentLineageFingerprint',
  'revisionCreatedAt',
  'contentFingerprint',
  'lineageFingerprint',
  'musicXmlSourceProvenance',
  'musicXmlSourceFingerprint',
  'ttsDecision',
  'ttsReason',
  'playbackDecision',
  'playbackReason',
  'createdAt',
])

const PITCH_POSITION_FIELDS = new Set(
  TEACHER_CORRECTION_REVALIDATION_SUPPORTED_FIELDS,
)
const TIMING_FIELDS = new Set([
  'duration',
  'beats',
  'durationValue',
  'dotCount',
  'startBeat',
  'isChordNote',
])
const STRUCTURAL_ONLY_FIELDS = new Set(STRUCTURAL_FIELDS)
const ROOT_IDENTITY_FIELDS = Object.freeze([
  'partId',
  'partIndex',
  'measureNumber',
  'measureKey',
  'measureIndex',
])
const FNV_1A_64_OFFSET = 0xcbf29ce484222325n
const FNV_1A_64_PRIME = 0x100000001b3n
const UINT64_MASK = 0xffffffffffffffffn
const EPSILON = 1e-9

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function requiredString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${fieldName} must be a non-empty string.`)
  }
  return value.trim()
}

function nullableString(value, fieldName) {
  if (value === null || value === undefined) return null
  return requiredString(value, fieldName)
}

function hasStrictFrozenShape(value, fields) {
  if (!isPlainObject(value) || !Object.isFrozen(value)) return false
  const keys = Reflect.ownKeys(value)
  if (
    keys.length !== fields.length ||
    keys.some((key) => typeof key !== 'string' || !fields.includes(key))
  ) {
    return false
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  return fields.every((field) => {
    const descriptor = descriptors[field]
    return Boolean(
      descriptor &&
      descriptor.enumerable === true &&
      descriptor.configurable === false &&
      descriptor.writable === false &&
      Object.prototype.hasOwnProperty.call(descriptor, 'value')
    )
  })
}

function isDenseFrozenStringArray(value) {
  if (!Array.isArray(value) || !Object.isFrozen(value)) return false
  if (Object.getOwnPropertySymbols(value).length > 0) return false

  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (let index = 0; index < value.length; index++) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false
    const descriptor = descriptors[index]
    if (
      !descriptor ||
      descriptor.enumerable !== true ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      typeof descriptor.value !== 'string' ||
      descriptor.value.trim() === '' ||
      descriptor.value.trim() !== descriptor.value
    ) {
      return false
    }
  }

  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (key === 'length') continue
    const index = Number(key)
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= value.length ||
      String(index) !== key ||
      descriptor.enumerable !== true ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      return false
    }
  }
  return true
}

function stableSerialize(value) {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('fingerprint value contains a non-finite number')
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value)
  }
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (!isPlainObject(value)) {
    throw new TypeError('fingerprint value must contain only plain data')
  }
  const keys = Object.keys(value).sort()
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
    .join(',')}}`
}

function fnv1a64(text) {
  let hash = FNV_1A_64_OFFSET
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte)
    hash = (hash * FNV_1A_64_PRIME) & UINT64_MASK
  }
  return hash.toString(16).padStart(16, '0')
}

function fingerprint(label, value) {
  const serialized = stableSerialize(value)
  return `${label}-fnv1a64-v1:${fnv1a64(serialized)}:${serialized.length}`
}

function sameRootQualityEvidence(left, right) {
  return ROOT_QUALITY_COMPARE_FIELDS.every((field) => left[field] === right[field])
}

function replayRootQuality({ history, sourceNotes, rootQualityEvidence }) {
  if (!isTeacherRevisionHistory(history)) {
    return { ok: false, reason: 'invalid-history' }
  }
  if (!Array.isArray(sourceNotes)) {
    return { ok: false, reason: 'source-notes-required' }
  }
  if (!isTeacherShareQualityEvidenceRecord(rootQualityEvidence)) {
    return { ok: false, reason: 'root-quality-evidence-invalid' }
  }

  const root = history.revisions[0]
  if (
    root?.revisionKind !== TEACHER_REVISION_KIND.AUTOMATIC ||
    rootQualityEvidence.sourceId !== root.sourceId ||
    rootQualityEvidence.sourceRevisionId !== root.sourceRevisionId ||
    rootQualityEvidence.revisionId !== root.revisionId ||
    rootQualityEvidence.contentFingerprint !== root.contentFingerprint ||
    rootQualityEvidence.lineageFingerprint !== root.lineageFingerprint
  ) {
    return { ok: false, reason: 'root-quality-evidence-not-applicable' }
  }

  try {
    const live = createTeacherShareQualityEvidence({
      evidenceId: rootQualityEvidence.evidenceId,
      revision: root,
      sourceNotes,
      createdAt: rootQualityEvidence.createdAt,
    })
    if (!sameRootQualityEvidence(live, rootQualityEvidence)) {
      return { ok: false, reason: 'root-quality-evidence-stale' }
    }
    return { ok: true, root, live }
  } catch {
    return { ok: false, reason: 'root-quality-not-eligible' }
  }
}

function operationValueValid(field, value) {
  if (field === 'step' || field === 'noteName' || field === 'duration') {
    return typeof value === 'string' && value.trim() !== '' && value.trim() === value
  }
  if (field === 'frequency') {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
  }
  if (field === 'beats' || field === 'startBeat') {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
  }
  if (field === 'durationValue') {
    return Number.isInteger(value) && value > 0
  }
  if (field === 'dotCount') {
    return Number.isInteger(value) && value >= 0 && value <= 1
  }
  if (field === 'voice' || field === 'staff') {
    return Number.isInteger(value) && value > 0
  }
  if (
    field === 'tieStart' ||
    field === 'tieStop' ||
    field === 'tieContinue' ||
    field === 'isChordNote'
  ) {
    return typeof value === 'boolean'
  }
  return (
    ['alter', 'octave', 'midi', 'fret'].includes(field) &&
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value)
  )
}

function collectHistoryScope(history) {
  if (!isTeacherRevisionHistory(history)) {
    return { ok: false, reason: 'invalid-history' }
  }
  if (history.revisions.length < 2) {
    return { ok: false, reason: 'teacher-corrected-revision-required' }
  }

  const target = getCurrentTeacherRevision(history)
  if (
    target.revisionKind !== TEACHER_REVISION_KIND.TEACHER_CORRECTED ||
    !Array.isArray(target.content)
  ) {
    return { ok: false, reason: 'teacher-corrected-note-array-required' }
  }

  const correctionsByResult = new Map(
    history.correctionAuditEvents.map((event) => [event.resultRevisionId, event]),
  )
  const undosByResult = new Map(
    history.undoAuditEvents.map((event) => [event.resultRevisionId, event]),
  )

  const chain = []
  const correctedTargets = new Set()
  let correctionEventCount = 0
  let undoEventCount = 0
  let correctionOperationCount = 0

  for (let index = 1; index < history.revisions.length; index++) {
    const revision = history.revisions[index]
    const correction = correctionsByResult.get(revision.revisionId) ?? null
    const undo = undosByResult.get(revision.revisionId) ?? null

    if ((correction === null) === (undo === null)) {
      return { ok: false, reason: 'history-transition-evidence-ambiguous' }
    }

    if (correction) {
      correctionEventCount++
      const operations = []
      for (const operation of correction.operations) {
        if (
          !Array.isArray(operation.path) ||
          operation.path.length !== 2 ||
          !Number.isInteger(operation.path[0]) ||
          operation.path[0] < 0 ||
          operation.path[0] >= target.content.length ||
          typeof operation.path[1] !== 'string' ||
          !TEACHER_STRUCTURAL_REVALIDATION_SUPPORTED_FIELDS.includes(operation.path[1])
        ) {
          return { ok: false, reason: 'unsupported-correction-field' }
        }

        const [noteIndex, field] = operation.path
        if (
          !operationValueValid(field, operation.before) ||
          !operationValueValid(field, operation.after) ||
          typeof operation.before !== typeof operation.after
        ) {
          return { ok: false, reason: 'invalid-correction-value' }
        }

        correctedTargets.add(`${noteIndex}/${field}`)
        correctionOperationCount++
        operations.push({
          operationId: operation.operationId,
          path: [noteIndex, field],
          before: operation.before,
          after: operation.after,
        })
      }

      chain.push({
        transition: 'correction',
        eventId: correction.eventId,
        actorId: correction.actorId,
        createdAt: correction.createdAt,
        parentRevisionId: correction.parentRevisionId,
        resultRevisionId: correction.resultRevisionId,
        operations,
      })
      continue
    }

    undoEventCount++
    chain.push({
      transition: 'undo',
      eventId: undo.eventId,
      actorId: undo.actorId,
      createdAt: undo.createdAt,
      parentRevisionId: undo.parentRevisionId,
      targetRevisionId: undo.targetRevisionId,
      targetContentFingerprint: undo.targetContentFingerprint,
      targetLineageFingerprint: undo.targetLineageFingerprint,
      resultRevisionId: undo.resultRevisionId,
      resultContentFingerprint: undo.resultContentFingerprint,
      resultLineageFingerprint: undo.resultLineageFingerprint,
    })
  }

  if (correctionOperationCount === 0) {
    return { ok: false, reason: 'correction-operation-required' }
  }

  return {
    ok: true,
    target,
    correctionEventCount,
    undoEventCount,
    correctionOperationCount,
    correctedTargets: Object.freeze([...correctedTargets].sort()),
    historyChainFingerprint: fingerprint('teacher-structural-history-chain', chain),
  }
}

function approximatelyEqual(left, right) {
  return (
    typeof left === 'number' &&
    typeof right === 'number' &&
    Number.isFinite(left) &&
    Number.isFinite(right) &&
    Math.abs(left - right) <= EPSILON
  )
}

function normalizedBoolean(value) {
  return value === true
}

function rootStructuralContextMatches(rootNotes, parsedNotes) {
  if (!Array.isArray(rootNotes) || !Array.isArray(parsedNotes)) return false
  if (rootNotes.length !== parsedNotes.length) return false

  for (let index = 0; index < rootNotes.length; index++) {
    const root = rootNotes[index]
    const parsed = parsedNotes[index]
    if (!isPlainObject(root) || !isPlainObject(parsed)) return false

    for (const field of ROOT_IDENTITY_FIELDS) {
      if ((root[field] ?? null) !== (parsed[field] ?? null)) return false
    }

    if (normalizedBoolean(root.isRest) !== normalizedBoolean(parsed.isRest)) return false
    if (normalizedBoolean(root.isGrace) !== normalizedBoolean(parsed.isGrace)) return false
    if (
      normalizedBoolean(root.isChordNote) !== normalizedBoolean(parsed.isChordNote)
    ) {
      return false
    }
    if (normalizedBoolean(root.tieStart) !== normalizedBoolean(parsed.tieStart)) return false
    if (normalizedBoolean(root.tieStop) !== normalizedBoolean(parsed.tieStop)) return false
    if (
      normalizedBoolean(root.tieContinue) !== normalizedBoolean(parsed.tieContinue)
    ) {
      return false
    }

    if ((root.duration ?? null) !== (parsed.duration ?? null)) return false
    if (!approximatelyEqual(Number(root.beats), Number(parsed.beats))) return false
    if (!approximatelyEqual(Number(root.startBeat), Number(parsed.startBeat))) return false
    if ((root.durationValue ?? null) !== (parsed.durationValue ?? null)) return false
    if ((root.divisions ?? null) !== (parsed.divisions ?? null)) return false
    if ((root.dotCount ?? 0) !== (parsed.dotCount ?? 0)) return false
    if ((root.voice ?? 1) !== (parsed.voice ?? 1)) return false
    if ((root.staff ?? 1) !== (parsed.staff ?? 1)) return false
  }

  return true
}

function structuralContextSnapshot(score, evidence, musicXmlFingerprint) {
  return {
    musicXmlFingerprint,
    timeSignatures: score.timeSignatures ?? [],
    divisionsByMeasure: score.divisionsByMeasure ?? [],
    measureMetadata: score.measureMetadata ?? [],
    measureEvents: score.measureEvents ?? [],
    noteEvidence: evidence.noteEvidence ?? [],
    divisionsDeclarations: evidence.divisionsDeclarations ?? [],
  }
}

function resolveStructuralContext({ history, sourceNotes, rootQualityEvidence }) {
  const rootQuality = replayRootQuality({ history, sourceNotes, rootQualityEvidence })
  if (!rootQuality.ok) {
    return {
      ok: false,
      status:
        TEACHER_STRUCTURALLY_CORRECTED_SHARE_ELIGIBILITY_STATUS
          .ROOT_QUALITY_NOT_ELIGIBLE,
      reason: rootQuality.reason,
    }
  }

  const source = resolveMusicXmlSourceForNotes(sourceNotes)
  if (
    !source ||
    !Object.isFrozen(source) ||
    source.notes !== sourceNotes ||
    typeof source.musicXml !== 'string' ||
    source.musicXml.trim() === ''
  ) {
    return {
      ok: false,
      status:
        TEACHER_STRUCTURALLY_CORRECTED_SHARE_ELIGIBILITY_STATUS
          .STRUCTURAL_CONTEXT_INVALID,
      reason: 'exact-root-musicxml-source-required',
    }
  }

  const parsed = parseMusicXmlWithStructure(source.musicXml)
  if (parsed?.error || !Array.isArray(parsed?.notes)) {
    return {
      ok: false,
      status:
        TEACHER_STRUCTURALLY_CORRECTED_SHARE_ELIGIBILITY_STATUS
          .STRUCTURAL_CONTEXT_INVALID,
      reason: 'source-structural-context-parse-failed',
    }
  }

  const evidence = extractMusicXmlStructuralEvidence(source.musicXml)
  if (!evidence?.ok) {
    return {
      ok: false,
      status:
        TEACHER_STRUCTURALLY_CORRECTED_SHARE_ELIGIBILITY_STATUS
          .STRUCTURAL_CONTEXT_INVALID,
      reason: 'source-structural-evidence-invalid',
    }
  }

  let validationScore
  try {
    validationScore = attachStructuralEvidence(parsed, evidence)
  } catch {
    return {
      ok: false,
      status:
        TEACHER_STRUCTURALLY_CORRECTED_SHARE_ELIGIBILITY_STATUS
          .STRUCTURAL_CONTEXT_INVALID,
      reason: 'source-structural-evidence-mismatch',
    }
  }

  if (!rootStructuralContextMatches(rootQuality.root.content, validationScore.notes)) {
    return {
      ok: false,
      status:
        TEACHER_STRUCTURALLY_CORRECTED_SHARE_ELIGIBILITY_STATUS
          .STRUCTURAL_CONTEXT_INVALID,
      reason: 'source-structural-context-mismatch',
    }
  }

  const rootValidation = validateStructuralRhythm(validationScore)
  if (
    rootValidation.valid !== true ||
    rootValidation.summary?.totalFindings !== 0
  ) {
    return {
      ok: false,
      status:
        TEACHER_STRUCTURALLY_CORRECTED_SHARE_ELIGIBILITY_STATUS
          .STRUCTURAL_CONTEXT_INVALID,
      reason: 'source-structural-context-not-clean',
    }
  }

  return {
    ok: true,
    root: rootQuality.root,
    rootQualityEvidence: rootQuality.live,
    source,
    validationScore,
    structuralContextFingerprint: fingerprint(
      'teacher-structural-context',
      structuralContextSnapshot(
        validationScore,
        evidence,
        rootQuality.live.musicXmlSourceFingerprint,
      ),
    ),
  }
}

function targetIdentityMatchesSource(targetNotes, sourceNotes) {
  if (!Array.isArray(targetNotes) || !Array.isArray(sourceNotes)) return false
  if (targetNotes.length !== sourceNotes.length) return false

  for (let index = 0; index < targetNotes.length; index++) {
    const target = targetNotes[index]
    const source = sourceNotes[index]
    if (!isPlainObject(target) || !isPlainObject(source)) return false

    for (const field of ROOT_IDENTITY_FIELDS) {
      if ((target[field] ?? null) !== (source[field] ?? null)) return false
    }
    if (normalizedBoolean(target.isRest) !== normalizedBoolean(source.isRest)) return false
    if (normalizedBoolean(target.isGrace) !== normalizedBoolean(source.isGrace)) return false
    if ((target.divisions ?? null) !== (source.divisions ?? null)) return false
  }

  return true
}

function buildCorrectedStructuralScore(sourceScore, targetNotes) {
  if (!targetIdentityMatchesSource(targetNotes, sourceScore.notes)) {
    throw new Error('corrected-note-identity-drift')
  }

  const notes = sourceScore.notes.map((sourceNote, index) => ({
    ...sourceNote,
    ...targetNotes[index],
    partId: sourceNote.partId,
    partIndex: sourceNote.partIndex,
    measureNumber: sourceNote.measureNumber,
    measureKey: sourceNote.measureKey,
    measureIndex: sourceNote.measureIndex,
    divisions: sourceNote.divisions,
    tuplet: sourceNote.tuplet ?? null,
    beam: sourceNote.beam ?? null,
  }))

  let noteIndex = 0
  const measureEvents = sourceScore.measureEvents.map((event) => {
    if (event.type !== 'note') return { ...event }
    if (noteIndex >= targetNotes.length) {
      throw new Error('corrected-note-event-count-mismatch')
    }
    const note = targetNotes[noteIndex++]
    return {
      ...event,
      isGrace: note.isGrace === true,
      isChordNote: note.isChordNote === true,
      isRest: note.isRest === true,
      voice: note.voice,
      staff: note.staff,
      beats: note.beats,
      durationValue: note.durationValue,
      divisions: event.divisions,
    }
  })

  if (noteIndex !== targetNotes.length) {
    throw new Error('corrected-note-event-count-mismatch')
  }

  return {
    ...sourceScore,
    notes,
    measureEvents,
  }
}

function affectedIndexesForFields(correctedTargets, fields) {
  const indexes = new Set()
  for (const target of correctedTargets) {
    const [rawIndex, field] = target.split('/')
    if (fields.has(field)) indexes.add(Number(rawIndex))
  }
  return indexes
}

function validateTieTopology(notes) {
  const open = new Map()

  for (const note of notes) {
    if (!isPlainObject(note)) return false
    if (Boolean(note.tieContinue) !== Boolean(note.tieStart && note.tieStop)) {
      return false
    }
    if (!note.tieStart && !note.tieStop) continue
    if (note.isRest === true) return false
    if (typeof note.step !== 'string' || !Number.isInteger(note.octave)) {
      return false
    }

    const key = [
      note.partId ?? '',
      note.voice ?? 1,
      note.staff ?? 1,
      note.step,
      note.alter ?? 0,
      note.octave,
    ].join(':')

    if (note.tieStop) {
      if (!open.has(key)) return false
      open.delete(key)
    }
    if (note.tieStart) {
      if (open.has(key)) return false
      open.set(key, note)
    }
  }

  return open.size === 0
}

function validatePitchPositionState(targetNotes, correctedTargets) {
  const pitchIndexes = affectedIndexesForFields(
    correctedTargets,
    PITCH_POSITION_FIELDS,
  )

  for (const noteIndex of pitchIndexes) {
    const note = targetNotes[noteIndex]
    if (!isPlainObject(note) || note.isRest === true) return false

    const pitch = resolveCanonicalPitch({
      step: note.step,
      alter: note.alter,
      octave: note.octave,
      midi: note.midi,
      frequency: note.frequency,
    })
    if (!pitch.valid || pitch.midi !== note.midi || pitch.noteName !== note.noteName) {
      return false
    }

    if (
      typeof note.stringLetter === 'string' &&
      note.stringLetter !== '' &&
      Number.isInteger(note.fret)
    ) {
      const positions = enumerateCanonicalGuitarPositionCandidates(note)
      if (positions.state !== GUITAR_POSITION_CANDIDATE_STATE.CANDIDATES) {
        return false
      }
      const matching = positions.candidates.find(
        (candidate) =>
          candidate.stringLetter === note.stringLetter &&
          candidate.fret === note.fret,
      )
      if (!matching) return false
      if (
        Number.isInteger(note.stringNumber) &&
        note.stringNumber > 0 &&
        matching.stringNumber !== note.stringNumber
      ) {
        return false
      }
    } else if (correctedTargets.includes(`${noteIndex}/fret`)) {
      return false
    }
  }

  return true
}

function validateTouchedStructuralNotes(targetNotes, correctedTargets) {
  const structuralIndexes = affectedIndexesForFields(
    correctedTargets,
    STRUCTURAL_ONLY_FIELDS,
  )
  const timingIndexes = affectedIndexesForFields(correctedTargets, TIMING_FIELDS)

  for (const noteIndex of structuralIndexes) {
    const note = targetNotes[noteIndex]
    if (!isPlainObject(note)) return false
    if (!Number.isInteger(note.voice) || note.voice <= 0) return false
    if (!Number.isInteger(note.staff) || note.staff <= 0) return false
    if (typeof note.isChordNote !== 'boolean') return false
    if (typeof note.tieStart !== 'boolean') return false
    if (typeof note.tieStop !== 'boolean') return false
    if (typeof note.tieContinue !== 'boolean') return false
  }

  for (const noteIndex of timingIndexes) {
    const note = targetNotes[noteIndex]
    if (!isPlainObject(note) || note.isGrace === true) return false
    if (
      !Number.isInteger(note.durationValue) ||
      note.durationValue <= 0 ||
      typeof note.beats !== 'number' ||
      !Number.isFinite(note.beats) ||
      note.beats <= 0 ||
      typeof note.startBeat !== 'number' ||
      !Number.isFinite(note.startBeat) ||
      note.startBeat < 0 ||
      !Number.isInteger(note.divisions) ||
      note.divisions <= 0 ||
      typeof note.duration !== 'string' ||
      note.duration.trim() === '' ||
      !Number.isInteger(note.dotCount) ||
      note.dotCount < 0 ||
      note.dotCount > 1
    ) {
      return false
    }

    const expectedBeats = note.durationValue / note.divisions
    if (!approximatelyEqual(note.beats, expectedBeats)) return false
    if (note.duration !== beatsToDurationId(note.beats)) return false

    const dotted = note.duration.startsWith('dotted-')
    if ((note.dotCount === 1) !== dotted) return false
  }

  return validateTieTopology(targetNotes)
}

function timelineStartSnapshot(validation, correctedScore, targetNotes) {
  const eventStarts = new Map()
  for (const measure of validation.timeline?.measures ?? []) {
    for (const event of measure.events ?? []) {
      if (event.type !== 'note') continue
      eventStarts.set(`${measure.measureKey}:${event.sequenceIndex}`, {
        startDivisions: event.startDivisions,
        divisions: measure.divisions,
      })
    }
  }

  const starts = []
  let noteIndex = 0
  for (const event of correctedScore.measureEvents) {
    if (event.type !== 'note') continue
    const target = targetNotes[noteIndex]
    const key = `${event.measureKey}:${event.sequenceIndex}`
    const resolved = eventStarts.get(key)
    if (
      !resolved ||
      !Number.isFinite(resolved.startDivisions) ||
      !Number.isFinite(resolved.divisions) ||
      resolved.divisions <= 0
    ) {
      return null
    }

    const startBeat = resolved.startDivisions / resolved.divisions
    if (!approximatelyEqual(Number(target.startBeat), startBeat)) {
      return null
    }

    starts.push({
      noteIndex,
      measureKey: event.measureKey,
      sequenceIndex: event.sequenceIndex,
      startBeat,
    })
    noteIndex++
  }

  if (noteIndex !== targetNotes.length) return null
  return starts
}

function structuralValidationSnapshot(validation, starts) {
  return {
    summary: {
      totalFindings: validation.summary?.totalFindings ?? null,
      structuralErrors: validation.summary?.structuralErrors ?? null,
      suspectedOmrErrors: validation.summary?.suspectedOmrErrors ?? null,
      errors: validation.summary?.errors ?? null,
      warnings: validation.summary?.warnings ?? null,
    },
    measures: (validation.measureReport?.measures ?? []).map((measure) => ({
      measureKey: measure.measureKey ?? null,
      measureNumber: measure.measureNumber ?? null,
      partId: measure.partId ?? null,
      measureIndex: measure.measureIndex ?? null,
      expectedBeats: measure.expectedBeats ?? null,
      actualBeats: measure.actualBeats ?? null,
      status: measure.status ?? null,
      severity: measure.severity ?? null,
    })),
    starts,
  }
}

function validateCorrectedStructuralState({
  structuralContext,
  target,
  correctedTargets,
}) {
  if (!Array.isArray(target.content)) {
    return { ok: false, reason: 'teacher-corrected-note-array-required' }
  }

  if (
    !targetIdentityMatchesSource(target.content, structuralContext.validationScore.notes)
  ) {
    return { ok: false, reason: 'corrected-note-identity-drift' }
  }

  if (!validatePitchPositionState(target.content, correctedTargets)) {
    return { ok: false, reason: 'corrected-pitch-position-state-invalid' }
  }

  if (!validateTouchedStructuralNotes(target.content, correctedTargets)) {
    return { ok: false, reason: 'corrected-structural-fields-invalid' }
  }

  let correctedScore
  try {
    correctedScore = buildCorrectedStructuralScore(
      structuralContext.validationScore,
      target.content,
    )
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'corrected-score-build-failed',
    }
  }

  const validation = validateStructuralRhythm(correctedScore)
  if (
    validation.valid !== true ||
    validation.summary?.totalFindings !== 0 ||
    validation.summary?.errors !== 0 ||
    validation.summary?.warnings !== 0
  ) {
    return { ok: false, reason: 'corrected-structural-validation-failed' }
  }

  const starts = timelineStartSnapshot(validation, correctedScore, target.content)
  if (!starts) {
    return { ok: false, reason: 'corrected-start-beat-mismatch' }
  }

  const snapshot = structuralValidationSnapshot(validation, starts)
  return {
    ok: true,
    structuralValidationFingerprint: fingerprint(
      'teacher-structural-validation',
      snapshot,
    ),
  }
}

function assessmentBinding({
  history,
  rootQualityEvidence,
  scope,
  structuralContextFingerprint,
  structuralValidationFingerprint,
}) {
  const root = history.revisions[0]
  const target = scope.target
  return {
    historyId: history.historyId,
    sourceId: history.sourceId,
    sourceRevisionId: history.sourceRevisionId,
    rootRevisionId: root.revisionId,
    rootContentFingerprint: root.contentFingerprint,
    rootLineageFingerprint: root.lineageFingerprint,
    targetRevisionId: target.revisionId,
    targetParentRevisionId: target.parentRevisionId,
    targetCreatedAt: target.createdAt,
    targetContentFingerprint: target.contentFingerprint,
    targetLineageFingerprint: target.lineageFingerprint,
    rootQualityEvidenceId: rootQualityEvidence.evidenceId,
    rootMusicXmlSourceFingerprint: rootQualityEvidence.musicXmlSourceFingerprint,
    correctionEventCount: scope.correctionEventCount,
    undoEventCount: scope.undoEventCount,
    correctionOperationCount: scope.correctionOperationCount,
    correctedTargets: scope.correctedTargets,
    historyChainFingerprint: scope.historyChainFingerprint,
    structuralContextFingerprint,
    structuralValidationFingerprint,
  }
}

function revalidationFingerprint(binding) {
  return fingerprint('teacher-structural-revalidation', binding)
}

function assess({ history, sourceNotes, rootQualityEvidence }) {
  const scope = collectHistoryScope(history)
  if (!scope.ok) {
    return {
      ok: false,
      status:
        TEACHER_STRUCTURALLY_CORRECTED_SHARE_ELIGIBILITY_STATUS
          .UNSUPPORTED_CORRECTION_SCOPE,
      reason: scope.reason,
    }
  }

  const structuralContext = resolveStructuralContext({
    history,
    sourceNotes,
    rootQualityEvidence,
  })
  if (!structuralContext.ok) return structuralContext

  const corrected = validateCorrectedStructuralState({
    structuralContext,
    target: scope.target,
    correctedTargets: scope.correctedTargets,
  })
  if (!corrected.ok) {
    return {
      ok: false,
      status:
        TEACHER_STRUCTURALLY_CORRECTED_SHARE_ELIGIBILITY_STATUS
          .CORRECTED_STATE_INVALID,
      reason: corrected.reason,
    }
  }

  const binding = assessmentBinding({
    history,
    rootQualityEvidence: structuralContext.rootQualityEvidence,
    scope,
    structuralContextFingerprint: structuralContext.structuralContextFingerprint,
    structuralValidationFingerprint: corrected.structuralValidationFingerprint,
  })

  return {
    ok: true,
    target: scope.target,
    rootQualityEvidence: structuralContext.rootQualityEvidence,
    binding,
    revalidationFingerprint: revalidationFingerprint(binding),
  }
}

function evidenceBindingMatches(evidence, revision, history) {
  return (
    evidence.historyId === history.historyId &&
    evidence.sourceId === revision.sourceId &&
    evidence.sourceRevisionId === revision.sourceRevisionId &&
    evidence.targetRevisionId === revision.revisionId &&
    evidence.targetParentRevisionId === revision.parentRevisionId &&
    evidence.targetCreatedAt === revision.createdAt &&
    evidence.targetContentFingerprint === revision.contentFingerprint &&
    evidence.targetLineageFingerprint === revision.lineageFingerprint
  )
}

function validateEvidenceRecord(value) {
  if (!hasStrictFrozenShape(value, EVIDENCE_FIELDS)) return false
  if (value.schemaVersion !== TEACHER_STRUCTURAL_REVALIDATION_SCHEMA_VERSION) {
    return false
  }
  if (value.revalidationState !== TEACHER_STRUCTURAL_REVALIDATION_STATE) {
    return false
  }
  if (value.scope !== TEACHER_STRUCTURAL_REVALIDATION_SCOPE) return false
  if (!isTeacherShareQualityEvidenceRecord(value.rootQualityEvidence)) return false
  if (
    !isDenseFrozenStringArray(value.correctedTargets) ||
    value.correctedTargets.length === 0
  ) {
    return false
  }
  if (
    !Number.isInteger(value.correctionEventCount) ||
    value.correctionEventCount <= 0 ||
    !Number.isInteger(value.undoEventCount) ||
    value.undoEventCount < 0 ||
    !Number.isInteger(value.correctionOperationCount) ||
    value.correctionOperationCount <= 0
  ) {
    return false
  }

  try {
    for (const field of [
      'revalidationState',
      'scope',
      'evidenceId',
      'historyId',
      'sourceId',
      'sourceRevisionId',
      'rootRevisionId',
      'rootContentFingerprint',
      'rootLineageFingerprint',
      'targetRevisionId',
      'targetParentRevisionId',
      'targetContentFingerprint',
      'targetLineageFingerprint',
      'historyChainFingerprint',
      'structuralContextFingerprint',
      'structuralValidationFingerprint',
      'revalidationFingerprint',
    ]) {
      if (requiredString(value[field], field) !== value[field]) return false
    }
    if (nullableString(value.targetCreatedAt, 'targetCreatedAt') !== value.targetCreatedAt) {
      return false
    }
    if (nullableString(value.createdAt, 'createdAt') !== value.createdAt) {
      return false
    }

    if (
      value.sourceId !== value.rootQualityEvidence.sourceId ||
      value.sourceRevisionId !== value.rootQualityEvidence.sourceRevisionId ||
      value.rootRevisionId !== value.rootQualityEvidence.revisionId ||
      value.rootContentFingerprint !== value.rootQualityEvidence.contentFingerprint ||
      value.rootLineageFingerprint !== value.rootQualityEvidence.lineageFingerprint
    ) {
      return false
    }

    const expected = revalidationFingerprint({
      historyId: value.historyId,
      sourceId: value.sourceId,
      sourceRevisionId: value.sourceRevisionId,
      rootRevisionId: value.rootRevisionId,
      rootContentFingerprint: value.rootContentFingerprint,
      rootLineageFingerprint: value.rootLineageFingerprint,
      targetRevisionId: value.targetRevisionId,
      targetParentRevisionId: value.targetParentRevisionId,
      targetCreatedAt: value.targetCreatedAt,
      targetContentFingerprint: value.targetContentFingerprint,
      targetLineageFingerprint: value.targetLineageFingerprint,
      rootQualityEvidenceId: value.rootQualityEvidence.evidenceId,
      rootMusicXmlSourceFingerprint:
        value.rootQualityEvidence.musicXmlSourceFingerprint,
      correctionEventCount: value.correctionEventCount,
      undoEventCount: value.undoEventCount,
      correctionOperationCount: value.correctionOperationCount,
      correctedTargets: value.correctedTargets,
      historyChainFingerprint: value.historyChainFingerprint,
      structuralContextFingerprint: value.structuralContextFingerprint,
      structuralValidationFingerprint: value.structuralValidationFingerprint,
    })

    return expected === value.revalidationFingerprint
  } catch {
    return false
  }
}

function result({
  status,
  authorizationApplicability,
  revision,
  recipientId,
  evidence = null,
  reason = null,
}) {
  return Object.freeze({
    status,
    eligible:
      status ===
      TEACHER_STRUCTURALLY_CORRECTED_SHARE_ELIGIBILITY_STATUS
        .ELIGIBLE_STRUCTURALLY_REVALIDATED_REVISION,
    authorizationApplicability,
    sourceId: revision.sourceId,
    revisionId: revision.revisionId,
    recipientId,
    revalidationEvidenceId: evidence?.evidenceId ?? null,
    revalidationScope: evidence?.scope ?? null,
    reason,
  })
}

export function isTeacherStructuralCorrectionRevalidationEvidence(value) {
  return validateEvidenceRecord(value)
}

export function createTeacherStructuralCorrectionRevalidationEvidence({
  evidenceId,
  history,
  sourceNotes,
  rootQualityEvidence,
  createdAt = null,
} = {}) {
  const normalizedEvidenceId = requiredString(evidenceId, 'evidenceId')
  const normalizedCreatedAt = nullableString(createdAt, 'createdAt')

  const live = assess({ history, sourceNotes, rootQualityEvidence })
  if (!live.ok) {
    throw new Error(`Teacher structural revalidation failed: ${live.reason}.`)
  }

  const binding = live.binding
  return Object.freeze({
    schemaVersion: TEACHER_STRUCTURAL_REVALIDATION_SCHEMA_VERSION,
    revalidationState: TEACHER_STRUCTURAL_REVALIDATION_STATE,
    scope: TEACHER_STRUCTURAL_REVALIDATION_SCOPE,
    evidenceId: normalizedEvidenceId,
    historyId: binding.historyId,
    sourceId: binding.sourceId,
    sourceRevisionId: binding.sourceRevisionId,
    rootRevisionId: binding.rootRevisionId,
    rootContentFingerprint: binding.rootContentFingerprint,
    rootLineageFingerprint: binding.rootLineageFingerprint,
    targetRevisionId: binding.targetRevisionId,
    targetParentRevisionId: binding.targetParentRevisionId,
    targetCreatedAt: binding.targetCreatedAt,
    targetContentFingerprint: binding.targetContentFingerprint,
    targetLineageFingerprint: binding.targetLineageFingerprint,
    rootQualityEvidence: live.rootQualityEvidence,
    correctionEventCount: binding.correctionEventCount,
    undoEventCount: binding.undoEventCount,
    correctionOperationCount: binding.correctionOperationCount,
    correctedTargets: binding.correctedTargets,
    historyChainFingerprint: binding.historyChainFingerprint,
    structuralContextFingerprint: binding.structuralContextFingerprint,
    structuralValidationFingerprint: binding.structuralValidationFingerprint,
    revalidationFingerprint: live.revalidationFingerprint,
    createdAt: normalizedCreatedAt,
  })
}

export function evaluateTeacherStructurallyCorrectedShareEligibility({
  authorization,
  revision,
  approval,
  recipientId,
  history,
  sourceNotes,
  revalidationEvidence = null,
  revocation = null,
} = {}) {
  if (!isTeacherRevision(revision)) {
    throw new TypeError('revision must be a valid immutable teacher revision.')
  }
  if (revision.revisionKind !== TEACHER_REVISION_KIND.TEACHER_CORRECTED) {
    throw new TypeError(
      'T4 structural corrected-share eligibility requires a teacher-corrected revision.',
    )
  }
  const normalizedRecipientId = requiredString(recipientId, 'recipientId')

  const authorizationApplicability = evaluateTeacherShareAuthorization({
    authorization,
    revision,
    approval,
    recipientId: normalizedRecipientId,
    revocation,
  })

  if (
    authorizationApplicability ===
    TEACHER_SHARE_AUTHORIZATION_APPLICABILITY.RECIPIENT_MISMATCH
  ) {
    return result({
      status:
        TEACHER_STRUCTURALLY_CORRECTED_SHARE_ELIGIBILITY_STATUS
          .RECIPIENT_MISMATCH,
      authorizationApplicability,
      revision,
      recipientId: normalizedRecipientId,
    })
  }

  if (authorizationApplicability === TEACHER_SHARE_AUTHORIZATION_APPLICABILITY.REVOKED) {
    return result({
      status: TEACHER_STRUCTURALLY_CORRECTED_SHARE_ELIGIBILITY_STATUS.REVOKED,
      authorizationApplicability,
      revision,
      recipientId: normalizedRecipientId,
    })
  }

  if (
    authorizationApplicability !==
    TEACHER_SHARE_AUTHORIZATION_APPLICABILITY.AUTHORIZED_EXACT_BINDING
  ) {
    return result({
      status:
        TEACHER_STRUCTURALLY_CORRECTED_SHARE_ELIGIBILITY_STATUS
          .AUTHORIZATION_NOT_APPLICABLE,
      authorizationApplicability,
      revision,
      recipientId: normalizedRecipientId,
    })
  }

  if (!isTeacherRevisionHistory(history) || getCurrentTeacherRevision(history) !== revision) {
    return result({
      status:
        TEACHER_STRUCTURALLY_CORRECTED_SHARE_ELIGIBILITY_STATUS.HISTORY_NOT_CURRENT,
      authorizationApplicability,
      revision,
      recipientId: normalizedRecipientId,
      reason: !isTeacherRevisionHistory(history)
        ? 'invalid-history'
        : 'revision-is-not-exact-current-history-reference',
    })
  }

  if (revalidationEvidence === null || revalidationEvidence === undefined) {
    return result({
      status:
        TEACHER_STRUCTURALLY_CORRECTED_SHARE_ELIGIBILITY_STATUS
          .REVALIDATION_EVIDENCE_MISSING,
      authorizationApplicability,
      revision,
      recipientId: normalizedRecipientId,
    })
  }

  if (!isTeacherStructuralCorrectionRevalidationEvidence(revalidationEvidence)) {
    return result({
      status:
        TEACHER_STRUCTURALLY_CORRECTED_SHARE_ELIGIBILITY_STATUS
          .REVALIDATION_EVIDENCE_INVALID,
      authorizationApplicability,
      revision,
      recipientId: normalizedRecipientId,
    })
  }

  if (!evidenceBindingMatches(revalidationEvidence, revision, history)) {
    return result({
      status:
        TEACHER_STRUCTURALLY_CORRECTED_SHARE_ELIGIBILITY_STATUS
          .REVALIDATION_EVIDENCE_NOT_APPLICABLE,
      authorizationApplicability,
      revision,
      recipientId: normalizedRecipientId,
      evidence: revalidationEvidence,
    })
  }

  const live = assess({
    history,
    sourceNotes,
    rootQualityEvidence: revalidationEvidence.rootQualityEvidence,
  })
  if (!live.ok) {
    return result({
      status: live.status,
      authorizationApplicability,
      revision,
      recipientId: normalizedRecipientId,
      evidence: revalidationEvidence,
      reason: live.reason,
    })
  }

  const binding = live.binding
  const stale =
    revalidationEvidence.rootQualityEvidence.evidenceId !==
      live.rootQualityEvidence.evidenceId ||
    revalidationEvidence.rootQualityEvidence.musicXmlSourceFingerprint !==
      live.rootQualityEvidence.musicXmlSourceFingerprint ||
    revalidationEvidence.correctionEventCount !== binding.correctionEventCount ||
    revalidationEvidence.undoEventCount !== binding.undoEventCount ||
    revalidationEvidence.correctionOperationCount !==
      binding.correctionOperationCount ||
    revalidationEvidence.historyChainFingerprint !==
      binding.historyChainFingerprint ||
    revalidationEvidence.structuralContextFingerprint !==
      binding.structuralContextFingerprint ||
    revalidationEvidence.structuralValidationFingerprint !==
      binding.structuralValidationFingerprint ||
    revalidationEvidence.revalidationFingerprint !== live.revalidationFingerprint ||
    revalidationEvidence.correctedTargets.length !==
      binding.correctedTargets.length ||
    revalidationEvidence.correctedTargets.some(
      (target, index) => target !== binding.correctedTargets[index],
    )

  if (stale) {
    return result({
      status:
        TEACHER_STRUCTURALLY_CORRECTED_SHARE_ELIGIBILITY_STATUS
          .REVALIDATION_EVIDENCE_STALE,
      authorizationApplicability,
      revision,
      recipientId: normalizedRecipientId,
      evidence: revalidationEvidence,
      reason: 'revalidation-evidence-does-not-match-live-corrected-state',
    })
  }

  return result({
    status:
      TEACHER_STRUCTURALLY_CORRECTED_SHARE_ELIGIBILITY_STATUS
        .ELIGIBLE_STRUCTURALLY_REVALIDATED_REVISION,
    authorizationApplicability,
    revision,
    recipientId: normalizedRecipientId,
    evidence: revalidationEvidence,
  })
}
