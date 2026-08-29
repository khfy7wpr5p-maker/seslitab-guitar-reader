// Package 8B-T6 — pinned Audiveris-native samples.zip serializer and acceptance binding.
//
// Research/data-domain only. This module consumes only an exact, immutable T5
// serializer-ready report. It does not execute training, replace a classifier,
// import production OMR/runtime code, or alter deployment wiring.

import { createHash } from 'node:crypto'
import JSZip from 'jszip'
import {
  AUDIVERIS_NATIVE_SAMPLE_REQUIREMENT,
  MUSCIMA_NATIVE_STAGING_STATUS,
  isMuscimaAudiverisNativeStagingReport,
} from './audiverisMuscimaIsolatedNativeSamplesHarness.js'

export const AUDIVERIS_PINNED_NATIVE_SERIALIZER_SCHEMA_VERSION = 1
export const AUDIVERIS_PINNED_REVISION = '7a36078e7ba0c006052c1f661b949cf9b729f505'

export const AUDIVERIS_PINNED_NATIVE_SERIALIZER_STATUS = Object.freeze({
  BLOCKED_STAGING_INPUT: 'blocked_staging_input',
  ARCHIVE_BUILT_PENDING_PINNED_ACCEPTANCE: 'archive_built_pending_pinned_acceptance',
  ACCEPTED_BY_PINNED_AUDIVERIS: 'accepted_by_pinned_audiveris',
})

export const AUDIVERIS_PINNED_NATIVE_SERIALIZER_BLOCKER = Object.freeze({
  T5_SERIALIZER_READY_REPORT_REQUIRED: 't5_serializer_ready_report_required',
  PINNED_AUDIVERIS_ACCEPTANCE_REQUIRED: 'pinned_audiveris_acceptance_required',
})

export const AUDIVERIS_PINNED_ACCEPTANCE_PROBE = Object.freeze({
  kind: 'sample_repository_get_instance',
  api: 'SampleRepository.getInstance(Path,true)',
  upstreamRevision: AUDIVERIS_PINNED_REVISION,
})

const ALLOWED_SHAPES = Object.freeze(new Set([
  'SHARP', 'FLAT', 'NATURAL', 'DOUBLE_SHARP', 'DOUBLE_FLAT',
]))
const SHA256_RE = /^[0-9a-f]{64}$/u
const GIT_SHA1_RE = /^[0-9a-f]{40}$/u
const MASK_TOKEN_RE = /^([01]):([1-9][0-9]*)$/u
const FIXED_ZIP_DATE = new Date('2000-01-01T00:00:00.000Z')
const CONTAINER_PATH = 'META-INF/container.xml'
const SAMPLE_FILE_NAME = 'samples.xml'
const BUILD_REPORT_FIELDS = Object.freeze([
  'schemaVersion', 'status', 'upstreamRevision', 'stagingManifestFingerprint',
  'archiveSha256', 'archiveByteLength', 'sampleCount', 'sheetCount',
  'samplesZipBuilt', 'pinnedAudiverisAccepted', 'trainingExecuted',
  'productionAuthorized', 'modelReplacementAuthorized', 'blockers',
])
const ACCEPTANCE_INPUT_FIELDS = Object.freeze([
  'probeKind', 'probeApi', 'upstreamRevision', 'archiveSha256',
  'repositoryLoaded', 'loadedSampleCount',
])
const ACCEPTANCE_REPORT_FIELDS = Object.freeze([
  'schemaVersion', 'status', 'upstreamRevision', 'stagingManifestFingerprint',
  'archiveSha256', 'archiveByteLength', 'sampleCount', 'sheetCount',
  'samplesZipBuilt', 'pinnedAudiverisAccepted', 'acceptanceProbeKind',
  'acceptanceProbeApi', 'loadedSampleCount', 'trainingExecuted',
  'productionAuthorized', 'modelReplacementAuthorized', 'blockers',
])

function hashBytes(value) {
  return createHash('sha256').update(value).digest('hex')
}

