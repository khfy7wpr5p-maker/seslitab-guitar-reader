// SES-118 / TD-PROD-05 — shared teacher-side Secure Delivery mechanics.
//
// This module deliberately owns no SCORE or CHORD_BOARD content authority.
// It accepts only already-authoritative assignment/package pairs, validates
// them through the existing Secure Delivery union, then coordinates the
// existing batch prepare -> exact ack -> batch deliver -> exact ack flow.

import {
  isPrivateAssignment,
} from './privateAssignment.js'
import {
  assertSecureDeliveryPackageMatchesAssignment,
  restoreSecureDeliveryPackage,
} from './secureDeliveryPackage.js'
import {
  restorePrivateAssignmentV1,
} from './teacherDeliveryWireCodec.js'
import {
  sameChordBoardVoicingSnapshot,
} from './chordBoardVoicingCanonical.js'
import {
  isScoreAssignmentSourceBinding,
} from './scoreAssignmentSourceBinding.js'
import {
  isChordBoardAssignmentSourceBinding,
} from './chordBoardAssignmentSourceBinding.js'
import {
  assertStrictInputObject,
  normalizeRequiredId,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

export const TEACHER_ASSIGNMENT_DELIVERY_PHASE =
  Object.freeze({
    LOCAL_ASSIGNMENT_ONLY:
      'LOCAL_ASSIGNMENT_ONLY',
    DURABLY_PREPARED:
      'DURABLY_PREPARED',
    DELIVERED_TO_STUDENT:
      'DELIVERED_TO_STUDENT',
  })

export const TEACHER_ASSIGNMENT_DELIVERY_MAX_BATCH_SIZE =
  40

const ITEM_FIELDS = Object.freeze([
  'assignment',
  'package',
])

const SCORE_SOURCE_FIELDS = Object.freeze([
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

function sameSourceAuthority(left, right) {
  if (
    isScoreAssignmentSourceBinding(left) &&
    isScoreAssignmentSourceBinding(right)
  ) {
    return SCORE_SOURCE_FIELDS.every(
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
    isPrivateAssignment(left) &&
    isPrivateAssignment(right) &&
    left.schemaVersion === right.schemaVersion &&
    left.assignmentId === right.assignmentId &&
    left.studentId === right.studentId &&
    left.practiceType === right.practiceType &&
    left.teacherNote === right.teacherNote &&
    left.state === right.state &&
    left.assignedAt === right.assignedAt &&
    left.revokedAt === right.revokedAt &&
    sameSourceAuthority(
      left.sourceRef,
      right.sourceRef,
    )
  )
}

function normalizedAssignments(items) {
  if (
    !Array.isArray(items) ||
    items.length === 0 ||
    items.length >
      TEACHER_ASSIGNMENT_DELIVERY_MAX_BATCH_SIZE
  ) {
    throw new TypeError(
      'teacher assignment delivery batch must contain 1 to 40 items.',
    )
  }

  const seen = new Set()
  const normalized = []

  for (const rawItem of items) {
    assertStrictInputObject(
      rawItem,
      ITEM_FIELDS,
      'TeacherAssignmentDeliveryItem',
    )

    if (!isPrivateAssignment(rawItem.assignment)) {
      throw new TypeError(
        'teacher assignment delivery requires an immutable PrivateAssignment.',
      )
    }

    const assignment = rawItem.assignment
    if (seen.has(assignment.assignmentId)) {
      throw new Error(
        'teacher assignment delivery duplicate assignmentId conflict.',
      )
    }
    seen.add(assignment.assignmentId)

    const pkg = restoreSecureDeliveryPackage(
      rawItem.package,
    )
    assertSecureDeliveryPackageMatchesAssignment(
      pkg,
      assignment,
    )

    normalized.push(
      Object.freeze({
        assignment,
        package: pkg,
      }),
    )
  }

  return Object.freeze(normalized)
}

function assertPreparedAcknowledgement(
  acknowledgement,
  items,
) {
  if (
    !Array.isArray(acknowledgement) ||
    acknowledgement.length !== items.length
  ) {
    throw new Error(
      'secure preparation acknowledgement mismatch.',
    )
  }

  for (
    let index = 0;
    index < items.length;
    index += 1
  ) {
    const expected = items[index]
    const actual = acknowledgement[index]

    if (
      actual === null ||
      typeof actual !== 'object' ||
      Array.isArray(actual)
    ) {
      throw new Error(
        'secure preparation acknowledgement mismatch.',
      )
    }

    let restored
    try {
      restored = restorePrivateAssignmentV1(
        actual.assignment,
      )
      normalizeRequiredId(
        actual.teacherId,
        'teacherId',
      )
      normalizeRequiredId(
        actual.packageId,
        'packageId',
      )
      normalizeRequiredTimestamp(
        actual.preparedAt,
        'preparedAt',
      )
    } catch {
      throw new Error(
        'secure preparation acknowledgement mismatch.',
      )
    }

    if (
      !sameAssignment(
        restored,
        expected.assignment,
      ) ||
      actual.packageId !==
        expected.package.packageId ||
      typeof actual.packageFingerprint !==
        'string' ||
      !/^[a-f0-9]{64}$/u.test(
        actual.packageFingerprint,
      )
    ) {
      throw new Error(
        'secure preparation acknowledgement mismatch.',
      )
    }
  }

  return acknowledgement
}

function assertDeliveryAcknowledgement(
  acknowledgement,
  items,
) {
  if (
    !Array.isArray(acknowledgement) ||
    acknowledgement.length !== items.length
  ) {
    throw new Error(
      'secure delivery acknowledgement mismatch.',
    )
  }

  for (
    let index = 0;
    index < items.length;
    index += 1
  ) {
    const expected = items[index]
    const actual = acknowledgement[index]

    try {
      normalizeRequiredTimestamp(
        actual?.deliveredAt,
        'deliveredAt',
      )
    } catch {
      throw new Error(
        'secure delivery acknowledgement mismatch.',
      )
    }

    if (
      actual?.deliveryId !==
        expected.assignment.assignmentId ||
      actual?.assignmentId !==
        expected.assignment.assignmentId ||
      actual?.studentId !==
        expected.assignment.studentId ||
      actual?.packageId !==
        expected.package.packageId ||
      actual?.revokedAt !== null
    ) {
      throw new Error(
        'secure delivery acknowledgement mismatch.',
      )
    }
  }

  return acknowledgement
}

function phaseResult({
  ok,
  phase,
  assignments,
}) {
  return Object.freeze({
    ok,
    phase,
    assignments: Object.freeze([
      ...assignments,
    ]),
  })
}

export function createTeacherAssignmentDeliveryOrchestrator({
  secureDeliveryClient,
} = {}) {
  if (
    !secureDeliveryClient ||
    typeof secureDeliveryClient
      .prepareAssignments !== 'function' ||
    typeof secureDeliveryClient
      .deliverAssignments !== 'function'
  ) {
    throw new TypeError(
      'secureDeliveryClient must provide prepareAssignments() and deliverAssignments().',
    )
  }

  async function deliver(rawItems = []) {
    let items
    try {
      items = normalizedAssignments(rawItems)
    } catch {
      return phaseResult({
        ok: false,
        phase:
          TEACHER_ASSIGNMENT_DELIVERY_PHASE
            .LOCAL_ASSIGNMENT_ONLY,
        assignments: [],
      })
    }

    const assignments = items.map(
      (item) => item.assignment,
    )

    try {
      const acknowledgement =
        await secureDeliveryClient
          .prepareAssignments(items)

      assertPreparedAcknowledgement(
        acknowledgement,
        items,
      )
    } catch {
      return phaseResult({
        ok: false,
        phase:
          TEACHER_ASSIGNMENT_DELIVERY_PHASE
            .LOCAL_ASSIGNMENT_ONLY,
        assignments,
      })
    }

    try {
      const acknowledgement =
        await secureDeliveryClient
          .deliverAssignments(
            assignments.map(
              (assignment) =>
                assignment.assignmentId,
            ),
          )

      assertDeliveryAcknowledgement(
        acknowledgement,
        items,
      )
    } catch {
      return phaseResult({
        ok: false,
        phase:
          TEACHER_ASSIGNMENT_DELIVERY_PHASE
            .DURABLY_PREPARED,
        assignments,
      })
    }

    return phaseResult({
      ok: true,
      phase:
        TEACHER_ASSIGNMENT_DELIVERY_PHASE
          .DELIVERED_TO_STUDENT,
      assignments,
    })
  }

  return Object.freeze({
    deliver,
  })
}
