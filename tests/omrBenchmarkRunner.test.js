import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  access,
  copyFile,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  OMR_BENCHMARK_MEASUREMENT_STATE,
  OMR_BENCHMARK_VARIANT_KIND,
} from '../scripts/omrBenchmark.js'
import {
  OMR_ISOLATED_BENCHMARK_KIND,
  runIsolatedOmrBenchmarkExperiment,
} from '../scripts/omrBenchmarkRunner.js'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(testDir, '..')
const sourceFixture = path.join(
  repoRoot,
  'tests/fixtures/golden-reference/plan0-cc0-4measure/plan0-cc0-4measure-source.pdf',
)
const goldenXml = await readFile(path.join(
  repoRoot,
  'tests/fixtures/golden-reference/plan0-cc0-4measure/plan0-cc0-4measure-expected.musicxml',
), 'utf8')

const ALL_VARIANTS = Object.values(OMR_BENCHMARK_VARIANT_KIND).map((variantKind, index) => ({
  variantId: `variant-${String(index + 1).padStart(2, '0')}`,
  variantKind,
  preprocessingSettings: { profile: variantKind },
  audiverisSettings: { profile: 'benchmark-default' },
}))

async function createSourceSandbox() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'seslitab-2e-source-test-'))
  const sourcePath = path.join(root, 'source.pdf')
  await copyFile(sourceFixture, sourcePath)
  return { root, sourcePath }
}

