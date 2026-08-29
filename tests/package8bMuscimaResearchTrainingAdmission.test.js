import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createMuscimaAccidentalPagePlan } from '../scripts/audiverisMuscimaAccidentalMapping.js'
import {
  AUDIVERIS_GLYPH_CLASSIFIER_INPUT,
  MUSCIMA_RESEARCH_ADMISSION_STATUS,
  MUSCIMA_RESEARCH_APPROVAL_SCOPE,
  MUSCIMA_RESEARCH_EXPERIMENT_BLOCKER,
  MUSCIMA_RESEARCH_INTENDED_USE,
  MUSCIMA_RESEARCH_LICENSE_PROFILE,
  MUSCIMA_RESEARCH_T1_BLOCKER,
  assessMuscimaResearchTrainingAdmission,
  createMuscimaResearchSampleApproval,
  isMuscimaResearchAdmissionReport,
  isMuscimaResearchSampleApproval,
} from '../scripts/audiverisMuscimaResearchTrainingAdmission.js'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
const APPROVED_AT = '2026-08-29T10:30:00.000Z'

function object(overrides = {}) {
  return {
    objectId: '87',
    className: 'accidentalSharp',
    top: 10,
    left: 20,
    width: 3,
    height: 2,
    maskRle: '0:1 1:3 0:2',
    ...overrides,
  }
}

function page(overrides = {}) {
  return createMuscimaAccidentalPagePlan({
    pageId: 'accidentals-001',
    pageImageSha256: A,
    annotationXmlSha256: B,
    imageWidth: 100,
    imageHeight: 200,
    split: 'train',
    objects: [object()],
    ...overrides,
  })
}

function approvalFor(sample, overrides = {}) {
  return createMuscimaResearchSampleApproval({
    approvalId: `approval:${sample.sampleId}`,
    sampleId: sample.sampleId,
    audiverisShape: sample.audiverisShape,
    maskSha256: sample.maskSha256,
    approvedBy: 'teacher-reviewer',
    approvedAt: APPROVED_AT,
    scope: MUSCIMA_RESEARCH_APPROVAL_SCOPE.AUDIVERIS_CLASSIFIER_RESEARCH_SAMPLE,
    licenseProfileId: MUSCIMA_RESEARCH_LICENSE_PROFILE.profileId,
    ...overrides,
  })
}

test('Package 8B-T4 license profile is explicit, immutable and research-only', () => {
  assert.deepEqual(MUSCIMA_RESEARCH_LICENSE_PROFILE, {
    profileId: 'muscima-pp-cvc-muscima-research-only-v1',
    muscimaPpLicense: 'CC-BY-NC-SA-4.0',
    cvcMuscimaUseBoundary: 'noncommercial_research_only',
    attributionRequired: true,
    shareAlikeRequired: true,
    commercialUseAllowed: false,
    productionUseAllowed: false,
  })
  assert.ok(Object.isFrozen(MUSCIMA_RESEARCH_LICENSE_PROFILE))
})

test('Package 8B-T4 current mapped evidence remains blocked without exact sample approvals', () => {
  const report = assessMuscimaResearchTrainingAdmission({
    plans: [page()],
    approvals: [],
    intendedUse: MUSCIMA_RESEARCH_INTENDED_USE.NONCOMMERCIAL_RESEARCH,
  })

  assert.equal(report.status, MUSCIMA_RESEARCH_ADMISSION_STATUS.BLOCKED_MISSING_SAMPLE_APPROVALS)
  assert.equal(report.mappedSampleCount, 1)
  assert.equal(report.approvalCount, 0)
  assert.equal(report.researchExperimentAdmittedSampleCount, 0)
  assert.equal(report.t1TrainableSampleCount, 0)
  assert.deepEqual(report.experimentBlockers, [MUSCIMA_RESEARCH_EXPERIMENT_BLOCKER.MISSING_EXPLICIT_SAMPLE_APPROVALS])
  assert.deepEqual(report.t1Blockers, [MUSCIMA_RESEARCH_T1_BLOCKER.MISSING_OMR_ARTIFACT])
  assert.ok(isMuscimaResearchAdmissionReport(report))
})

test('Package 8B-T4 commercial and production intent fail closed even with complete sample approval', () => {
  const plan = page()
  const approvals = [approvalFor(plan.mappedSamples[0])]

  for (const intendedUse of [MUSCIMA_RESEARCH_INTENDED_USE.COMMERCIAL, MUSCIMA_RESEARCH_INTENDED_USE.PRODUCTION]) {
    const report = assessMuscimaResearchTrainingAdmission({ plans: [plan], approvals, intendedUse })
    assert.equal(report.status, MUSCIMA_RESEARCH_ADMISSION_STATUS.BLOCKED_LICENSE_USE)
    assert.equal(report.researchExperimentAdmittedSampleCount, 0)
    assert.equal(report.productionAuthorized, false)
    assert.equal(report.modelReplacementAuthorized, false)
    assert.deepEqual(report.experimentBlockers, [MUSCIMA_RESEARCH_EXPERIMENT_BLOCKER.NONCOMMERCIAL_LICENSE_ONLY])
    assert.ok(isMuscimaResearchAdmissionReport(report))
  }
})

