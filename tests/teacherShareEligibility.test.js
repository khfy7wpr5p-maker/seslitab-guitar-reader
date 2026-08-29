import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  CANONICAL_NOTE_SCHEMA_VERSION,
  CANONICAL_VERIFICATION_STATUS,
} from '../noteTheory.js'
import { prepareMusicXmlQualityGate } from '../src/services/appQualityGate.js'
import {
  QUALITY_GATE_DECISION,
  QUALITY_GATE_REASON,
  registerQualityReportForNotes,
  unregisterQualityReportForNotes,
} from '../src/services/qualityGateIntegration.js'
import { QUALITY_STATE } from '../src/services/qualityErrorReport.js'
import {
  clearMusicXmlSourceForNotes,
  registerMusicXmlSourceForNotes,
} from '../src/services/musicXmlSourceRegistry.js'
import { createTeacherApprovalRecord } from '../src/services/teacherApprovalModel.js'
import {
  createAutomaticRevision,
  createTeacherCorrectedRevision,
} from '../src/services/teacherRevisionModel.js'
import {
  createTeacherShareAuthorization,
  createTeacherShareRevocation,
} from '../src/services/teacherShareAuthorization.js'
import {
  TEACHER_SHARE_ELIGIBILITY_STATUS,
  TEACHER_SHARE_QUALITY_EVIDENCE_SCHEMA_VERSION,
  TEACHER_SHARE_QUALITY_EVIDENCE_STATE,
  createTeacherShareQualityEvidence,
  evaluateTeacherShareEligibility,
  isTeacherShareQualityEvidenceRecord,
} from '../src/services/teacherShareEligibility.js'

