import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import {
  AUDIVERIS_DATASET_SPLIT,
  AUDIVERIS_TRAINABILITY_REASON,
  AUDIVERIS_TRAINABILITY_STATUS,
  AUDIVERIS_TRAINING_APPROVAL_SCOPE,
  createAudiverisTrainingCandidate,
} from '../scripts/audiverisTrainingDatasetContract.js'
import {
  AUDIVERIS_8B_REPOSITORY_CANDIDATES,
} from '../scripts/audiverisTrainingDatasetInventory.js'
import {
  AUDIVERIS_EVIDENCE_FIELD,
  AUDIVERIS_EVIDENCE_READINESS_SCHEMA_VERSION,
  AUDIVERIS_EVIDENCE_READINESS_STATUS,
  AUDIVERIS_EVIDENCE_REJECTION_REASON,
  evaluateAudiverisEvidenceReadiness,
  isAudiverisEvidenceReadinessReport,
} from '../scripts/audiverisTrainingEvidenceReadiness.js'

function bytes(text) {
  return new TextEncoder().encode(text)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function artifact(path, value) {
  return { path, sha256: sha256(value) }
}

function buildCompleteFixture({ candidateId = 'ready-a', split = AUDIVERIS_DATASET_SPLIT.TRAIN } = {}) {
  const evidence = Object.freeze({
    sourcePdf: bytes(`pdf-${candidateId}`),
    pageImage: bytes(`page-${candidateId}`),
    omrArtifact: bytes(`omr-${candidateId}`),
    musicXml: bytes(`xml-${candidateId}`),
    glyphImage: bytes(`glyph-${candidateId}`),
    licenseEvidence: bytes(`license-${candidateId}`),
    trainingApprovalEvidence: bytes(`training-approval-${candidateId}`),
  })
  const input = {
    candidateId,
    provenanceId: `provenance-${candidateId}`,
    split,
    sourcePdf: artifact(`fixtures/${candidateId}/source.pdf`, evidence.sourcePdf),
    pageImage: artifact(`fixtures/${candidateId}/page-1.png`, evidence.pageImage),
    omrArtifact: artifact(`fixtures/${candidateId}/project.omr`, evidence.omrArtifact),
    musicXml: artifact(`fixtures/${candidateId}/reference.musicxml`, evidence.musicXml),
    glyphImage: artifact(`fixtures/${candidateId}/glyph.png`, evidence.glyphImage),
    shapeLabel: 'test_only_shape',
    symbolCoordinates: { pageIndex: 0, x: 10, y: 20, width: 12, height: 16 },
    referenceApprovalEvidence: null,
    trainingApproval: null,
    licenseId: 'TEST-ONLY-PERMITTED',
    licenseEvidence: artifact(`fixtures/${candidateId}/LICENSE.md`, evidence.licenseEvidence),
    audiverisVersion: '5.11.0',
  }
  const draft = createAudiverisTrainingCandidate(input)
  const candidate = createAudiverisTrainingCandidate({
    ...input,
    trainingApproval: {
      approvalId: `approval-${candidateId}`,
      actorId: 'teacher-test-actor',
      approvedAt: '2026-08-28T20:15:00.000Z',
      scope: AUDIVERIS_TRAINING_APPROVAL_SCOPE,
      approvedCandidateFingerprint: draft.candidateFingerprint,
      evidence: artifact(
        `fixtures/${candidateId}/TRAINING_APPROVAL.md`,
        evidence.trainingApprovalEvidence,
      ),
    },
  })
  return { candidate, evidence }
}

function exactEntries(candidate, evidence) {
  return [
    { field: AUDIVERIS_EVIDENCE_FIELD.SOURCE_PDF, path: candidate.sourcePdf.path, bytes: evidence.sourcePdf },
    { field: AUDIVERIS_EVIDENCE_FIELD.PAGE_IMAGE, path: candidate.pageImage.path, bytes: evidence.pageImage },
    { field: AUDIVERIS_EVIDENCE_FIELD.OMR_ARTIFACT, path: candidate.omrArtifact.path, bytes: evidence.omrArtifact },
    { field: AUDIVERIS_EVIDENCE_FIELD.MUSIC_XML, path: candidate.musicXml.path, bytes: evidence.musicXml },
    { field: AUDIVERIS_EVIDENCE_FIELD.GLYPH_IMAGE, path: candidate.glyphImage.path, bytes: evidence.glyphImage },
    { field: AUDIVERIS_EVIDENCE_FIELD.LICENSE_EVIDENCE, path: candidate.licenseEvidence.path, bytes: evidence.licenseEvidence },
    {
      field: AUDIVERIS_EVIDENCE_FIELD.TRAINING_APPROVAL_EVIDENCE,
      path: candidate.trainingApproval.evidence.path,
      bytes: evidence.trainingApprovalEvidence,
    },
  ]
}

function repositoryEntry(candidate, field, artifactValue) {
  return {
    field,
    path: artifactValue.path,
    bytes: readFileSync(new URL(`../${artifactValue.path}`, import.meta.url)),
  }
}

test('Package 8B-T2 readiness vocabulary is explicit and immutable', () => {
  assert.equal(AUDIVERIS_EVIDENCE_READINESS_SCHEMA_VERSION, 1)
  assert.equal(Object.isFrozen(AUDIVERIS_EVIDENCE_READINESS_STATUS), true)
  assert.equal(Object.isFrozen(AUDIVERIS_EVIDENCE_REJECTION_REASON), true)
  assert.equal(Object.isFrozen(AUDIVERIS_EVIDENCE_FIELD), true)
  assert.deepEqual(Object.values(AUDIVERIS_EVIDENCE_READINESS_STATUS).sort(), [
    'eligible', 'incomplete', 'rejected',
  ])
})

test('Package 8B-T2 exact verified bytes make a fully trainable synthetic candidate eligible only for manifest review', () => {
  const { candidate, evidence } = buildCompleteFixture()
  const report = evaluateAudiverisEvidenceReadiness(candidate, exactEntries(candidate, evidence))

  assert.equal(report.status, AUDIVERIS_EVIDENCE_READINESS_STATUS.ELIGIBLE)
  assert.equal(report.trainabilityStatus, AUDIVERIS_TRAINABILITY_STATUS.TRAINABLE)
  assert.deepEqual(report.trainabilityReasons, [])
  assert.deepEqual(report.missingEvidenceFields, [])
  assert.deepEqual(report.rejections, [])
  assert.equal(report.eligibleForManifestReview, true)
  assert.equal(isAudiverisEvidenceReadinessReport(report), true)
  assert.equal(Object.isFrozen(report), true)
  assert.equal(Object.isFrozen(report.verifiedEvidenceFields), true)
  assert.equal('bytes' in report, false)
  assert.equal('trainingApproved' in report, false)
  assert.equal('productionReady' in report, false)
})

test('Package 8B-T2 current real repository chain stays incomplete after every declared artifact hash is verified', () => {
  const candidate = AUDIVERIS_8B_REPOSITORY_CANDIDATES[0]
  const entries = [
    repositoryEntry(candidate, AUDIVERIS_EVIDENCE_FIELD.SOURCE_PDF, candidate.sourcePdf),
    repositoryEntry(candidate, AUDIVERIS_EVIDENCE_FIELD.OMR_ARTIFACT, candidate.omrArtifact),
    repositoryEntry(candidate, AUDIVERIS_EVIDENCE_FIELD.MUSIC_XML, candidate.musicXml),
    repositoryEntry(
      candidate,
      AUDIVERIS_EVIDENCE_FIELD.REFERENCE_APPROVAL_EVIDENCE,
      candidate.referenceApprovalEvidence,
    ),
    repositoryEntry(candidate, AUDIVERIS_EVIDENCE_FIELD.LICENSE_EVIDENCE, candidate.licenseEvidence),
  ]
  const report = evaluateAudiverisEvidenceReadiness(candidate, entries)

  assert.equal(report.status, AUDIVERIS_EVIDENCE_READINESS_STATUS.INCOMPLETE)
  assert.equal(report.trainabilityStatus, AUDIVERIS_TRAINABILITY_STATUS.INCOMPLETE)
  assert.deepEqual(report.trainabilityReasons, [
    AUDIVERIS_TRAINABILITY_REASON.MISSING_PAGE_IMAGE,
    AUDIVERIS_TRAINABILITY_REASON.MISSING_GLYPH_IMAGE,
    AUDIVERIS_TRAINABILITY_REASON.MISSING_SHAPE_LABEL,
    AUDIVERIS_TRAINABILITY_REASON.MISSING_SYMBOL_COORDINATES,
    AUDIVERIS_TRAINABILITY_REASON.MISSING_TRAINING_APPROVAL,
    AUDIVERIS_TRAINABILITY_REASON.MISSING_SPLIT,
  ])
  assert.deepEqual(report.missingEvidenceFields, [])
  assert.equal(report.verifiedEvidenceFields.length, 5)
  assert.deepEqual(report.rejections, [])
  assert.equal(report.eligibleForManifestReview, false)
})

test('Package 8B-T2 missing observation keeps a trainable candidate incomplete instead of assuming evidence exists', () => {
  const { candidate, evidence } = buildCompleteFixture()
  const entries = exactEntries(candidate, evidence).filter(
    (entry) => entry.field !== AUDIVERIS_EVIDENCE_FIELD.GLYPH_IMAGE,
  )
  const report = evaluateAudiverisEvidenceReadiness(candidate, entries)

  assert.equal(report.trainabilityStatus, AUDIVERIS_TRAINABILITY_STATUS.TRAINABLE)
  assert.equal(report.status, AUDIVERIS_EVIDENCE_READINESS_STATUS.INCOMPLETE)
  assert.deepEqual(report.missingEvidenceFields, [AUDIVERIS_EVIDENCE_FIELD.GLYPH_IMAGE])
  assert.equal(report.eligibleForManifestReview, false)
})

test('Package 8B-T2 changed bytes reject the declared hash instead of normalizing or trusting caller metadata', () => {
  const { candidate, evidence } = buildCompleteFixture()
  const entries = exactEntries(candidate, evidence).map((entry) =>
    entry.field === AUDIVERIS_EVIDENCE_FIELD.GLYPH_IMAGE
      ? { ...entry, bytes: bytes('different-glyph-bytes') }
      : entry,
  )
  const report = evaluateAudiverisEvidenceReadiness(candidate, entries)

  assert.equal(report.status, AUDIVERIS_EVIDENCE_READINESS_STATUS.REJECTED)
  assert.deepEqual(report.rejections, [{
    code: AUDIVERIS_EVIDENCE_REJECTION_REASON.HASH_MISMATCH,
    field: AUDIVERIS_EVIDENCE_FIELD.GLYPH_IMAGE,
  }])
  assert.equal(report.eligibleForManifestReview, false)
})

test('Package 8B-T2 path mismatch is rejected even when artifact bytes hash exactly', () => {
  const { candidate, evidence } = buildCompleteFixture()
  const entries = exactEntries(candidate, evidence).map((entry) =>
    entry.field === AUDIVERIS_EVIDENCE_FIELD.SOURCE_PDF
      ? { ...entry, path: 'fixtures/other/source.pdf' }
      : entry,
  )
  const report = evaluateAudiverisEvidenceReadiness(candidate, entries)

  assert.equal(report.status, AUDIVERIS_EVIDENCE_READINESS_STATUS.REJECTED)
  assert.deepEqual(report.rejections, [{
    code: AUDIVERIS_EVIDENCE_REJECTION_REASON.PATH_MISMATCH,
    field: AUDIVERIS_EVIDENCE_FIELD.SOURCE_PDF,
  }])
})

test('Package 8B-T2 undeclared and duplicate evidence fields fail closed as rejected readiness evidence', () => {
  const { candidate, evidence } = buildCompleteFixture()
  const exact = exactEntries(candidate, evidence)
  const undeclared = evaluateAudiverisEvidenceReadiness(candidate, [
    ...exact,
    {
      field: AUDIVERIS_EVIDENCE_FIELD.REFERENCE_APPROVAL_EVIDENCE,
      path: 'fixtures/ready-a/REFERENCE_APPROVAL.md',
      bytes: bytes('reference-approval'),
    },
  ])
  assert.equal(undeclared.status, AUDIVERIS_EVIDENCE_READINESS_STATUS.REJECTED)
  assert.deepEqual(undeclared.rejections, [{
    code: AUDIVERIS_EVIDENCE_REJECTION_REASON.UNDECLARED_EVIDENCE_FIELD,
    field: AUDIVERIS_EVIDENCE_FIELD.REFERENCE_APPROVAL_EVIDENCE,
  }])

  const duplicate = evaluateAudiverisEvidenceReadiness(candidate, [exact[0], ...exact])
  assert.equal(duplicate.status, AUDIVERIS_EVIDENCE_READINESS_STATUS.REJECTED)
  assert.deepEqual(duplicate.rejections, [{
    code: AUDIVERIS_EVIDENCE_REJECTION_REASON.DUPLICATE_EVIDENCE_FIELD,
    field: AUDIVERIS_EVIDENCE_FIELD.SOURCE_PDF,
  }])
})

test('Package 8B-T2 malformed, accessor, sparse and unsupported intake records do not produce a readiness report', () => {
  const { candidate, evidence } = buildCompleteFixture()
  const valid = exactEntries(candidate, evidence)[0]

  assert.throws(
    () => evaluateAudiverisEvidenceReadiness(candidate, [{ ...valid, extra: true }]),
    /unsupported field set/,
  )
  assert.throws(
    () => evaluateAudiverisEvidenceReadiness(candidate, [{ ...valid, field: 'unknown' }]),
    /unsupported/,
  )
  assert.throws(
    () => evaluateAudiverisEvidenceReadiness(candidate, [{ ...valid, bytes: 'not-bytes' }]),
    /Uint8Array/,
  )
  assert.throws(
    () => evaluateAudiverisEvidenceReadiness(candidate, [{ ...valid, bytes: new Uint8Array() }]),
    /must not be empty/,
  )

  const accessor = { ...valid }
  Object.defineProperty(accessor, 'path', {
    enumerable: true,
    configurable: true,
    get() { return valid.path },
  })
  assert.throws(
    () => evaluateAudiverisEvidenceReadiness(candidate, [accessor]),
    /enumerable data property/,
  )

  const sparse = new Array(1)
  assert.throws(() => evaluateAudiverisEvidenceReadiness(candidate, sparse), /must not be sparse/)
})

test('Package 8B-T2 report is deterministic across evidence entry order and does not retain mutable input bytes', () => {
  const { candidate, evidence } = buildCompleteFixture()
  const entries = exactEntries(candidate, evidence)
  const candidateBefore = JSON.stringify(candidate)
  const first = evaluateAudiverisEvidenceReadiness(candidate, entries)
  const second = evaluateAudiverisEvidenceReadiness(candidate, [...entries].reverse())

  assert.deepEqual(first, second)
  assert.equal(JSON.stringify(candidate), candidateBefore)
  assert.equal(first.verifiedEvidenceFields.includes(AUDIVERIS_EVIDENCE_FIELD.GLYPH_IMAGE), true)

  evidence.glyphImage[0] ^= 0xff
  assert.equal(first.status, AUDIVERIS_EVIDENCE_READINESS_STATUS.ELIGIBLE)
  assert.equal('bytes' in first, false)
})

test('Package 8B-T2 MusicXML-only evidence remains incomplete even when the exact XML bytes are verified', () => {
  const xmlBytes = bytes('<score-partwise/>')
  const candidate = createAudiverisTrainingCandidate({
    candidateId: 'xml-only-t2',
    provenanceId: 'xml-only-source',
    split: null,
    sourcePdf: null,
    pageImage: null,
    omrArtifact: null,
    musicXml: artifact('fixtures/xml-only/reference.musicxml', xmlBytes),
    glyphImage: null,
    shapeLabel: null,
    symbolCoordinates: null,
    referenceApprovalEvidence: null,
    trainingApproval: null,
    licenseId: null,
    licenseEvidence: null,
    audiverisVersion: null,
  })
  const report = evaluateAudiverisEvidenceReadiness(candidate, [{
    field: AUDIVERIS_EVIDENCE_FIELD.MUSIC_XML,
    path: candidate.musicXml.path,
    bytes: xmlBytes,
  }])

  assert.equal(report.status, AUDIVERIS_EVIDENCE_READINESS_STATUS.INCOMPLETE)
  assert.ok(report.trainabilityReasons.includes(AUDIVERIS_TRAINABILITY_REASON.MUSICXML_ONLY_EVIDENCE))
  assert.equal(report.eligibleForManifestReview, false)
})

test('Package 8B-T2 report validator rejects mutable or injected report containers', () => {
  const { candidate, evidence } = buildCompleteFixture()
  const report = evaluateAudiverisEvidenceReadiness(candidate, exactEntries(candidate, evidence))

  assert.equal(isAudiverisEvidenceReadinessReport(report), true)
  assert.equal(isAudiverisEvidenceReadinessReport({ ...report }), false)
  assert.equal(isAudiverisEvidenceReadinessReport(Object.freeze({ ...report, extra: true })), false)
  assert.equal(isAudiverisEvidenceReadinessReport(Object.freeze({
    ...report,
    verifiedEvidenceFields: [...report.verifiedEvidenceFields],
  })), false)
})

test('Package 8B-T2 source remains isolated from production OMR/model/deployment and write-capable boundaries', () => {
  const source = readFileSync(
    new URL('../scripts/audiverisTrainingEvidenceReadiness.js', import.meta.url),
    'utf8',
  )
  const importTargets = [...source.matchAll(/from\s+['"]([^'"]+)['"]/gu)].map((match) => match[1])

  assert.deepEqual(importTargets, [
    'node:crypto',
    './audiverisTrainingDatasetContract.js',
  ])
  assert.doesNotMatch(source, /\b(?:writeFile|writeFileSync|readFile|readFileSync|spawn|execFile|fetch)\s*\(/u)
  assert.doesNotMatch(source, /(?:Dockerfile|render\.yaml|productionModel|modelReplacement|OMR_PROVIDER)/u)
})