function hashText(value) {
  return hashBytes(Buffer.from(value, 'utf8'))
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function assertSupportedInputObject(value, allowedFields, label) {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be a plain object.`)
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowedFields.includes(key)) {
      throw new TypeError(`${label} contains an unsupported field.`)
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw new TypeError(`${label}.${key} must be an enumerable data property.`)
    }
  }
}

function assertExactFrozenRecord(value, fields) {
  if (!isPlainObject(value) || !Object.isFrozen(value)) return false
  const keys = Reflect.ownKeys(value)
  if (keys.length !== fields.length || keys.some((key) => typeof key !== 'string' || !fields.includes(key))) {
    return false
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  return fields.every((field) => {
    const descriptor = descriptors[field]
    return Boolean(
      descriptor?.enumerable === true && descriptor.configurable === false &&
      descriptor.writable === false && Object.prototype.hasOwnProperty.call(descriptor, 'value'),
    )
  })
}

function requiredString(value, fieldName, maxLength = 256) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${fieldName} must be a non-empty string.`)
  }
  const normalized = value.trim()
  if (normalized.length > maxLength || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new TypeError(`${fieldName} contains unsupported text.`)
  }
  return normalized
}

function requiredSha256(value, fieldName) {
  const normalized = requiredString(value, fieldName, 64).toLowerCase()
  if (!SHA256_RE.test(normalized)) throw new TypeError(`${fieldName} must be a SHA-256 digest.`)
  return normalized
}

function requiredGitSha1(value, fieldName) {
  const normalized = requiredString(value, fieldName, 40).toLowerCase()
  if (!GIT_SHA1_RE.test(normalized)) throw new TypeError(`${fieldName} must be a Git SHA-1 revision.`)
  return normalized
}

function escapeXmlAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function decodeMask(maskRle, width, height) {
  const text = requiredString(maskRle, 'manifest.entries[].maskRle', 200000)
  const expectedPixels = width * height
  if (!Number.isSafeInteger(expectedPixels) || expectedPixels <= 0 || expectedPixels > 10_000_000) {
    throw new TypeError('manifest entry mask dimensions are unsupported.')
  }
  const decoded = new Uint8Array(expectedPixels)
  let offset = 0
  for (const token of text.split(/\s+/u)) {
    const match = MASK_TOKEN_RE.exec(token)
    if (!match) throw new TypeError('manifest entry maskRle contains an invalid run token.')
    const bit = Number(match[1])
    const count = Number(match[2])
    if (!Number.isSafeInteger(count) || offset + count > expectedPixels) {
      throw new TypeError('manifest entry maskRle exceeds the exact glyph bounds.')
    }
    if (bit === 1) decoded.fill(1, offset, offset + count)
    offset += count
  }
  if (offset !== expectedPixels) {
    throw new TypeError('manifest entry maskRle does not cover the exact glyph bounds.')
  }
  return decoded
}

// Audiveris RunTable RLE starts with foreground. If a row starts with
// background, its first foreground length is 0. An empty sequence is valid as
// [] and is emitted as <runs/> so the row index remains explicit.
function encodeHorizontalRunSequence(row) {
  const foregroundRuns = []
  let index = 0
  while (index < row.length) {
    while (index < row.length && row[index] === 0) index += 1
    if (index >= row.length) break
    const start = index
    while (index < row.length && row[index] === 1) index += 1
    foregroundRuns.push({ start, length: index - start })
  }
  if (foregroundRuns.length === 0) return []

  const rle = []
  let consumed = 0
  if (foregroundRuns[0].start !== 0) {
    rle.push(0)
    rle.push(foregroundRuns[0].start)
    consumed = foregroundRuns[0].start
  }
  for (let runIndex = 0; runIndex < foregroundRuns.length; runIndex++) {
    const run = foregroundRuns[runIndex]
    if (runIndex > 0) {
      rle.push(run.start - consumed)
      consumed = run.start
    }
    rle.push(run.length)
    consumed += run.length
  }
  return rle
}

function renderRunTable(entry) {
  const decoded = decodeMask(entry.maskRle, entry.width, entry.height)
  if (hashBytes(decoded) !== entry.maskSha256) {
    throw new TypeError('manifest entry mask bytes no longer bind the T5 mask fingerprint.')
  }
  const lines = [
    `      <run-table orientation="HORIZONTAL" width="${entry.width}" height="${entry.height}">`,
  ]
  for (let y = 0; y < entry.height; y++) {
    const row = decoded.subarray(y * entry.width, (y + 1) * entry.width)
    const rle = encodeHorizontalRunSequence(row)
    lines.push(rle.length === 0 ? '        <runs/>' : `        <runs>${rle.join(' ')}</runs>`)
  }
  lines.push('      </run-table>')
  return lines.join('\n')
}

