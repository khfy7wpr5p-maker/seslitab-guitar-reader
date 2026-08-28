import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import {
  AUDIVERIS_DATASET_SPLIT,
  AUDIVERIS_TRAINABILITY_REASON,
  AUDIVERIS_TRAINABILITY_STATUS,
  AUDIVERIS_TRAINING_APPROVAL_SCOPE,
  createAudiverisDatasetManifest,
  createAudiverisTrainingCandidate,
  evaluateAudiverisTrainingCandidate,
  isAudiverisDatasetManifest,
  isAudiverisTrainingCandidate,
  requireAudiverisTrainableSample,
} from '../scripts/audiverisTrainingDatasetContract.js'
import {
  AUDIVERIS_8B_REPOSITORY_CANDIDATES,
  AUDIVERIS_8B_REPOSITORY_EVALUATIONS,
} from '../scripts/audiverisTrainingDatasetInventory.js'

const digest = (character) => character.repeat(64)

function artifact(path, character) {
  return { path, sha256: digest(character) }
}

function completeCandidate({
  candidateId = 'sample-a',
  provenanceId = 'source-a',
  split = AUDIVERIS_DATASET_SPLIT.TRAIN,
  sourceCharacter = 'a',
  pageCharacter = 'b',
  omrCharacter = 'c',
  glyphCharacter = 'd',
  label = 'test_only_shape',
} = {}) {
  return createAudiverisTrainingCandidate({
    candidateId,
    provenanceId,
    split,
    sourcePdf: artifact(`fixtures/${candidateId}/source.pdf`, sourceCharacter),
    pageImage: artifact(`fixtures/${candidateId}/page-1.png`, pageCharacter),
    omrArtifact: artifact(`fixtures/${candidateId}/project.omr`, omrCharacter),
    musicXml: artifact(`fixtures/${candidateId}/reference.musicxml`, 'e'),
    glyphImage: artifact(`fixtures/${candidateId}/glyph.png`, glyphCharacter),
    shapeLabel: label,
    symbolCoordinates: { pageIndex: 0, x: 10, y: 20, width: 12, height: 16 },
    referenceApprovalEvidence: null,
    trainingApproval: {
      approvalId: `approval-${candidateId}`,
      actorId: 'teacher-test-actor',
      approvedAt: '2026-08-28T18:00:00.000Z',
      scope: AUDIVERIS_TRAINING_APPROVAL_SCOPE,
      evidence: artifact(`fixtures/${candidateId}/TRAINING_APPROVAL.md`, 'f'),
    },
    licenseId: 'TEST-ONLY-PERMITTED',
    licenseEvidence: artifact(`fixtures/${candidateId}/LICENSE.md`, '1'),
    audiverisVersion: '5.11.0',
  })
}

function sha256File(relativePath) {
  return createHash('sha256')
    .update(readFileSync(new URL(`../${relativePath}`, import.meta.url)))
    .digest('hex')
}

test('Package 8B-T1 vocabulary is explicit and immutable', () => {
  assert.equal(Object.isFrozen(AUDIVERIS_DATASET_SPLIT), true)
  assert.equal(Object.isFrozen(AUDIVERIS_TRAINABILITY_STATUS), true)
  assert.equal(Object.isFrozen(AUDIVERIS_TRAINABILITY_REASON), true)
  assert.deepEqual(Object.values(AUDIVERIS_DATASET_SPLIT).sort(), ['evaluation', 'train'])
  assert.equal(AUDIVERIS_TRAINING_APPROVAL_SCOPE, 'audiveris_training_sample')
})

