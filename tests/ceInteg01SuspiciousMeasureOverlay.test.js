import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import test from 'node:test'

import {
  SCORE_RENDERER_REVISION,
  verifyRuntimeFeatureSources,
} from '../scripts/prepareScoreRuntime.js'
import * as rendererConsumer from '../src/services/scoreRendererConsumer.js'
import { preparePinnedRuntime } from '../scripts/preparePinnedRuntime.js'
import { syncCorrectionMeasureOverlays } from '../src/scoreViewUi.js'

const EXPECTED_RENDERER_REVISION = '3955250a0a1407d3a13de5f72b106b5234db10b6'
const analysisPreparerUrl = new URL('../scripts/prepareCeAnalysisRuntime.js', import.meta.url)
const analysisConsumerUrl = new URL('../src/services/correctionAnalysisConsumer.js', import.meta.url)
const overlayUrl = new URL('../src/services/correctionMeasureOverlay.js', import.meta.url)

test('CE-INTEG-01 pins the reviewed renderer revision with whole-measure presentation support', () => {
  assert.equal(SCORE_RENDERER_REVISION, EXPECTED_RENDERER_REVISION)
  assert.equal(rendererConsumer.ST_SCORE_RENDERER_REVIEWED_REVISION, EXPECTED_RENDERER_REVISION)

  assert.throws(
    () => verifyRuntimeFeatureSources({
      bootstrap: 'runtimeHost.hitTestNoteDetailed(payload)',
      browserHost: 'return { renderEpoch: currentEpoch }',
    }),
    /measure highlight/i,
  )
})

test('renderer consumer exposes bounded whole-measure highlight and clear calls', async () => {
  assert.equal(typeof rendererConsumer.highlightScoreMeasure, 'function')
  assert.equal(typeof rendererConsumer.clearScoreMeasureHighlights, 'function')

  const calls = []
  const host = {
    async highlightMeasure(payload) { calls.push(['highlight', payload]) },
    async clearMeasureHighlights() { calls.push(['clear']) },
  }

  await rendererConsumer.highlightScoreMeasure(host, { partId: 'P1', measureIndex: 3 })
  assert.deepEqual(calls[0], [
    'highlight',
    { target: { partId: 'P1', measureIndex: 3 }, className: 'st-score-suspicious-measure' },
  ])
  assert.equal(await rendererConsumer.clearScoreMeasureHighlights(host), true)
  assert.deepEqual(calls[1], ['clear'])
  await assert.rejects(
    () => rendererConsumer.highlightScoreMeasure(host, { partId: 'P1', measureIndex: -1 }),
    RangeError,
  )
})

test('CE analysis runtime has a separate exact-source-bound preparation lane', async () => {
  assert.equal(existsSync(analysisPreparerUrl), true)
  if (!existsSync(analysisPreparerUrl)) return

  const preparer = await import(analysisPreparerUrl)
  assert.equal(preparer.CE_ANALYSIS_REVISION, 'bdaeb1e6fec8aee27d1cc72347f5be735af3cf30')
  assert.equal(preparer.CE_ANALYSIS_BROWSER_CONTRACT, 'ST_OMR_CORRECTION_ENGINE_ANALYSIS_BROWSER')
  assert.equal(preparer.CE_ANALYSIS_BROWSER_CONTRACT_VERSION, '1.0.0')
  assert.equal(preparer.CE_ANALYSIS_RUNTIME_VERSION, '1.0.0')
  assert.equal(preparer.CE_ANALYSIS_RUNTIME_GLOBAL, 'STOmrCorrectionAnalysisRuntime')
  assert.equal(preparer.CE_ANALYSIS_ARTIFACT_SHA256, '2fb9762d05d6164f9a595736adc58fed08a7b40733b969cd54bd7db41bbb41aa')

  const manifest = {
    contract: preparer.CE_ANALYSIS_BROWSER_CONTRACT,
    contractVersion: preparer.CE_ANALYSIS_BROWSER_CONTRACT_VERSION,
    runtimeVersion: preparer.CE_ANALYSIS_RUNTIME_VERSION,
    engineSourceRevision: preparer.CE_ANALYSIS_REVISION,
    artifact: 'ce-analysis-browser-runtime.js',
    format: 'iife',
    target: 'es2022',
    global: preparer.CE_ANALYSIS_RUNTIME_GLOBAL,
    externalImports: 0,
    networkCapable: false,
    persistenceCapable: false,
    authenticationAuthority: false,
    automaticApplyAuthority: false,
    learningAuthority: false,
    musicXmlWriteBackAuthority: false,
    bytes: 3,
    sha256: 'a'.repeat(64),
  }
  assert.equal(preparer.verifyCeAnalysisRuntimeManifest(manifest), manifest)
  const artifact = Buffer.from('abc')
  const artifactManifest = {
    ...manifest,
    bytes: artifact.byteLength,
    sha256: createHash('sha256').update(artifact).digest('hex'),
  }
  assert.throws(
    () => preparer.verifyCeAnalysisRuntimeArtifact(artifactManifest, artifact),
    /reviewed artifact digest mismatch/i,
  )

  const unsafe = { ...manifest, automaticApplyAuthority: true }
  assert.throws(() => preparer.verifyCeAnalysisRuntimeManifest(unsafe), /forbidden authority/i)
})

