import {
  isPreparedAssignmentRecord,
} from '../../../src/services/preparedAssignmentRecord.js'
import {
  isDeliveryRecord,
} from '../../../src/services/deliveryRecord.js'
import {
  isSecureDeliveryIdentityMapping,
} from '../../../src/services/secureDeliveryIdentity.js'
import {
  isTeacherStudentGrant,
} from '../../../src/services/teacherStudentGrant.js'
import {
  isAssignmentLifecycleRecord,
} from '../../../src/services/assignmentLifecycleRecord.js'
import {
  isPrivateAssignment,
} from '../../../src/services/privateAssignment.js'
import {
  isStudentRosterEntry,
} from '../../../src/services/studentRosterEntry.js'
import {
  isPoolPublicationRecord,
} from '../../../src/services/poolPublicationRecord.js'
import {
  validateStudentPracticePackageV1,
} from '../../../src/services/studentPracticePackageV1.js'
import {
  fingerprintPracticePackage,
} from '../integrity/packageFingerprint.js'
import {
  assertStrictInputObject,
  normalizeRequiredId,
} from '../../../src/services/teacherDeliveryContractValidation.js'

const PREPARED_ROW_FIELDS = Object.freeze([
  'prepared',
  'package',
])

const LIFECYCLE_MUTATION_FIELDS = Object.freeze([
  'teacherId',
  'assignment',
  'currentLifecycle',
  'nextLifecycle',
  'deliveryBefore',
  'deliveryAfter',
  'historyEventId',
])

function grantKey(teacherId, studentId) {
  return `${teacherId}\u0001${studentId}`
}

function exactJson(value) {
  return JSON.stringify(value)
}

function sameRecord(left, right) {
  return left === right || exactJson(left) === exactJson(right)
}

function assertPreparedCommitRow(row) {
  assertStrictInputObject(
    row,
    PREPARED_ROW_FIELDS,
    'PreparedAssignmentCommitRow',
  )
  if (!isPreparedAssignmentRecord(row.prepared)) {
    throw new TypeError(
      'prepared must be a valid PreparedAssignmentRecord.',
    )
  }
  const validation =
    validateStudentPracticePackageV1(row.package)
  if (!validation.ok) {
    throw new TypeError(
      'package must be a valid Student PracticePackage v1.',
    )
  }
  if (
    row.prepared.packageId !== row.package.packageId ||
    row.prepared.packageFingerprint !==
      fingerprintPracticePackage(row.package) ||
    row.prepared.assignment.studentId !==
      row.package.publication.recipientStudentId ||
    row.prepared.assignment.sourceRef.revisionId !==
      row.package.approvedRevision.revisionId
  ) {
    throw new Error(
      'prepared assignment package acknowledgement conflict.',
    )
  }
  return row
}

