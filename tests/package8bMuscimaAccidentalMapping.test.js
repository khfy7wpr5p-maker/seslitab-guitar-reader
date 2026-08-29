import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  MUSCIMA_ACCIDENTAL_MAPPING_STATUS,
  MUSCIMA_ACCIDENTAL_SOURCE_TO_AUDIVERIS_SHAPE,
  MUSCIMA_ACCIDENTAL_T1_BLOCKER,
  MUSCIMA_EVALUATION_SCOPE,
  assignDeterministicPageSplits,
  createMuscimaAccidentalPagePlan,
  isMuscimaAccidentalPagePlan,
  summarizeMuscimaAccidentalPlans,
} from '../scripts/audiverisMuscimaAccidentalMapping.js'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)

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
  return {
    pageId: 'accidentals-001',
    pageImageSha256: A,
    annotationXmlSha256: B,
    imageWidth: 100,
    imageHeight: 200,
    split: 'train',
    objects: [object()],
    ...overrides,
  }
}

test('Package 8B-T3 accidental vocabulary maps only the five bounded Audiveris classifier shapes', () => {
  assert.deepEqual(MUSCIMA_ACCIDENTAL_SOURCE_TO_AUDIVERIS_SHAPE, {
    accidentalSharp: 'SHARP',
    accidentalFlat: 'FLAT',
    accidentalNatural: 'NATURAL',
    accidentalDoubleSharp: 'DOUBLE_SHARP',
    accidentalDoubleFlat: 'DOUBLE_FLAT',
  })
  assert.ok(Object.isFrozen(MUSCIMA_ACCIDENTAL_SOURCE_TO_AUDIVERIS_SHAPE))
})

test('Package 8B-T3 maps supported accidental evidence and ignores unrelated MUSCIMA classes', () => {
  const plan = createMuscimaAccidentalPagePlan(page({
    objects: [
      object(),
      object({ objectId: '88', className: 'stem', width: 1, height: 2, maskRle: '1:2' }),
      object({ objectId: '89', className: 'accidentalFlat', width: 2, height: 2, maskRle: '1:4' }),
    ],
  }))
  assert.equal(plan.mappedSamples.length, 2)
  assert.equal(plan.ignoredObjectCount, 1)
  assert.deepEqual(plan.mappedSamples.map((sample) => sample.audiverisShape).sort(), ['FLAT', 'SHARP'])
  assert.equal(plan.evaluationScope, MUSCIMA_EVALUATION_SCOPE.PAGE_DISJOINT_ONLY)
  assert.ok(isMuscimaAccidentalPagePlan(plan))
  assert.ok(Object.isFrozen(plan))
  assert.ok(Object.isFrozen(plan.mappedSamples))
})

test('Package 8B-T3 never promotes mapped evidence to T1 trainability or production authorization', () => {
  const sample = createMuscimaAccidentalPagePlan(page()).mappedSamples[0]
  assert.equal(sample.status, MUSCIMA_ACCIDENTAL_MAPPING_STATUS.MAPPED_EXPERIMENTAL)
  assert.deepEqual(sample.t1Blockers, [
    MUSCIMA_ACCIDENTAL_T1_BLOCKER.MISSING_OMR_ARTIFACT,
    MUSCIMA_ACCIDENTAL_T1_BLOCKER.MISSING_TRAINING_APPROVAL,
    MUSCIMA_ACCIDENTAL_T1_BLOCKER.EXTERNAL_LICENSE_REVIEW_REQUIRED,
  ])
  assert.ok(Object.isFrozen(sample.t1Blockers))
})

test('Package 8B-T3 accidental bbox must remain inside the exact declared page', () => {
  assert.throws(
    () => createMuscimaAccidentalPagePlan(page({ objects: [object({ left: 99, width: 2 })] })),
    /bounds/u,
  )
  assert.throws(
    () => createMuscimaAccidentalPagePlan(page({ objects: [object({ top: 199, height: 2 })] })),
    /bounds/u,
  )
})

test('Package 8B-T3 mask RLE must cover exactly width x height and use only binary positive runs', () => {
  assert.throws(
    () => createMuscimaAccidentalPagePlan(page({ objects: [object({ maskRle: '1:5' })] })),
    /exact declared glyph bounds/u,
  )
  assert.throws(
    () => createMuscimaAccidentalPagePlan(page({ objects: [object({ maskRle: '1:7' })] })),
    /exceeds/u,
  )
  assert.throws(
    () => createMuscimaAccidentalPagePlan(page({ objects: [object({ maskRle: '2:6' })] })),
    /invalid run token/u,
  )
  assert.throws(
    () => createMuscimaAccidentalPagePlan(page({ objects: [object({ maskRle: '1:0 0:6' })] })),
    /invalid run token/u,
  )
})

test('Package 8B-T3 mask fingerprint binds decoded pixels, not caller formatting', () => {
  const first = createMuscimaAccidentalPagePlan(page({ objects: [object({ maskRle: '0:1 1:3 0:2' })] })).mappedSamples[0]
  const second = createMuscimaAccidentalPagePlan(page({ objects: [object({ maskRle: '0:1 1:1 1:2 0:2' })] })).mappedSamples[0]
  assert.equal(first.maskSha256, second.maskSha256)
  assert.equal(first.sampleId, second.sampleId)
})

