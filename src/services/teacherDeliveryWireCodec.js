import {
  createStudentRosterEntry,
  STUDENT_ROSTER_ENTRY_SCHEMA_VERSION,
} from './studentRosterEntry.js'
import {
  createPoolItem,
  POOL_ITEM_SCHEMA_VERSION,
} from './poolItem.js'
import {
  createActivePoolPublicationRecord,
  POOL_PUBLICATION_RECORD_SCHEMA_VERSION,
  revokePoolPublicationRecord,
} from './poolPublicationRecord.js'
import {
  createPrivateAssignment,
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  PRIVATE_ASSIGNMENT_SCHEMA_VERSION,
  PRIVATE_ASSIGNMENT_STATE,
} from './privateAssignment.js'
import {
  SCORE_ASSIGNMENT_SOURCE_SCHEMA_VERSION,
  SCORE_ASSIGNMENT_SOURCE_KIND,
  isScoreAssignmentSourceBinding,
} from './scoreAssignmentSourceBinding.js'
import {
  isChordBoardAssignmentSourceBinding,
  restoreChordBoardAssignmentSourceBindingV1,
} from './chordBoardAssignmentSourceBinding.js'
import {
  sameChordBoardVoicingSnapshot,
} from './chordBoardVoicingCanonical.js'
import {
  ASSIGNMENT_LIFECYCLE_SCHEMA_VERSION,
  isAssignmentLifecycleRecord,
} from './assignmentLifecycleRecord.js'
import {
  assertStrictInputObject,
  normalizeNullableTimestamp,
  normalizeRequiredId,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

const ROSTER_FIELDS = Object.freeze([
  'schemaVersion',
  'studentId',
  'displayNameOrNickname',
  'active',
])

const SOURCE_FIELDS = Object.freeze([
  'schemaVersion',
  'sourceKind',
  'studentId',
  'sourceId',
  'sourceRevisionId',
  'revisionId',
  'revisionKind',
  'contentFingerprint',
  'lineageFingerprint',
  'approvalId',
  'authorizationId',
  'qualityEvidenceId',
  'revalidationEvidenceId',
  'readinessRoute',
  'package12Status',
  'boundAt',
])

const PRIVATE_ASSIGNMENT_FIELDS = Object.freeze([
  'schemaVersion',
  'assignmentId',
  'studentId',
  'practiceType',
  'teacherNote',
  'state',
  'assignedAt',
  'revokedAt',
  'sourceRef',
])

const POOL_ITEM_FIELDS = Object.freeze([
  'schemaVersion',
  'poolItemId',
  'title',
  'shortDescription',
  'detailText',
  'publishedAt',
  'audienceMode',
  'recipientStudentIds',
  'revokedAt',
])

const POOL_PUBLICATION_FIELDS = Object.freeze([
  'schemaVersion',
  'item',
  'revokedAt',
])

const LIFECYCLE_FIELDS = Object.freeze([
  'schemaVersion',
  'assignment',
  'state',
  'stateChangedAt',
  'revokedAt',
])

function restoreScoreAssignmentSourceBindingV1(raw) {
  assertStrictInputObject(raw, SOURCE_FIELDS, 'ScoreAssignmentSourceBinding wire')
  if (
    raw.schemaVersion !== SCORE_ASSIGNMENT_SOURCE_SCHEMA_VERSION ||
    raw.sourceKind !== SCORE_ASSIGNMENT_SOURCE_KIND
  ) {
    throw new TypeError('unsupported ScoreAssignmentSourceBinding schema.')
  }

  const restored = Object.freeze({
    schemaVersion: SCORE_ASSIGNMENT_SOURCE_SCHEMA_VERSION,
    sourceKind: SCORE_ASSIGNMENT_SOURCE_KIND,
    studentId: normalizeRequiredId(raw.studentId, 'studentId'),
    sourceId: normalizeRequiredId(raw.sourceId, 'sourceId'),
    sourceRevisionId: normalizeRequiredId(raw.sourceRevisionId, 'sourceRevisionId'),
    revisionId: normalizeRequiredId(raw.revisionId, 'revisionId'),
    revisionKind: normalizeRequiredId(raw.revisionKind, 'revisionKind'),
    contentFingerprint: normalizeRequiredId(raw.contentFingerprint, 'contentFingerprint'),
    lineageFingerprint: normalizeRequiredId(raw.lineageFingerprint, 'lineageFingerprint'),
    approvalId: normalizeRequiredId(raw.approvalId, 'approvalId'),
    authorizationId: normalizeRequiredId(raw.authorizationId, 'authorizationId'),
    qualityEvidenceId: normalizeRequiredId(raw.qualityEvidenceId, 'qualityEvidenceId'),
    revalidationEvidenceId:
      raw.revalidationEvidenceId === null
        ? null
        : normalizeRequiredId(raw.revalidationEvidenceId, 'revalidationEvidenceId'),
    readinessRoute: normalizeRequiredId(raw.readinessRoute, 'readinessRoute'),
    package12Status: normalizeRequiredId(raw.package12Status, 'package12Status'),
    boundAt: normalizeNullableTimestamp(raw.boundAt, 'boundAt'),
  })

  if (!isScoreAssignmentSourceBinding(restored)) {
    throw new TypeError('invalid ScoreAssignmentSourceBinding wire snapshot.')
  }
  return restored
}

function sameSource(left, right) {
  if (
    isScoreAssignmentSourceBinding(left) &&
    isScoreAssignmentSourceBinding(right)
  ) {
    return SOURCE_FIELDS.every(
      (field) => left[field] === right[field],
    )
  }

  if (
    isChordBoardAssignmentSourceBinding(left) &&
    isChordBoardAssignmentSourceBinding(right)
  ) {
    return (
      left.schemaVersion === right.schemaVersion &&
      left.sourceKind === right.sourceKind &&
      left.studentId === right.studentId &&
      left.voicingFingerprint ===
        right.voicingFingerprint &&
      left.boundAt === right.boundAt &&
      sameChordBoardVoicingSnapshot(
        left.snapshot,
        right.snapshot,
      )
    )
  }

  return false
}

function sameAssignment(left, right) {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.assignmentId === right.assignmentId &&
    left.studentId === right.studentId &&
    left.practiceType === right.practiceType &&
    left.teacherNote === right.teacherNote &&
    left.state === right.state &&
    left.assignedAt === right.assignedAt &&
    left.revokedAt === right.revokedAt &&
    sameSource(left.sourceRef, right.sourceRef)
  )
}

