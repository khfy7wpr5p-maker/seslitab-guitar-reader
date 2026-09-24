import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  isPrivateAssignment,
} from './privateAssignment.js'
import {
  STUDENT_PRACTICE_PACKAGE_SCOPE,
  restoreStudentPracticePackageV1,
  validateStudentPracticePackageV1,
} from './studentPracticePackageV1.js'
import {
  STUDENT_CHORD_BOARD_PACKAGE_TYPE,
  restoreStudentChordBoardPackageV1,
  validateStudentChordBoardPackageV1,
} from './studentChordBoardPackageV1.js'
import {
  sameChordBoardVoicingSnapshot,
} from './chordBoardVoicingCanonical.js'

export const SECURE_DELIVERY_PACKAGE_KIND =
  Object.freeze({
    SCORE: 'SCORE',
    CHORD_BOARD: 'CHORD_BOARD',
  })

export function secureDeliveryPackageKind(
  value,
) {
  if (
    value?.packageType ===
      STUDENT_CHORD_BOARD_PACKAGE_TYPE
  ) {
    const validation =
      validateStudentChordBoardPackageV1(
        value,
      )
    if (!validation.ok) {
      throw new TypeError(
        `invalid CHORD_BOARD secure delivery package: ${validation.errors.join('; ')}`,
      )
    }
    return SECURE_DELIVERY_PACKAGE_KIND
      .CHORD_BOARD
  }

  const scoreValidation =
    validateStudentPracticePackageV1(
      value,
    )
  if (scoreValidation.ok) {
    return SECURE_DELIVERY_PACKAGE_KIND.SCORE
  }

  throw new TypeError(
    `invalid secure delivery package: ${scoreValidation.errors.join('; ')}`,
  )
}

export function restoreSecureDeliveryPackage(
  raw,
) {
  if (
    raw?.packageType ===
      STUDENT_CHORD_BOARD_PACKAGE_TYPE
  ) {
    return restoreStudentChordBoardPackageV1(
      raw,
    )
  }
  if (
    raw &&
    typeof raw === 'object' &&
    Object.hasOwn(raw, 'packageType')
  ) {
    throw new TypeError(
      'unsupported secure delivery packageType.',
    )
  }
  return restoreStudentPracticePackageV1(
    raw,
  )
}

export function assertSecureDeliveryPackageMatchesAssignment(
  pkg,
  assignment,
) {
  if (!isPrivateAssignment(assignment)) {
    throw new TypeError(
      'assignment must be a valid immutable PrivateAssignment.',
    )
  }

  if (
    assignment.practiceType ===
      PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE
  ) {
    const validation =
      validateStudentPracticePackageV1(
        pkg,
      )
    if (!validation.ok) {
      throw new TypeError(
        `invalid SCORE secure delivery package: ${validation.errors.join('; ')}`,
      )
    }
    if (
      pkg.publication.scope !==
        STUDENT_PRACTICE_PACKAGE_SCOPE
          .STUDENT_PRIVATE ||
      pkg.publication.recipientStudentId !==
        assignment.studentId
    ) {
      throw new Error(
        'secure delivery package recipient student mismatch.',
      )
    }
    if (
      pkg.approvedRevision.revisionId !==
        assignment.sourceRef.revisionId ||
      pkg.approvedRevision.state !==
        'teacher_approved'
    ) {
      throw new Error(
        'secure delivery SCORE revision authority mismatch.',
      )
    }
    return pkg
  }

  const validation =
    validateStudentChordBoardPackageV1(
      pkg,
    )
  if (!validation.ok) {
    throw new TypeError(
      `invalid CHORD_BOARD secure delivery package: ${validation.errors.join('; ')}`,
    )
  }

  if (
    pkg.packageId !==
      assignment.assignmentId ||
    pkg.assignmentAuthority.assignmentId !==
      assignment.assignmentId
  ) {
    throw new Error(
      'secure delivery CHORD_BOARD assignmentId mismatch.',
    )
  }
  if (
    pkg.publication.recipientStudentId !==
      assignment.studentId
  ) {
    throw new Error(
      'secure delivery package recipient student mismatch.',
    )
  }
  if (
    pkg.assignmentAuthority.assignedAt !==
      assignment.assignedAt
  ) {
    throw new Error(
      'secure delivery CHORD_BOARD assignedAt mismatch.',
    )
  }
  if (
    pkg.practice.teacherNote !==
      assignment.teacherNote
  ) {
    throw new Error(
      'secure delivery CHORD_BOARD teacherNote mismatch.',
    )
  }
  if (
    pkg.content.chordBoard
      .voicingFingerprint !==
      assignment.sourceRef
        .voicingFingerprint ||
    !sameChordBoardVoicingSnapshot(
      pkg.content.chordBoard,
      assignment.sourceRef.snapshot,
    )
  ) {
    throw new Error(
      'secure delivery CHORD_BOARD exact voicing mismatch.',
    )
  }

  return pkg
}
