// Package 12-T3 — bounded post-correction revalidation/provenance.
//
// T3 never treats teacher-corrected content as if it were still the raw
// MusicXML source. It keeps the exact automatic Package 7C/2C/2D evidence on
// the automatic root, replays that evidence live, then proves that the current
// immutable correction history stays inside a deliberately bounded
// pitch/position scope. The final corrected state is mechanically revalidated
// from its own written pitch/playback/position values.
//
// Metadata only: no payload, link, token, authentication, persistence,
// network request, OMR action, or deployment change is introduced here.

import { resolveCanonicalPitch } from '../../noteTheory.js'
import {
  GUITAR_POSITION_CANDIDATE_STATE,
  enumerateCanonicalGuitarPositionCandidates,
} from '../../guitarPositionResolver.js'
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

export const TEACHER_CORRECTION_REVALIDATION_SCHEMA_VERSION = 1
export const TEACHER_CORRECTION_REVALIDATION_STATE = 'teacher_corrected_revalidated'
export const TEACHER_CORRECTION_REVALIDATION_SCOPE = 'pitch_position_v1'

// Deliberately exclude duration/rhythm, voice/staff, tie, string identity and
// undo semantics. Those need a later structural/rhythmic revalidation stage.
export const TEACHER_CORRECTION_REVALIDATION_SUPPORTED_FIELDS = Object.freeze([
  'step',
  'alter',
  'octave',
  'noteName',
  'midi',
  'frequency',
  'fret',
])

export const TEACHER_CORRECTED_SHARE_ELIGIBILITY_STATUS = Object.freeze({
  ELIGIBLE_CORRECTED_REVISION: 'eligible_corrected_revision',
  AUTHORIZATION_NOT_APPLICABLE: 'authorization_not_applicable',
  RECIPIENT_MISMATCH: 'recipient_mismatch',
  REVOKED: 'revoked',
  REVALIDATION_EVIDENCE_MISSING: 'revalidation_evidence_missing',
  REVALIDATION_EVIDENCE_INVALID: 'revalidation_evidence_invalid',
  REVALIDATION_EVIDENCE_NOT_APPLICABLE: 'revalidation_evidence_not_applicable',
  REVALIDATION_EVIDENCE_STALE: 'revalidation_evidence_stale',
  HISTORY_NOT_CURRENT: 'history_not_current',
  ROOT_QUALITY_NOT_ELIGIBLE: 'root_quality_not_eligible',
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
  'correctionOperationCount',
  'correctedTargets',
  'correctionChainFingerprint',
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

const PITCH_IDENTITY_FIELDS = new Set([
  'step',
  'alter',
  'octave',
  'noteName',
  'midi',
  'frequency',
])
const FNV_1A_64_OFFSET = 0xcbf29ce484222325n
const FNV_1A_64_PRIME = 0x100000001b3n
const UINT64_MASK = 0xffffffffffffffffn

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
      Object.prototype.hasOwnProperty.call(descriptor, 'value'),
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
  if (typeof value === 'number') return JSON.stringify(Object.is(value, -0) ? 0 : value)
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
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
  if (field === 'step' || field === 'noteName') {
    return typeof value === 'string' && value.trim() !== '' && value.trim() === value
  }
  if (field === 'frequency') {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
  }
  return (
    ['alter', 'octave', 'midi', 'fret'].includes(field) &&
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value)
  )
}

