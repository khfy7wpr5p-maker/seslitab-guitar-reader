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
  assertSecureDeliveryPackageMatchesAssignment,
  restoreSecureDeliveryPackage,
} from '../../../src/services/secureDeliveryPackage.js'
import {
  POOL_AUDIENCE_MODE,
} from '../../../src/services/poolItem.js'
import {
  isPoolPublicationRecord,
} from '../../../src/services/poolPublicationRecord.js'
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
  lifecycle,
  pkg,
) {
  const assignment = prepared.assignment

  return Object.freeze({
    deliveryId: delivery.deliveryId,
    assignmentId: assignment.assignmentId,
    packageId: delivery.packageId,
    practiceType: assignment.practiceType,
    teacherNote: assignment.teacherNote,
    state:
      lifecycle === null
        ? assignment.state
        : lifecycle.state,
    assignedAt: assignment.assignedAt,
    deliveredAt: delivery.deliveredAt,
    package: pkg,
  })
}

function studentPoolView(
  record,
  studentId,
) {
  if (!isPoolPublicationRecord(record)) {
    throw new Error(
      'student Pool authority mismatch.',
    )
  }

  const item = record.item
  const authorized =
    record.revokedAt === null &&
    (
      item.audienceMode ===
        POOL_AUDIENCE_MODE.ALL ||
      (
        item.audienceMode ===
          POOL_AUDIENCE_MODE.SELECTED &&
        item.recipientStudentIds
          .includes(studentId)
      )
    )

  if (!authorized) {
    throw new Error(
      'student Pool authority mismatch.',
    )
  }

  return Object.freeze({
    poolItemId: item.poolItemId,
    title: item.title,
    shortDescription:
      item.shortDescription,
    detailText: item.detailText,
    publishedAt: item.publishedAt,
    audienceMode: item.audienceMode,
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
  rawPackage,
  prepared,
  studentId,
) {
  try {
    const pkg =
      restoreSecureDeliveryPackage(
        rawPackage,
      )
    if (
      pkg.packageId !== prepared.packageId ||
      pkg.publication.scope !==
        'student_private' ||
      pkg.publication.recipientStudentId !==
        studentId
    ) {
      throw new Error(
        'student delivery package recipient mismatch.',
      )
    }
    assertSecureDeliveryPackageMatchesAssignment(
      pkg,
      prepared.assignment,
    )
    return pkg
  } catch {
    throw new Error(
      'student delivery package authority mismatch.',
    )
  }
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
  if (
    typeof trustedStore
      .listPoolPublicationsForStudent !==
      'function'
  ) {
    throw new TypeError(
      'store must provide listPoolPublicationsForStudent().',
    )
  }

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
      lifecycle,
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

  async function listPoolItems({
    providerSubject,
  } = {}) {
    const { studentId } =
      await studentPrincipal(providerSubject)
    const candidates =
      await trustedStore
        .listPoolPublicationsForStudent(
          studentId,
        )

    if (!Array.isArray(candidates)) {
      throw new TypeError(
        'student Pool list must be an array.',
      )
    }

    const output = []
    const seen = new Set()

    for (const candidate of candidates) {
      const poolItemId =
        candidate?.item?.poolItemId

      if (
        typeof poolItemId !== 'string' ||
        seen.has(poolItemId)
      ) {
        throw new Error(
          'student Pool authority mismatch.',
        )
      }

      const view =
        studentPoolView(
          candidate,
          studentId,
        )
      seen.add(view.poolItemId)
      output.push(view)
    }

    return Object.freeze(output)
  }

  return Object.freeze({
    listAssignments,
    getAssignment,
    listPoolItems,
  })
}
