import {
  restorePrivateAssignmentV1,
} from '../../../src/services/teacherDeliveryWireCodec.js'
import {
  assertSecureDeliveryPackageMatchesAssignment,
  restoreSecureDeliveryPackage,
} from '../../../src/services/secureDeliveryPackage.js'
import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
} from '../../../src/services/privateAssignment.js'
import {
  sameChordBoardVoicingSnapshot,
} from '../../../src/services/chordBoardVoicingCanonical.js'
import {
  createPreparedAssignmentRecord,
  isPreparedAssignmentRecord,
} from '../../../src/services/preparedAssignmentRecord.js'
import {
  fingerprintSecureDeliveryPackage,
  canonicalPackageJson,
} from '../integrity/packageFingerprint.js'
import {
  fingerprintChordBoardVoicingSync,
} from '../integrity/chordBoardVoicingFingerprint.js'
import {
  assertSecureDeliveryStore,
} from '../repositories/secureDeliveryStore.js'
import {
  assertStrictInputObject,
  normalizeRequiredTimestamp,
} from '../../../src/services/teacherDeliveryContractValidation.js'

const ITEM_FIELDS = Object.freeze([
  'assignment',
  'package',
])

function sameAssignmentAuthority(left, right) {
  if (
    left.assignmentId !== right.assignmentId ||
    left.studentId !== right.studentId ||
    left.practiceType !== right.practiceType ||
    left.sourceRef.studentId !==
      right.sourceRef.studentId
  ) {
    return false
  }

  if (
    left.practiceType ===
      PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE
  ) {
    return (
      left.sourceRef.sourceId ===
        right.sourceRef.sourceId &&
      left.sourceRef.revisionId ===
        right.sourceRef.revisionId
    )
  }

  return (
    left.sourceRef.voicingFingerprint ===
      right.sourceRef.voicingFingerprint &&
    left.sourceRef.boundAt ===
      right.sourceRef.boundAt &&
    sameChordBoardVoicingSnapshot(
      left.sourceRef.snapshot,
      right.sourceRef.snapshot,
    )
  )
}

function samePrepared(left, right) {
  return (
    isPreparedAssignmentRecord(left) &&
    left.teacherId === right.teacherId &&
    sameAssignmentAuthority(
      left.assignment,
      right.assignment,
    ) &&
    left.packageId === right.packageId &&
    left.packageFingerprint ===
      right.packageFingerprint &&
    left.preparedAt === right.preparedAt
  )
}

function assertChordFingerprintAuthority(
  assignment,
  pkg,
) {
  if (
    assignment.practiceType !==
      PRIVATE_ASSIGNMENT_PRACTICE_TYPE.CHORD_BOARD
  ) {
    return
  }

  const computed =
    fingerprintChordBoardVoicingSync(
      assignment.sourceRef.snapshot,
    )

  if (
    computed !==
      assignment.sourceRef.voicingFingerprint ||
    computed !==
      pkg.content.chordBoard.voicingFingerprint ||
    !sameChordBoardVoicingSnapshot(
      assignment.sourceRef.snapshot,
      pkg.content.chordBoard,
    )
  ) {
    throw new Error(
      'prepared chord voicing fingerprint mismatch.',
    )
  }
}

function samePackage(left, right) {
  try {
    return canonicalPackageJson(left) ===
      canonicalPackageJson(right)
  } catch {
    return false
  }
}