test('Package 8B-T1 complete candidate is immutable, strict, and trainable only with explicit training approval', () => {
  const candidate = completeCandidate()
  const evaluation = evaluateAudiverisTrainingCandidate(candidate)

  assert.equal(isAudiverisTrainingCandidate(candidate), true)
  assert.equal(Object.isFrozen(candidate), true)
  assert.equal(Object.isFrozen(candidate.sourcePdf), true)
  assert.equal(Object.isFrozen(candidate.symbolCoordinates), true)
  assert.equal(Object.isFrozen(candidate.trainingApproval), true)
  assert.equal(Object.isFrozen(candidate.trainingApproval.evidence), true)
  assert.equal(evaluation.status, AUDIVERIS_TRAINABILITY_STATUS.TRAINABLE)
  assert.deepEqual(evaluation.reasons, [])
  assert.equal(requireAudiverisTrainableSample(candidate), candidate)
})

test('Package 8B-T1 rejects mutable nested evidence disguised inside a frozen candidate', () => {
  const valid = completeCandidate()
  const forged = Object.freeze({
    ...valid,
    sourcePdf: { ...valid.sourcePdf },
  })
  assert.equal(Object.isFrozen(forged.sourcePdf), false)
  assert.equal(isAudiverisTrainingCandidate(forged), false)
})

test('Package 8B-T1 MusicXML-only evidence is never a training sample', () => {
  const candidate = createAudiverisTrainingCandidate({
    candidateId: 'musicxml-only',
    provenanceId: 'musicxml-only-source',
    split: null,
    sourcePdf: null,
    pageImage: null,
    omrArtifact: null,
    musicXml: artifact('fixtures/musicxml-only/reference.musicxml', 'a'),
    glyphImage: null,
    shapeLabel: null,
    symbolCoordinates: null,
    referenceApprovalEvidence: null,
    trainingApproval: null,
    licenseId: null,
    licenseEvidence: null,
    audiverisVersion: null,
  })
  const evaluation = evaluateAudiverisTrainingCandidate(candidate)

  assert.equal(evaluation.status, AUDIVERIS_TRAINABILITY_STATUS.INCOMPLETE)
  assert.ok(evaluation.reasons.includes(AUDIVERIS_TRAINABILITY_REASON.MUSICXML_ONLY_EVIDENCE))
  assert.ok(evaluation.reasons.includes(AUDIVERIS_TRAINABILITY_REASON.MISSING_GLYPH_IMAGE))
  assert.ok(evaluation.reasons.includes(AUDIVERIS_TRAINABILITY_REASON.MISSING_TRAINING_APPROVAL))
  assert.throws(() => requireAudiverisTrainableSample(candidate), /not trainable/)
})

test('Package 8B-T1 unapproved candidate is rejected even when images, OMR and label evidence exist', () => {
  const complete = completeCandidate()
  const candidate = createAudiverisTrainingCandidate({
    ...complete,
    trainingApproval: null,
  })
  const evaluation = evaluateAudiverisTrainingCandidate(candidate)

  assert.equal(evaluation.status, AUDIVERIS_TRAINABILITY_STATUS.INCOMPLETE)
  assert.deepEqual(evaluation.reasons, [AUDIVERIS_TRAINABILITY_REASON.MISSING_TRAINING_APPROVAL])
  assert.throws(
    () => createAudiverisDatasetManifest({
      datasetId: 'dataset-a',
      versionId: 'v1',
      samples: [candidate],
    }),
    /not trainable/,
  )
})

test('Package 8B-T1 image/label evidence is paired and coordinates must be bounded plain integers', () => {
  const complete = completeCandidate()
  const missingLabel = createAudiverisTrainingCandidate({ ...complete, shapeLabel: null })
  const missingGlyph = createAudiverisTrainingCandidate({ ...complete, glyphImage: null })

  assert.deepEqual(evaluateAudiverisTrainingCandidate(missingLabel).reasons, [
    AUDIVERIS_TRAINABILITY_REASON.MISSING_SHAPE_LABEL,
  ])
  assert.deepEqual(evaluateAudiverisTrainingCandidate(missingGlyph).reasons, [
    AUDIVERIS_TRAINABILITY_REASON.MISSING_GLYPH_IMAGE,
  ])
  assert.throws(
    () => createAudiverisTrainingCandidate({
      ...complete,
      pageImage: artifact('fixtures/sample-a/page-1.pdf', 'b'),
    }),
    /file extension/,
  )
  assert.throws(
    () => createAudiverisTrainingCandidate({
      ...complete,
      symbolCoordinates: { pageIndex: 0, x: 1, y: 2, width: 0, height: 3 },
    }),
    /greater than zero/,
  )
  assert.throws(
    () => createAudiverisTrainingCandidate({
      ...complete,
      symbolCoordinates: { pageIndex: 0, x: 1.5, y: 2, width: 3, height: 4 },
    }),
    /safe integer/,
  )
})

