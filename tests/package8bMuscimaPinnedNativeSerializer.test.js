import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { createMuscimaAccidentalPagePlan } from '../scripts/audiverisMuscimaAccidentalMapping.js'
import {
  MUSCIMA_RESEARCH_APPROVAL_SCOPE,
  MUSCIMA_RESEARCH_INTENDED_USE,
  MUSCIMA_RESEARCH_LICENSE_PROFILE,
  createMuscimaResearchSampleApproval,
} from '../scripts/audiverisMuscimaResearchTrainingAdmission.js'
import {
  MUSCIMA_NATIVE_STAGING_STATUS,
  prepareMuscimaAudiverisNativeSampleStaging,
} from '../scripts/audiverisMuscimaIsolatedNativeSamplesHarness.js'
import {
  AUDIVERIS_PINNED_ACCEPTANCE_PROBE,
  AUDIVERIS_PINNED_NATIVE_SERIALIZER_BLOCKER,
  AUDIVERIS_PINNED_NATIVE_SERIALIZER_STATUS,
  AUDIVERIS_PINNED_REVISION,
  bindPinnedAudiverisAcceptance,
  buildMuscimaAudiverisNativeSamplesArchive,
  isPinnedAudiverisAcceptanceReport,
  isPinnedAudiverisNativeArchiveBuild,
} from '../scripts/audiverisMuscimaPinnedNativeSerializer.js'

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

function approvalFor(sample) {
  return createMuscimaResearchSampleApproval({
    approvalId: `approval:${sample.sampleId}`,
    sampleId: sample.sampleId,
    audiverisShape: sample.audiverisShape,
    maskSha256: sample.maskSha256,
    approvedBy: 'teacher-reviewer',
    approvedAt: APPROVED_AT,
    scope: MUSCIMA_RESEARCH_APPROVAL_SCOPE.AUDIVERIS_CLASSIFIER_RESEARCH_SAMPLE,
    licenseProfileId: MUSCIMA_RESEARCH_LICENSE_PROFILE.profileId,
  })
}

function stagingReady(overrides = {}) {
  const plan = page(overrides)
  const approvals = plan.mappedSamples.map(approvalFor)
  const nativeEvidence = plan.mappedSamples.map((sample) => ({
    sampleId: sample.sampleId,
    audiverisShape: sample.audiverisShape,
    maskRle: sample.sourceClass === 'accidentalFlat' ? '1:4' : '0:1 1:3 0:2',
    interline: 20,
  }))
  const staging = prepareMuscimaAudiverisNativeSampleStaging({
    plans: [plan],
    approvals,
    intendedUse: MUSCIMA_RESEARCH_INTENDED_USE.NONCOMMERCIAL_RESEARCH,
    nativeEvidence,
  })
  assert.equal(staging.status, MUSCIMA_NATIVE_STAGING_STATUS.READY_FOR_AUDIVERIS_NATIVE_SERIALIZER)
  return staging
}

function probeFor(build, overrides = {}) {
  return {
    probeKind: AUDIVERIS_PINNED_ACCEPTANCE_PROBE.kind,
    probeApi: AUDIVERIS_PINNED_ACCEPTANCE_PROBE.api,
    upstreamRevision: AUDIVERIS_PINNED_REVISION,
    archiveSha256: build.report.archiveSha256,
    repositoryLoaded: true,
    loadedSampleCount: build.report.sampleCount,
    ...overrides,
  }
}

test('Package 8B-T6 blocks real/current non-ready T5 evidence without producing bytes', async () => {
  const plan = page()
  const staging = prepareMuscimaAudiverisNativeSampleStaging({
    plans: [plan],
    approvals: [],
    intendedUse: MUSCIMA_RESEARCH_INTENDED_USE.NONCOMMERCIAL_RESEARCH,
  })
  const build = await buildMuscimaAudiverisNativeSamplesArchive(staging)
  assert.equal(build.archiveBytes, null)
  assert.equal(build.report.status, AUDIVERIS_PINNED_NATIVE_SERIALIZER_STATUS.BLOCKED_STAGING_INPUT)
  assert.equal(build.report.samplesZipBuilt, false)
  assert.equal(build.report.pinnedAudiverisAccepted, false)
  assert.equal(build.report.trainingExecuted, false)
  assert.deepEqual(build.report.blockers, [AUDIVERIS_PINNED_NATIVE_SERIALIZER_BLOCKER.T5_SERIALIZER_READY_REPORT_REQUIRED])
  assert.ok(isPinnedAudiverisNativeArchiveBuild(build.report))
})