test('shared pinned runtime preparer is deterministic, verifies bytes, writes provenance and always cleans up', async () => {
  const artifact = Buffer.from('runtime-bytes')
  const digest = createHash('sha256').update(artifact).digest('hex')
  const manifest = {
    contract: 'TEST_CONTRACT',
    contractVersion: '1.0.0',
    runtimeVersion: '1.0.0',
    engineSourceRevision: 'a'.repeat(40),
    artifact: 'runtime.js',
    format: 'iife',
    target: 'es2022',
    global: 'TestRuntime',
    externalImports: 0,
    networkCapable: false,
    automaticApplyAuthority: false,
    bytes: artifact.byteLength,
    sha256: digest,
  }
  const spec = {
    label: 'Test browser',
    repository: 'https://example.invalid/repo.git',
    revision: 'a'.repeat(40),
    repoRoot: '/repo',
    buildRoot: '/repo/.build',
    checkoutRoot: '/repo/.build/engine',
    generatedRuntimeRoot: '/repo/.build/engine/dist/browser',
    publicRuntimeRoot: '/repo/public/runtime',
    buildScript: 'build:browser',
    artifactName: 'runtime.js',
    manifestName: 'runtime.manifest.json',
    provenanceName: 'provenance.json',
    contract: 'TEST_CONTRACT',
    contractVersion: '1.0.0',
    runtimeVersion: '1.0.0',
    global: 'TestRuntime',
    sourceRevisionField: 'engineSourceRevision',
    provenanceRevisionField: 'engineSourceRevision',
    reviewedArtifactSha256: digest,
    forbiddenFlags: ['networkCapable', 'automaticApplyAuthority'],
  }
  const calls = []
  const writes = []
  const io = {
    async rm(...args) { calls.push(['rm', ...args]) },
    async mkdir(...args) { calls.push(['mkdir', ...args]) },
    async cp(...args) { calls.push(['cp', ...args]) },
    async readFile(filePath) {
      calls.push(['readFile', filePath])
      return filePath.endsWith('runtime.manifest.json')
        ? Buffer.from(JSON.stringify(manifest))
        : artifact
    },
    async writeFile(...args) { writes.push(args); calls.push(['writeFile', args[0]]) },
    run(...args) { calls.push(['run', ...args]) },
  }

  const result = await preparePinnedRuntime(spec, { io })
  assert.deepEqual(result, {
    destination: spec.publicRuntimeRoot,
    revision: spec.revision,
    runtimeVersion: '1.0.0',
    artifactSha256: digest,
  })
  assert.equal(calls.filter((entry) => entry[0] === 'run').length, 6)
  assert.equal(calls.filter((entry) => entry[0] === 'rm' && entry[1] === spec.buildRoot).length, 2)
  assert.equal(writes.length, 1)
  const provenance = JSON.parse(writes[0][1])
  assert.equal(provenance.engineSourceRevision, spec.revision)
  assert.equal(provenance.files[0].sha256, digest)
  assert.equal(provenance.files[1].path, spec.manifestName)

  const failingIo = {
    ...io,
    async readFile(filePath) {
      if (filePath.endsWith('runtime.manifest.json')) {
        return Buffer.from(JSON.stringify({ ...manifest, sha256: '0'.repeat(64) }))
      }
      return artifact
    },
  }
  await assert.rejects(() => preparePinnedRuntime(spec, { io: failingIo }), /digest does not match/i)
  assert.ok(calls.filter((entry) => entry[0] === 'rm' && entry[1] === spec.buildRoot).length >= 3)
  await assert.rejects(() => preparePinnedRuntime(null, { io }), /spec is invalid/i)
})

