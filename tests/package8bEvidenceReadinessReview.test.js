import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import {
  AUDIVERIS_DATASET_SPLIT,
  AUDIVERIS_TRAINING_APPROVAL_SCOPE,
  createAudiverisTrainingCandidate,
} from '../scripts/audiverisTrainingDatasetContract.js'
import {
  AUDIVERIS_EVIDENCE_FIELD,
  AUDIVERIS_EVIDENCE_READINESS_STATUS,
  AUDIVERIS_EVIDENCE_REJECTION_REASON,
  evaluateAudiverisEvidenceReadiness,
  isAudiverisEvidenceReadinessReport,
} from '../scripts/audiverisTrainingEvidenceReadiness.js'

const bytes = (text) => new TextEncoder().encode(text)
const hash = (value) => createHash('sha256').update(value).digest('hex')
const artifact = (path, value) => ({ path, sha256: hash(value) })

function fixture() {
  const raw = {
    pdf: bytes('pdf'), page: bytes('page'), omr: bytes('omr'), xml: bytes('xml'),
    glyph: bytes('glyph'), license: bytes('license'), approval: bytes('approval'),
  }
  const base = {
    candidateId: 'semantic-review',
    provenanceId: 'semantic-review-source',
    split: AUDIVERIS_DATASET_SPLIT.TRAIN,
    sourcePdf: artifact('fixtures/semantic/source.pdf', raw.pdf),
    pageImage: artifact('fixtures/semantic/page.png', raw.page),
    omrArtifact: artifact('fixtures/semantic/project.omr', raw.omr),
    musicXml: artifact('fixtures/semantic/reference.musicxml', raw.xml),
    glyphImage: artifact('fixtures/semantic/glyph.png', raw.glyph),
    shapeLabel: 'test_only_shape',
    symbolCoordinates: { pageIndex: 0, x: 1, y: 2, width: 3, height: 4 },
    referenceApprovalEvidence: null,
    trainingApproval: null,
    licenseId: 'TEST-ONLY-PERMITTED',
    licenseEvidence: artifact('fixtures/semantic/LICENSE.md', raw.license),
    audiverisVersion: '5.11.0',
  }
  const draft = createAudiverisTrainingCandidate(base)
  const candidate = createAudiverisTrainingCandidate({
    ...base,
    trainingApproval: {
      approvalId: 'approval-semantic-review',
      actorId: 'teacher-test-actor',
      approvedAt: '2026-08-28T20:20:00.000Z',
      scope: AUDIVERIS_TRAINING_APPROVAL_SCOPE,
      approvedCandidateFingerprint: draft.candidateFingerprint,
      evidence: artifact('fixtures/semantic/TRAINING_APPROVAL.md', raw.approval),
    },
  })
  const entries = [
    [AUDIVERIS_EVIDENCE_FIELD.SOURCE_PDF, candidate.sourcePdf, raw.pdf],
    [AUDIVERIS_EVIDENCE_FIELD.PAGE_IMAGE, candidate.pageImage, raw.page],
    [AUDIVERIS_EVIDENCE_FIELD.OMR_ARTIFACT, candidate.omrArtifact, raw.omr],
    [AUDIVERIS_EVIDENCE_FIELD.MUSIC_XML, candidate.musicXml, raw.xml],
    [AUDIVERIS_EVIDENCE_FIELD.GLYPH_IMAGE, candidate.glyphImage, raw.glyph],
    [AUDIVERIS_EVIDENCE_FIELD.LICENSE_EVIDENCE, candidate.licenseEvidence, raw.license],
    [AUDIVERIS_EVIDENCE_FIELD.TRAINING_APPROVAL_EVIDENCE, candidate.trainingApproval.evidence, raw.approval],
  ].map(([field, evidence, value]) => ({ field, path: evidence.path, bytes: value }))
  return { candidate, entries }
}

function frozenArray(values) {
  return Object.freeze([...values])
}

test('Package 8B-T2 review regression: semantically contradictory frozen reports are rejected', () => {
  const { candidate, entries } = fixture()
  const report = evaluateAudiverisEvidenceReadiness(candidate, entries)
  assert.equal(isAudiverisEvidenceReadinessReport(report), true)

  assert.equal(isAudiverisEvidenceReadinessReport(Object.freeze({
    ...report,
    status: AUDIVERIS_EVIDENCE_READINESS_STATUS.INCOMPLETE,
    eligibleForManifestReview: false,
  })), false)

  assert.equal(isAudiverisEvidenceReadinessReport(Object.freeze({
    ...report,
    trainabilityReasons: frozenArray(['missing_page_image']),
  })), false)

  assert.equal(isAudiverisEvidenceReadinessReport(Object.freeze({
    ...report,
    missingEvidenceFields: frozenArray([AUDIVERIS_EVIDENCE_FIELD.GLYPH_IMAGE]),
  })), false)
})

test('Package 8B-T2 review regression: forged rejection vocabulary and duplicate fields are rejected', () => {
  const { candidate, entries } = fixture()
  const report = evaluateAudiverisEvidenceReadiness(candidate, entries)
  const rejection = Object.freeze({
    code: AUDIVERIS_EVIDENCE_REJECTION_REASON.HASH_MISMATCH,
    field: AUDIVERIS_EVIDENCE_FIELD.GLYPH_IMAGE,
  })

  assert.equal(isAudiverisEvidenceReadinessReport(Object.freeze({
    ...report,
    status: AUDIVERIS_EVIDENCE_READINESS_STATUS.REJECTED,
    rejections: frozenArray([Object.freeze({ code: 'invented_reason', field: 'glyphImage' })]),
    eligibleForManifestReview: false,
  })), false)

  assert.equal(isAudiverisEvidenceReadinessReport(Object.freeze({
    ...report,
    status: AUDIVERIS_EVIDENCE_READINESS_STATUS.REJECTED,
    rejections: frozenArray([rejection, rejection]),
    eligibleForManifestReview: false,
  })), false)
})

test('Package 8B-T2 eligibility wording is bounded to manifest review, not training or production authorization', () => {
  const { candidate, entries } = fixture()
  const report = evaluateAudiverisEvidenceReadiness(candidate, entries)

  assert.equal(report.status, AUDIVERIS_EVIDENCE_READINESS_STATUS.ELIGIBLE)
  assert.equal(report.eligibleForManifestReview, true)
  assert.equal(Object.prototype.hasOwnProperty.call(report, 'approvedForTrainingRun'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(report, 'productionReady'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(report, 'modelApproved'), false)
})
