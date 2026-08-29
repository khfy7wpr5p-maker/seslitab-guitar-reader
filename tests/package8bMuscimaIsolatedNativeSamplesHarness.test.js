import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createMuscimaAccidentalPagePlan } from '../scripts/audiverisMuscimaAccidentalMapping.js'
import {
  MUSCIMA_RESEARCH_APPROVAL_SCOPE,
  MUSCIMA_RESEARCH_INTENDED_USE,
  MUSCIMA_RESEARCH_LICENSE_PROFILE,
  createMuscimaResearchSampleApproval,
} from '../scripts/audiverisMuscimaResearchTrainingAdmission.js'
import {
  AUDIVERIS_NATIVE_SAMPLE_REQUIREMENT,
  MUSCIMA_NATIVE_STAGING_BLOCKER,
  MUSCIMA_NATIVE_STAGING_STATUS,
  isMuscimaAudiverisNativeStagingReport,
  prepareMuscimaAudiverisNativeSampleStaging,
} from '../scripts/audiverisMuscimaIsolatedNativeSamplesHarness.js'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
const APPROVED_AT = '2026-08-29T11:00:00.000Z'

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

function approvalFor(sample, suffix = '') {
  return createMuscimaResearchSampleApproval({
    approvalId: `approval:${sample.sampleId}${suffix}`,
    sampleId: sample.sampleId,
    audiverisShape: sample.audiverisShape,
    maskSha256: sample.maskSha256,
    approvedBy: 'teacher-reviewer',
    approvedAt: APPROVED_AT,
    scope: MUSCIMA_RESEARCH_APPROVAL_SCOPE.AUDIVERIS_CLASSIFIER_RESEARCH_SAMPLE,
    licenseProfileId: MUSCIMA_RESEARCH_LICENSE_PROFILE.profileId,
  })
}

function nativeEvidenceFor(sample, overrides = {}) {
  return {
    sampleId: sample.sampleId,
    audiverisShape: sample.audiverisShape,
    maskRle: '0:1 1:3 0:2',
    interline: 20,
    ...overrides,
  }
}

test('Package 8B-T5 records the verified Audiveris native sample requirements without claiming serialization', () => {
  assert.deepEqual(AUDIVERIS_NATIVE_SAMPLE_REQUIREMENT, {
    upstreamRevision: '7a36078e7ba0c006052c1f661b949cf9b729f505',
    archiveFileName: 'samples.zip',
    perSheetEntryName: 'samples.xml',
    requiresShape: true,
    requiresInterline: true,
    requiresGlyphLocation: true,
    requiresRunTable: true,
  })
  assert.ok(Object.isFrozen(AUDIVERIS_NATIVE_SAMPLE_REQUIREMENT))
})

test('Package 8B-T5 current zero-approval state blocks before native evidence or zip preparation', () => {
  const report = prepareMuscimaAudiverisNativeSampleStaging({
    plans: [page()],
    approvals: [],
    intendedUse: MUSCIMA_RESEARCH_INTENDED_USE.NONCOMMERCIAL_RESEARCH,
  })

  assert.equal(report.status, MUSCIMA_NATIVE_STAGING_STATUS.BLOCKED_RESEARCH_ADMISSION)
  assert.equal(report.approvalCount, 0)
  assert.equal(report.nativeEvidenceCount, 0)
  assert.equal(report.samplesZipBuilt, false)
  assert.equal(report.trainingExecuted, false)
  assert.equal(report.manifest, null)
  assert.deepEqual(report.blockers, [MUSCIMA_NATIVE_STAGING_BLOCKER.RESEARCH_ADMISSION_NOT_READY])
  assert.ok(isMuscimaAudiverisNativeStagingReport(report))
})

test('Package 8B-T5 complete T4 approval still blocks when raw mask/interline native evidence is absent', () => {
  const plan = page()
  const sample = plan.mappedSamples[0]
  const report = prepareMuscimaAudiverisNativeSampleStaging({
    plans: [plan],
    approvals: [approvalFor(sample)],
    intendedUse: MUSCIMA_RESEARCH_INTENDED_USE.NONCOMMERCIAL_RESEARCH,
    nativeEvidence: [],
  })

  assert.equal(report.status, MUSCIMA_NATIVE_STAGING_STATUS.BLOCKED_NATIVE_EVIDENCE)
  assert.equal(report.missingNativeEvidenceCount, 1)
  assert.equal(report.manifest, null)
  assert.deepEqual(report.blockers, [MUSCIMA_NATIVE_STAGING_BLOCKER.MISSING_NATIVE_GLYPH_EVIDENCE])
  assert.ok(isMuscimaAudiverisNativeStagingReport(report))
})