test('CE analysis consumer validates shadow-only source identity and authority', async () => {
  assert.equal(existsSync(analysisConsumerUrl), true)
  if (!existsSync(analysisConsumerUrl)) return

  const consumer = await import(analysisConsumerUrl)
  const result = {
    contract: 'ST_OMR_CORRECTION_ENGINE_SUSPICIOUS_MEASURES_V1',
    mode: 'SHADOW_ONLY',
    sourceId: 'render:1',
    sourceHash: 'b'.repeat(64),
    partId: 'P1',
    measureCount: 4,
    eventCount: 8,
    findings: [],
    suspiciousMeasures: [{ measureKey: 'm2', measureNumber: '2', measureIndex: 1, codes: ['X'], errorClasses: ['DURATION'], findingIds: ['f1'] }],
    unmappedFindingCount: 0,
    sourceGraphMutated: false,
    automaticApplyAuthority: false,
    musicXmlWriteBackAuthority: false,
  }
  const runtime = {
    contract: 'ST_OMR_CORRECTION_ENGINE_ANALYSIS_BROWSER',
    contractVersion: '1.0.0',
    runtimeVersion: '1.0.0',
    analyzeMusicXmlSuspiciousMeasures() { return result },
  }

  assert.equal(consumer.resolveCorrectionAnalysisRuntime({ STOmrCorrectionAnalysisRuntime: runtime }), runtime)
  const accepted = consumer.analyzeSuspiciousMeasures(runtime, {
    musicxml: '<score-partwise/>',
    sourceId: 'render:1',
  })
  assert.equal(accepted, result)
  assert.throws(
    () => consumer.validateSuspiciousMeasureAnalysis(result, { expectedSourceId: 'render:2' }),
    /source identity/i,
  )
  assert.throws(
    () => consumer.validateSuspiciousMeasureAnalysis({ ...result, automaticApplyAuthority: true }, { expectedSourceId: 'render:1' }),
    /authority/i,
  )
})

