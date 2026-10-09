import {
  GUITAR_TAB_MAX_FRET,
  GUITAR_TAB_STANDARD_TUNING_MIDI,
  validateGuitarTabExport,
} from './guitarTabExportValidator.js'
import { normalizeGuitarTabTargetSelection } from './guitarTabCanonicalIdentity.js'

export const EDITOR_GUITAR_TAB_HANDOFF_SCHEMA_VERSION = '1.0.0'
export const EDITOR_GUITAR_TAB_MAX_FRET = GUITAR_TAB_MAX_FRET
export const EDITOR_STANDARD_TUNING_MIDI = GUITAR_TAB_STANDARD_TUNING_MIDI

function fail(code, { category = null, validatorCode = null } = {}) {
  const error = new Error(`editor-guitar-tab-handoff-${code}`)
  if (category) error.category = category
  if (validatorCode) error.code = validatorCode
  throw error
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeTargetSelection(targetSelection) {
  try {
    return normalizeGuitarTabTargetSelection(targetSelection, { allowNull: true })
  } catch {
    fail('target-selection-invalid', { category: 'IDENTITY', validatorCode: 'TARGET_SELECTION_INVALID' })
  }
}

function hexFromBuffer(buffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256Utf8(value) {
  const subtle = globalThis.crypto?.subtle
  if (!subtle || typeof subtle.digest !== 'function') fail('crypto-unavailable')
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value))
  return hexFromBuffer(digest)
}

function throwValidatorFailure(result) {
  const code = String(result?.code ?? 'VALIDATION_FAILED')
    .toLowerCase()
    .replaceAll('_', '-')
  fail(code, {
    category: result?.category ?? 'RUNTIME',
    validatorCode: result?.code ?? 'VALIDATION_FAILED',
  })
}

export async function prepareEditorGuitarTabHandoff({
  scoreUpload,
  guitarTabMusicXml,
  draftId,
  targetSelection = null,
} = {}) {
  if (!isRecord(scoreUpload)) fail('score-upload-required')
  if (!hasText(draftId)) fail('draft-id-required')
  if (scoreUpload.draftId !== draftId) fail('draft-mismatch')
  if (!hasText(scoreUpload.musicXml)) fail('score-musicxml-required')
  if (
    typeof scoreUpload.musicXmlFingerprint !== 'string'
    || !/^[0-9a-f]{64}$/u.test(scoreUpload.musicXmlFingerprint)
  ) fail('score-fingerprint-required')
  if (!hasText(guitarTabMusicXml)) fail('tab-empty')

  const normalizedTargetSelection = normalizeTargetSelection(targetSelection)
  const validation = validateGuitarTabExport({
    scoreMusicXml: scoreUpload.musicXml,
    guitarTabMusicXml,
    targetSelection: normalizedTargetSelection,
  })
  if (!validation.ok) throwValidatorFailure(validation)

  const guitarTabMusicXmlFingerprint = await sha256Utf8(guitarTabMusicXml)
  const targetSelectionFingerprint = normalizedTargetSelection === null
    ? null
    : await sha256Utf8(JSON.stringify({
        schemaVersion: EDITOR_GUITAR_TAB_HANDOFF_SCHEMA_VERSION,
        draftId,
        scoreMusicXmlFingerprint: scoreUpload.musicXmlFingerprint,
        guitarTabMusicXmlFingerprint,
        targetSelection: normalizedTargetSelection,
      }))

  return Object.freeze({
    schemaVersion: EDITOR_GUITAR_TAB_HANDOFF_SCHEMA_VERSION,
    draftId,
    scoreMusicXmlFingerprint: scoreUpload.musicXmlFingerprint,
    guitarTabMusicXmlFingerprint,
    guitarTabMusicXml,
    pitchedEventCount: validation.facts.scoreEventCount,
    ...(normalizedTargetSelection === null
      ? {}
      : {
          targetSelection: normalizedTargetSelection,
          targetSelectionFingerprint,
        }),
  })
}