test('Package 8B-T5 exact raw mask plus explicit interline yields serializer-ready staging only', () => {
  const plan = page()
  const sample = plan.mappedSamples[0]
  const report = prepareMuscimaAudiverisNativeSampleStaging({
    plans: [plan],
    approvals: [approvalFor(sample)],
    intendedUse: MUSCIMA_RESEARCH_INTENDED_USE.NONCOMMERCIAL_RESEARCH,
    nativeEvidence: [nativeEvidenceFor(sample)],
  })

  assert.equal(report.status, MUSCIMA_NATIVE_STAGING_STATUS.READY_FOR_AUDIVERIS_NATIVE_SERIALIZER)
  assert.equal(report.nativeEvidenceCount, 1)
  assert.equal(report.missingNativeEvidenceCount, 0)
  assert.equal(report.manifest.sampleCount, 1)
  assert.equal(report.manifest.entries[0].interline, 20)
  assert.equal(report.manifest.entries[0].maskSha256, sample.maskSha256)
  assert.match(report.manifestFingerprint, /^[0-9a-f]{64}$/u)
  assert.equal(report.samplesZipBuilt, false)
  assert.equal(report.trainingExecuted, false)
  assert.equal(report.t1TrainableSampleCount, 0)
  assert.equal(report.t1OmrEvidenceSatisfied, false)
  assert.equal(report.productionAuthorized, false)
  assert.equal(report.modelReplacementAuthorized, false)
  assert.deepEqual(report.blockers, [MUSCIMA_NATIVE_STAGING_BLOCKER.AUDIVERIS_NATIVE_SERIALIZER_REQUIRED])
  assert.ok(Object.isFrozen(report))
  assert.ok(Object.isFrozen(report.manifest))
  assert.ok(Object.isFrozen(report.manifest.entries))
  assert.ok(Object.isFrozen(report.manifest.entries[0]))
  assert.ok(isMuscimaAudiverisNativeStagingReport(report))
})

test('Package 8B-T5 exact decoded mask fingerprint is mandatory and cannot be substituted', () => {
  const plan = page()
  const sample = plan.mappedSamples[0]
  assert.throws(
    () => prepareMuscimaAudiverisNativeSampleStaging({
      plans: [plan],
      approvals: [approvalFor(sample)],
      intendedUse: MUSCIMA_RESEARCH_INTENDED_USE.NONCOMMERCIAL_RESEARCH,
      nativeEvidence: [nativeEvidenceFor(sample, { maskRle: '1:6' })],
    }),
    /exact T3 decoded-mask fingerprint/u,
  )
})

test('Package 8B-T5 never invents Audiveris interline evidence', () => {
  const plan = page()
  const sample = plan.mappedSamples[0]
  for (const interline of [0, -1, 1.5, '20', undefined]) {
    assert.throws(
      () => prepareMuscimaAudiverisNativeSampleStaging({
        plans: [plan],
        approvals: [approvalFor(sample)],
        intendedUse: MUSCIMA_RESEARCH_INTENDED_USE.NONCOMMERCIAL_RESEARCH,
        nativeEvidence: [nativeEvidenceFor(sample, { interline })],
      }),
      /positive safe integer/u,
    )
  }
})

test('Package 8B-T5 commercial and production intent remain blocked even if native evidence is supplied', () => {
  const plan = page()
  const sample = plan.mappedSamples[0]
  for (const intendedUse of [MUSCIMA_RESEARCH_INTENDED_USE.COMMERCIAL, MUSCIMA_RESEARCH_INTENDED_USE.PRODUCTION]) {
    const report = prepareMuscimaAudiverisNativeSampleStaging({
      plans: [plan],
      approvals: [approvalFor(sample)],
      intendedUse,
      nativeEvidence: [nativeEvidenceFor(sample)],
    })
    assert.equal(report.status, MUSCIMA_NATIVE_STAGING_STATUS.BLOCKED_RESEARCH_ADMISSION)
    assert.equal(report.nativeEvidenceCount, 0)
    assert.equal(report.samplesZipBuilt, false)
    assert.equal(report.productionAuthorized, false)
    assert.equal(report.modelReplacementAuthorized, false)
    assert.ok(isMuscimaAudiverisNativeStagingReport(report))
  }
})

test('Package 8B-T5 staging manifest and fingerprint are deterministic across native-evidence ordering', () => {
  const plan = page({
    objects: [
      object(),
      object({ objectId: '88', className: 'accidentalFlat', width: 2, height: 2, maskRle: '1:4' }),
    ],
  })
  const approvals = plan.mappedSamples.map((sample) => approvalFor(sample))
  const evidence = plan.mappedSamples.map((sample) => nativeEvidenceFor(sample, {
    maskRle: sample.sourceClass === 'accidentalFlat' ? '1:4' : '0:1 1:3 0:2',
  }))

  const first = prepareMuscimaAudiverisNativeSampleStaging({
    plans: [plan], approvals, intendedUse: MUSCIMA_RESEARCH_INTENDED_USE.NONCOMMERCIAL_RESEARCH, nativeEvidence: evidence,
  })
  const second = prepareMuscimaAudiverisNativeSampleStaging({
    plans: [plan], approvals: [...approvals].reverse(), intendedUse: MUSCIMA_RESEARCH_INTENDED_USE.NONCOMMERCIAL_RESEARCH,
    nativeEvidence: [...evidence].reverse(),
  })

  assert.deepEqual(first.manifest, second.manifest)
  assert.equal(first.manifestFingerprint, second.manifestFingerprint)
})