test('analysis validator rejects malformed identities, bounds and evidence without coercion', async () => {
  const consumer = await import(analysisConsumerUrl)
  const valid = {
    contract: 'ST_OMR_CORRECTION_ENGINE_SUSPICIOUS_MEASURES_V1',
    mode: 'SHADOW_ONLY',
    sourceId: 'render:1',
    sourceHash: 'e'.repeat(64),
    partId: 'P1',
    measureCount: 2,
    eventCount: 3,
    findings: [],
    suspiciousMeasures: [
      { measureKey: 'm1', measureNumber: '1', measureIndex: 0, codes: ['X'], errorClasses: ['DURATION'], findingIds: ['f1'] },
    ],
    unmappedFindingCount: 0,
    sourceGraphMutated: false,
    automaticApplyAuthority: false,
    musicXmlWriteBackAuthority: false,
  }

  for (const [value, pattern] of [
    [null, /must be an object/i],
    [{ ...valid, contract: 'OTHER' }, /contract mismatch/i],
    [{ ...valid, mode: 'APPLY' }, /SHADOW_ONLY/i],
    [{ ...valid, sourceId: ' bad ' }, /source identity/i],
    [{ ...valid, sourceHash: 'BAD' }, /source hash/i],
    [{ ...valid, partId: '' }, /partId/i],
    [{ ...valid, measureCount: -1 }, /summary/i],
    [{ ...valid, findings: null }, /findings/i],
    [{ ...valid, unmappedFindingCount: -1 }, /unmapped finding count/i],
    [{ ...valid, sourceGraphMutated: true }, /authority|immutability/i],
    [{ ...valid, suspiciousMeasures: [{ ...valid.suspiciousMeasures[0], measureIndex: 2 }] }, /outside the analyzed score/i],
    [{ ...valid, suspiciousMeasures: [{ ...valid.suspiciousMeasures[0], measureKey: '' }] }, /identity/i],
    [{ ...valid, suspiciousMeasures: [{ ...valid.suspiciousMeasures[0], codes: null }] }, /evidence/i],
  ]) {
    assert.throws(() => consumer.validateSuspiciousMeasureAnalysis(value), pattern)
  }

  assert.throws(
    () => consumer.analyzeSuspiciousMeasures(null, { musicxml: '<score-partwise/>', sourceId: 'render:1' }),
    /runtime is not connected/i,
  )
  const runtime = {
    analyzeMusicXmlSuspiciousMeasures() { return valid },
  }
  assert.throws(
    () => consumer.analyzeSuspiciousMeasures(runtime, { musicxml: '<score-timewise/>', sourceId: 'render:1' }),
    /score-partwise/i,
  )
  assert.throws(
    () => consumer.analyzeSuspiciousMeasures(runtime, { musicxml: '<score-partwise/>', sourceId: ' bad ' }),
    /source identity/i,
  )
  assert.throws(
    () => consumer.analyzeSuspiciousMeasures(runtime, { musicxml: '<score-partwise/>', sourceId: 'render:1', tolerance: -1 }),
    /tolerance/i,
  )
})