export function createPreparedAssignmentService({
  authorization,
  store,
  now,
} = {}) {
  if (
    !authorization ||
    typeof authorization.resolvePrincipal !==
      'function' ||
    typeof authorization.requireTeacherStudent !==
      'function'
  ) {
    throw new TypeError(
      'authorization must provide principal and grant checks.',
    )
  }
  const trustedStore =
    assertSecureDeliveryStore(store)
  if (typeof now !== 'function') {
    throw new TypeError('now must be a function.')
  }

  async function prepareBatch({
    providerSubject,
    items,
  } = {}) {
    if (
      !Array.isArray(items) ||
      items.length === 0
    ) {
      throw new TypeError(
        'prepared assignment batch must be non-empty.',
      )
    }
    if (items.length > 40) {
      throw new Error(
        'prepared assignment batch maximum is 40.',
      )
    }

    const principal =
      await authorization.resolvePrincipal(
        providerSubject,
        'TEACHER',
      )
    const teacherId = principal.teacherId

    const seen = new Map()
    const pending = []
    const outputPlan = []

    for (const rawItem of items) {
      assertStrictInputObject(
        rawItem,
        ITEM_FIELDS,
        'PreparedAssignmentHandoffItem',
      )
      const assignment =
        restorePrivateAssignmentV1(
          rawItem.assignment,
        )
      const pkg =
        restoreSecureDeliveryPackage(
          rawItem.package,
        )
      assertSecureDeliveryPackageMatchesAssignment(
        pkg,
        assignment,
      )
      assertChordFingerprintAuthority(
        assignment,
        pkg,
      )
      const fingerprint =
        fingerprintSecureDeliveryPackage(pkg)

      await authorization.requireTeacherStudent(
        teacherId,
        assignment.studentId,
      )

      const descriptor = Object.freeze({
        assignment,
        package: pkg,
        fingerprint,
      })
      const duplicate =
        seen.get(assignment.assignmentId) ?? null
      if (duplicate !== null) {
        if (
          duplicate.fingerprint !== fingerprint ||
          duplicate.package.packageId !==
            pkg.packageId ||
          !sameAssignmentAuthority(
            duplicate.assignment,
            assignment,
          )
        ) {
          throw new Error(
            'duplicate assignmentId conflict in prepared batch.',
          )
        }
        continue
      }
      seen.set(
        assignment.assignmentId,
        descriptor,
      )

      const existing =
        await trustedStore.getPreparedAssignment(
          assignment.assignmentId,
        )
      if (existing !== null) {
        if (
          !isPreparedAssignmentRecord(existing) ||
          existing.teacherId !== teacherId ||
          !sameAssignmentAuthority(
            existing.assignment,
            assignment,
          ) ||
          existing.packageId !== pkg.packageId ||
          existing.packageFingerprint !==
            fingerprint
        ) {
          throw new Error(
            'prepared assignment conflict.',
          )
        }
        const storedPackage =
          await trustedStore.getPracticePackage(
            existing.packageId,
          )
        if (
          storedPackage === null ||
          !samePackage(storedPackage, pkg)
        ) {
          throw new Error(
            'prepared package conflict.',
          )
        }
        outputPlan.push(
          Object.freeze({
            assignmentId:
              assignment.assignmentId,
            expected: existing,
            package: pkg,
            newRow: null,
          }),
        )
        continue
      }

      const preparedAt =
        normalizeRequiredTimestamp(
          now(),
          'preparedAt',
        )
      const prepared =
        createPreparedAssignmentRecord({
          teacherId,
          assignment,
          packageId: pkg.packageId,
          packageFingerprint: fingerprint,
          preparedAt,
        })
      pending.push(
        Object.freeze({
          prepared,
          package: pkg,
        }),
      )
      outputPlan.push(
        Object.freeze({
          assignmentId:
            assignment.assignmentId,
          expected: prepared,
          package: pkg,
          newRow: prepared,
        }),
      )
    }

    if (pending.length > 0) {
      const acknowledgement =
        await trustedStore.commitPreparedBatch(
          pending,
        )
      if (
        !Array.isArray(acknowledgement) ||
        acknowledgement.length !==
          pending.length
      ) {
        throw new Error(
          'prepared assignment repository acknowledgement mismatch.',
        )
      }
    }

    const results = []
    for (const planned of outputPlan) {
      const stored =
        await trustedStore.getPreparedAssignment(
          planned.assignmentId,
        )
      const storedPackage =
        stored === null
          ? null
          : await trustedStore.getPracticePackage(
              stored.packageId,
            )
      if (
        stored === null ||
        !samePrepared(
          stored,
          planned.expected,
        ) ||
        storedPackage === null ||
        !samePackage(
          storedPackage,
          planned.package,
        ) ||
        fingerprintSecureDeliveryPackage(
          storedPackage,
        ) !== stored.packageFingerprint
      ) {
        throw new Error(
          'prepared assignment acknowledgement mismatch.',
        )
      }
      results.push(stored)
    }

    return Object.freeze(results)
  }

  return Object.freeze({
    prepareBatch,
  })
}