function collectCorrectionScope(history) {
  if (!isTeacherRevisionHistory(history)) {
    return { ok: false, reason: 'invalid-history' }
  }
  if (history.undoAuditEvents.length > 0) {
    return { ok: false, reason: 'undo-revalidation-not-supported' }
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

  const eventsByResult = new Map(
    history.correctionAuditEvents.map((event) => [event.resultRevisionId, event]),
  )
  const chain = []
  const correctedTargets = new Set()
  let operationCount = 0

  for (let index = 1; index < history.revisions.length; index++) {
    const revision = history.revisions[index]
    const event = eventsByResult.get(revision.revisionId)
    if (!event) return { ok: false, reason: 'correction-event-missing' }

    const operations = []
    for (const operation of event.operations) {
      if (
        !Array.isArray(operation.path) ||
        operation.path.length !== 2 ||
        !Number.isInteger(operation.path[0]) ||
        operation.path[0] < 0 ||
        operation.path[0] >= target.content.length ||
        typeof operation.path[1] !== 'string' ||
        !TEACHER_CORRECTION_REVALIDATION_SUPPORTED_FIELDS.includes(operation.path[1])
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
      operationCount++
      operations.push({
        operationId: operation.operationId,
        path: [noteIndex, field],
        before: operation.before,
        after: operation.after,
      })
    }

    chain.push({
      eventId: event.eventId,
      actorId: event.actorId,
      createdAt: event.createdAt,
      parentRevisionId: event.parentRevisionId,
      resultRevisionId: event.resultRevisionId,
      operations,
    })
  }

  if (operationCount === 0) {
    return { ok: false, reason: 'correction-operation-required' }
  }

  return {
    ok: true,
    target,
    correctionEventCount: chain.length,
    correctionOperationCount: operationCount,
    correctedTargets: Object.freeze([...correctedTargets].sort()),
    correctionChainFingerprint: fingerprint('teacher-correction-chain', chain),
  }
}

function affectedNoteIndexes(correctedTargets) {
  return [...new Set(correctedTargets.map((target) => Number(target.split('/')[0])))]
}

function validateTieTopology(notes) {
  const open = new Map()
  for (const note of notes) {
    if (!isPlainObject(note)) return false
    if (note.tieContinue !== Boolean(note.tieStart && note.tieStop)) return false
    if (!note.tieStart && !note.tieStop) continue
    if (note.isRest === true) return false
    if (
      typeof note.step !== 'string' ||
      !Number.isInteger(note.octave)
    ) {
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

function validateCorrectedState(target, correctedTargets) {
  if (!Array.isArray(target.content)) return false

  for (const noteIndex of affectedNoteIndexes(correctedTargets)) {
    const note = target.content[noteIndex]
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
      if (positions.state !== GUITAR_POSITION_CANDIDATE_STATE.CANDIDATES) return false
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

  const pitchIdentityChanged = correctedTargets.some((target) =>
    PITCH_IDENTITY_FIELDS.has(target.split('/')[1]),
  )
  if (pitchIdentityChanged && !validateTieTopology(target.content)) return false
  return true
}

function assessmentBinding({ history, rootQualityEvidence, scope }) {
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
    correctionOperationCount: scope.correctionOperationCount,
    correctedTargets: scope.correctedTargets,
    correctionChainFingerprint: scope.correctionChainFingerprint,
  }
}

function revalidationFingerprint(binding) {
  return fingerprint('teacher-correction-revalidation', binding)
}

function assess({ history, sourceNotes, rootQualityEvidence }) {
  const rootQuality = replayRootQuality({ history, sourceNotes, rootQualityEvidence })
  if (!rootQuality.ok) {
    return {
      ok: false,
      status: TEACHER_CORRECTED_SHARE_ELIGIBILITY_STATUS.ROOT_QUALITY_NOT_ELIGIBLE,
      reason: rootQuality.reason,
    }
  }

  const scope = collectCorrectionScope(history)
  if (!scope.ok) {
    return {
      ok: false,
      status: TEACHER_CORRECTED_SHARE_ELIGIBILITY_STATUS.UNSUPPORTED_CORRECTION_SCOPE,
      reason: scope.reason,
    }
  }

  if (!validateCorrectedState(scope.target, scope.correctedTargets)) {
    return {
      ok: false,
      status: TEACHER_CORRECTED_SHARE_ELIGIBILITY_STATUS.CORRECTED_STATE_INVALID,
      reason: 'corrected-pitch-position-state-invalid',
    }
  }

  const binding = assessmentBinding({
    history,
    rootQualityEvidence: rootQuality.live,
    scope,
  })
  return {
    ok: true,
    target: scope.target,
    rootQualityEvidence: rootQuality.live,
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
  if (value.schemaVersion !== TEACHER_CORRECTION_REVALIDATION_SCHEMA_VERSION) return false
  if (value.revalidationState !== TEACHER_CORRECTION_REVALIDATION_STATE) return false
  if (value.scope !== TEACHER_CORRECTION_REVALIDATION_SCOPE) return false
  if (!isTeacherShareQualityEvidenceRecord(value.rootQualityEvidence)) return false
  if (!isDenseFrozenStringArray(value.correctedTargets) || value.correctedTargets.length === 0) {
    return false
  }
  if (
    !Number.isInteger(value.correctionEventCount) ||
    value.correctionEventCount <= 0 ||
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
      'correctionChainFingerprint',
      'revalidationFingerprint',
    ]) {
      if (requiredString(value[field], field) !== value[field]) return false
    }
    if (nullableString(value.targetCreatedAt, 'targetCreatedAt') !== value.targetCreatedAt) {
      return false
    }
    if (nullableString(value.createdAt, 'createdAt') !== value.createdAt) return false

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
      rootMusicXmlSourceFingerprint: value.rootQualityEvidence.musicXmlSourceFingerprint,
      correctionEventCount: value.correctionEventCount,
      correctionOperationCount: value.correctionOperationCount,
      correctedTargets: value.correctedTargets,
      correctionChainFingerprint: value.correctionChainFingerprint,
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
      status === TEACHER_CORRECTED_SHARE_ELIGIBILITY_STATUS.ELIGIBLE_CORRECTED_REVISION,
    authorizationApplicability,
    sourceId: revision.sourceId,
    revisionId: revision.revisionId,
    recipientId,
    revalidationEvidenceId: evidence?.evidenceId ?? null,
    revalidationScope: evidence?.scope ?? null,
    reason,
  })
}

export function isTeacherCorrectionRevalidationEvidence(value) {
  return validateEvidenceRecord(value)
}

export function createTeacherCorrectionRevalidationEvidence({
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
    throw new Error(`Teacher correction revalidation failed: ${live.reason}.`)
  }

  const binding = live.binding
  return Object.freeze({
    schemaVersion: TEACHER_CORRECTION_REVALIDATION_SCHEMA_VERSION,
    revalidationState: TEACHER_CORRECTION_REVALIDATION_STATE,
    scope: TEACHER_CORRECTION_REVALIDATION_SCOPE,
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
    correctionOperationCount: binding.correctionOperationCount,
    correctedTargets: binding.correctedTargets,
    correctionChainFingerprint: binding.correctionChainFingerprint,
    revalidationFingerprint: live.revalidationFingerprint,
    createdAt: normalizedCreatedAt,
  })
}

export function evaluateTeacherCorrectedShareEligibility({
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
    throw new TypeError('T3 corrected-share eligibility requires a teacher-corrected revision.')
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
      status: TEACHER_CORRECTED_SHARE_ELIGIBILITY_STATUS.RECIPIENT_MISMATCH,
      authorizationApplicability,
      revision,
      recipientId: normalizedRecipientId,
    })
  }
  if (authorizationApplicability === TEACHER_SHARE_AUTHORIZATION_APPLICABILITY.REVOKED) {
    return result({
      status: TEACHER_CORRECTED_SHARE_ELIGIBILITY_STATUS.REVOKED,
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
      status: TEACHER_CORRECTED_SHARE_ELIGIBILITY_STATUS.AUTHORIZATION_NOT_APPLICABLE,
      authorizationApplicability,
      revision,
      recipientId: normalizedRecipientId,
    })
  }

  if (!isTeacherRevisionHistory(history) || getCurrentTeacherRevision(history) !== revision) {
    return result({
      status: TEACHER_CORRECTED_SHARE_ELIGIBILITY_STATUS.HISTORY_NOT_CURRENT,
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
      status: TEACHER_CORRECTED_SHARE_ELIGIBILITY_STATUS.REVALIDATION_EVIDENCE_MISSING,
      authorizationApplicability,
      revision,
      recipientId: normalizedRecipientId,
    })
  }
  if (!isTeacherCorrectionRevalidationEvidence(revalidationEvidence)) {
    return result({
      status: TEACHER_CORRECTED_SHARE_ELIGIBILITY_STATUS.REVALIDATION_EVIDENCE_INVALID,
      authorizationApplicability,
      revision,
      recipientId: normalizedRecipientId,
    })
  }
  if (!evidenceBindingMatches(revalidationEvidence, revision, history)) {
    return result({
      status: TEACHER_CORRECTED_SHARE_ELIGIBILITY_STATUS.REVALIDATION_EVIDENCE_NOT_APPLICABLE,
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
    revalidationEvidence.correctionOperationCount !== binding.correctionOperationCount ||
    revalidationEvidence.correctionChainFingerprint !== binding.correctionChainFingerprint ||
    revalidationEvidence.revalidationFingerprint !== live.revalidationFingerprint ||
    revalidationEvidence.correctedTargets.length !== binding.correctedTargets.length ||
    revalidationEvidence.correctedTargets.some(
      (target, index) => target !== binding.correctedTargets[index],
    )

  if (stale) {
    return result({
      status: TEACHER_CORRECTED_SHARE_ELIGIBILITY_STATUS.REVALIDATION_EVIDENCE_STALE,
      authorizationApplicability,
      revision,
      recipientId: normalizedRecipientId,
      evidence: revalidationEvidence,
    })
  }

  return result({
    status: TEACHER_CORRECTED_SHARE_ELIGIBILITY_STATUS.ELIGIBLE_CORRECTED_REVISION,
    authorizationApplicability,
    revision,
    recipientId: normalizedRecipientId,
    evidence: revalidationEvidence,
  })
}