test('score-view dynamically loads CE analysis runtime and keeps load failures fail-open for rendering', async () => {
  const musicxml = '<score-partwise version="4.0"><part-list/><part id="P1"><measure number="1"/></part></score-partwise>'
  const resultFor = (sourceId) => ({
    contract: 'ST_OMR_CORRECTION_ENGINE_SUSPICIOUS_MEASURES_V1',
    mode: 'SHADOW_ONLY',
    sourceId,
    sourceHash: 'f'.repeat(64),
    partId: 'P1',
    measureCount: 1,
    eventCount: 0,
    findings: [],
    suspiciousMeasures: [
      { measureKey: 'm1', measureNumber: '1', measureIndex: 0, codes: ['X'], errorClasses: ['DURATION'], findingIds: ['f1'] },
    ],
    unmappedFindingCount: 0,
    sourceGraphMutated: false,
    automaticApplyAuthority: false,
    musicXmlWriteBackAuthority: false,
  })
  const runtime = {
    contract: 'ST_OMR_CORRECTION_ENGINE_ANALYSIS_BROWSER',
    contractVersion: '1.0.0',
    runtimeVersion: '1.0.0',
    analyzeMusicXmlSuspiciousMeasures({ sourceId }) { return resultFor(sourceId) },
  }

  function makeRenderer(label) {
    return {
      async renderMusicXml() { return { renderEpoch: label, sourceId: `source:${label}` } },
      async highlightMeasure() {},
      async clearMeasureHighlights() {},
    }
  }

  function makeRoot({ existingRuntime = null, outcome = 'load', allowDom = true } = {}) {
    const scope = existingRuntime ? { STOmrCorrectionAnalysisRuntime: existingRuntime } : {}
    const surface = { dataset: {} }
    const xmlOutput = { textContent: musicxml }
    let created = 0
    let appended = 0
    const root = {
      defaultView: scope,
      getElementById(id) {
        if (id === 'score-view-surface') return surface
        if (id === 'xml-output') return xmlOutput
        return null
      },
      querySelector() { return null },
    }
    if (allowDom) {
      root.createElement = () => {
        created += 1
        const listeners = {}
        return {
          dataset: {},
          addEventListener(name, listener) { listeners[name] = listener },
          get listeners() { return listeners },
        }
      }
      root.head = {
        appendChild(script) {
          appended += 1
          if (outcome === 'load') {
            scope.STOmrCorrectionAnalysisRuntime = runtime
            script.listeners.load?.()
          } else {
            script.listeners.error?.()
          }
        },
      }
    }
    return { root, surface, counts: () => ({ created, appended }) }
  }

  const loaded = makeRoot()
  const rendererA = makeRenderer('a')
  await rendererConsumer.renderScoreView(rendererA, musicxml, { ticket: 'a' })
  assert.equal(await syncCorrectionMeasureOverlays(loaded.root, rendererA, musicxml), true)
  assert.deepEqual(loaded.counts(), { created: 1, appended: 1 })
  assert.equal(loaded.surface.dataset.correctionOverlayState, 'ready')

  const already = makeRoot({ existingRuntime: runtime })
  const rendererB = makeRenderer('b')
  await rendererConsumer.renderScoreView(rendererB, musicxml, { ticket: 'b' })
  assert.equal(await syncCorrectionMeasureOverlays(already.root, rendererB, musicxml), true)
  assert.deepEqual(already.counts(), { created: 0, appended: 0 })

  const failed = makeRoot({ outcome: 'error' })
  const rendererC = makeRenderer('c')
  await rendererConsumer.renderScoreView(rendererC, musicxml, { ticket: 'c' })
  assert.equal(await syncCorrectionMeasureOverlays(failed.root, rendererC, musicxml), false)
  assert.equal(failed.surface.dataset.correctionOverlayState, 'unavailable')
  assert.deepEqual(failed.counts(), { created: 1, appended: 1 })

  const noDom = makeRoot({ allowDom: false })
  const rendererD = makeRenderer('d')
  await rendererConsumer.renderScoreView(rendererD, musicxml, { ticket: 'd' })
  assert.equal(await syncCorrectionMeasureOverlays(noDom.root, rendererD, musicxml), false)
  assert.equal(noDom.surface.dataset.correctionOverlayState, 'unavailable')
})

test('overlay projection deduplicates exact partId + measureIndex and fails closed on incomplete mapping', async () => {
  assert.equal(existsSync(overlayUrl), true)
  if (!existsSync(overlayUrl)) return

  const { replaceSuspiciousMeasureOverlays } = await import(overlayUrl)
  const calls = []
  const renderer = {
    async highlightMeasure(payload) { calls.push(['highlight', payload.target.partId, payload.target.measureIndex]) },
    async clearMeasureHighlights() { calls.push(['clear']) },
  }
  const base = {
    contract: 'ST_OMR_CORRECTION_ENGINE_SUSPICIOUS_MEASURES_V1',
    mode: 'SHADOW_ONLY',
    sourceId: 'render:1',
    sourceHash: 'c'.repeat(64),
    partId: 'P1',
    measureCount: 4,
    eventCount: 8,
    findings: [],
    suspiciousMeasures: [
      { measureKey: 'm2', measureNumber: '2', measureIndex: 1, codes: ['A'], errorClasses: ['DURATION'], findingIds: ['f1'] },
      { measureKey: 'm2-again', measureNumber: '2', measureIndex: 1, codes: ['B'], errorClasses: ['ONSET'], findingIds: ['f2'] },
      { measureKey: 'm4', measureNumber: '4', measureIndex: 3, codes: ['C'], errorClasses: ['VOICE'], findingIds: ['f3'] },
    ],
    unmappedFindingCount: 0,
    sourceGraphMutated: false,
    automaticApplyAuthority: false,
    musicXmlWriteBackAuthority: false,
  }

  assert.equal(await replaceSuspiciousMeasureOverlays(renderer, base, { expectedSourceId: 'render:1' }), true)
  assert.deepEqual(calls, [
    ['clear'],
    ['highlight', 'P1', 1],
    ['highlight', 'P1', 3],
  ])

  calls.length = 0
  assert.equal(await replaceSuspiciousMeasureOverlays(renderer, { ...base, unmappedFindingCount: 1 }, { expectedSourceId: 'render:1' }), false)
  assert.deepEqual(calls, [['clear']])
})