test('Package 8B-T1 requires safe repository paths and exact SHA-256 evidence', () => {
  const complete = completeCandidate()
  assert.throws(
    () => createAudiverisTrainingCandidate({
      ...complete,
      glyphImage: { path: '../escape.png', sha256: digest('d') },
    }),
    /repository-relative/,
  )
  assert.throws(
    () => createAudiverisTrainingCandidate({
      ...complete,
      glyphImage: { path: 'fixtures/glyph.png', sha256: 'abc' },
    }),
    /SHA-256/,
  )
  assert.throws(
    () => createAudiverisTrainingCandidate({
      ...complete,
      trainingApproval: {
        ...complete.trainingApproval,
        scope: 'golden_reference',
      },
    }),
    /explicitly approve Audiveris training use/,
  )
})

test('Package 8B-T1 dataset version fingerprint is deterministic across input order', () => {
  const a = completeCandidate({ candidateId: 'a', provenanceId: 'pa' })
  const b = completeCandidate({
    candidateId: 'b',
    provenanceId: 'pb',
    sourceCharacter: '2',
    pageCharacter: '3',
    omrCharacter: '4',
    glyphCharacter: '5',
  })
  const one = createAudiverisDatasetManifest({
    datasetId: 'verified-symbols',
    versionId: 'v1',
    createdAt: '2026-08-28T18:10:00.000Z',
    samples: [b, a],
  })
  const two = createAudiverisDatasetManifest({
    datasetId: 'verified-symbols',
    versionId: 'v1',
    createdAt: '2026-08-28T18:10:00.000Z',
    samples: [a, b],
  })

  assert.equal(one.datasetFingerprint, two.datasetFingerprint)
  assert.deepEqual(one.samples.map((sample) => sample.candidateId), ['a', 'b'])
  assert.equal(isAudiverisDatasetManifest(one), true)
  assert.equal(Object.isFrozen(one), true)
  assert.equal(Object.isFrozen(one.samples), true)
  assert.equal(Object.isFrozen(one.splitCounts), true)
})

test('Package 8B-T1 dataset fingerprint changes when exact labeled evidence changes', () => {
  const a = completeCandidate()
  const b = completeCandidate({ label: 'different_test_only_shape' })
  const manifestA = createAudiverisDatasetManifest({
    datasetId: 'verified-symbols', versionId: 'v1', samples: [a],
  })
  const manifestB = createAudiverisDatasetManifest({
    datasetId: 'verified-symbols', versionId: 'v1', samples: [b],
  })
  assert.notEqual(manifestA.datasetFingerprint, manifestB.datasetFingerprint)
})