function sheetNameForPage(pageId) {
  return `SESLITAB_MUSCIMA_${hashText(requiredString(pageId, 'manifest.entries[].pageId', 512))}`
}

function renderSamplesXml(sheetName, entries) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<samples sheet-name="${escapeXmlAttribute(sheetName)}">`,
  ]
  entries.forEach((entry, index) => {
    if (!ALLOWED_SHAPES.has(entry.audiverisShape)) {
      throw new TypeError('manifest entry shape is outside the bounded T3 accidental mapping.')
    }
    lines.push(
      `  <sample id="${index + 1}" shape="${escapeXmlAttribute(entry.audiverisShape)}" interline="${entry.interline}" left="${entry.left}" top="${entry.top}">`,
    )
    lines.push(renderRunTable(entry))
    lines.push('  </sample>')
  })
  lines.push('</samples>', '')
  return lines.join('\n')
}

function renderContainerXml(sheetNames) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<container>',
    '  <sheets>',
    ...sheetNames.map((name) => `    <sheet name="${escapeXmlAttribute(name)}"/>`),
    '  </sheets>',
    '</container>',
    '',
  ]
  return lines.join('\n')
}

function blockedBuildReport(validStagingReport = null) {
  return Object.freeze({
    schemaVersion: AUDIVERIS_PINNED_NATIVE_SERIALIZER_SCHEMA_VERSION,
    status: AUDIVERIS_PINNED_NATIVE_SERIALIZER_STATUS.BLOCKED_STAGING_INPUT,
    upstreamRevision: AUDIVERIS_PINNED_REVISION,
    stagingManifestFingerprint: validStagingReport?.manifestFingerprint ?? null,
    archiveSha256: null,
    archiveByteLength: 0,
    sampleCount: validStagingReport?.mappedSampleCount ?? 0,
    sheetCount: 0,
    samplesZipBuilt: false,
    pinnedAudiverisAccepted: false,
    trainingExecuted: false,
    productionAuthorized: false,
    modelReplacementAuthorized: false,
    blockers: Object.freeze([AUDIVERIS_PINNED_NATIVE_SERIALIZER_BLOCKER.T5_SERIALIZER_READY_REPORT_REQUIRED]),
  })
}

export async function buildMuscimaAudiverisNativeSamplesArchive(stagingReport) {
  const validStaging = isMuscimaAudiverisNativeStagingReport(stagingReport)
  if (!validStaging) {
    return Object.freeze({ report: blockedBuildReport(), archiveBytes: null })
  }
  if (
    stagingReport.status !== MUSCIMA_NATIVE_STAGING_STATUS.READY_FOR_AUDIVERIS_NATIVE_SERIALIZER ||
    stagingReport.manifest === null
  ) {
    return Object.freeze({ report: blockedBuildReport(stagingReport), archiveBytes: null })
  }
  if (AUDIVERIS_NATIVE_SAMPLE_REQUIREMENT.upstreamRevision !== AUDIVERIS_PINNED_REVISION) {
    throw new Error('T5 Audiveris revision does not match the T6 pinned serializer revision.')
  }

  const grouped = new Map()
  for (const entry of stagingReport.manifest.entries) {
    const pageId = requiredString(entry.pageId, 'manifest.entries[].pageId', 512)
    const sheetName = sheetNameForPage(pageId)
    let group = grouped.get(sheetName)
    if (!group) {
      group = { pageId, entries: [] }
      grouped.set(sheetName, group)
    } else if (group.pageId !== pageId) {
      throw new Error('deterministic sheet-name collision detected.')
    }
    group.entries.push(entry)
  }

  const sheetNames = [...grouped.keys()].sort()
  const zip = new JSZip()
  const zipOptions = Object.freeze({ date: FIXED_ZIP_DATE, compression: 'STORE', createFolders: false })
  zip.file(CONTAINER_PATH, renderContainerXml(sheetNames), zipOptions)
  for (const sheetName of sheetNames) {
    const entries = [...grouped.get(sheetName).entries].sort((a, b) => a.sampleId.localeCompare(b.sampleId))
    zip.file(`${sheetName}/${SAMPLE_FILE_NAME}`, renderSamplesXml(sheetName, entries), zipOptions)
  }

  const archiveBytes = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'STORE',
    platform: 'UNIX',
    streamFiles: false,
  })
  const archiveSha256 = hashBytes(archiveBytes)
  const report = Object.freeze({
    schemaVersion: AUDIVERIS_PINNED_NATIVE_SERIALIZER_SCHEMA_VERSION,
    status: AUDIVERIS_PINNED_NATIVE_SERIALIZER_STATUS.ARCHIVE_BUILT_PENDING_PINNED_ACCEPTANCE,
    upstreamRevision: AUDIVERIS_PINNED_REVISION,
    stagingManifestFingerprint: stagingReport.manifestFingerprint,
    archiveSha256,
    archiveByteLength: archiveBytes.length,
    sampleCount: stagingReport.manifest.sampleCount,
    sheetCount: sheetNames.length,
    samplesZipBuilt: true,
    pinnedAudiverisAccepted: false,
    trainingExecuted: false,
    productionAuthorized: false,
    modelReplacementAuthorized: false,
    blockers: Object.freeze([AUDIVERIS_PINNED_NATIVE_SERIALIZER_BLOCKER.PINNED_AUDIVERIS_ACCEPTANCE_REQUIRED]),
  })
  return Object.freeze({ report, archiveBytes })
}

export function bindPinnedAudiverisAcceptance(buildResult, probeEvidence) {
  if (!isPinnedAudiverisNativeArchiveBuild(buildResult?.report) || !Buffer.isBuffer(buildResult?.archiveBytes)) {
    throw new TypeError('a valid T6 archive build result is required.')
  }
  const build = buildResult.report
  if (build.status !== AUDIVERIS_PINNED_NATIVE_SERIALIZER_STATUS.ARCHIVE_BUILT_PENDING_PINNED_ACCEPTANCE) {
    throw new TypeError('only a pending T6 archive can receive pinned Audiveris acceptance.')
  }
  if (hashBytes(buildResult.archiveBytes) !== build.archiveSha256 || buildResult.archiveBytes.length !== build.archiveByteLength) {
    throw new TypeError('archive bytes do not bind the recorded T6 archive fingerprint.')
  }

  assertSupportedInputObject(probeEvidence, ACCEPTANCE_INPUT_FIELDS, 'acceptance evidence')
  const probeKind = requiredString(probeEvidence.probeKind, 'acceptanceEvidence.probeKind', 128)
  const probeApi = requiredString(probeEvidence.probeApi, 'acceptanceEvidence.probeApi', 128)
  const upstreamRevision = requiredGitSha1(probeEvidence.upstreamRevision, 'acceptanceEvidence.upstreamRevision')
  const archiveSha256 = requiredSha256(probeEvidence.archiveSha256, 'acceptanceEvidence.archiveSha256')
  if (probeKind !== AUDIVERIS_PINNED_ACCEPTANCE_PROBE.kind || probeApi !== AUDIVERIS_PINNED_ACCEPTANCE_PROBE.api) {
    throw new TypeError('acceptance evidence was not produced by the required SampleRepository probe contract.')
  }
  if (upstreamRevision !== AUDIVERIS_PINNED_REVISION || upstreamRevision !== build.upstreamRevision) {
    throw new TypeError('acceptance evidence does not bind the exact pinned Audiveris revision.')
  }
  if (archiveSha256 !== build.archiveSha256) {
    throw new TypeError('acceptance evidence does not bind the exact archive SHA-256.')
  }
  if (probeEvidence.repositoryLoaded !== true) {
    throw new TypeError('pinned Audiveris SampleRepository did not report a loaded repository.')
  }
  if (!Number.isSafeInteger(probeEvidence.loadedSampleCount) || probeEvidence.loadedSampleCount !== build.sampleCount) {
    throw new TypeError('pinned Audiveris loaded sample count does not match the exact serialized sample count.')
  }

  return Object.freeze({
    schemaVersion: AUDIVERIS_PINNED_NATIVE_SERIALIZER_SCHEMA_VERSION,
    status: AUDIVERIS_PINNED_NATIVE_SERIALIZER_STATUS.ACCEPTED_BY_PINNED_AUDIVERIS,
    upstreamRevision: build.upstreamRevision,
    stagingManifestFingerprint: build.stagingManifestFingerprint,
    archiveSha256: build.archiveSha256,
    archiveByteLength: build.archiveByteLength,
    sampleCount: build.sampleCount,
    sheetCount: build.sheetCount,
    samplesZipBuilt: true,
    pinnedAudiverisAccepted: true,
    acceptanceProbeKind: probeKind,
    acceptanceProbeApi: probeApi,
    loadedSampleCount: probeEvidence.loadedSampleCount,
    trainingExecuted: false,
    productionAuthorized: false,
    modelReplacementAuthorized: false,
    blockers: Object.freeze([]),
  })
}

export function isPinnedAudiverisNativeArchiveBuild(value) {
  try {
    if (!assertExactFrozenRecord(value, BUILD_REPORT_FIELDS)) return false
    if (value.schemaVersion !== AUDIVERIS_PINNED_NATIVE_SERIALIZER_SCHEMA_VERSION) return false
    if (!Object.values(AUDIVERIS_PINNED_NATIVE_SERIALIZER_STATUS).includes(value.status)) return false
    if (value.status === AUDIVERIS_PINNED_NATIVE_SERIALIZER_STATUS.ACCEPTED_BY_PINNED_AUDIVERIS) return false
    if (value.upstreamRevision !== AUDIVERIS_PINNED_REVISION) return false
    if (value.trainingExecuted !== false || value.productionAuthorized !== false || value.modelReplacementAuthorized !== false) return false
    if (!Array.isArray(value.blockers) || !Object.isFrozen(value.blockers)) return false
    if (value.status === AUDIVERIS_PINNED_NATIVE_SERIALIZER_STATUS.BLOCKED_STAGING_INPUT) {
      return (
        value.samplesZipBuilt === false && value.pinnedAudiverisAccepted === false &&
        value.archiveSha256 === null && value.archiveByteLength === 0 &&
        value.sheetCount === 0 && Number.isSafeInteger(value.sampleCount) && value.sampleCount >= 0 &&
        (value.stagingManifestFingerprint === null || SHA256_RE.test(value.stagingManifestFingerprint)) &&
        value.blockers.length === 1 &&
        value.blockers[0] === AUDIVERIS_PINNED_NATIVE_SERIALIZER_BLOCKER.T5_SERIALIZER_READY_REPORT_REQUIRED
      )
    }
    return (
      value.samplesZipBuilt === true && value.pinnedAudiverisAccepted === false &&
      SHA256_RE.test(value.stagingManifestFingerprint) && SHA256_RE.test(value.archiveSha256) &&
      Number.isSafeInteger(value.archiveByteLength) && value.archiveByteLength > 0 &&
      Number.isSafeInteger(value.sampleCount) && value.sampleCount > 0 &&
      Number.isSafeInteger(value.sheetCount) && value.sheetCount > 0 &&
      value.blockers.length === 1 && value.blockers[0] === AUDIVERIS_PINNED_NATIVE_SERIALIZER_BLOCKER.PINNED_AUDIVERIS_ACCEPTANCE_REQUIRED
    )
  } catch {
    return false
  }
}

export function isPinnedAudiverisAcceptanceReport(value) {
  try {
    if (!assertExactFrozenRecord(value, ACCEPTANCE_REPORT_FIELDS)) return false
    return (
      value.schemaVersion === AUDIVERIS_PINNED_NATIVE_SERIALIZER_SCHEMA_VERSION &&
      value.status === AUDIVERIS_PINNED_NATIVE_SERIALIZER_STATUS.ACCEPTED_BY_PINNED_AUDIVERIS &&
      value.upstreamRevision === AUDIVERIS_PINNED_REVISION &&
      SHA256_RE.test(value.stagingManifestFingerprint) && SHA256_RE.test(value.archiveSha256) &&
      Number.isSafeInteger(value.archiveByteLength) && value.archiveByteLength > 0 &&
      Number.isSafeInteger(value.sampleCount) && value.sampleCount > 0 &&
      Number.isSafeInteger(value.sheetCount) && value.sheetCount > 0 &&
      value.samplesZipBuilt === true && value.pinnedAudiverisAccepted === true &&
      value.acceptanceProbeKind === AUDIVERIS_PINNED_ACCEPTANCE_PROBE.kind &&
      value.acceptanceProbeApi === AUDIVERIS_PINNED_ACCEPTANCE_PROBE.api &&
      value.loadedSampleCount === value.sampleCount &&
      value.trainingExecuted === false && value.productionAuthorized === false &&
      value.modelReplacementAuthorized === false &&
      Array.isArray(value.blockers) && Object.isFrozen(value.blockers) && value.blockers.length === 0
    )
  } catch {
    return false
  }
}
