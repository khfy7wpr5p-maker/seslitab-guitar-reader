// SES-117 / TD-PROD-04 — SCORE PracticePackage builder.
//
// This boundary consumes only the exact Task 3 final-MusicXML authority plus
// the exact immutable SCORE assignment/current teacher approval. It does not
// persist, prepare Secure Delivery, deliver, mount UI, generate TAB, or activate
// production writes.

import {
  inspectMusicXml,
} from '../../musicXmlSecurity.js'
import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  isPrivateAssignment,
} from './privateAssignment.js'
import {
  createFinalMusicXmlIntake,
} from './finalMusicXmlIntake.js'
import {
  parseMusicXmlToNotes,
} from './musicEngine.js'
import {
  createStudentPrivatePracticePackageV1,
} from './studentPracticePackageV1.js'
import {
  getTeacherWorkspaceApplicableApproval,
  getTeacherWorkspaceCurrentRevision,
} from './teacherWorkspaceModel.js'
import {
  assertStrictInputObject,
} from './teacherDeliveryContractValidation.js'

const OPTIONAL_GUITAR_TAB_MAX_BYTES = 5_000_000

const INPUT_FIELDS = Object.freeze([
  'workspace',
  'assignment',
  'intake',
  'packageId',
  'title',
  'practice',
  'guitarTabMusicXml',
])

const REQUIRED_FIELDS = Object.freeze([
  'workspace',
  'assignment',
  'intake',
  'packageId',
  'title',
])

const INTAKE_FIELDS = Object.freeze([
  'schemaVersion',
  'sourceId',
  'sourceRevisionId',
  'revisionId',
  'revisionKind',
  'contentFingerprint',
  'lineageFingerprint',
  'musicXmlFingerprint',
  'authorityFingerprint',
  'musicXml',
  'semanticNoteCount',
])

function assertOwnRequiredFields(input) {
  if (
    REQUIRED_FIELDS.some(
      (field) => !Object.hasOwn(input, field),
    )
  ) {
    throw new TypeError(
      'ScorePracticePackageBuilder input contains missing fields.',
    )
  }
}

function sameFinalMusicXmlIntake(expected, actual) {
  if (
    !actual
    || typeof actual !== 'object'
    || Array.isArray(actual)
  ) {
    return false
  }

  return INTAKE_FIELDS.every(
    (field) => expected[field] === actual[field],
  )
}

function assertAssignmentMatchesIntake(
  assignment,
  intake,
) {
  const sourceRef = assignment.sourceRef

  for (const [field, expected] of [
    ['sourceId', intake.sourceId],
    ['sourceRevisionId', intake.sourceRevisionId],
    ['revisionId', intake.revisionId],
    ['revisionKind', intake.revisionKind],
    ['contentFingerprint', intake.contentFingerprint],
    ['lineageFingerprint', intake.lineageFingerprint],
  ]) {
    if (sourceRef[field] !== expected) {
      throw new Error(
        `score-package-assignment-intake-binding-mismatch:${field}`,
      )
    }
  }
}

function assertApprovalMatchesAuthority({
  approval,
  assignment,
  intake,
}) {
  if (!approval) {
    throw new Error(
      'score-package-current-teacher-approval-required',
    )
  }

  if (
    approval.approvalId !==
      assignment.sourceRef.approvalId
  ) {
    throw new Error(
      'score-package-approval-id-mismatch',
    )
  }

  for (const [field, expected] of [
    ['sourceId', intake.sourceId],
    ['sourceRevisionId', intake.sourceRevisionId],
    ['approvedRevisionId', intake.revisionId],
    ['approvedRevisionKind', intake.revisionKind],
    ['approvedContentFingerprint', intake.contentFingerprint],
    ['approvedLineageFingerprint', intake.lineageFingerprint],
  ]) {
    if (approval[field] !== expected) {
      throw new Error(
        `score-package-approval-authority-mismatch:${field}`,
      )
    }
  }

  if (
    typeof approval.createdAt !== 'string'
    || approval.createdAt.trim().length === 0
  ) {
    throw new Error(
      'score-package-approvedAt-timestamp-required',
    )
  }
}

function deriveCanonicalEvents(
  musicXml,
  expectedCount,
) {
  const parsed = parseMusicXmlToNotes(musicXml)

  if (
    parsed?.error
    || !Array.isArray(parsed?.notes)
    || parsed.notes.length === 0
  ) {
    throw new Error(
      'score-package-final-musicxml-semantic-parse-failed',
    )
  }

  if (parsed.notes.length !== expectedCount) {
    throw new Error(
      'score-package-final-musicxml-semantic-count-mismatch',
    )
  }

  return parsed.notes
}

function validateOptionalGuitarTabMusicXml(value) {
  if (value === undefined || value === null) {
    return undefined
  }

  if (
    typeof value !== 'string'
    || value.length === 0
  ) {
    throw new TypeError(
      'score-package-guitar-tab-musicxml-invalid',
    )
  }

  const inspection = inspectMusicXml(value, {
    maxBytes: OPTIONAL_GUITAR_TAB_MAX_BYTES,
  })
  if (!inspection.ok) {
    throw new Error(
      `score-package-guitar-tab-musicxml-invalid:${inspection.code}`,
    )
  }

  return value
}

export async function createScorePracticePackageFromFinalMusicXml(
  input = {},
) {
  assertStrictInputObject(
    input,
    INPUT_FIELDS,
    'ScorePracticePackageBuilder',
  )
  assertOwnRequiredFields(input)

  if (
    !isPrivateAssignment(input.assignment)
    || input.assignment.practiceType !==
      PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE
  ) {
    throw new TypeError(
      'score-package-assignment-must-be-valid-score-private-assignment',
    )
  }

  const revision =
    getTeacherWorkspaceCurrentRevision(
      input.workspace,
    )

  const authoritativeIntake =
    await createFinalMusicXmlIntake({
      workspace: input.workspace,
      revision,
    })

  if (
    !sameFinalMusicXmlIntake(
      authoritativeIntake,
      input.intake,
    )
  ) {
    throw new Error(
      'score-package-final-musicxml-intake-authority-mismatch',
    )
  }

  assertAssignmentMatchesIntake(
    input.assignment,
    authoritativeIntake,
  )

  const approval =
    getTeacherWorkspaceApplicableApproval(
      input.workspace,
    )

  assertApprovalMatchesAuthority({
    approval,
    assignment: input.assignment,
    intake: authoritativeIntake,
  })

  const canonicalEvents =
    deriveCanonicalEvents(
      authoritativeIntake.musicXml,
      authoritativeIntake.semanticNoteCount,
    )

  const guitarTabMusicXml =
    validateOptionalGuitarTabMusicXml(
      input.guitarTabMusicXml,
    )

  return createStudentPrivatePracticePackageV1({
    packageId: input.packageId,
    workId: authoritativeIntake.sourceId,
    title: input.title,
    revisionId: authoritativeIntake.revisionId,
    approvedAt: approval.createdAt,
    studentId: input.assignment.studentId,
    musicXml: authoritativeIntake.musicXml,
    guitarTabMusicXml,
    canonicalEvents,
    practice: input.practice ?? {},
  })
}