export function createInMemorySecureDeliveryStore({
  identityMappings = [],
  grants = [],
  preparedAssignments = [],
  practicePackages = [],
  lifecycles = [],
  deliveries = [],
  rosterEntries = [],
  poolPublications = [],
} = {}) {
  let identityBySubject = new Map()
  let grantsByPair = new Map()
  let preparedByAssignment = new Map()
  let packageById = new Map()
  let lifecycleByAssignment = new Map()
  let historyByAssignment = new Map()
  let deliveryByAssignment = new Map()
  let rosterByStudent = new Map()
  let poolById = new Map()

  for (const mapping of identityMappings) {
    if (!isSecureDeliveryIdentityMapping(mapping)) {
      throw new TypeError(
        'initial identity mapping must be valid.',
      )
    }
    if (identityBySubject.has(mapping.providerSubject)) {
      throw new Error('duplicate identity mapping.')
    }
    identityBySubject.set(mapping.providerSubject, mapping)
  }

  for (const grant of grants) {
    if (!isTeacherStudentGrant(grant)) {
      throw new TypeError('initial grant must be valid.')
    }
    const key = grantKey(grant.teacherId, grant.studentId)
    if (grantsByPair.has(key)) {
      throw new Error('duplicate teacher student grant.')
    }
    grantsByPair.set(key, grant)
  }

  for (const pkg of practicePackages) {
    const validation = validateStudentPracticePackageV1(pkg)
    if (!validation.ok) {
      throw new TypeError(
        'initial PracticePackage must be valid.',
      )
    }
    if (packageById.has(pkg.packageId)) {
      throw new Error('duplicate packageId.')
    }
    packageById.set(pkg.packageId, pkg)
  }

  for (const prepared of preparedAssignments) {
    if (!isPreparedAssignmentRecord(prepared)) {
      throw new TypeError(
        'initial prepared assignment must be valid.',
      )
    }
    if (
      preparedByAssignment.has(
        prepared.assignment.assignmentId,
      )
    ) {
      throw new Error('duplicate prepared assignment.')
    }
    preparedByAssignment.set(
      prepared.assignment.assignmentId,
      prepared,
    )
  }

  for (const lifecycle of lifecycles) {
    if (!isAssignmentLifecycleRecord(lifecycle)) {
      throw new TypeError('initial lifecycle must be valid.')
    }
    const id = lifecycle.assignment.assignmentId
    if (lifecycleByAssignment.has(id)) {
      throw new Error('duplicate lifecycle.')
    }
    lifecycleByAssignment.set(id, lifecycle)
    historyByAssignment.set(id, [lifecycle])
  }

  for (const delivery of deliveries) {
    if (!isDeliveryRecord(delivery)) {
      throw new TypeError('initial delivery must be valid.')
    }
    if (deliveryByAssignment.has(delivery.assignmentId)) {
      throw new Error('duplicate delivery.')
    }
    deliveryByAssignment.set(
      delivery.assignmentId,
      delivery,
    )
  }

  for (const entry of rosterEntries) {
    if (!isStudentRosterEntry(entry)) {
      throw new TypeError('initial roster entry must be valid.')
    }
    if (rosterByStudent.has(entry.studentId)) {
      throw new Error('duplicate roster studentId.')
    }
    rosterByStudent.set(entry.studentId, entry)
  }

  for (const record of poolPublications) {
    if (!isPoolPublicationRecord(record)) {
      throw new TypeError(
        'initial Pool publication must be valid.',
      )
    }
    const id = record.item.poolItemId
    if (poolById.has(id)) {
      throw new Error('duplicate Pool publication.')
    }
    poolById.set(id, record)
  }

  async function commitPreparedBatch(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new TypeError(
        'prepared assignment batch must be non-empty.',
      )
    }

    const nextPrepared = new Map(preparedByAssignment)
    const nextPackages = new Map(packageById)
    const output = []

    for (const raw of rows) {
      const row = assertPreparedCommitRow(raw)
      const id = row.prepared.assignment.assignmentId
      const existing = nextPrepared.get(id) ?? null
      if (existing !== null) {
        if (!sameRecord(existing, row.prepared)) {
          throw new Error(
            'prepared assignment conflict.',
          )
        }
        const existingPackage =
          nextPackages.get(existing.packageId) ?? null
        if (
          existingPackage === null ||
          fingerprintPracticePackage(
            existingPackage,
          ) !== existing.packageFingerprint
        ) {
          throw new Error(
            'prepared package fingerprint conflict.',
          )
        }
        output.push(existing)
        continue
      }

      const existingPackage =
        nextPackages.get(row.package.packageId) ?? null
      if (
        existingPackage !== null &&
        fingerprintPracticePackage(existingPackage) !==
          row.prepared.packageFingerprint
      ) {
        throw new Error(
          'PracticePackage content conflict.',
        )
      }

      nextPrepared.set(id, row.prepared)
      if (existingPackage === null) {
        nextPackages.set(
          row.package.packageId,
          row.package,
        )
      }
      output.push(row.prepared)
    }

    preparedByAssignment = nextPrepared
    packageById = nextPackages
    return Object.freeze(output)
  }

  async function commitDeliveryBatch(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new TypeError(
        'delivery batch must be non-empty.',
      )
    }

    const next = new Map(deliveryByAssignment)
    const output = []
    for (const row of rows) {
      if (!isDeliveryRecord(row)) {
        throw new TypeError(
          'delivery batch row must be a valid DeliveryRecord.',
        )
      }
      const existing =
        next.get(row.assignmentId) ?? null
      if (existing !== null) {
        if (!sameRecord(existing, row)) {
          throw new Error('delivery conflict.')
        }
        output.push(existing)
        continue
      }
      next.set(row.assignmentId, row)
      output.push(row)
    }

    deliveryByAssignment = next
    return Object.freeze(output)
  }

  async function commitLifecycleMutation(input = {}) {
    assertStrictInputObject(
      input,
      LIFECYCLE_MUTATION_FIELDS,
      'SecureDeliveryLifecycleMutation',
    )
    normalizeRequiredId(input.teacherId, 'teacherId')
    normalizeRequiredId(
      input.historyEventId,
      'historyEventId',
    )
    if (!isPrivateAssignment(input.assignment)) {
      throw new TypeError('assignment must be valid.')
    }
    if (
      !isAssignmentLifecycleRecord(
        input.currentLifecycle,
      ) ||
      !isAssignmentLifecycleRecord(
        input.nextLifecycle,
      ) ||
      input.currentLifecycle.assignment !==
        input.assignment ||
      input.nextLifecycle.assignment !==
        input.assignment
    ) {
      throw new Error(
        'lifecycle mutation assignment mismatch.',
      )
    }

    const id = input.assignment.assignmentId
    const storedLifecycle =
      lifecycleByAssignment.get(id) ?? null
    if (
      storedLifecycle !== null &&
      !sameRecord(
        storedLifecycle,
        input.currentLifecycle,
      )
    ) {
      throw new Error('lifecycle current conflict.')
    }

    const storedDelivery =
      deliveryByAssignment.get(id) ?? null
    if (
      !sameRecord(
        storedDelivery,
        input.deliveryBefore,
      )
    ) {
      throw new Error('delivery current conflict.')
    }
    if (
      input.deliveryAfter !== null &&
      input.deliveryAfter !== undefined &&
      (!isDeliveryRecord(input.deliveryAfter) ||
        input.deliveryAfter.assignmentId !== id)
    ) {
      throw new TypeError(
        'deliveryAfter must match assignment.',
      )
    }

    if (
      sameRecord(
        input.currentLifecycle,
        input.nextLifecycle,
      ) &&
      sameRecord(
        input.deliveryBefore,
        input.deliveryAfter,
      )
    ) {
      return Object.freeze({
        lifecycle: storedLifecycle ?? input.currentLifecycle,
        delivery: storedDelivery,
      })
    }

    const nextLifecycles =
      new Map(lifecycleByAssignment)
    const nextHistory = new Map(historyByAssignment)
    const nextDeliveries =
      new Map(deliveryByAssignment)

    nextLifecycles.set(id, input.nextLifecycle)
    const history = [
      ...(nextHistory.get(id) ?? []),
      input.nextLifecycle,
    ]
    nextHistory.set(id, history)
    if (
      input.deliveryAfter === null ||
      input.deliveryAfter === undefined
    ) {
      if (storedDelivery !== null) {
        nextDeliveries.delete(id)
      }
    } else {
      nextDeliveries.set(id, input.deliveryAfter)
    }

    lifecycleByAssignment = nextLifecycles
    historyByAssignment = nextHistory
    deliveryByAssignment = nextDeliveries
    return Object.freeze({
      lifecycle: input.nextLifecycle,
      delivery:
        input.deliveryAfter ?? null,
    })
  }

  return Object.freeze({
    async getIdentityMapping(providerSubject) {
      const id = normalizeRequiredId(
        providerSubject,
        'providerSubject',
      )
      return identityBySubject.get(id) ?? null
    },

    async getTeacherStudentGrant(
      teacherId,
      studentId,
    ) {
      return (
        grantsByPair.get(
          grantKey(
            normalizeRequiredId(
              teacherId,
              'teacherId',
            ),
            normalizeRequiredId(
              studentId,
              'studentId',
            ),
          ),
        ) ?? null
      )
    },

    async getPreparedAssignment(assignmentId) {
      return (
        preparedByAssignment.get(
          normalizeRequiredId(
            assignmentId,
            'assignmentId',
          ),
        ) ?? null
      )
    },

    async getPracticePackage(packageId) {
      return (
        packageById.get(
          normalizeRequiredId(packageId, 'packageId'),
        ) ?? null
      )
    },

    async getLifecycle(assignmentId) {
      return (
        lifecycleByAssignment.get(
          normalizeRequiredId(
            assignmentId,
            'assignmentId',
          ),
        ) ?? null
      )
    },

    async getLifecycleHistory(assignmentId) {
      const id = normalizeRequiredId(
        assignmentId,
        'assignmentId',
      )
      return Object.freeze([
        ...(historyByAssignment.get(id) ?? []),
      ])
    },

    async getDelivery(assignmentId) {
      return (
        deliveryByAssignment.get(
          normalizeRequiredId(
            assignmentId,
            'assignmentId',
          ),
        ) ?? null
      )
    },

    async listDeliveriesForTeacher(teacherId) {
      const id = normalizeRequiredId(
        teacherId,
        'teacherId',
      )
      return Object.freeze(
        [...deliveryByAssignment.values()].filter(
          (row) => row.teacherId === id,
        ),
      )
    },

    async listActiveDeliveriesForStudent(
      studentId,
    ) {
      const id = normalizeRequiredId(
        studentId,
        'studentId',
      )
      return Object.freeze(
        [...deliveryByAssignment.values()].filter(
          (row) =>
            row.studentId === id &&
            row.revokedAt === null,
        ),
      )
    },

    commitPreparedBatch,
    commitDeliveryBatch,
    commitLifecycleMutation,

    async putRosterEntriesForProvisioning(entries) {
      if (!Array.isArray(entries)) {
        throw new TypeError(
          'roster provisioning input must be an array.',
        )
      }
      const next = new Map(rosterByStudent)
      for (const entry of entries) {
        if (!isStudentRosterEntry(entry)) {
          throw new TypeError(
            'roster provisioning row must be valid.',
          )
        }
        next.set(entry.studentId, entry)
      }
      rosterByStudent = next
      return Object.freeze([...entries])
    },

    async putPoolPublicationsForProvisioning(
      records,
    ) {
      if (!Array.isArray(records)) {
        throw new TypeError(
          'Pool provisioning input must be an array.',
        )
      }
      const next = new Map(poolById)
      for (const record of records) {
        if (!isPoolPublicationRecord(record)) {
          throw new TypeError(
            'Pool provisioning row must be valid.',
          )
        }
        next.set(record.item.poolItemId, record)
      }
      poolById = next
      return Object.freeze([...records])
    },
  })
}
