import { inspectMusicXml } from '../../musicXmlSecurity.js'
import { parseMusicXmlToNotes } from './musicEngine.js'
import {
  approveTeacherWorkspace,
  createTeacherWorkspace,
  getTeacherWorkspaceCurrentRevision,
} from './teacherWorkspaceModel.js'
import { registerPrDProductMusicXml } from './editorPrDRevisionMusicXmlRegistry.js'
import { createFinalMusicXmlIntake } from './finalMusicXmlIntake.js'
import { MAX_MUSIC_XML_FILE_SIZE } from './musicXmlFile.js'

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

export async function prepareTeacherAssignmentScoreUpload({
  musicXml,
  teacherId,
  draftId,
  now,
} = {}) {
  const actorId = requiredText(teacherId, 'teacherId')
  const workDraftId = requiredText(draftId, 'draftId')
  const createdAt = requiredTimestamp(now)

  if (typeof musicXml !== 'string' || musicXml.trim() === '') {
    fail('invalid-empty')
  }

  const inspection = inspectMusicXml(musicXml, {
    maxBytes: MAX_MUSIC_XML_FILE_SIZE,
  })
  if (!inspection.ok) {
    fail(`invalid-${inspection.code ?? 'structure'}`)
  }

  const parsed = parseMusicXmlToNotes(musicXml)
  if (
    parsed?.error ||
    !Array.isArray(parsed?.notes) ||
    parsed.notes.length === 0
  ) {
    fail('semantic-parse-failed')
  }

  const sourceNotes = parsed.notes

  let workspace = createTeacherWorkspace({
    content: sourceNotes,
    actorId,
    sourceId: `assignment-composer:${workDraftId}:score`,
    automaticRevisionId:
      `assignment-composer:${workDraftId}:revision`,
    historyId:
      `assignment-composer:${workDraftId}:history`,
    createdAt,
  })

  workspace = approveTeacherWorkspace({
    workspace,
    approvalId:
      `assignment-composer:${workDraftId}:approval`,
    createdAt,
  })

  const revision =
    getTeacherWorkspaceCurrentRevision(workspace)

  registerPrDProductMusicXml(
    revision,
    musicXml,
    {
      evidence:
        'ses-141-assignment-composer-upload',
    },
  )

  const intake =
    await createFinalMusicXmlIntake({
      workspace,
      revision,
    })

  if (intake.musicXml !== musicXml) {
    fail('authority-mismatch')
  }

  return Object.freeze({
    musicXml,
    sourceNotes,
    workspace,
    intake,
    semanticNoteCount:
      intake.semanticNoteCount,
  })
}