test('Package 8B-T6 serializes exact T5 evidence into the pinned Audiveris container/samples/run-table contract', async () => {
  const build = await buildMuscimaAudiverisNativeSamplesArchive(stagingReady())
  assert.equal(build.report.status, AUDIVERIS_PINNED_NATIVE_SERIALIZER_STATUS.ARCHIVE_BUILT_PENDING_PINNED_ACCEPTANCE)
  assert.ok(Buffer.isBuffer(build.archiveBytes))
  assert.match(build.report.archiveSha256, /^[0-9a-f]{64}$/u)
  assert.equal(build.report.sampleCount, 1)
  assert.equal(build.report.sheetCount, 1)
  assert.equal(build.report.samplesZipBuilt, true)
  assert.equal(build.report.pinnedAudiverisAccepted, false)
  assert.equal(build.report.trainingExecuted, false)
  assert.equal(build.report.productionAuthorized, false)
  assert.equal(build.report.modelReplacementAuthorized, false)
  assert.ok(isPinnedAudiverisNativeArchiveBuild(build.report))

  const zip = await JSZip.loadAsync(build.archiveBytes)
  const paths = Object.keys(zip.files).sort()
  assert.equal(paths.length, 2)
  assert.equal(paths[0], 'META-INF/container.xml')
  assert.match(paths[1], /^SESLITAB_MUSCIMA_[0-9a-f]{64}\/samples\.xml$/u)

  const containerXml = await zip.file('META-INF/container.xml').async('string')
  const samplesXml = await zip.file(paths[1]).async('string')
  const sheetName = paths[1].split('/')[0]
  assert.match(containerXml, new RegExp(`<sheet name="${sheetName}"/>`, 'u'))
  assert.match(samplesXml, new RegExp(`<samples sheet-name="${sheetName}">`, 'u'))
  assert.match(samplesXml, /<sample id="1" shape="SHARP" interline="20" left="20" top="10">/u)
  assert.match(samplesXml, /<run-table orientation="HORIZONTAL" width="3" height="2">/u)
  assert.match(samplesXml, /<runs>0 1 2<\/runs>/u)
  assert.match(samplesXml, /<runs>1<\/runs>/u)
})

test('Package 8B-T6 preserves internal all-background rows as explicit empty RunTable sequences', async () => {
  const staging = stagingReady({
    objects: [object({ width: 3, height: 3, maskRle: '1:1 0:7 1:1' })],
  })
  const build = await buildMuscimaAudiverisNativeSamplesArchive(staging)
  const zip = await JSZip.loadAsync(build.archiveBytes)
  const samplesPath = Object.keys(zip.files).find((path) => path.endsWith('/samples.xml'))
  const xml = await zip.file(samplesPath).async('string')
  const emptyRuns = xml.match(/<runs\/>/gu) ?? []
  assert.equal(emptyRuns.length, 1)
})

test('Package 8B-T6 archive bytes and fingerprint are deterministic for identical serializer-ready evidence', async () => {
  const staging = stagingReady({
    objects: [
      object(),
      object({ objectId: '88', className: 'accidentalFlat', width: 2, height: 2, maskRle: '1:4' }),
    ],
  })
  const first = await buildMuscimaAudiverisNativeSamplesArchive(staging)
  const second = await buildMuscimaAudiverisNativeSamplesArchive(staging)
  assert.equal(first.report.archiveSha256, second.report.archiveSha256)
  assert.deepEqual(first.archiveBytes, second.archiveBytes)
})

test('Package 8B-T6 requires real pinned SampleRepository receipt binding before acceptance', async () => {
  const build = await buildMuscimaAudiverisNativeSamplesArchive(stagingReady())
  const accepted = bindPinnedAudiverisAcceptance(build, probeFor(build))
  assert.equal(accepted.status, AUDIVERIS_PINNED_NATIVE_SERIALIZER_STATUS.ACCEPTED_BY_PINNED_AUDIVERIS)
  assert.equal(accepted.pinnedAudiverisAccepted, true)
  assert.equal(accepted.archiveSha256, build.report.archiveSha256)
  assert.equal(accepted.stagingManifestFingerprint, build.report.stagingManifestFingerprint)
  assert.equal(accepted.loadedSampleCount, build.report.sampleCount)
  assert.equal(accepted.trainingExecuted, false)
  assert.equal(accepted.productionAuthorized, false)
  assert.equal(accepted.modelReplacementAuthorized, false)
  assert.deepEqual(accepted.blockers, [])
  assert.ok(isPinnedAudiverisAcceptanceReport(accepted))
})

