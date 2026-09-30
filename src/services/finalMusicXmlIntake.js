// SES-116 / TD-PROD-03 — final teacher MusicXML intake authority.
//
// This boundary deliberately does not build a student PracticePackage and does
// not activate delivery. It binds the exact MusicXML already accepted by the
// Smoosic/product revision pipeline to the exact current immutable teacher
// revision, then fingerprints that byte-exact XML for later package assembly.

import {
  inspectMusicXml,
  MAX_MUSIC_XML_SIZE_BYTES,
} from '../../musicXmlSecurity.js'
import {
  resolvePrDProductMusicXml,
} from './editorPrDRevisionMusicXmlRegistry.js'
import {
  parseMusicXmlToNotes,
} from './musicEngine.js'
import {
  createAutomaticRevision,
  isTeacherRevision,
} from './teacherRevisionModel.js'
import {
  getTeacherWorkspaceCurrentRevision,
  isTeacherWorkspace,
} from './teacherWorkspaceModel.js'

export const FINAL_MUSICXML_INTAKE_SCHEMA_VERSION = 1

const REVISION_BINDING_FIELDS = Object.freeze([
  'revisionId',
  'revisionKind',
  'sourceId',
  'sourceRevisionId',
  'parentRevisionId',
  'parentLineageFingerprint',
  'createdAt',
  'contentFingerprint',
  'lineageFingerprint',
])

function sameRevisionBinding(expected, actual) {
  return REVISION_BINDING_FIELDS.every(
    (field) => expected?.[field] === actual?.[field],
  )
}

function hexFromBuffer(buffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256Utf8(value) {
  const subtle = globalThis.crypto?.subtle
  if (!subtle || typeof subtle.digest !== 'function') {
    throw new Error('final-musicxml-crypto-unavailable')
  }

  const bytes = new TextEncoder().encode(value)
  const digest = await subtle.digest('SHA-256', bytes)
  return hexFromBuffer(digest)
}

function assertSemanticMatch(revision, musicXml) {
  const parsed = parseMusicXmlToNotes(musicXml)
  if (
    parsed?.error
    || !Array.isArray(parsed?.notes)
    || parsed.notes.length === 0
  ) {
    throw new Error('final-musicxml-semantic-empty-or-unparseable')
  }

  const replay = createAutomaticRevision({
    revisionId: revision.sourceRevisionId,
    sourceId: revision.sourceId,
    content: parsed.notes,
    createdAt: null,
  })

  if (
    replay.contentFingerprint !== revision.contentFingerprint
    || parsed.notes.length !== revision.content.length
  ) {
    throw new Error('final-musicxml-semantic-revision-mismatch')
  }

  return parsed.notes.length
}

function authorityFingerprintPayload(revision, musicXmlFingerprint) {
  return JSON.stringify([
    FINAL_MUSICXML_INTAKE_SCHEMA_VERSION,
    revision.sourceId,
    revision.sourceRevisionId,
    revision.revisionId,
    revision.revisionKind,
    revision.parentRevisionId,
    revision.parentLineageFingerprint,
    revision.createdAt,
    revision.contentFingerprint,
    revision.lineageFingerprint,
    musicXmlFingerprint,
  ])
}

export async function createFinalMusicXmlIntake({
  workspace,
  revision,
} = {}) {
  if (!isTeacherWorkspace(workspace)) {
    throw new TypeError('final-musicxml-workspace-invalid')
  }
  if (!isTeacherRevision(revision)) {
    throw new TypeError('final-musicxml-revision-invalid')
  }

  const currentRevision =
    getTeacherWorkspaceCurrentRevision(workspace)

  if (!sameRevisionBinding(currentRevision, revision)) {
    throw new Error('final-musicxml-revision-stale-or-not-current')
  }

  const registryRecord =
    resolvePrDProductMusicXml(currentRevision)

  if (!registryRecord?.musicXml) {
    throw new Error('final-musicxml-registry-missing-or-mismatched')
  }

  const musicXml = registryRecord.musicXml
  const inspection = inspectMusicXml(musicXml, {
    maxBytes: MAX_MUSIC_XML_SIZE_BYTES,
  })

  if (!inspection.ok) {
    throw new Error(
      `final-musicxml-invalid:${inspection.code}`,
    )
  }

  const semanticNoteCount =
    assertSemanticMatch(currentRevision, musicXml)

  const musicXmlFingerprint =
    await sha256Utf8(musicXml)

  const authorityFingerprint =
    await sha256Utf8(
      authorityFingerprintPayload(
        currentRevision,
        musicXmlFingerprint,
      ),
    )

  return Object.freeze({
    schemaVersion:
      FINAL_MUSICXML_INTAKE_SCHEMA_VERSION,
    sourceId: currentRevision.sourceId,
    sourceRevisionId:
      currentRevision.sourceRevisionId,
    revisionId: currentRevision.revisionId,
    revisionKind: currentRevision.revisionKind,
    contentFingerprint:
      currentRevision.contentFingerprint,
    lineageFingerprint:
      currentRevision.lineageFingerprint,
    musicXmlFingerprint,
    authorityFingerprint,
    musicXml,
    semanticNoteCount,
  })
}
