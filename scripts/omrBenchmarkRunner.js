// Package 2E-D — isolated experimental OMR benchmark runner.
//
// This module orchestrates experimental preprocessing/OMR adapters in dedicated
// temporary workspaces. It intentionally imports no production OMR provider,
// worker, gateway, or Audiveris integration. Adapters are supplied by the
// benchmark caller and receive only workspace-local input paths.

import { createHash } from 'node:crypto'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  OMR_BENCHMARK_MEASUREMENT_STATE,
  OMR_BENCHMARK_VARIANT_KIND,
  createOmrVariantRecord,
} from './omrBenchmark.js'
import { runWithOmrBenchmarkDomParser } from './omrBenchmarkNodeDom.js'
import { measureOmrVariantEvidence } from './omrMeasuredVariantEvidence.js'

export const OMR_ISOLATED_BENCHMARK_SCHEMA_VERSION = 1
export const OMR_ISOLATED_BENCHMARK_KIND = 'isolated-omr-comparative-experiment'

const APPROVED_VARIANT_KINDS = Object.freeze(Object.values(OMR_BENCHMARK_VARIANT_KIND))
const SAFE_VARIANT_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/u

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function assertNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string.`)
  }
  return value.trim()
}

function isInside(parentDir, candidatePath) {
  const relative = path.relative(path.resolve(parentDir), path.resolve(candidatePath))
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
}

async function assertRegularFileInside(workspaceDir, artifactPath) {
  if (typeof artifactPath !== 'string' || artifactPath.trim() === '') {
    throw new Error('prepared-artifact-path-required')
  }
  const resolved = path.resolve(artifactPath)
  if (!isInside(workspaceDir, resolved)) {
    throw new Error('prepared-artifact-outside-variant-workspace')
  }
  let info
  try {
    info = await stat(resolved)
  } catch {
    throw new Error('prepared-artifact-not-found')
  }
  if (!info.isFile()) throw new Error('prepared-artifact-must-be-file')
  return resolved
}

function isExplicitlyUnmeasured(result) {
  return result?.state === OMR_BENCHMARK_MEASUREMENT_STATE.NOT_MEASURED
}

function unmeasuredVariant(base, reason, stage) {
  return deepFreeze({
    variantId: base.variantId,
    variantKind: base.variantKind,
    preprocessingSettings: base.preprocessingSettings,
    audiverisSettings: base.audiverisSettings,
    executionState: OMR_BENCHMARK_MEASUREMENT_STATE.NOT_MEASURED,
    reason: typeof reason === 'string' && reason.trim() ? reason.trim() : `${stage}-not-measured`,
    unavailableStage: stage,
    evidence: null,
  })
}

function validateVariantSet(variants, goldenReferenceId) {
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new TypeError('variants must be a non-empty array.')
  }

  const normalized = []
  const ids = new Set()
  const kinds = new Set()

  for (const variant of variants) {
    const variantId = assertNonEmptyString(variant?.variantId, 'variantId')
    if (!SAFE_VARIANT_ID.test(variantId)) throw new Error(`unsafe-omr-benchmark-variant-id:${variantId}`)
    if (!APPROVED_VARIANT_KINDS.includes(variant?.variantKind)) {
      throw new Error(`unsupported-omr-benchmark-variant:${variant?.variantKind}`)
    }
    if (ids.has(variantId) || kinds.has(variant.variantKind)) {
      throw new Error(`duplicate-omr-benchmark-variant:${variantId}`)
    }
    ids.add(variantId)
    kinds.add(variant.variantKind)

    normalized.push(createOmrVariantRecord({
      variantId,
      variantKind: variant.variantKind,
      inputMetadata: variant.inputMetadata || {},
      preprocessingSettings: variant.preprocessingSettings || {},
      audiverisSettings: variant.audiverisSettings || {},
      generatedMusicXml: null,
      validatorFindings: [],
      goldenReferenceId,
    }))
  }

  if (
    normalized.length !== APPROVED_VARIANT_KINDS.length ||
    APPROVED_VARIANT_KINDS.some((kind) => !kinds.has(kind))
  ) {
    throw new Error('complete-approved-variant-set-required')
  }

  return normalized.sort((a, b) => a.variantId.localeCompare(b.variantId))
}

async function assertOriginalUnchanged(sourcePath, expectedSha256, expectedByteLength) {
  const current = await readFile(sourcePath)
  if (current.byteLength !== expectedByteLength || sha256(current) !== expectedSha256) {
    throw new Error('original-input-mutated')
  }
}

export async function runIsolatedOmrBenchmarkExperiment({
  benchmarkId,
  sourcePath,
  variants,
  goldenReferenceId = null,
  prepareVariant,
  runExperimentalOmr,
} = {}) {
  const normalizedBenchmarkId = assertNonEmptyString(benchmarkId, 'benchmarkId')
  const normalizedSourcePath = assertNonEmptyString(sourcePath, 'sourcePath')
  if (typeof prepareVariant !== 'function') throw new TypeError('prepareVariant must be a function.')
  if (typeof runExperimentalOmr !== 'function') throw new TypeError('runExperimentalOmr must be a function.')

  const normalizedVariants = validateVariantSet(variants, goldenReferenceId)

  let sourceInfo
  try {
    sourceInfo = await stat(normalizedSourcePath)
  } catch {
    throw new Error('benchmark-source-not-found')
  }
  if (!sourceInfo.isFile()) throw new Error('benchmark-source-must-be-file')

  const originalBytes = await readFile(normalizedSourcePath)
  const originalSha256 = sha256(originalBytes)
  const originalByteLength = originalBytes.byteLength
  const sourceExtension = path.extname(normalizedSourcePath).toLowerCase() || '.bin'

  let benchmarkWorkspace = null
  let result = null

  try {
    benchmarkWorkspace = await mkdtemp(path.join(os.tmpdir(), 'seslitab-package-2e-'))
    const measuredVariants = []

    for (let index = 0; index < normalizedVariants.length; index++) {
      const variant = normalizedVariants[index]
      const variantWorkspace = path.join(
        benchmarkWorkspace,
        `${String(index + 1).padStart(2, '0')}-${variant.variantId}`,
      )
      await mkdir(variantWorkspace, { recursive: false })

      const localSourcePath = path.join(variantWorkspace, `original${sourceExtension}`)
      await copyFile(normalizedSourcePath, localSourcePath)

      const prepared = await prepareVariant({
        variantId: variant.variantId,
        variantKind: variant.variantKind,
        sourcePath: localSourcePath,
        workspaceDir: variantWorkspace,
        preprocessingSettings: variant.preprocessingSettings,
      })

      await assertOriginalUnchanged(normalizedSourcePath, originalSha256, originalByteLength)

      if (isExplicitlyUnmeasured(prepared)) {
        measuredVariants.push(unmeasuredVariant(variant, prepared.reason, 'preprocessing'))
        continue
      }

      const artifactPath = await assertRegularFileInside(variantWorkspace, prepared?.artifactPath)

      const omrResult = await runExperimentalOmr({
        variantId: variant.variantId,
        variantKind: variant.variantKind,
        artifactPath,
        workspaceDir: variantWorkspace,
        audiverisSettings: variant.audiverisSettings,
      })

      await assertOriginalUnchanged(normalizedSourcePath, originalSha256, originalByteLength)

      if (isExplicitlyUnmeasured(omrResult)) {
        measuredVariants.push(unmeasuredVariant(variant, omrResult.reason, 'experimental-omr'))
        continue
      }

      if (typeof omrResult?.generatedMusicXml !== 'string' || omrResult.generatedMusicXml.trim() === '') {
        throw new Error('experimental-omr-musicxml-required')
      }

      const evidence = runWithOmrBenchmarkDomParser(() => measureOmrVariantEvidence({
        variantId: variant.variantId,
        variantKind: variant.variantKind,
        inputMetadata: {
          ...variant.inputMetadata,
          sourceSha256: originalSha256,
          sourceByteLength: originalByteLength,
        },
        preprocessingSettings: variant.preprocessingSettings,
        audiverisSettings: variant.audiverisSettings,
        generatedMusicXml: omrResult.generatedMusicXml,
        goldenReferenceId,
      }))

      measuredVariants.push(deepFreeze({
        variantId: variant.variantId,
        variantKind: variant.variantKind,
        preprocessingSettings: variant.preprocessingSettings,
        audiverisSettings: variant.audiverisSettings,
        executionState: OMR_BENCHMARK_MEASUREMENT_STATE.MEASURED,
        reason: null,
        unavailableStage: null,
        evidence,
      }))
    }

    await assertOriginalUnchanged(normalizedSourcePath, originalSha256, originalByteLength)

    result = {
      schemaVersion: OMR_ISOLATED_BENCHMARK_SCHEMA_VERSION,
      benchmarkKind: OMR_ISOLATED_BENCHMARK_KIND,
      benchmarkId: normalizedBenchmarkId,
      source: {
        fileName: path.basename(normalizedSourcePath),
        format: sourceExtension.slice(1) || 'bin',
        byteLength: originalByteLength,
        sha256: originalSha256,
      },
      goldenReferenceId,
      variants: measuredVariants,
    }
  } finally {
    if (benchmarkWorkspace) {
      await rm(benchmarkWorkspace, { recursive: true, force: true })
    }
  }

  return deepFreeze(result)
}
