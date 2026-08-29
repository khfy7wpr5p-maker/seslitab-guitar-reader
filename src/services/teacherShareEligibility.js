// Package 12-T2 — exact-revision safety/quality eligibility for sharing.
//
// T2 combines the explicit Package 12-T1 authorization boundary with the
// existing Package 2D quality gate and Package 7C exact-array MusicXML source
// provenance. It returns eligibility metadata only. It never returns revision
// content, builds a student payload, authenticates identities, persists grants,
// creates links/tokens, or performs network delivery.
//
// Important: Package 8 teacher corrections do not currently recompute source
// verification metadata. Therefore T2 v1 deliberately supports quality
// eligibility evidence only for AUTOMATIC revisions. A teacher-corrected
// revision fails closed until a separately reviewed post-correction revalidation
// contract exists; old automatic-source evidence must never be reused.

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

function isAcceptedPackage2cReport(report, revision) {
  if (!isPlainObject(report) || !Object.isFrozen(report)) return false
  if (!Array.isArray(revision.content)) return false

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
  if (report.summary.verifiedNotes !== revision.content.length) return false
  if (report.summary.totalFindings !== report.findings.length) return false
  if (report.findings.length !== 0) return false

  return true
}

function resolveExactSource(revision) {
  if (!Array.isArray(revision.content)) return null
  const source = resolveMusicXmlSourceForNotes(revision.content)
  if (!source || !Object.isFrozen(source)) return null
  if (source.notes !== revision.content) return null
  if (source.provenance !== MUSICXML_SOURCE_PROVENANCE) return null
  if (typeof source.musicXml !== 'string' || source.musicXml.trim() === '') return null
  return source
}

function resolveLiveQuality(revision) {
  if (!Array.isArray(revision.content)) {
    return Object.freeze({
      source: null,
      report: null,
      ttsGate: null,
      playbackGate: null,
    })
  }

  return Object.freeze({
    source: resolveExactSource(revision),
    report: getRegisteredQualityReport(revision.content),
    ttsGate: resolveTtsQualityGate(revision.content),
    playbackGate: resolvePlaybackQualityGate(revision.content),
  })
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
 * Create immutable quality eligibility evidence for one exact AUTOMATIC
 * revision. The exact revision content must already have both:
 *
 * - Package 7C exact-array MusicXML source provenance; and
 * - a genuine frozen Package 2C accepted quality report registered against the
 *   exact same array identity.
 *
 * TTS and playback Package 2D gates must both resolve ACCEPT. No report/source
 * is invented here and no payload is produced.
 */
export function createTeacherShareQualityEvidence({
  evidenceId,
  revision,
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
  if (!Array.isArray(revision.content)) {
    throw new TypeError('Share quality evidence requires revision.content to be a NoteObject array.')
  }

  const live = resolveLiveQuality(revision)
  if (!live.source) {
    throw new Error('Exact-array MusicXML source evidence is required for share quality eligibility.')
  }
  if (!isAcceptedPackage2cReport(live.report, revision)) {
    throw new Error('A genuine accepted Package 2C report is required for the exact revision array.')
  }
  if (
    live.ttsGate.decision !== QUALITY_GATE_DECISION.ACCEPT ||
    live.playbackGate.decision !== QUALITY_GATE_DECISION.ACCEPT ||
    live.ttsGate.reason !== QUALITY_GATE_REASON.ACCEPT_VERIFIED ||
    live.playbackGate.reason !== QUALITY_GATE_REASON.ACCEPT_VERIFIED
  ) {
    throw new Error('TTS and playback quality gates must both ACCEPT the exact revision.')
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
 * eligibility. This function returns metadata only and never exposes revision
 * content or student payload bytes.
 */
export function evaluateTeacherShareEligibility({
  authorization,
  revision,
  approval,
  recipientId,
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

  const live = resolveLiveQuality(revision)
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
  if (!isAcceptedPackage2cReport(live.report, revision)) {
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
