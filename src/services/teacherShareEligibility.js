// Package 12-T2 — exact-revision safety/quality eligibility for sharing.
//
// T2 combines Package 12-T1 authorization with Package 2D quality gates and
// Package 7C exact-array MusicXML provenance. Package 8 revisions are immutable
// snapshots, so their `content` arrays are deliberately not treated as the
// original exact arrays that own Package 2C/7C evidence. The caller must supply
// the exact source NoteObject[] separately; T2 verifies that its deterministic
// Package 8 snapshot matches the automatic revision before reading evidence.
//
// T2 returns eligibility metadata only. It never returns revision content,
// builds a student payload, authenticates identities, persists grants, creates
// links/tokens, or performs network delivery.

import {
  QUALITY_GATE_DECISION,
  QUALITY_GATE_REASON,
  getRegisteredQualityReport,
  resolvePlaybackQualityGate,
  resolveTtsQualityGate,
} from './qualityGateIntegration.js'
import { QUALITY_STATE } from './qualityErrorReport.js'
import {
  MUSICXML_SOURCE_PROVENANCE,
  resolveMusicXmlSourceForNotes,
} from './musicXmlSourceRegistry.js'
import {
  TEACHER_REVISION_KIND,
  createAutomaticRevision,
  isTeacherRevision,
} from './teacherRevisionModel.js'
import {
  TEACHER_SHARE_AUTHORIZATION_APPLICABILITY,
  evaluateTeacherShareAuthorization,
} from './teacherShareAuthorization.js'

export const TEACHER_SHARE_QUALITY_EVIDENCE_SCHEMA_VERSION = 1
export const TEACHER_SHARE_QUALITY_EVIDENCE_STATE = 'share_quality_eligible'

export const TEACHER_SHARE_ELIGIBILITY_STATUS = Object.freeze({
  ELIGIBLE_EXACT_REVISION: 'eligible_exact_revision',
  AUTHORIZATION_NOT_APPLICABLE: 'authorization_not_applicable',
  RECIPIENT_MISMATCH: 'recipient_mismatch',
  REVOKED: 'revoked',
  CORRECTED_REVISION_REVALIDATION_REQUIRED:
    'corrected_revision_revalidation_required',
  QUALITY_EVIDENCE_MISSING: 'quality_evidence_missing',
  QUALITY_EVIDENCE_NOT_APPLICABLE: 'quality_evidence_not_applicable',
  SOURCE_EVIDENCE_MISSING: 'source_evidence_missing',
  SOURCE_EVIDENCE_STALE: 'source_evidence_stale',
  QUALITY_REVIEW_REQUIRED: 'quality_review_required',
  QUALITY_BLOCKED: 'quality_blocked',
  QUALITY_EVIDENCE_INVALID: 'quality_evidence_invalid',
  QUALITY_EVIDENCE_STALE: 'quality_evidence_stale',
})