async function pathExists(target) {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

function goldenAdapters(observedWorkspaces = []) {
  return {
    async prepareVariant({ sourcePath, workspaceDir, variantId }) {
      observedWorkspaces.push(workspaceDir)
      const artifactPath = path.join(workspaceDir, `${variantId}.pdf`)
      await copyFile(sourcePath, artifactPath)
      return { artifactPath }
    },
    async runExperimentalOmr() {
      return { generatedMusicXml: goldenXml }
    },
  }
}

describe('Package 2E-D isolated comparative benchmark runner', () => {
  test('all eight approved variant kinds execute in isolated workspaces and produce measured golden evidence', async () => {
    const sandbox = await createSourceSandbox()
    const workspaces = []
    try {
      const result = await runIsolatedOmrBenchmarkExperiment({
        benchmarkId: 'all-eight-golden',
        sourcePath: sandbox.sourcePath,
        variants: ALL_VARIANTS,
        goldenReferenceId: 'plan0-cc0-4measure',
        ...goldenAdapters(workspaces),
      })

      assert.equal(result.benchmarkKind, OMR_ISOLATED_BENCHMARK_KIND)
      assert.equal(result.variants.length, 8)
      assert.deepEqual(
        new Set(result.variants.map((variant) => variant.variantKind)),
        new Set(Object.values(OMR_BENCHMARK_VARIANT_KIND)),
      )
      assert.equal(new Set(workspaces).size, 8)
      for (const variant of result.variants) {
        assert.equal(variant.executionState, OMR_BENCHMARK_MEASUREMENT_STATE.MEASURED)
        assert.equal(variant.evidence.comparison.fullyCorrectMeasureRate.value, 1)
        assert.equal(variant.evidence.sourceVerification.definitive, false)
      }
    } finally {
      await rm(sandbox.root, { recursive: true, force: true })
    }
  })

  test('original source bytes are unchanged after a complete run', async () => {
    const sandbox = await createSourceSandbox()
    try {
      const before = await readFile(sandbox.sourcePath)
      const result = await runIsolatedOmrBenchmarkExperiment({
        benchmarkId: 'preserve-source',
        sourcePath: sandbox.sourcePath,
        variants: ALL_VARIANTS,
        goldenReferenceId: 'plan0-cc0-4measure',
        ...goldenAdapters(),
      })
      assert.deepEqual(await readFile(sandbox.sourcePath), before)
      assert.match(result.source.sha256, /^[a-f0-9]{64}$/)
      assert.equal(result.source.byteLength, before.byteLength)
    } finally {
      await rm(sandbox.root, { recursive: true, force: true })
    }
  })

  test('temporary variant workspaces are removed after success', async () => {
    const sandbox = await createSourceSandbox()
    const workspaces = []
    try {
      await runIsolatedOmrBenchmarkExperiment({
        benchmarkId: 'cleanup-success',
        sourcePath: sandbox.sourcePath,
        variants: ALL_VARIANTS,
        ...goldenAdapters(workspaces),
      })
      for (const workspace of workspaces) assert.equal(await pathExists(workspace), false)
    } finally {
      await rm(sandbox.root, { recursive: true, force: true })
    }
  })

  test('temporary workspaces are removed when preprocessing adapter throws', async () => {
    const sandbox = await createSourceSandbox()
    let workspace = null
    try {
      await assert.rejects(
        runIsolatedOmrBenchmarkExperiment({
          benchmarkId: 'cleanup-prepare-failure',
          sourcePath: sandbox.sourcePath,
          variants: ALL_VARIANTS,
          async prepareVariant(context) {
            workspace = context.workspaceDir
            throw new Error('synthetic-prepare-failure')
          },
          async runExperimentalOmr() {
            return { generatedMusicXml: goldenXml }
          },
        }),
        /synthetic-prepare-failure/,
      )
      assert.ok(workspace)
      assert.equal(await pathExists(workspace), false)
    } finally {
      await rm(sandbox.root, { recursive: true, force: true })
    }
  })

  test('temporary workspaces are removed when experimental OMR adapter throws', async () => {
    const sandbox = await createSourceSandbox()
    const workspaces = []
    try {
      await assert.rejects(
        runIsolatedOmrBenchmarkExperiment({
          benchmarkId: 'cleanup-omr-failure',
          sourcePath: sandbox.sourcePath,
          variants: ALL_VARIANTS,
          async prepareVariant({ sourcePath, workspaceDir }) {
            workspaces.push(workspaceDir)
            const artifactPath = path.join(workspaceDir, 'prepared.pdf')
            await copyFile(sourcePath, artifactPath)
            return { artifactPath }
          },
          async runExperimentalOmr() {
            throw new Error('synthetic-omr-failure')
          },
        }),
        /synthetic-omr-failure/,
      )
      for (const workspace of workspaces) assert.equal(await pathExists(workspace), false)
    } finally {
      await rm(sandbox.root, { recursive: true, force: true })
    }
  })

  test('prepared artifacts outside the dedicated variant workspace fail closed', async () => {
    const sandbox = await createSourceSandbox()
    try {
      await assert.rejects(
        runIsolatedOmrBenchmarkExperiment({
          benchmarkId: 'reject-outside-artifact',
          sourcePath: sandbox.sourcePath,
          variants: ALL_VARIANTS,
          async prepareVariant() {
            return { artifactPath: sandbox.sourcePath }
          },
          async runExperimentalOmr() {
            return { generatedMusicXml: goldenXml }
          },
        }),
        /prepared-artifact-outside-variant-workspace/,
      )
    } finally {
      await rm(sandbox.root, { recursive: true, force: true })
    }
  })

  test('caller mutation of the original input during a variant is detected and fails closed', async () => {
    const sandbox = await createSourceSandbox()
    const original = await readFile(sandbox.sourcePath)
    try {
      await assert.rejects(
        runIsolatedOmrBenchmarkExperiment({
          benchmarkId: 'detect-original-mutation',
          sourcePath: sandbox.sourcePath,
          variants: ALL_VARIANTS,
          async prepareVariant({ sourcePath, workspaceDir }) {
            const artifactPath = path.join(workspaceDir, 'prepared.pdf')
            await copyFile(sourcePath, artifactPath)
            await writeFile(sandbox.sourcePath, Buffer.from('mutated'))
            return { artifactPath }
          },
          async runExperimentalOmr() {
            return { generatedMusicXml: goldenXml }
          },
        }),
        /original-input-mutated/,
      )
    } finally {
      await writeFile(sandbox.sourcePath, original)
      await rm(sandbox.root, { recursive: true, force: true })
    }
  })

  test('without golden reference recognition comparison remains NOT_MEASURED', async () => {
    const sandbox = await createSourceSandbox()
    try {
      const result = await runIsolatedOmrBenchmarkExperiment({
        benchmarkId: 'no-golden',
        sourcePath: sandbox.sourcePath,
        variants: ALL_VARIANTS,
        ...goldenAdapters(),
      })
      for (const variant of result.variants) {
        assert.equal(variant.evidence.comparison.state, OMR_BENCHMARK_MEASUREMENT_STATE.NOT_MEASURED)
        assert.equal(variant.evidence.comparison.pitchErrors.value, null)
      }
    } finally {
      await rm(sandbox.root, { recursive: true, force: true })
    }
  })

  test('an explicitly unavailable experimental adapter is recorded as NOT_MEASURED without fabricating output', async () => {
    const sandbox = await createSourceSandbox()
    try {
      const result = await runIsolatedOmrBenchmarkExperiment({
        benchmarkId: 'one-unavailable',
        sourcePath: sandbox.sourcePath,
        variants: ALL_VARIANTS,
        async prepareVariant({ sourcePath, workspaceDir, variantKind }) {
          if (variantKind === OMR_BENCHMARK_VARIANT_KIND.ADAPTIVE_BINARIZATION) {
            return {
              state: OMR_BENCHMARK_MEASUREMENT_STATE.NOT_MEASURED,
              reason: 'preprocessor-unavailable',
            }
          }
          const artifactPath = path.join(workspaceDir, 'prepared.pdf')
          await copyFile(sourcePath, artifactPath)
          return { artifactPath }
        },
        async runExperimentalOmr() {
          return { generatedMusicXml: goldenXml }
        },
      })
      const unavailable = result.variants.find(
        (variant) => variant.variantKind === OMR_BENCHMARK_VARIANT_KIND.ADAPTIVE_BINARIZATION,
      )
      assert.equal(unavailable.executionState, OMR_BENCHMARK_MEASUREMENT_STATE.NOT_MEASURED)
      assert.equal(unavailable.evidence, null)
      assert.equal(unavailable.reason, 'preprocessor-unavailable')
      assert.equal(JSON.stringify(unavailable).includes('<score-partwise'), false)
    } finally {
      await rm(sandbox.root, { recursive: true, force: true })
    }
  })

  test('variant input ordering does not change deterministic output', async () => {
    const sandbox = await createSourceSandbox()
    try {
      const adapters = goldenAdapters()
      const first = await runIsolatedOmrBenchmarkExperiment({
        benchmarkId: 'deterministic-order',
        sourcePath: sandbox.sourcePath,
        variants: ALL_VARIANTS,
        goldenReferenceId: 'plan0-cc0-4measure',
        ...adapters,
      })
      const second = await runIsolatedOmrBenchmarkExperiment({
        benchmarkId: 'deterministic-order',
        sourcePath: sandbox.sourcePath,
        variants: [...ALL_VARIANTS].reverse(),
        goldenReferenceId: 'plan0-cc0-4measure',
        ...goldenAdapters(),
      })
      assert.deepEqual(second, first)
    } finally {
      await rm(sandbox.root, { recursive: true, force: true })
    }
  })

  test('runner output never exposes temporary filesystem paths or raw MusicXML', async () => {
    const sandbox = await createSourceSandbox()
    const workspaces = []
    try {
      const result = await runIsolatedOmrBenchmarkExperiment({
        benchmarkId: 'no-path-leak',
        sourcePath: sandbox.sourcePath,
        variants: ALL_VARIANTS,
        ...goldenAdapters(workspaces),
      })
      const serialized = JSON.stringify(result)
      assert.equal(serialized.includes(os.tmpdir()), false)
      assert.equal(serialized.includes(sandbox.sourcePath), false)
      assert.equal(serialized.includes('<score-partwise'), false)
      for (const workspace of workspaces) assert.equal(serialized.includes(workspace), false)
      assert.equal(Object.isFrozen(result), true)
      assert.equal(Object.isFrozen(result.variants), true)
    } finally {
      await rm(sandbox.root, { recursive: true, force: true })
    }
  })

  test('runner rejects incomplete, duplicate, or unsupported variant sets before adapters execute', async () => {
    const sandbox = await createSourceSandbox()
    let calls = 0
    try {
      const adapters = {
        async prepareVariant() { calls++; return { state: OMR_BENCHMARK_MEASUREMENT_STATE.NOT_MEASURED, reason: 'unused' } },
        async runExperimentalOmr() { calls++; return { generatedMusicXml: goldenXml } },
      }
      await assert.rejects(
        runIsolatedOmrBenchmarkExperiment({
          benchmarkId: 'incomplete', sourcePath: sandbox.sourcePath, variants: ALL_VARIANTS.slice(0, 7), ...adapters,
        }),
        /complete-approved-variant-set-required/,
      )
      await assert.rejects(
        runIsolatedOmrBenchmarkExperiment({
          benchmarkId: 'duplicate', sourcePath: sandbox.sourcePath, variants: [...ALL_VARIANTS.slice(0, 7), ALL_VARIANTS[0]], ...adapters,
        }),
        /duplicate-omr-benchmark-variant/,
      )
      await assert.rejects(
        runIsolatedOmrBenchmarkExperiment({
          benchmarkId: 'unsupported', sourcePath: sandbox.sourcePath, variants: [...ALL_VARIANTS.slice(0, 7), { ...ALL_VARIANTS[7], variantKind: 'invented' }], ...adapters,
        }),
        /unsupported-omr-benchmark-variant/,
      )
      assert.equal(calls, 0)
    } finally {
      await rm(sandbox.root, { recursive: true, force: true })
    }
  })

  test('runner source imports no production OMR provider, worker, gateway, or Audiveris module', async () => {
    const source = await readFile(path.join(repoRoot, 'scripts/omrBenchmarkRunner.js'), 'utf8')
    assert.doesNotMatch(source, /backend\/omr/u)
    assert.doesNotMatch(source, /AudiverisProvider/u)
    assert.doesNotMatch(source, /gatewayProvider/u)
    assert.doesNotMatch(source, /omrWorker/u)
    assert.doesNotMatch(source, /src\/services\/omrService/u)
  })
})
