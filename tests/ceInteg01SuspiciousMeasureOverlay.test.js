import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import test from 'node:test'

import {
  SCORE_RENDERER_REVISION,
  verifyRuntimeFeatureSources,
} from '../scripts/prepareScoreRuntime.js'
import * as rendererConsumer from '../src/services/scoreRendererConsumer.js'
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

  const unsafe = { ...manifest, automaticApplyAuthority: true }
  assert.throws(() => preparer.verifyCeAnalysisRuntimeManifest(unsafe), /forbidden authority/i)
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