test('Package 8B-T4 complete exact approvals allow only isolated samples.zip preparation', () => {
  const plan = page({
    objects: [
      object(),
      object({ objectId: '88', className: 'accidentalFlat', width: 2, height: 2, maskRle: '1:4' }),
    ],
  })
  const approvals = plan.mappedSamples.map((sample) => approvalFor(sample))
  const report = assessMuscimaResearchTrainingAdmission({
    plans: [plan],
    approvals,
    intendedUse: MUSCIMA_RESEARCH_INTENDED_USE.NONCOMMERCIAL_RESEARCH,
  })

  assert.equal(report.status, MUSCIMA_RESEARCH_ADMISSION_STATUS.READY_FOR_ISOLATED_SAMPLES_ZIP_BUILD)
  assert.equal(report.researchExperimentAdmittedSampleCount, 2)
  assert.equal(report.t1TrainableSampleCount, 0)
  assert.equal(report.audiverisTechnicalInput, AUDIVERIS_GLYPH_CLASSIFIER_INPUT.GLOBAL_SAMPLES_ZIP_GLYPH_SHAPE)
  assert.equal(report.t1OmrEvidenceSatisfied, false)
  assert.equal(report.productionAuthorized, false)
  assert.equal(report.modelReplacementAuthorized, false)
  assert.deepEqual(report.experimentBlockers, [])
  assert.deepEqual(report.t1Blockers, [MUSCIMA_RESEARCH_T1_BLOCKER.MISSING_OMR_ARTIFACT])
  assert.ok(isMuscimaResearchAdmissionReport(report))
  assert.ok(Object.isFrozen(report))
  assert.ok(Object.isFrozen(report.experimentBlockers))
  assert.ok(Object.isFrozen(report.t1Blockers))
})

test('Package 8B-T4 approval binds exact sample id, shape and mask evidence', () => {
  const plan = page()
  const sample = plan.mappedSamples[0]

  assert.throws(
    () => assessMuscimaResearchTrainingAdmission({
      plans: [plan],
      approvals: [approvalFor(sample, { audiverisShape: 'FLAT' })],
      intendedUse: MUSCIMA_RESEARCH_INTENDED_USE.NONCOMMERCIAL_RESEARCH,
    }),
    /exact mapped sample evidence/u,
  )

  assert.throws(
    () => assessMuscimaResearchTrainingAdmission({
      plans: [plan],
      approvals: [approvalFor(sample, { maskSha256: 'c'.repeat(64) })],
      intendedUse: MUSCIMA_RESEARCH_INTENDED_USE.NONCOMMERCIAL_RESEARCH,
    }),
    /exact mapped sample evidence/u,
  )

  assert.throws(
    () => assessMuscimaResearchTrainingAdmission({
      plans: [plan],
      approvals: [approvalFor(sample, { sampleId: 'muscima:unknown' })],
      intendedUse: MUSCIMA_RESEARCH_INTENDED_USE.NONCOMMERCIAL_RESEARCH,
    }),
    /unknown mapped sample/u,
  )
})

test('Package 8B-T4 approval is strict, immutable and uses a separate research scope', () => {
  const sample = page().mappedSamples[0]
  const approval = approvalFor(sample)

  assert.equal(approval.scope, 'audiveris_classifier_research_sample')
  assert.ok(Object.isFrozen(approval))
  assert.ok(isMuscimaResearchSampleApproval(approval))
  assert.equal('teacherApproved' in approval, false)
  assert.equal('productionAuthorized' in approval, false)

  assert.throws(() => approvalFor(sample, { scope: 'audiveris_training_sample' }), /scope/u)
  assert.throws(() => approvalFor(sample, { licenseProfileId: 'other' }), /licenseProfileId/u)
  assert.throws(() => approvalFor(sample, { approvedAt: '2026-08-29' }), /ISO-8601/u)
  assert.throws(() => createMuscimaResearchSampleApproval({ ...approval, extra: true }), /unsupported field/u)
  assert.equal(isMuscimaResearchSampleApproval({ ...approval }), false)
})

test('Package 8B-T4 duplicate approval identity or duplicate sample approval fails closed', () => {
  const plan = page({
    objects: [
      object(),
      object({ objectId: '88', className: 'accidentalNatural', width: 2, height: 2, maskRle: '1:4' }),
    ],
  })
  const [first, second] = plan.mappedSamples
  const a1 = approvalFor(first, { approvalId: 'same' })
  const a2 = approvalFor(second, { approvalId: 'same' })

  assert.throws(
    () => assessMuscimaResearchTrainingAdmission({
      plans: [plan], approvals: [a1, a2], intendedUse: MUSCIMA_RESEARCH_INTENDED_USE.NONCOMMERCIAL_RESEARCH,
    }),
    /approvalId must be unique/u,
  )

  const duplicateSample = approvalFor(first, { approvalId: 'different' })
  assert.throws(
    () => assessMuscimaResearchTrainingAdmission({
      plans: [plan], approvals: [approvalFor(first), duplicateSample], intendedUse: MUSCIMA_RESEARCH_INTENDED_USE.NONCOMMERCIAL_RESEARCH,
    }),
    /at most one/u,
  )
})

