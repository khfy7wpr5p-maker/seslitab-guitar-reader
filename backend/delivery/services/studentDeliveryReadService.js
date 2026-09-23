import {
  isDeliveryRecord,
} from '../../../src/services/deliveryRecord.js'
import {
  isPreparedAssignmentRecord,
} from '../../../src/services/preparedAssignmentRecord.js'
import {
  isAssignmentLifecycleRecord,
} from '../../../src/services/assignmentLifecycleRecord.js'
import {
  validateStudentPracticePackageV1,
} from '../../../src/services/studentPracticePackageV1.js'
import {
  assertSecureDeliveryStore,
} from '../repositories/secureDeliveryStore.js'
import {
  normalizeRequiredId,
} from '../../../src/services/teacherDeliveryContractValidation.js'

function notFound() {
  return new Error('student-assignment-not-found')
}

function studentView(
  delivery,
  prepared,
  pkg,
) {
  return Object.freeze({
    deliveryId: delivery.deliveryId,
    packageId: delivery.packageId,
    teacherNote:
      prepared.assignment.teacherNote,
    deliveredAt: delivery.deliveredAt,
    package: pkg,
  })
}

function assertPreparedForDelivery(
  prepared,
  delivery,
  studentId,
) {
  if (
    !isPreparedAssignmentRecord(prepared) ||
    prepared.assignment.assignmentId !==
      delivery.assignmentId ||
    prepared.assignment.studentId !== studentId ||
    prepared.packageId !== delivery.packageId
  ) {
    throw new Error(
      'student delivery prepared authority mismatch.',
    )
  }
  return prepared
}

function assertPackageForStudent(
  pkg,
  prepared,
  studentId,
) {
  const validation =
    validateStudentPracticePackageV1(pkg)
  if (
    pkg === null ||
    !validation.ok ||
    pkg.packageId !== prepared.packageId ||
    pkg.publication.scope !==
      'student_private' ||
    pkg.publication.recipientStudentId !==
      studentId ||
    pkg.approvedRevision.revisionId !==
      prepared.assignment.sourceRef.revisionId
  ) {
    throw new Error(
      'student delivery package authority mismatch.',
    )
  }
  return pkg
}

export function createStudentDeliveryReadService({
  authorization,
  store,
} = {}) {
  if (
    !authorization ||
    typeof authorization.resolvePrincipal !==
      'function'
  ) {
    throw new TypeError(
      'authorization must provide resolvePrincipal().',
    )
  }
  const trustedStore =
    assertSecureDeliveryStore(store)

  async function studentPrincipal(
    providerSubject,
  ) {
    const principal =
      await authorization.resolvePrincipal(
        providerSubject,
        'STUDENT',
      )
    if (!principal.studentId) {
      throw new Error(
        'student identity mapping missing.',
      )
    }
    return principal
  }

  async function visibleById(
    studentId,
    deliveryId,
  ) {
    const id = normalizeRequiredId(
      deliveryId,
      'deliveryId',
    )
    const delivery =
      await trustedStore.getDelivery(id)

    if (
      delivery === null ||
      !isDeliveryRecord(delivery) ||
      delivery.deliveryId !== id ||
      delivery.studentId !== studentId ||
      delivery.revokedAt !== null
    ) {
      throw notFound()
    }

    const prepared =
      assertPreparedForDelivery(
        await trustedStore.getPreparedAssignment(
          id,
        ),
        delivery,
        studentId,
      )

    const lifecycle =
      await trustedStore.getLifecycle(id)
    if (lifecycle !== null) {
      if (
        !isAssignmentLifecycleRecord(
          lifecycle,
        ) ||
        lifecycle.assignment.assignmentId !==
          id ||
        lifecycle.assignment.studentId !==
          studentId
      ) {
        throw new Error(
          'student delivery lifecycle authority mismatch.',
        )
      }
      if (lifecycle.revokedAt !== null) {
        throw notFound()
      }
    }

    const pkg =
      assertPackageForStudent(
        await trustedStore.getPracticePackage(
          delivery.packageId,
        ),
        prepared,
        studentId,
      )

    return studentView(
      delivery,
      prepared,
      pkg,
    )
  }

  async function listAssignments({
    providerSubject,
  } = {}) {
    const { studentId } =
      await studentPrincipal(providerSubject)
    const candidates =
      await trustedStore
        .listActiveDeliveriesForStudent(
          studentId,
        )

    if (!Array.isArray(candidates)) {
      throw new TypeError(
        'student delivery list must be an array.',
      )
    }

    const output = []
    const seen = new Set()
    for (const candidate of candidates) {
      if (
        !isDeliveryRecord(candidate) ||
        candidate.studentId !== studentId
      ) {
        throw new Error(
          'student delivery list authority mismatch.',
        )
      }
      if (seen.has(candidate.assignmentId)) {
        throw new Error(
          'duplicate student delivery authority.',
        )
      }
      seen.add(candidate.assignmentId)

      const current =
        await trustedStore.getDelivery(
          candidate.assignmentId,
        )
      if (
        current === null ||
        !isDeliveryRecord(current) ||
        current.studentId !== studentId ||
        current.revokedAt !== null
      ) {
        continue
      }

      try {
        output.push(
          await visibleById(
            studentId,
            current.deliveryId,
          ),
        )
      } catch (error) {
        if (
          error instanceof Error &&
          error.message ===
            'student-assignment-not-found'
        ) {
          continue
        }
        throw error
      }
    }

    return Object.freeze(output)
  }

  async function getAssignment({
    providerSubject,
    deliveryId,
  } = {}) {
    const { studentId } =
      await studentPrincipal(providerSubject)
    return visibleById(
      studentId,
      deliveryId,
    )
  }

  return Object.freeze({
    listAssignments,
    getAssignment,
  })
}
