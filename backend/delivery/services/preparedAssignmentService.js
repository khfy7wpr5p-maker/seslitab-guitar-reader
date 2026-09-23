import {
  restorePrivateAssignmentV1,
} from '../../../src/services/teacherDeliveryWireCodec.js'
import {
  restoreStudentPracticePackageV1,
} from '../../../src/services/studentPracticePackageV1.js'
import {
  createPreparedAssignmentRecord,
  isPreparedAssignmentRecord,
} from '../../../src/services/preparedAssignmentRecord.js'
import {
  fingerprintPracticePackage,
  canonicalPackageJson,
} from '../integrity/packageFingerprint.js'
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

function samePrepared(left, right) {
  return (
    isPreparedAssignmentRecord(left) &&
    left.teacherId === right.teacherId &&
    left.assignment.assignmentId ===
      right.assignment.assignmentId &&
    left.assignment.studentId ===
      right.assignment.studentId &&
    left.assignment.sourceRef.revisionId ===
      right.assignment.sourceRef.revisionId &&
    left.packageId === right.packageId &&
    left.packageFingerprint ===
      right.packageFingerprint &&
    left.preparedAt === right.preparedAt
  )
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
        restoreStudentPracticePackageV1(
          rawItem.package,
        )
      const fingerprint =
        fingerprintPracticePackage(pkg)

      if (
        pkg.publication.scope !==
          'student_private' ||
        pkg.publication.recipientStudentId !==
          assignment.studentId
      ) {
        throw new Error(
          'prepared package recipient student mismatch.',
        )
      }
      if (
        pkg.approvedRevision.revisionId !==
        assignment.sourceRef.revisionId
      ) {
        throw new Error(
          'prepared package revision mismatch.',
        )
      }
      if (
        pkg.approvedRevision.state !==
        'teacher_approved'
      ) {
        throw new Error(
          'prepared package must be teacher_approved.',
        )
      }

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
          duplicate.assignment.studentId !==
            assignment.studentId ||
          duplicate.assignment.sourceRef
            .revisionId !==
            assignment.sourceRef.revisionId
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
          existing.assignment.studentId !==
            assignment.studentId ||
          existing.assignment.sourceRef
            .revisionId !==
            assignment.sourceRef.revisionId ||
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
        fingerprintPracticePackage(
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