test('Package 8B-T3 duplicate object identity fails closed even when one object would be ignored', () => {
  assert.throws(
    () => createMuscimaAccidentalPagePlan(page({
      objects: [object(), object({ className: 'stem' })],
    })),
    /unique/u,
  )
})

test('Package 8B-T3 rejects sparse, injected, accessor, malformed and coercible input', () => {
  const sparse = [object()]
  sparse.length = 2
  assert.throws(() => createMuscimaAccidentalPagePlan(page({ objects: sparse })), /sparse/u)

  assert.throws(() => createMuscimaAccidentalPagePlan({ ...page(), extra: true }), /unsupported field/u)
  assert.throws(() => createMuscimaAccidentalPagePlan(page({ imageWidth: '100' })), /safe integer/u)
  assert.throws(() => createMuscimaAccidentalPagePlan(page({ split: 'test' })), /train or evaluation/u)

  const withAccessor = page()
  Object.defineProperty(withAccessor, 'pageId', { enumerable: true, get: () => 'forged' })
  assert.throws(() => createMuscimaAccidentalPagePlan(withAccessor), /data property/u)
})

test('Package 8B-T3 deterministic split is page-disjoint and caller-bounded', () => {
  const pageIds = Array.from({ length: 100 }, (_, index) => `page-${String(index + 1).padStart(3, '0')}`)
  const first = assignDeterministicPageSplits(pageIds, 20)
  const second = assignDeterministicPageSplits([...pageIds].reverse(), 20)
  assert.deepEqual(first, second)
  assert.equal(Object.values(first).filter((split) => split === 'train').length, 80)
  assert.equal(Object.values(first).filter((split) => split === 'evaluation').length, 20)
  assert.ok(Object.isFrozen(first))
  assert.throws(() => assignDeterministicPageSplits(pageIds, 0), /at least one train/u)
  assert.throws(() => assignDeterministicPageSplits(pageIds, 100), /at least one train/u)
  assert.throws(() => assignDeterministicPageSplits(['x', 'x'], 1), /unique/u)
})

test('Package 8B-T3 split never claims writer-independent evaluation', () => {
  const plan = createMuscimaAccidentalPagePlan(page({ split: 'evaluation' }))
  assert.equal(plan.evaluationScope, 'page_disjoint_only')
  assert.equal('writerIndependent' in plan, false)
})

test('Package 8B-T3 summary is deterministic and keeps T1 trainable count at zero', () => {
  const p1 = createMuscimaAccidentalPagePlan(page({ pageId: 'p1', objects: [object()] }))
  const p2 = createMuscimaAccidentalPagePlan(page({
    pageId: 'p2',
    pageImageSha256: 'c'.repeat(64),
    annotationXmlSha256: 'd'.repeat(64),
    split: 'evaluation',
    objects: [object({ className: 'accidentalDoubleFlat' })],
  }))
  const summary = summarizeMuscimaAccidentalPlans([p1, p2])
  assert.equal(summary.pageCount, 2)
  assert.equal(summary.mappedSampleCount, 2)
  assert.equal(summary.t1TrainableSampleCount, 0)
  assert.deepEqual(summary.splitCounts, { train: 1, evaluation: 1 })
  assert.deepEqual(summary.classCounts, { DOUBLE_FLAT: 1, SHARP: 1 })
  assert.ok(Object.isFrozen(summary))
  assert.ok(Object.isFrozen(summary.classCounts))
})

test('Package 8B-T3 summary rejects duplicate pages and forged mutable plans', () => {
  const plan = createMuscimaAccidentalPagePlan(page())
  assert.throws(() => summarizeMuscimaAccidentalPlans([plan, plan]), /duplicate pageId/u)
  assert.throws(() => summarizeMuscimaAccidentalPlans([{ ...plan }]), /invalid page plan/u)
})

test('Package 8B-T3 plan validator rejects mutable or semantically forged evidence', () => {
  const plan = createMuscimaAccidentalPagePlan(page())
  assert.equal(isMuscimaAccidentalPagePlan({ ...plan }), false)

  const forgedSample = Object.freeze({
    ...plan.mappedSamples[0],
    audiverisShape: 'NATURAL',
  })
  const forged = Object.freeze({
    ...plan,
    mappedSamples: Object.freeze([forgedSample]),
  })
  assert.equal(isMuscimaAccidentalPagePlan(forged), false)
})

test('Package 8B-T3 source is isolated from production OMR/model/deployment and write-capable boundaries', () => {
  const source = readFileSync(new URL('../scripts/audiverisMuscimaAccidentalMapping.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /from ['"]node:fs['"]/u)
  assert.doesNotMatch(source, /from ['"]node:child_process['"]/u)
  assert.doesNotMatch(source, /fetch\s*\(/u)
  assert.doesNotMatch(source, /AudiverisProvider|HttpOmrProvider|omrService|gatewayProvider|render\.yaml|Dockerfile/u)
  assert.doesNotMatch(source, /train(?:Model|Network)|replace(?:Model|Classifier)/u)
})