test('Package 8B-T4 preserves page-disjoint-only evaluation and never claims writer independence', () => {
  const report = assessMuscimaResearchTrainingAdmission({
    plans: [page({ split: 'evaluation' })],
    approvals: [],
    intendedUse: MUSCIMA_RESEARCH_INTENDED_USE.NONCOMMERCIAL_RESEARCH,
  })

  assert.equal(report.evaluationScope, 'page_disjoint_only')
  assert.equal(report.writerIndependentEvaluation, false)
  assert.equal('writerIndependent' in report, false)
})

test('Package 8B-T4 does not relax the T1 .omr requirement even when research preparation is ready', () => {
  const plan = page()
  const report = assessMuscimaResearchTrainingAdmission({
    plans: [plan],
    approvals: [approvalFor(plan.mappedSamples[0])],
    intendedUse: MUSCIMA_RESEARCH_INTENDED_USE.NONCOMMERCIAL_RESEARCH,
  })

  assert.equal(report.status, 'ready_for_isolated_samples_zip_build')
  assert.equal(report.t1OmrEvidenceSatisfied, false)
  assert.equal(report.t1TrainableSampleCount, 0)
  assert.deepEqual(report.t1Blockers, ['missing_omr_artifact'])
})

test('Package 8B-T4 rejects sparse, injected, accessor and unsupported assessment input', () => {
  const plans = [page()]
  plans.length = 2
  assert.throws(
    () => assessMuscimaResearchTrainingAdmission({
      plans, approvals: [], intendedUse: MUSCIMA_RESEARCH_INTENDED_USE.NONCOMMERCIAL_RESEARCH,
    }),
    /sparse/u,
  )

  assert.throws(
    () => assessMuscimaResearchTrainingAdmission({
      plans: [page()], approvals: [], intendedUse: 'personal_use',
    }),
    /unsupported/u,
  )

  assert.throws(
    () => assessMuscimaResearchTrainingAdmission({
      plans: [page()], approvals: [], intendedUse: MUSCIMA_RESEARCH_INTENDED_USE.NONCOMMERCIAL_RESEARCH, extra: true,
    }),
    /unsupported field/u,
  )

  const input = {
    plans: [page()],
    approvals: [],
    intendedUse: MUSCIMA_RESEARCH_INTENDED_USE.NONCOMMERCIAL_RESEARCH,
  }
  Object.defineProperty(input, 'intendedUse', { enumerable: true, get: () => 'noncommercial_research' })
  assert.throws(() => assessMuscimaResearchTrainingAdmission(input), /data property/u)
})

test('Package 8B-T4 report validator rejects semantically forged frozen states', () => {
  const plan = page()
  const valid = assessMuscimaResearchTrainingAdmission({
    plans: [plan],
    approvals: [],
    intendedUse: MUSCIMA_RESEARCH_INTENDED_USE.NONCOMMERCIAL_RESEARCH,
  })
  assert.ok(isMuscimaResearchAdmissionReport(valid))

  const forgedReady = Object.freeze({
    ...valid,
    status: MUSCIMA_RESEARCH_ADMISSION_STATUS.READY_FOR_ISOLATED_SAMPLES_ZIP_BUILD,
    researchExperimentAdmittedSampleCount: valid.mappedSampleCount,
    experimentBlockers: Object.freeze([]),
  })
  assert.equal(isMuscimaResearchAdmissionReport(forgedReady), false)

  const forgedBlocker = Object.freeze({
    ...valid,
    experimentBlockers: Object.freeze([MUSCIMA_RESEARCH_EXPERIMENT_BLOCKER.NONCOMMERCIAL_LICENSE_ONLY]),
  })
  assert.equal(isMuscimaResearchAdmissionReport(forgedBlocker), false)
})

test('Package 8B-T4 source is isolated from file writes, training execution and production OMR/deployment wiring', () => {
  const source = readFileSync(new URL('../scripts/audiverisMuscimaResearchTrainingAdmission.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /from ['"]node:fs['"]/u)
  assert.doesNotMatch(source, /from ['"]node:child_process['"]/u)
  assert.doesNotMatch(source, /fetch\s*\(/u)
  assert.doesNotMatch(source, /AudiverisProvider|HttpOmrProvider|omrService|gatewayProvider|render\.yaml|Dockerfile/u)
  assert.doesNotMatch(source, /writeFile|mkdir|spawn|execFile|train(?:Model|Network)|replace(?:Model|Classifier)/u)
})