const VALID_4_4_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`

const OTHER_XML = `${VALID_4_4_XML}\n<!-- replaced source evidence -->`

function verifiedState() {
  return {
    schemaVersion: CANONICAL_NOTE_SCHEMA_VERSION,
    status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
    pitch: {
      valid: true,
      status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
    },
    time: {
      valid: true,
      status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
    },
  }
}

function verifiedNotes() {
  return ['Do', 'Re', 'Mi', 'Fa'].map((noteName, index) => ({
    partId: 'P1',
    measureNumber: 1,
    measureKey: 'P1:0',
    measureIndex: 0,
    voice: 1,
    staff: 1,
    startBeat: index,
    beats: 1,
    noteName,
    sourceVerificationState: verifiedState(),
  }))
}

function automatic({
  revisionId = 'auto-1',
  sourceId = 'score-1',
  createdAt = '2026-08-29T15:20:00Z',
} = {}) {
  return createAutomaticRevision({
    revisionId,
    sourceId,
    createdAt,
    content: verifiedNotes(),
  })
}

function approve(revision, overrides = {}) {
  return createTeacherApprovalRecord({
    approvalId: 'approval-1',
    actorId: 'teacher-1',
    revision,
    createdAt: '2026-08-29T15:21:00Z',
    ...overrides,
  })
}

function authorize(revision, approval = approve(revision), overrides = {}) {
  return createTeacherShareAuthorization({
    authorizationId: 'share-auth-1',
    issuerActorId: 'teacher-1',
    recipientId: 'student-1',
    revision,
    approval,
    createdAt: '2026-08-29T15:22:00Z',
    ...overrides,
  })
}

function prepareAcceptedQuality(revision) {
  const report = prepareMusicXmlQualityGate(revision.content, VALID_4_4_XML)
  assert.equal(report.qualityState, QUALITY_STATE.SOURCE_VERIFIED)
  assert.equal(report.structurallyValid, true)
  assert.equal(report.sourceVerified, true)
  assert.equal(report.reviewRequired, false)
  assert.equal(report.reliable, true)
  assert.equal(report.automaticPlaybackAllowed, true)
  return report
}

function evidence(revision, overrides = {}) {
  prepareAcceptedQuality(revision)
  return createTeacherShareQualityEvidence({
    evidenceId: 'quality-evidence-1',
    revision,
    createdAt: '2026-08-29T15:23:00Z',
    ...overrides,
  })
}

function frozenBlockedReport(noteCount) {
  return Object.freeze({
    qualityState: QUALITY_STATE.UNRELIABLE,
    qualityStates: Object.freeze([QUALITY_STATE.UNRELIABLE]),
    structuralState: QUALITY_STATE.UNRELIABLE,
    sourceState: QUALITY_STATE.SOURCE_UNVERIFIED,
    structurallyValid: false,
    sourceVerified: false,
    reviewRequired: true,
    reliable: false,
    automaticPlaybackAllowed: false,
    summary: Object.freeze({
      totalFindings: 0,
      errors: 1,
      warnings: 0,
      verifiedNotes: 0,
      unverifiedNotes: noteCount,
    }),
    findings: Object.freeze([]),
  })
}

function frozenOptimisticButNonPackage2cReport() {
  return Object.freeze({
    qualityState: QUALITY_STATE.SOURCE_VERIFIED,
    structurallyValid: true,
    sourceVerified: true,
    reviewRequired: false,
    reliable: true,
    automaticPlaybackAllowed: true,
  })
}

describe('Package 12-T2 exact-revision share quality eligibility', () => {
  test('exports explicit immutable T2 vocabulary', () => {
    assert.equal(TEACHER_SHARE_QUALITY_EVIDENCE_SCHEMA_VERSION, 1)
    assert.equal(TEACHER_SHARE_QUALITY_EVIDENCE_STATE, 'share_quality_eligible')
    assert.equal(Object.isFrozen(TEACHER_SHARE_ELIGIBILITY_STATUS), true)
    assert.equal(
      TEACHER_SHARE_ELIGIBILITY_STATUS.ELIGIBLE_EXACT_REVISION,
      'eligible_exact_revision',
    )
    assert.equal(
      TEACHER_SHARE_ELIGIBILITY_STATUS.CORRECTED_REVISION_REVALIDATION_REQUIRED,
      'corrected_revision_revalidation_required',
    )
  })

  test('creates strict immutable evidence from exact source provenance plus accepted Package 2C/2D gates', () => {
    const revision = automatic()
    const report = prepareAcceptedQuality(revision)
    const revisionBefore = structuredClone(revision)
    const reportBefore = structuredClone(report)

    const qualityEvidence = createTeacherShareQualityEvidence({
      evidenceId: ' quality-evidence-1 ',
      revision,
      createdAt: ' 2026-08-29T15:23:00Z ',
    })

    assert.equal(Object.isFrozen(qualityEvidence), true)
    assert.equal(isTeacherShareQualityEvidenceRecord(qualityEvidence), true)
    assert.equal(qualityEvidence.evidenceId, 'quality-evidence-1')
    assert.equal(qualityEvidence.evidenceState, 'share_quality_eligible')
    assert.equal(qualityEvidence.sourceId, revision.sourceId)
    assert.equal(qualityEvidence.sourceRevisionId, revision.sourceRevisionId)
    assert.equal(qualityEvidence.revisionId, revision.revisionId)
    assert.equal(qualityEvidence.contentFingerprint, revision.contentFingerprint)
    assert.equal(qualityEvidence.lineageFingerprint, revision.lineageFingerprint)
    assert.equal(qualityEvidence.musicXmlSourceProvenance, 'exact-note-array-musicxml-source')
    assert.match(qualityEvidence.musicXmlSourceFingerprint, /^musicxml-fnv1a64-v1:/)
    assert.equal(qualityEvidence.ttsDecision, QUALITY_GATE_DECISION.ACCEPT)
    assert.equal(qualityEvidence.ttsReason, QUALITY_GATE_REASON.ACCEPT_VERIFIED)
    assert.equal(qualityEvidence.playbackDecision, QUALITY_GATE_DECISION.ACCEPT)
    assert.equal(qualityEvidence.playbackReason, QUALITY_GATE_REASON.ACCEPT_VERIFIED)
    assert.deepEqual(revision, revisionBefore)
    assert.deepEqual(report, reportBefore)
  })

  test('exact T1 authorization plus exact live quality evidence is eligible but exposes no payload', () => {
    const revision = automatic()
    const approval = approve(revision)
    const authorization = authorize(revision, approval)
    const qualityEvidence = evidence(revision)

    const result = evaluateTeacherShareEligibility({
      authorization,
      revision,
      approval,
      recipientId: 'student-1',
      qualityEvidence,
    })

    assert.equal(result.status, TEACHER_SHARE_ELIGIBILITY_STATUS.ELIGIBLE_EXACT_REVISION)
    assert.equal(result.eligible, true)
    assert.equal(result.revisionId, revision.revisionId)
    assert.equal(result.qualityEvidenceId, qualityEvidence.evidenceId)
    assert.equal(result.ttsDecision, QUALITY_GATE_DECISION.ACCEPT)
    assert.equal(result.playbackDecision, QUALITY_GATE_DECISION.ACCEPT)
    for (const forbidden of ['content', 'payload', 'bytes', 'token', 'url', 'link', 'musicXml']) {
      assert.equal(Object.hasOwn(result, forbidden), false)
    }
  })

  test('quality evidence creation fails closed when exact source/report evidence is missing', () => {
    const revision = automatic()

    assert.throws(
      () =>
        createTeacherShareQualityEvidence({
          evidenceId: 'quality-evidence-1',
          revision,
        }),
      /Exact-array MusicXML source evidence is required/,
    )

    registerMusicXmlSourceForNotes(revision.content, VALID_4_4_XML)
    assert.throws(
      () =>
        createTeacherShareQualityEvidence({
          evidenceId: 'quality-evidence-1',
          revision,
        }),
      /genuine accepted Package 2C report/,
    )
  })

  test('source/report evidence attached to a clone cannot transfer to the exact revision array', () => {
    const revision = automatic()
    const clone = structuredClone(revision.content)
    prepareMusicXmlQualityGate(clone, VALID_4_4_XML)

    assert.throws(
      () =>
        createTeacherShareQualityEvidence({
          evidenceId: 'quality-evidence-1',
          revision,
        }),
      /Exact-array MusicXML source evidence is required/,
    )
  })

  test('teacher-corrected revisions require post-correction revalidation even if stale metadata appears optimistic', () => {
    const base = automatic()
    const changedContent = structuredClone(base.content)
    changedContent[0].noteName = 'Fa#'
    const corrected = createTeacherCorrectedRevision({
      revisionId: 'teacher-1',
      parentRevision: base,
      createdAt: '2026-08-29T15:24:00Z',
      content: changedContent,
    })
    const approval = approve(corrected)
    const authorization = authorize(corrected, approval)

    // Existing Package 2D report generation does not constitute a reviewed
    // post-correction provenance contract. T2 must refuse to inherit it.
    const optimistic = prepareMusicXmlQualityGate(corrected.content, VALID_4_4_XML)
    assert.equal(optimistic.sourceVerified, true)

    assert.throws(
      () =>
        createTeacherShareQualityEvidence({
          evidenceId: 'quality-evidence-corrected',
          revision: corrected,
        }),
      /post-correction revalidation/,
    )

    const result = evaluateTeacherShareEligibility({
      authorization,
      revision: corrected,
      approval,
      recipientId: 'student-1',
    })
    assert.equal(
      result.status,
      TEACHER_SHARE_ELIGIBILITY_STATUS.CORRECTED_REVISION_REVALIDATION_REQUIRED,
    )
    assert.equal(result.eligible, false)
    assert.equal(result.ttsDecision, null)
    assert.equal(result.playbackDecision, null)
  })

  test('missing T2 quality evidence never becomes eligible even when live gates are accepted', () => {
    const revision = automatic()
    const approval = approve(revision)
    const authorization = authorize(revision, approval)
    prepareAcceptedQuality(revision)

    const result = evaluateTeacherShareEligibility({
      authorization,
      revision,
      approval,
      recipientId: 'student-1',
    })

    assert.equal(result.status, TEACHER_SHARE_ELIGIBILITY_STATUS.QUALITY_EVIDENCE_MISSING)
    assert.equal(result.eligible, false)
  })

  test('quality evidence is bound to one exact revision and cannot be reused cross-source', () => {
    const revision = automatic()
    const approval = approve(revision)
    const authorization = authorize(revision, approval)

    const other = automatic({ revisionId: 'auto-2', sourceId: 'score-2' })
    const otherEvidence = evidence(other, { evidenceId: 'quality-evidence-other' })

    const result = evaluateTeacherShareEligibility({
      authorization,
      revision,
      approval,
      recipientId: 'student-1',
      qualityEvidence: otherEvidence,
    })

    assert.equal(
      result.status,
      TEACHER_SHARE_ELIGIBILITY_STATUS.QUALITY_EVIDENCE_NOT_APPLICABLE,
    )
    assert.equal(result.eligible, false)
  })

  test('removing exact source provenance after evidence creation fails closed', () => {
    const revision = automatic()
    const approval = approve(revision)
    const authorization = authorize(revision, approval)
    const qualityEvidence = evidence(revision)

    assert.equal(clearMusicXmlSourceForNotes(revision.content), true)

    const result = evaluateTeacherShareEligibility({
      authorization,
      revision,
      approval,
      recipientId: 'student-1',
      qualityEvidence,
    })
    assert.equal(result.status, TEACHER_SHARE_ELIGIBILITY_STATUS.SOURCE_EVIDENCE_MISSING)
    assert.equal(result.eligible, false)
  })

  test('replacing exact source provenance after evidence creation is detected as stale', () => {
    const revision = automatic()
    const approval = approve(revision)
    const authorization = authorize(revision, approval)
    const qualityEvidence = evidence(revision)

    registerMusicXmlSourceForNotes(revision.content, OTHER_XML)

    const result = evaluateTeacherShareEligibility({
      authorization,
      revision,
      approval,
      recipientId: 'student-1',
      qualityEvidence,
    })
    assert.equal(result.status, TEACHER_SHARE_ELIGIBILITY_STATUS.SOURCE_EVIDENCE_STALE)
    assert.equal(result.eligible, false)
  })

  test('removing the accepted report after evidence creation returns quality review, not eligibility', () => {
    const revision = automatic()
    const approval = approve(revision)
    const authorization = authorize(revision, approval)
    const qualityEvidence = evidence(revision)

    assert.equal(unregisterQualityReportForNotes(revision.content), true)

    const result = evaluateTeacherShareEligibility({
      authorization,
      revision,
      approval,
      recipientId: 'student-1',
      qualityEvidence,
    })
    assert.equal(result.status, TEACHER_SHARE_ELIGIBILITY_STATUS.QUALITY_REVIEW_REQUIRED)
    assert.equal(result.eligible, false)
    assert.equal(result.ttsDecision, QUALITY_GATE_DECISION.REVIEW)
    assert.equal(result.playbackDecision, QUALITY_GATE_DECISION.REVIEW)
  })

  test('a newly blocked live quality report invalidates previously issued evidence', () => {
    const revision = automatic()
    const approval = approve(revision)
    const authorization = authorize(revision, approval)
    const qualityEvidence = evidence(revision)

    registerQualityReportForNotes(
      revision.content,
      frozenBlockedReport(revision.content.length),
    )

    const result = evaluateTeacherShareEligibility({
      authorization,
      revision,
      approval,
      recipientId: 'student-1',
      qualityEvidence,
    })
    assert.equal(result.status, TEACHER_SHARE_ELIGIBILITY_STATUS.QUALITY_BLOCKED)
    assert.equal(result.eligible, false)
    assert.equal(result.ttsDecision, QUALITY_GATE_DECISION.BLOCK)
    assert.equal(result.playbackDecision, QUALITY_GATE_DECISION.BLOCK)
  })

  test('an optimistic ad-hoc registered report cannot satisfy T2 provenance shape even if Package 2D returns ACCEPT', () => {
    const revision = automatic()
    const approval = approve(revision)
    const authorization = authorize(revision, approval)
    const qualityEvidence = evidence(revision)

    registerQualityReportForNotes(
      revision.content,
      frozenOptimisticButNonPackage2cReport(),
    )

    const result = evaluateTeacherShareEligibility({
      authorization,
      revision,
      approval,
      recipientId: 'student-1',
      qualityEvidence,
    })
    assert.equal(result.ttsDecision, QUALITY_GATE_DECISION.ACCEPT)
    assert.equal(result.playbackDecision, QUALITY_GATE_DECISION.ACCEPT)
    assert.equal(result.status, TEACHER_SHARE_ELIGIBILITY_STATUS.QUALITY_EVIDENCE_INVALID)
    assert.equal(result.eligible, false)
  })

  test('recipient mismatch and exact revocation are enforced before quality eligibility', () => {
    const revision = automatic()
    const approval = approve(revision)
    const authorization = authorize(revision, approval)
    const qualityEvidence = evidence(revision)

    const recipientMismatch = evaluateTeacherShareEligibility({
      authorization,
      revision,
      approval,
      recipientId: 'student-2',
      qualityEvidence,
    })
    assert.equal(recipientMismatch.status, TEACHER_SHARE_ELIGIBILITY_STATUS.RECIPIENT_MISMATCH)
    assert.equal(recipientMismatch.eligible, false)

    const revocation = createTeacherShareRevocation({
      revocationId: 'revoke-1',
      actorId: 'teacher-1',
      authorization,
      createdAt: '2026-08-29T15:25:00Z',
    })
    const revoked = evaluateTeacherShareEligibility({
      authorization,
      revision,
      approval,
      recipientId: 'student-1',
      qualityEvidence,
      revocation,
    })
    assert.equal(revoked.status, TEACHER_SHARE_ELIGIBILITY_STATUS.REVOKED)
    assert.equal(revoked.eligible, false)
  })

  test('stale authorization fails closed before a later corrected revision can enter T2', () => {
    const first = automatic()
    const firstApproval = approve(first)
    const authorization = authorize(first, firstApproval)
    const firstEvidence = evidence(first)

    const later = createTeacherCorrectedRevision({
      revisionId: 'teacher-2',
      parentRevision: first,
      createdAt: '2026-08-29T15:26:00Z',
      content: structuredClone(first.content),
    })
    const laterApproval = approve(later, { approvalId: 'approval-later' })

    const result = evaluateTeacherShareEligibility({
      authorization,
      revision: later,
      approval: laterApproval,
      recipientId: 'student-1',
      qualityEvidence: firstEvidence,
    })
    assert.equal(
      result.status,
      TEACHER_SHARE_ELIGIBILITY_STATUS.AUTHORIZATION_NOT_APPLICABLE,
    )
    assert.equal(result.eligible, false)
  })

  test('strict quality evidence validator rejects mutable, extra-field, symbol and accessor records', () => {
    const revision = automatic()
    const valid = evidence(revision)

    assert.equal(isTeacherShareQualityEvidenceRecord(valid), true)
    assert.equal(isTeacherShareQualityEvidenceRecord(structuredClone(valid)), false)
    assert.equal(
      isTeacherShareQualityEvidenceRecord(Object.freeze({ ...valid, safeToShare: true })),
      false,
    )

    const withSymbol = { ...valid }
    withSymbol[Symbol('unsafe')] = true
    Object.freeze(withSymbol)
    assert.equal(isTeacherShareQualityEvidenceRecord(withSymbol), false)

    const accessor = { ...valid }
    Object.defineProperty(accessor, 'evidenceId', {
      enumerable: true,
      configurable: true,
      get() {
        return 'quality-evidence-1'
      },
    })
    Object.freeze(accessor)
    assert.equal(isTeacherShareQualityEvidenceRecord(accessor), false)
  })

  test('strict validator rejects unsupported schema/state/kind and non-ACCEPT evidence claims', () => {
    const valid = evidence(automatic())

    for (const replacement of [
      { schemaVersion: 2 },
      { evidenceState: 'safe_to_share' },
      { evidenceId: '' },
      { revisionKind: 'teacher_corrected' },
      { parentRevisionId: 'parent-1' },
      { parentLineageFingerprint: 'lineage-x' },
      { musicXmlSourceProvenance: 'invented' },
      { musicXmlSourceFingerprint: '' },
      { ttsDecision: QUALITY_GATE_DECISION.REVIEW },
      { ttsReason: QUALITY_GATE_REASON.REPORT_MISSING },
      { playbackDecision: QUALITY_GATE_DECISION.BLOCK },
      { playbackReason: QUALITY_GATE_REASON.REPORT_UNRELIABLE },
      { revisionCreatedAt: 123 },
      { createdAt: 123 },
    ]) {
      assert.equal(
        isTeacherShareQualityEvidenceRecord(Object.freeze({ ...valid, ...replacement })),
        false,
      )
    }
  })

  test('caller owns evidence identity/time and malformed domain inputs fail closed', () => {
    const revision = automatic()
    prepareAcceptedQuality(revision)

    assert.throws(
      () => createTeacherShareQualityEvidence({ revision }),
      /evidenceId/,
    )

    const qualityEvidence = createTeacherShareQualityEvidence({
      evidenceId: ' quality-1 ',
      revision,
    })
    assert.equal(qualityEvidence.evidenceId, 'quality-1')
    assert.equal(qualityEvidence.createdAt, null)

    const approval = approve(revision)
    const authorization = authorize(revision, approval)
    assert.throws(
      () =>
        evaluateTeacherShareEligibility({
          authorization,
          revision,
          approval,
          recipientId: 'student-1',
          qualityEvidence: structuredClone(qualityEvidence),
        }),
      /valid immutable teacher share quality evidence record/,
    )
    assert.throws(
      () =>
        evaluateTeacherShareEligibility({
          authorization,
          revision: structuredClone(revision),
          approval,
          recipientId: 'student-1',
          qualityEvidence,
        }),
      /valid immutable teacher revision/,
    )
  })
})