const QUALITY_EVIDENCE_FIELDS = Object.freeze([
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

const FNV_1A_64_OFFSET = 0xcbf29ce484222325n
const FNV_1A_64_PRIME = 0x100000001b3n
const UINT64_MASK = 0xffffffffffffffffn

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function normalizeRequiredString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${fieldName} must be a non-empty string.`)
  }
  return value.trim()
}

function normalizeNullableString(value, fieldName) {
  if (value === null || value === undefined) return null
  return normalizeRequiredString(value, fieldName)
}

function hasStrictFrozenShape(value, fields) {
  if (!isPlainObject(value) || !Object.isFrozen(value)) return false

  const ownKeys = Reflect.ownKeys(value)
  if (
    ownKeys.length !== fields.length ||
    ownKeys.some((key) => typeof key !== 'string' || !fields.includes(key))
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

function fnv1a64(text) {
  let hash = FNV_1A_64_OFFSET
  const bytes = new TextEncoder().encode(text)

  for (const byte of bytes) {
    hash ^= BigInt(byte)
    hash = (hash * FNV_1A_64_PRIME) & UINT64_MASK
  }

  return hash.toString(16).padStart(16, '0')
}

function fingerprintMusicXml(musicXml) {
  const text = normalizeRequiredString(musicXml, 'musicXml')
  return `musicxml-fnv1a64-v1:${fnv1a64(text)}:${text.length}`
}

function sourceNotesMatchAutomaticRevision(revision, sourceNotes) {
  if (
    revision.revisionKind !== TEACHER_REVISION_KIND.AUTOMATIC ||
    !Array.isArray(sourceNotes)
  ) {
    return false
  }

  try {
    const replay = createAutomaticRevision({
      revisionId: revision.revisionId,
      sourceId: revision.sourceId,
      createdAt: revision.createdAt,
      content: sourceNotes,
    })

    return (
      replay.sourceRevisionId === revision.sourceRevisionId &&
      replay.contentFingerprint === revision.contentFingerprint &&
      replay.lineageFingerprint === revision.lineageFingerprint
    )
  } catch {
    return false
  }
}

function isAcceptedPackage2cReport(report, sourceNotes) {
  if (!isPlainObject(report) || !Object.isFrozen(report)) return false
  if (!Array.isArray(sourceNotes)) return false

  if (report.qualityState !== QUALITY_STATE.SOURCE_VERIFIED) return false
  if (report.structuralState !== QUALITY_STATE.STRUCTURALLY_VALID) return false
  if (report.sourceState !== QUALITY_STATE.SOURCE_VERIFIED) return false
  if (report.structurallyValid !== true) return false
  if (report.sourceVerified !== true) return false
  if (report.reviewRequired !== false) return false
  if (report.reliable !== true) return false
  if (report.automaticPlaybackAllowed !== true) return false

  if (!Array.isArray(report.qualityStates) || !Object.isFrozen(report.qualityStates)) {
    return false
  }
  if (!report.qualityStates.includes(QUALITY_STATE.STRUCTURALLY_VALID)) return false
  if (!report.qualityStates.includes(QUALITY_STATE.SOURCE_VERIFIED)) return false
  if (report.qualityStates.includes(QUALITY_STATE.REVIEW_REQUIRED)) return false
  if (report.qualityStates.includes(QUALITY_STATE.UNRELIABLE)) return false

  if (!isPlainObject(report.summary) || !Object.isFrozen(report.summary)) return false
  if (!Array.isArray(report.findings) || !Object.isFrozen(report.findings)) return false
  if (report.summary.errors !== 0 || report.summary.warnings !== 0) return false
  if (report.summary.unverifiedNotes !== 0) return false
  if (report.summary.verifiedNotes !== sourceNotes.length) return false
  if (report.summary.totalFindings !== report.findings.length) return false
  if (report.findings.length !== 0) return false

  return true
}

function resolveExactSource(sourceNotes) {
  if (!Array.isArray(sourceNotes)) return null
  const source = resolveMusicXmlSourceForNotes(sourceNotes)
  if (!source || !Object.isFrozen(source)) return null
  if (source.notes !== sourceNotes) return null
  if (source.provenance !== MUSICXML_SOURCE_PROVENANCE) return null
  if (typeof source.musicXml !== 'string' || source.musicXml.trim() === '') return null
  return source
}

function resolveLiveQuality(sourceNotes) {
  if (!Array.isArray(sourceNotes)) {
    return Object.freeze({
      source: null,
      report: null,
      ttsGate: null,
      playbackGate: null,
    })
  }

  try {
    return Object.freeze({
      source: resolveExactSource(sourceNotes),
      report: getRegisteredQualityReport(sourceNotes),
      ttsGate: resolveTtsQualityGate(sourceNotes),
      playbackGate: resolvePlaybackQualityGate(sourceNotes),
    })
  } catch {
    return Object.freeze({
      source: resolveExactSource(sourceNotes),
      report: getRegisteredQualityReport(sourceNotes),
      ttsGate: null,
      playbackGate: null,
    })
  }
}

function qualityEvidenceBindingMatches(evidence, revision) {
  return (
    evidence.sourceId === revision.sourceId &&
    evidence.sourceRevisionId === revision.sourceRevisionId &&
    evidence.revisionId === revision.revisionId &&
    evidence.revisionKind === revision.revisionKind &&
    evidence.parentRevisionId === revision.parentRevisionId &&
    evidence.parentLineageFingerprint === revision.parentLineageFingerprint &&
    evidence.revisionCreatedAt === revision.createdAt &&
    evidence.contentFingerprint === revision.contentFingerprint &&
    evidence.lineageFingerprint === revision.lineageFingerprint
  )
}

function validateQualityEvidenceRecord(value) {
  if (!hasStrictFrozenShape(value, QUALITY_EVIDENCE_FIELDS)) return false
  if (value.schemaVersion !== TEACHER_SHARE_QUALITY_EVIDENCE_SCHEMA_VERSION) return false
  if (value.evidenceState !== TEACHER_SHARE_QUALITY_EVIDENCE_STATE) return false
  if (value.revisionKind !== TEACHER_REVISION_KIND.AUTOMATIC) return false
  if (value.parentRevisionId !== null || value.parentLineageFingerprint !== null) return false
  if (value.revisionId !== value.sourceRevisionId) return false
  if (value.musicXmlSourceProvenance !== MUSICXML_SOURCE_PROVENANCE) return false
  if (value.ttsDecision !== QUALITY_GATE_DECISION.ACCEPT) return false
  if (value.playbackDecision !== QUALITY_GATE_DECISION.ACCEPT) return false
  if (value.ttsReason !== QUALITY_GATE_REASON.ACCEPT_VERIFIED) return false
  if (value.playbackReason !== QUALITY_GATE_REASON.ACCEPT_VERIFIED) return false

  try {
    for (const field of [
      'evidenceId',
      'sourceId',
      'sourceRevisionId',
      'revisionId',
      'revisionKind',
      'contentFingerprint',
      'lineageFingerprint',
      'musicXmlSourceProvenance',
      'musicXmlSourceFingerprint',
      'ttsDecision',
      'ttsReason',
      'playbackDecision',
      'playbackReason',
    ]) {
      if (normalizeRequiredString(value[field], field) !== value[field]) return false
    }

    if (
      normalizeNullableString(value.revisionCreatedAt, 'revisionCreatedAt') !==
      value.revisionCreatedAt
    ) {
      return false
    }
    if (normalizeNullableString(value.createdAt, 'createdAt') !== value.createdAt) {
      return false
    }

    return true
  } catch {
    return false
  }
}

function result({
  status,
  authorizationApplicability,
  revision,
  recipientId,
  qualityEvidenceId = null,
  ttsGate = null,
  playbackGate = null,
}) {
  const eligible = status === TEACHER_SHARE_ELIGIBILITY_STATUS.ELIGIBLE_EXACT_REVISION
  return Object.freeze({
    status,
    eligible,
    authorizationApplicability,
    sourceId: revision.sourceId,
    revisionId: revision.revisionId,
    recipientId,
    qualityEvidenceId,
    ttsDecision: ttsGate?.decision ?? null,
    ttsReason: ttsGate?.reason ?? null,
    playbackDecision: playbackGate?.decision ?? null,
    playbackReason: playbackGate?.reason ?? null,
  })
}

export function isTeacherShareQualityEvidenceRecord(value) {
  return validateQualityEvidenceRecord(value)
}

/**
 * Create immutable T2 evidence for one exact AUTOMATIC revision.
 *
 * `sourceNotes` must be the exact NoteObject[] that owns current Package 7C and
 * Package 2C/2D evidence. T2 recreates the automatic Package 8 snapshot from
 * that array and requires its content + lineage fingerprints to match the
 * supplied revision before any eligibility evidence can be issued.
 */
export function createTeacherShareQualityEvidence({
  evidenceId,
  revision,
  sourceNotes,
  createdAt = null,
} = {}) {
  const normalizedEvidenceId = normalizeRequiredString(evidenceId, 'evidenceId')
  const normalizedCreatedAt = normalizeNullableString(createdAt, 'createdAt')

  if (!isTeacherRevision(revision)) {
    throw new TypeError('revision must be a valid immutable teacher revision.')
  }
  if (revision.revisionKind !== TEACHER_REVISION_KIND.AUTOMATIC) {
    throw new Error(
      'Teacher-corrected revisions require explicit post-correction revalidation before share quality evidence can be created.',
    )
  }
  if (!Array.isArray(sourceNotes)) {
    throw new TypeError('sourceNotes must be the exact source NoteObject array.')
  }
  if (!sourceNotesMatchAutomaticRevision(revision, sourceNotes)) {
    throw new Error('Exact source NoteObject array does not match the automatic revision snapshot.')
  }

  const live = resolveLiveQuality(sourceNotes)
  if (!live.source) {
    throw new Error('Exact-array MusicXML source evidence is required for share quality eligibility.')
  }
  if (!isAcceptedPackage2cReport(live.report, sourceNotes)) {
    throw new Error('A genuine accepted Package 2C report is required for the exact source array.')
  }
  if (
    live.ttsGate?.decision !== QUALITY_GATE_DECISION.ACCEPT ||
    live.playbackGate?.decision !== QUALITY_GATE_DECISION.ACCEPT ||
    live.ttsGate?.reason !== QUALITY_GATE_REASON.ACCEPT_VERIFIED ||
    live.playbackGate?.reason !== QUALITY_GATE_REASON.ACCEPT_VERIFIED
  ) {
    throw new Error('TTS and playback quality gates must both ACCEPT the exact source array.')
  }

  return Object.freeze({
    schemaVersion: TEACHER_SHARE_QUALITY_EVIDENCE_SCHEMA_VERSION,
    evidenceState: TEACHER_SHARE_QUALITY_EVIDENCE_STATE,
    evidenceId: normalizedEvidenceId,
    sourceId: revision.sourceId,
    sourceRevisionId: revision.sourceRevisionId,
    revisionId: revision.revisionId,
    revisionKind: revision.revisionKind,
    parentRevisionId: revision.parentRevisionId,
    parentLineageFingerprint: revision.parentLineageFingerprint,
    revisionCreatedAt: revision.createdAt,
    contentFingerprint: revision.contentFingerprint,
    lineageFingerprint: revision.lineageFingerprint,
    musicXmlSourceProvenance: live.source.provenance,
    musicXmlSourceFingerprint: fingerprintMusicXml(live.source.musicXml),
    ttsDecision: live.ttsGate.decision,
    ttsReason: live.ttsGate.reason,
    playbackDecision: live.playbackGate.decision,
    playbackReason: live.playbackGate.reason,
    createdAt: normalizedCreatedAt,
  })
}

/**
 * Evaluate whether one exact T1 authorization also satisfies T2 quality/safety
 * eligibility. This returns metadata only; no student payload bytes are exposed.
 */
export function evaluateTeacherShareEligibility({
  authorization,
  revision,
  approval,
  recipientId,
  sourceNotes = null,
  qualityEvidence = null,
  revocation = null,
} = {}) {
  if (!isTeacherRevision(revision)) {
    throw new TypeError('revision must be a valid immutable teacher revision.')
  }
  const normalizedRecipientId = normalizeRequiredString(recipientId, 'recipientId')

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
      status: TEACHER_SHARE_ELIGIBILITY_STATUS.RECIPIENT_MISMATCH,
      authorizationApplicability,
      revision,
      recipientId: normalizedRecipientId,
    })
  }
  if (
    authorizationApplicability === TEACHER_SHARE_AUTHORIZATION_APPLICABILITY.REVOKED
  ) {
    return result({
      status: TEACHER_SHARE_ELIGIBILITY_STATUS.REVOKED,
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
      status: TEACHER_SHARE_ELIGIBILITY_STATUS.AUTHORIZATION_NOT_APPLICABLE,
      authorizationApplicability,
      revision,
      recipientId: normalizedRecipientId,
    })
  }

  if (revision.revisionKind !== TEACHER_REVISION_KIND.AUTOMATIC) {
    return result({
      status:
        TEACHER_SHARE_ELIGIBILITY_STATUS.CORRECTED_REVISION_REVALIDATION_REQUIRED,
      authorizationApplicability,
      revision,
      recipientId: normalizedRecipientId,
    })
  }

  if (qualityEvidence === null || qualityEvidence === undefined) {
    return result({
      status: TEACHER_SHARE_ELIGIBILITY_STATUS.QUALITY_EVIDENCE_MISSING,
      authorizationApplicability,
      revision,
      recipientId: normalizedRecipientId,
    })
  }
  if (!isTeacherShareQualityEvidenceRecord(qualityEvidence)) {
    throw new TypeError(
      'qualityEvidence must be null or a valid immutable teacher share quality evidence record.',
    )
  }
  if (!qualityEvidenceBindingMatches(qualityEvidence, revision)) {
    return result({
      status: TEACHER_SHARE_ELIGIBILITY_STATUS.QUALITY_EVIDENCE_NOT_APPLICABLE,
      authorizationApplicability,
      revision,
      recipientId: normalizedRecipientId,
      qualityEvidenceId: qualityEvidence.evidenceId,
    })
  }

  if (!Array.isArray(sourceNotes)) {
    return result({
      status: TEACHER_SHARE_ELIGIBILITY_STATUS.SOURCE_EVIDENCE_MISSING,
      authorizationApplicability,
      revision,
      recipientId: normalizedRecipientId,
      qualityEvidenceId: qualityEvidence.evidenceId,
    })
  }
  if (!sourceNotesMatchAutomaticRevision(revision, sourceNotes)) {
    return result({
      status: TEACHER_SHARE_ELIGIBILITY_STATUS.SOURCE_EVIDENCE_STALE,
      authorizationApplicability,
      revision,
      recipientId: normalizedRecipientId,
      qualityEvidenceId: qualityEvidence.evidenceId,
    })
  }

  const live = resolveLiveQuality(sourceNotes)
  if (!live.source) {
    return result({
      status: TEACHER_SHARE_ELIGIBILITY_STATUS.SOURCE_EVIDENCE_MISSING,
      authorizationApplicability,
      revision,
      recipientId: normalizedRecipientId,
      qualityEvidenceId: qualityEvidence.evidenceId,
      ttsGate: live.ttsGate,
      playbackGate: live.playbackGate,
    })
  }
  if (
    live.source.provenance !== qualityEvidence.musicXmlSourceProvenance ||
    fingerprintMusicXml(live.source.musicXml) !== qualityEvidence.musicXmlSourceFingerprint
  ) {
    return result({
      status: TEACHER_SHARE_ELIGIBILITY_STATUS.SOURCE_EVIDENCE_STALE,
      authorizationApplicability,
      revision,
      recipientId: normalizedRecipientId,
      qualityEvidenceId: qualityEvidence.evidenceId,
      ttsGate: live.ttsGate,
      playbackGate: live.playbackGate,
    })
  }

  if (
    live.ttsGate?.decision === QUALITY_GATE_DECISION.BLOCK ||
    live.playbackGate?.decision === QUALITY_GATE_DECISION.BLOCK
  ) {
    return result({
      status: TEACHER_SHARE_ELIGIBILITY_STATUS.QUALITY_BLOCKED,
      authorizationApplicability,
      revision,
      recipientId: normalizedRecipientId,
      qualityEvidenceId: qualityEvidence.evidenceId,
      ttsGate: live.ttsGate,
      playbackGate: live.playbackGate,
    })
  }
  if (
    live.ttsGate?.decision !== QUALITY_GATE_DECISION.ACCEPT ||
    live.playbackGate?.decision !== QUALITY_GATE_DECISION.ACCEPT
  ) {
    return result({
      status: TEACHER_SHARE_ELIGIBILITY_STATUS.QUALITY_REVIEW_REQUIRED,
      authorizationApplicability,
      revision,
      recipientId: normalizedRecipientId,
      qualityEvidenceId: qualityEvidence.evidenceId,
      ttsGate: live.ttsGate,
      playbackGate: live.playbackGate,
    })
  }
  if (!isAcceptedPackage2cReport(live.report, sourceNotes)) {
    return result({
      status: TEACHER_SHARE_ELIGIBILITY_STATUS.QUALITY_EVIDENCE_INVALID,
      authorizationApplicability,
      revision,
      recipientId: normalizedRecipientId,
      qualityEvidenceId: qualityEvidence.evidenceId,
      ttsGate: live.ttsGate,
      playbackGate: live.playbackGate,
    })
  }
  if (
    live.ttsGate.reason !== qualityEvidence.ttsReason ||
    live.playbackGate.reason !== qualityEvidence.playbackReason
  ) {
    return result({
      status: TEACHER_SHARE_ELIGIBILITY_STATUS.QUALITY_EVIDENCE_STALE,
      authorizationApplicability,
      revision,
      recipientId: normalizedRecipientId,
      qualityEvidenceId: qualityEvidence.evidenceId,
      ttsGate: live.ttsGate,
      playbackGate: live.playbackGate,
    })
  }

  return result({
    status: TEACHER_SHARE_ELIGIBILITY_STATUS.ELIGIBLE_EXACT_REVISION,
    authorizationApplicability,
    revision,
    recipientId: normalizedRecipientId,
    qualityEvidenceId: qualityEvidence.evidenceId,
    ttsGate: live.ttsGate,
    playbackGate: live.playbackGate,
  })
}