export function restoreStudentRosterEntryV1(raw) {
  assertStrictInputObject(raw, ROSTER_FIELDS, 'StudentRosterEntry wire')
  if (raw.schemaVersion !== STUDENT_ROSTER_ENTRY_SCHEMA_VERSION) {
    throw new TypeError('unsupported StudentRosterEntry schema.')
  }
  return createStudentRosterEntry({
    studentId: raw.studentId,
    displayNameOrNickname: raw.displayNameOrNickname,
    active: raw.active,
  })
}

export function restorePoolPublicationRecordV1(raw) {
  assertStrictInputObject(raw, POOL_PUBLICATION_FIELDS, 'PoolPublicationRecord wire')
  if (raw.schemaVersion !== POOL_PUBLICATION_RECORD_SCHEMA_VERSION) {
    throw new TypeError('unsupported PoolPublicationRecord schema.')
  }

  assertStrictInputObject(raw.item, POOL_ITEM_FIELDS, 'PoolItem wire')
  if (
    raw.item.schemaVersion !== POOL_ITEM_SCHEMA_VERSION ||
    raw.item.revokedAt !== null
  ) {
    throw new TypeError('invalid PoolItem wire snapshot.')
  }

  const item = createPoolItem({
    poolItemId: raw.item.poolItemId,
    title: raw.item.title,
    shortDescription: raw.item.shortDescription,
    detailText: raw.item.detailText,
    publishedAt: raw.item.publishedAt,
    audienceMode: raw.item.audienceMode,
    recipientStudentIds: raw.item.recipientStudentIds,
  })
  const active = createActivePoolPublicationRecord(item)
  if (raw.revokedAt === null) return active

  return revokePoolPublicationRecord(
    active,
    normalizeRequiredTimestamp(raw.revokedAt, 'revokedAt'),
  )
}

export function restorePrivateAssignmentV1(raw) {
  assertStrictInputObject(raw, PRIVATE_ASSIGNMENT_FIELDS, 'PrivateAssignment wire')
  if (
    raw.schemaVersion !== PRIVATE_ASSIGNMENT_SCHEMA_VERSION ||
    raw.state !== PRIVATE_ASSIGNMENT_STATE.ACTIVE ||
    raw.revokedAt !== null
  ) {
    throw new TypeError('invalid initial PrivateAssignment wire snapshot.')
  }

  let sourceRef
  if (
    raw.practiceType ===
      PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE
  ) {
    sourceRef =
      restoreScoreAssignmentSourceBindingV1(
        raw.sourceRef,
      )
  } else if (
    raw.practiceType ===
      PRIVATE_ASSIGNMENT_PRACTICE_TYPE.CHORD_BOARD
  ) {
    sourceRef =
      restoreChordBoardAssignmentSourceBindingV1(
        raw.sourceRef,
      )
  } else {
    throw new TypeError(
      'unsupported PrivateAssignment practiceType.',
    )
  }
  return createPrivateAssignment({
    assignmentId: raw.assignmentId,
    studentId: raw.studentId,
    practiceType: raw.practiceType,
    teacherNote: raw.teacherNote,
    assignedAt: raw.assignedAt,
    sourceRef,
  })
}

export function restoreAssignmentLifecycleRecordV1(raw, assignment) {
  assertStrictInputObject(raw, LIFECYCLE_FIELDS, 'AssignmentLifecycleRecord wire')
  if (raw.schemaVersion !== ASSIGNMENT_LIFECYCLE_SCHEMA_VERSION) {
    throw new TypeError('unsupported AssignmentLifecycleRecord schema.')
  }

  const wireAssignment = restorePrivateAssignmentV1(raw.assignment)
  if (!sameAssignment(wireAssignment, assignment)) {
    throw new Error('assignment lifecycle wire assignment mismatch.')
  }

  const candidate = Object.freeze({
    schemaVersion: ASSIGNMENT_LIFECYCLE_SCHEMA_VERSION,
    assignment,
    state: raw.state,
    stateChangedAt: normalizeRequiredTimestamp(
      raw.stateChangedAt,
      'stateChangedAt',
    ),
    revokedAt:
      raw.revokedAt === null
        ? null
        : normalizeRequiredTimestamp(raw.revokedAt, 'revokedAt'),
  })

  if (!isAssignmentLifecycleRecord(candidate)) {
    throw new TypeError('invalid AssignmentLifecycleRecord wire snapshot.')
  }
  return candidate
}