test('Package 8B-T6 rejects stale revision, wrong archive/count, failed load and wrong probe API', async () => {
  const build = await buildMuscimaAudiverisNativeSamplesArchive(stagingReady())
  const cases = [
    [{ upstreamRevision: 'c'.repeat(64) }, /exact pinned Audiveris revision/u],
    [{ archiveSha256: 'd'.repeat(64) }, /exact archive SHA-256/u],
    [{ loadedSampleCount: build.report.sampleCount + 1 }, /loaded sample count/u],
    [{ repositoryLoaded: false }, /did not report a loaded repository/u],
    [{ probeApi: 'ZipFileSystem.open' }, /required SampleRepository probe contract/u],
  ]
  for (const [overrides, pattern] of cases) {
    assert.throws(() => bindPinnedAudiverisAcceptance(build, probeFor(build, overrides)), pattern)
  }
})

test('Package 8B-T6 detects archive mutation after build and cannot bind acceptance to changed bytes', async () => {
  const build = await buildMuscimaAudiverisNativeSamplesArchive(stagingReady())
  const mutatedBytes = Buffer.from(build.archiveBytes)
  mutatedBytes[0] ^= 0xff
  const mutatedBuild = Object.freeze({ report: build.report, archiveBytes: mutatedBytes })
  assert.throws(() => bindPinnedAudiverisAcceptance(mutatedBuild, probeFor(build)), /archive bytes do not bind/u)
})

test('Package 8B-T6 validators reject forged accepted/authorized reports', async () => {
  const build = await buildMuscimaAudiverisNativeSamplesArchive(stagingReady())
  const accepted = bindPinnedAudiverisAcceptance(build, probeFor(build))
  assert.ok(isPinnedAudiverisAcceptanceReport(accepted))
  assert.equal(isPinnedAudiverisAcceptanceReport(Object.freeze({ ...accepted, productionAuthorized: true })), false)
  assert.equal(isPinnedAudiverisAcceptanceReport(Object.freeze({ ...accepted, trainingExecuted: true })), false)
  assert.equal(isPinnedAudiverisAcceptanceReport(Object.freeze({ ...accepted, archiveSha256: 'e'.repeat(64) })), true)
  // A structurally valid report cannot authenticate itself; operational trust is
  // provided only by the real probe runner. Domain binding still prevents using
  // that forged digest with the original archive bytes.
  assert.throws(
    () => bindPinnedAudiverisAcceptance(
      Object.freeze({ report: Object.freeze({ ...build.report, archiveSha256: 'e'.repeat(64) }), archiveBytes: build.archiveBytes }),
      probeFor(build, { archiveSha256: 'e'.repeat(64) }),
    ),
    /archive bytes do not bind/u,
  )
})

test('Package 8B-T6 acceptance runner is pinned to the real SampleRepository API and stays outside production wiring', () => {
  const runner = readFileSync(new URL('../scripts/runPinnedAudiverisSampleRepositoryAcceptance.js', import.meta.url), 'utf8')
  assert.match(runner, /SampleRepository\.getInstance\(archive, true\)/u)
  assert.match(runner, /repo\.getAllSamples\(\)\.size\(\)/u)
  assert.match(runner, new RegExp(AUDIVERIS_PINNED_REVISION, 'u'))
  for (const forbidden of [
    '../backend/', 'Dockerfile', 'render.yaml', 'classifier.train', 'modelReplacementAuthorized: true',
  ]) {
    assert.equal(runner.includes(forbidden), false)
  }
})

test('Package 8B-T6 serializer does not import or call production OMR/runtime/deployment surfaces', () => {
  const source = readFileSync(new URL('../scripts/audiverisMuscimaPinnedNativeSerializer.js', import.meta.url), 'utf8')
  for (const forbidden of [
    '../backend/', 'omrProvider', 'cloudO', 'render.yaml', 'Dockerfile', 'trainingExecuted: true',
    'productionAuthorized: true', 'modelReplacementAuthorized: true',
  ]) {
    assert.equal(source.includes(forbidden), false)
  }
})