test('score-view orchestration keeps CE analysis non-blocking and source-current', async () => {
  const musicxml = '<score-partwise version="4.0"><part-list/><part id="P1"><measure number="1"/></part></score-partwise>'
  const xmlOutput = { textContent: musicxml }
  const surface = { dataset: {} }
  const root = {
    getElementById(id) {
      if (id === 'xml-output') return xmlOutput
      if (id === 'score-view-surface') return surface
      return null
    },
  }
  const calls = []
  const renderer = {
    async renderMusicXml() { return { renderEpoch: 'render-9', sourceId: 'workstation:9' } },
    async highlightMeasure(payload) { calls.push(['highlight', payload.target.measureIndex]) },
    async clearMeasureHighlights() { calls.push(['clear']) },
  }
  await rendererConsumer.renderScoreView(renderer, musicxml, { ticket: '9' })

  const resultFor = (sourceId) => ({
    contract: 'ST_OMR_CORRECTION_ENGINE_SUSPICIOUS_MEASURES_V1',
    mode: 'SHADOW_ONLY',
    sourceId,
    sourceHash: 'd'.repeat(64),
    partId: 'P1',
    measureCount: 1,
    eventCount: 0,
    findings: [],
    suspiciousMeasures: [
      { measureKey: 'm1', measureNumber: '1', measureIndex: 0, codes: ['X'], errorClasses: ['DURATION'], findingIds: ['f1'] },
    ],
    unmappedFindingCount: 0,
    sourceGraphMutated: false,
    automaticApplyAuthority: false,
    musicXmlWriteBackAuthority: false,
  })
  const analysisRuntime = {
    contract: 'ST_OMR_CORRECTION_ENGINE_ANALYSIS_BROWSER',
    contractVersion: '1.0.0',
    runtimeVersion: '1.0.0',
    analyzeMusicXmlSuspiciousMeasures({ sourceId }) { return resultFor(sourceId) },
  }

  assert.equal(await syncCorrectionMeasureOverlays(root, renderer, musicxml, analysisRuntime), true)
  assert.equal(calls.some((entry) => entry[0] === 'highlight' && entry[1] === 0), true)
  assert.equal(surface.dataset.correctionOverlayState, 'ready')
  assert.equal(surface.dataset.correctionOverlayCount, '1')
  assert.deepEqual(rendererConsumer.getCurrentScoreRenderEvidence(renderer), {
    renderEpoch: 'render-9',
    sourceId: 'workstation:9',
  })

  calls.length = 0
  const failingRuntime = {
    ...analysisRuntime,
    analyzeMusicXmlSuspiciousMeasures() { throw new Error('analysis unavailable') },
  }
  assert.equal(await syncCorrectionMeasureOverlays(root, renderer, musicxml, failingRuntime), false)
  assert.equal(calls.some((entry) => entry[0] === 'highlight'), false)
  assert.equal(surface.dataset.correctionOverlayState, 'unavailable')
  assert.ok(rendererConsumer.getCurrentScoreRenderEvidence(renderer))

  calls.length = 0
  const staleRuntime = {
    ...analysisRuntime,
    analyzeMusicXmlSuspiciousMeasures({ sourceId }) {
      xmlOutput.textContent = musicxml + ' '
      return resultFor(sourceId)
    },
  }
  assert.equal(await syncCorrectionMeasureOverlays(root, renderer, musicxml, staleRuntime), false)
  assert.equal(calls.some((entry) => entry[0] === 'highlight'), false)
  assert.equal(surface.dataset.correctionOverlayState, 'stale')
  xmlOutput.textContent = musicxml
})