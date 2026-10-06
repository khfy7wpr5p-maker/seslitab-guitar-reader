import { inspectMusicXml } from '../../musicXmlSecurity.js'
import {
  normalizeSmoosicDirectUploadTiming,
} from './smoosicDirectUploadTimingNormalization.js'

export const TEACHER_ASSIGNMENT_SCORE_DELIVERY_MAX_BYTES =
  900 * 1024

function requiredText(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${fieldName} must be non-empty text.`)
  }
  return value.trim()
}

function requiredTimestamp(now) {
  if (typeof now !== 'function') {
    throw new TypeError('now must be a function.')
  }
  return requiredText(now(), 'createdAt')
}

function fail(code) {
  throw new Error(`assignment-composer-score-upload-${code}`)
}

function hexFromBuffer(buffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) =>
      byte.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256Utf8(value) {
  const subtle = globalThis.crypto?.subtle
  if (
    !subtle ||
    typeof subtle.digest !== 'function'
  ) {
    fail('crypto-unavailable')
  }

  const bytes =
    new TextEncoder().encode(value)
  const digest =
    await subtle.digest('SHA-256', bytes)
  return hexFromBuffer(digest)
}

function inspectScoreXml(musicXml) {
  const inspection = inspectMusicXml(
    musicXml,
    {
      maxBytes:
        TEACHER_ASSIGNMENT_SCORE_DELIVERY_MAX_BYTES,
    },
  )
  if (!inspection.ok) {
    fail(
      `invalid-${inspection.code ?? 'structure'}`,
    )
  }
  return inspection
}

export async function prepareTeacherAssignmentScoreUpload({
  musicXml,
  teacherId,
  draftId,
  now,
} = {}) {
  requiredText(teacherId, 'teacherId')
  const workDraftId =
    requiredText(draftId, 'draftId')
  const createdAt =
    requiredTimestamp(now)

  if (
    typeof musicXml !== 'string' ||
    musicXml.trim() === ''
  ) {
    fail('invalid-empty')
  }

  inspectScoreXml(musicXml)

  const acceptedMusicXml =
    normalizeSmoosicDirectUploadTiming(
      musicXml,
    )
  if (acceptedMusicXml !== musicXml) {
    inspectScoreXml(acceptedMusicXml)
  }

  const musicXmlFingerprint =
    await sha256Utf8(acceptedMusicXml)

  return Object.freeze({
    draftId: workDraftId,
    musicXml: acceptedMusicXml,
    musicXmlFingerprint,
    createdAt,
    canonicalEvents: Object.freeze([]),
  })
}