test('Package 8B-T1 train/evaluation split rejects provenance and source-evidence leakage', () => {
  const train = completeCandidate({ candidateId: 'train-a', provenanceId: 'shared-source' })
  const evaluationSameProvenance = completeCandidate({
    candidateId: 'eval-a',
    provenanceId: 'shared-source',
    split: AUDIVERIS_DATASET_SPLIT.EVALUATION,
    sourceCharacter: '2',
    pageCharacter: '3',
    omrCharacter: '4',
    glyphCharacter: '5',
  })
  assert.throws(
    () => createAudiverisDatasetManifest({
      datasetId: 'dataset-a', versionId: 'v1', samples: [train, evaluationSameProvenance],
    }),
    /leakage.*provenanceId/i,
  )

  const evaluationSharedPdf = completeCandidate({
    candidateId: 'eval-b',
    provenanceId: 'different-source-id',
    split: AUDIVERIS_DATASET_SPLIT.EVALUATION,
    sourceCharacter: 'a',
    pageCharacter: '3',
    omrCharacter: '4',
    glyphCharacter: '5',
  })
  assert.throws(
    () => createAudiverisDatasetManifest({
      datasetId: 'dataset-a', versionId: 'v1', samples: [train, evaluationSharedPdf],
    }),
    /leakage.*shared source evidence/i,
  )
})

test('Package 8B-T1 repository inventory preserves the real approved chain but does not promote it to trainable data', () => {
  assert.equal(AUDIVERIS_8B_REPOSITORY_CANDIDATES.length, 1)
  assert.equal(AUDIVERIS_8B_REPOSITORY_EVALUATIONS.length, 1)
  const candidate = AUDIVERIS_8B_REPOSITORY_CANDIDATES[0]
  const evaluation = AUDIVERIS_8B_REPOSITORY_EVALUATIONS[0].evaluation

  assert.equal(candidate.provenanceId, 'plan0-owner-approved-3-8')
  assert.equal(candidate.sourcePdf.sha256, sha256File(candidate.sourcePdf.path))
  assert.equal(candidate.omrArtifact.sha256, sha256File(candidate.omrArtifact.path))
  assert.equal(candidate.musicXml.sha256, sha256File(candidate.musicXml.path))
  assert.equal(candidate.referenceApprovalEvidence.sha256, sha256File(candidate.referenceApprovalEvidence.path))
  assert.equal(candidate.licenseId, 'CC0-1.0')
  assert.equal(candidate.audiverisVersion, '5.11.0')
  assert.equal(candidate.trainingApproval, null)
  assert.equal(candidate.pageImage, null)
  assert.equal(candidate.glyphImage, null)
  assert.equal(evaluation.status, AUDIVERIS_TRAINABILITY_STATUS.INCOMPLETE)
  assert.deepEqual(evaluation.reasons, [
    AUDIVERIS_TRAINABILITY_REASON.MISSING_PAGE_IMAGE,
    AUDIVERIS_TRAINABILITY_REASON.MISSING_GLYPH_IMAGE,
    AUDIVERIS_TRAINABILITY_REASON.MISSING_SHAPE_LABEL,
    AUDIVERIS_TRAINABILITY_REASON.MISSING_SYMBOL_COORDINATES,
    AUDIVERIS_TRAINABILITY_REASON.MISSING_TRAINING_APPROVAL,
    AUDIVERIS_TRAINABILITY_REASON.MISSING_SPLIT,
  ])
})

test('Package 8B-T1 contract is isolated from production OMR/model/deployment wiring', () => {
  const source = readFileSync(
    new URL('../scripts/audiverisTrainingDatasetContract.js', import.meta.url),
    'utf8',
  )
  const inventory = readFileSync(
    new URL('../scripts/audiverisTrainingDatasetInventory.js', import.meta.url),
    'utf8',
  )
  const importTargets = [...`${source}\n${inventory}`.matchAll(/from\s+['"]([^'"]+)['"]/gu)]
    .map((match) => match[1])

  assert.deepEqual(importTargets, [
    'node:crypto',
    './audiverisTrainingDatasetContract.js',
  ])
  assert.doesNotMatch(source, /\b(?:writeFile|writeFileSync|spawn|execFile|fetch)\s*\(/u)
  assert.doesNotMatch(inventory, /\b(?:writeFile|writeFileSync|spawn|execFile|fetch)\s*\(/u)
  assert.doesNotMatch(`${source}\n${inventory}`, /(?:Dockerfile|render\.yaml|modelReplacement|productionModel)/u)
})