test('Package 8B-T5 duplicate, unknown, wrong-shape, sparse and accessor native evidence fails closed', () => {
  const plan = page()
  const sample = plan.mappedSamples[0]
  const approval = approvalFor(sample)
  const base = {
    plans: [plan], approvals: [approval], intendedUse: MUSCIMA_RESEARCH_INTENDED_USE.NONCOMMERCIAL_RESEARCH,
  }

  assert.throws(
    () => prepareMuscimaAudiverisNativeSampleStaging({ ...base, nativeEvidence: [nativeEvidenceFor(sample), nativeEvidenceFor(sample)] }),
    /duplicate sampleId/u,
  )
  assert.throws(
    () => prepareMuscimaAudiverisNativeSampleStaging({ ...base, nativeEvidence: [nativeEvidenceFor(sample, { sampleId: 'muscima:unknown' })] }),
    /unknown mapped sample/u,
  )
  assert.throws(
    () => prepareMuscimaAudiverisNativeSampleStaging({ ...base, nativeEvidence: [nativeEvidenceFor(sample, { audiverisShape: 'FLAT' })] }),
    /shape does not bind/u,
  )

  const sparse = [nativeEvidenceFor(sample)]
  sparse.length = 2
  assert.throws(() => prepareMuscimaAudiverisNativeSampleStaging({ ...base, nativeEvidence: sparse }), /sparse/u)

  const accessor = nativeEvidenceFor(sample)
  Object.defineProperty(accessor, 'interline', { enumerable: true, get: () => 20 })
  assert.throws(() => prepareMuscimaAudiverisNativeSampleStaging({ ...base, nativeEvidence: [accessor] }), /data property/u)
})

test('Package 8B-T5 report validator rejects forged serializer-ready or authorization state', () => {
  const plan = page()
  const sample = plan.mappedSamples[0]
  const valid = prepareMuscimaAudiverisNativeSampleStaging({
    plans: [plan],
    approvals: [approvalFor(sample)],
    intendedUse: MUSCIMA_RESEARCH_INTENDED_USE.NONCOMMERCIAL_RESEARCH,
    nativeEvidence: [nativeEvidenceFor(sample)],
  })
  assert.ok(isMuscimaAudiverisNativeStagingReport(valid))

  const forged = Object.freeze({ ...valid, productionAuthorized: true })
  assert.equal(isMuscimaAudiverisNativeStagingReport(forged), false)
  const forgedZip = Object.freeze({ ...valid, samplesZipBuilt: true })
  assert.equal(isMuscimaAudiverisNativeStagingReport(forgedZip), false)
  const forgedFingerprint = Object.freeze({ ...valid, manifestFingerprint: 'c'.repeat(64) })
  assert.equal(isMuscimaAudiverisNativeStagingReport(forgedFingerprint), false)
})

test('Package 8B-T5 keeps page-disjoint evaluation and T1 .omr/production boundaries unchanged', () => {
  const plan = page({ split: 'evaluation' })
  const sample = plan.mappedSamples[0]
  const report = prepareMuscimaAudiverisNativeSampleStaging({
    plans: [plan],
    approvals: [approvalFor(sample)],
    intendedUse: MUSCIMA_RESEARCH_INTENDED_USE.NONCOMMERCIAL_RESEARCH,
    nativeEvidence: [nativeEvidenceFor(sample)],
  })
  assert.equal(report.evaluationScope, 'page_disjoint_only')
  assert.equal(report.writerIndependentEvaluation, false)
  assert.equal(report.t1OmrEvidenceSatisfied, false)
  assert.equal(report.t1TrainableSampleCount, 0)
  assert.equal(report.samplesZipBuilt, false)
  assert.equal(report.trainingExecuted, false)
})

test('Package 8B-T5 source is isolated from file writes, training execution and production OMR/deployment wiring', () => {
  const source = readFileSync(new URL('../scripts/audiverisMuscimaIsolatedNativeSamplesHarness.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /from ['"]node:fs['"]/u)
  assert.doesNotMatch(source, /from ['"]node:child_process['"]/u)
  assert.doesNotMatch(source, /fetch\s*\(/u)
  assert.doesNotMatch(source, /AudiverisProvider|HttpOmrProvider|omrService|gatewayProvider|render\.yaml|Dockerfile/u)
  assert.doesNotMatch(source, /writeFile|mkdir|spawn|execFile|train(?:Model|Network)|replace(?:Model|Classifier)/u)
})
