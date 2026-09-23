import {
  createDeliveryRecord,
  isDeliveryRecord,
  revokeDeliveryRecord,
} from '../../../src/services/deliveryRecord.js'
import {
  isPreparedAssignmentRecord,
} from '../../../src/services/preparedAssignmentRecord.js'
import {
  createInitialAssignmentLifecycleRecord,
  isAssignmentLifecycleRecord,
  revokeAssignmentLifecycleRecord,
  transitionAssignmentLifecycleRecord,
} from '../../../src/services/assignmentLifecycleRecord.js'
import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  PRIVATE_ASSIGNMENT_STATE,
} from '../../../src/services/privateAssignment.js'
import {
  assertSecureDeliveryPackageMatchesAssignment,
  restoreSecureDeliveryPackage,
} from '../../../src/services/secureDeliveryPackage.js'
import {
  sameChordBoardVoicingSnapshot,
} from '../../../src/services/chordBoardVoicingCanonical.js'
import {
  fingerprintSecureDeliveryPackage,
} from '../integrity/packageFingerprint.js'
import {
  fingerprintChordBoardVoicingSync,
} from '../integrity/chordBoardVoicingFingerprint.js'
import {
  assertSecureDeliveryStore,
} from '../repositories/secureDeliveryStore.js'
import {
  normalizeRequiredId,
  normalizeRequiredTimestamp,
} from '../../../src/services/teacherDeliveryContractValidation.js'

const ACTIONS = new Set([
  'COMPLETE',
  'REPERTOIRE',
  'REVOKE',
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
      pkg.content.chordBoard.voicingFingerprint
  ) {
    throw new Error(
      'secure-delivery-prepared-package-mismatch',
    )
  }
}

function assertExactDelivery(
  row,
  prepared,
  teacherId,
) {
  if (
    !isDeliveryRecord(row) ||
    row.assignmentId !==
      prepared.assignment.assignmentId ||
    row.teacherId !== teacherId ||
    row.studentId !==
      prepared.assignment.studentId ||
    row.packageId !== prepared.packageId
  ) {
    throw new Error(
      'secure delivery acknowledgement mismatch.',
    )
  }
  return row
}

async function loadPreparedContext(
  store,
  authorization,
  teacherId,
  assignmentId,
) {
  const id = normalizeRequiredId(
    assignmentId,
    'assignmentId',
  )
  const prepared =
    await store.getPreparedAssignment(id)
  if (
    prepared === null ||
    !isPreparedAssignmentRecord(prepared)
  ) {
    throw new Error(
      'secure-delivery-prepared-assignment-not-found',
    )
  }
  if (
    prepared.assignment.assignmentId !== id ||
    prepared.teacherId !== teacherId
  ) {
    throw new Error(
      'secure-delivery-prepared-assignment-authority-mismatch',
    )
  }

  await authorization.requireTeacherStudent(
    teacherId,
    prepared.assignment.studentId,
  )

  const rawPackage =
    await store.getPracticePackage(
      prepared.packageId,
    )
  let pkg
  try {
    pkg = restoreSecureDeliveryPackage(
      rawPackage,
    )
    assertSecureDeliveryPackageMatchesAssignment(
      pkg,
      prepared.assignment,
    )
    assertChordFingerprintAuthority(
      prepared.assignment,
      pkg,
    )
    if (
      fingerprintSecureDeliveryPackage(pkg) !==
        prepared.packageFingerprint
    ) {
      throw new Error(
        'secure-delivery-prepared-package-fingerprint-mismatch',
      )
    }
  } catch {
    throw new Error(
      'secure-delivery-prepared-package-mismatch',
    )
  }

  const storedLifecycle =
    await store.getLifecycle(id)
  const lifecycle =
    storedLifecycle === null
      ? createInitialAssignmentLifecycleRecord(
          prepared.assignment,
        )
      : storedLifecycle

  if (
    !isAssignmentLifecycleRecord(lifecycle) ||
    !sameAssignmentAuthority(
      lifecycle.assignment,
      prepared.assignment,
    )
  ) {
    throw new Error(
      'secure-delivery-lifecycle-authority-mismatch',
    )
  }

  return Object.freeze({
    id,
    prepared,
    package: pkg,
    lifecycle,
  })
}

export function createTeacherSecureDeliveryService({
  authorization,
  store,
  now,
  createHistoryEventId,
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
  if (typeof createHistoryEventId !== 'function') {
    throw new TypeError(
      'createHistoryEventId must be a function.',
    )
  }

  async function teacherPrincipal(providerSubject) {
    const principal =
      await authorization.resolvePrincipal(
        providerSubject,
        'TEACHER',
      )
    if (!principal.teacherId) {
      throw new Error(
        'secure-delivery-teacher-identity-missing',
      )
    }
    return principal
  }

  async function deliverBatch({
    providerSubject,
    assignmentIds,
  } = {}) {
    if (
      !Array.isArray(assignmentIds) ||
      assignmentIds.length === 0
    ) {
      throw new TypeError(
        'delivery assignmentIds must be non-empty.',
      )
    }
    if (assignmentIds.length > 40) {
      throw new Error(
        'delivery batch maximum is 40.',
      )
    }

    const { teacherId } =
      await teacherPrincipal(providerSubject)
    const ids = []
    const seen = new Set()
    for (const raw of assignmentIds) {
      const id = normalizeRequiredId(
        raw,
        'assignmentId',
      )
      if (!seen.has(id)) {
        seen.add(id)
        ids.push(id)
      }
    }

    const plans = []
    const pending = []
    for (const id of ids) {
      const context = await loadPreparedContext(
        trustedStore,
        authorization,
        teacherId,
        id,
      )
      if (context.lifecycle.revokedAt !== null) {
        throw new Error(
          'secure-delivery-assignment-revoked',
        )
      }

      const existing =
        await trustedStore.getDelivery(id)
      if (existing !== null) {
        assertExactDelivery(
          existing,
          context.prepared,
          teacherId,
        )
        if (existing.revokedAt !== null) {
          throw new Error(
            'secure-delivery-existing-delivery-revoked',
          )
        }
        plans.push(
          Object.freeze({
            context,
            expected: existing,
          }),
        )
        continue
      }

      const deliveredAt =
        normalizeRequiredTimestamp(
          now(),
          'deliveredAt',
        )
      const delivery = createDeliveryRecord({
        assignmentId: id,
        packageId:
          context.prepared.packageId,
        teacherId,
        studentId:
          context.prepared.assignment.studentId,
        deliveredAt,
      })
      pending.push(delivery)
      plans.push(
        Object.freeze({
          context,
          expected: delivery,
        }),
      )
    }

    if (pending.length > 0) {
      const ack =
        await trustedStore.commitDeliveryBatch(
          pending,
        )
      if (
        !Array.isArray(ack) ||
        ack.length !== pending.length
      ) {
        throw new Error(
          'secure delivery repository acknowledgement mismatch.',
        )
      }
    }

    const result = []
    for (const plan of plans) {
      const row =
        await trustedStore.getDelivery(
          plan.context.id,
        )
      assertExactDelivery(
        row,
        plan.context.prepared,
        teacherId,
      )
      if (
        row.deliveredAt !==
          plan.expected.deliveredAt ||
        row.revokedAt !==
          plan.expected.revokedAt
      ) {
        throw new Error(
          'secure delivery acknowledgement mismatch.',
        )
      }
      result.push(row)
    }
    return Object.freeze(result)
  }

  async function listDeliveries({
    providerSubject,
  } = {}) {
    const { teacherId } =
      await teacherPrincipal(providerSubject)
    const rows =
      await trustedStore.listDeliveriesForTeacher(
        teacherId,
      )
    if (!Array.isArray(rows)) {
      throw new TypeError(
        'teacher delivery list must be an array.',
      )
    }
    for (const row of rows) {
      if (
        !isDeliveryRecord(row) ||
        row.teacherId !== teacherId
      ) {
        throw new Error(
          'teacher delivery list authority mismatch.',
        )
      }
    }
    return Object.freeze([...rows])
  }

  async function applyAssignmentAction({
    providerSubject,
    assignmentId,
    action,
  } = {}) {
    if (!ACTIONS.has(action)) {
      throw new TypeError(
        'action must be COMPLETE, REPERTOIRE or REVOKE.',
      )
    }
    const { teacherId } =
      await teacherPrincipal(providerSubject)
    const context = await loadPreparedContext(
      trustedStore,
      authorization,
      teacherId,
      assignmentId,
    )
    const current = context.lifecycle
    const deliveryBefore =
      await trustedStore.getDelivery(context.id)
    if (deliveryBefore !== null) {
      assertExactDelivery(
        deliveryBefore,
        context.prepared,
        teacherId,
      )
    }

    if (current.revokedAt !== null) {
      if (action === 'REVOKE') {
        return Object.freeze({
          lifecycle: current,
          delivery: deliveryBefore,
        })
      }
      throw new Error(
        'secure-delivery-assignment-revoked',
      )
    }

    let nextLifecycle
    let deliveryAfter = deliveryBefore

    if (action === 'REVOKE') {
      const revokedAt =
        normalizeRequiredTimestamp(
          now(),
          'revokedAt',
        )
      nextLifecycle =
        revokeAssignmentLifecycleRecord(
          current,
          revokedAt,
        )
      if (deliveryBefore !== null) {
        deliveryAfter = revokeDeliveryRecord(
          deliveryBefore,
          revokedAt,
        )
      }
    } else {
      const target =
        action === 'COMPLETE'
          ? PRIVATE_ASSIGNMENT_STATE.COMPLETED
          : PRIVATE_ASSIGNMENT_STATE.REPERTOIRE
      if (current.state === target) {
        return Object.freeze({
          lifecycle: current,
          delivery: deliveryBefore,
        })
      }
      const transitionedAt =
        normalizeRequiredTimestamp(
          now(),
          'transitionedAt',
        )
      nextLifecycle =
        transitionAssignmentLifecycleRecord(
          current,
          target,
          transitionedAt,
        )
    }

    const historyEventId =
      normalizeRequiredId(
        createHistoryEventId(),
        'historyEventId',
      )
    await trustedStore.commitLifecycleMutation({
      teacherId,
      assignment:
        context.prepared.assignment,
      currentLifecycle: current,
      nextLifecycle,
      deliveryBefore,
      deliveryAfter,
      historyEventId,
    })

    const storedLifecycle =
      await trustedStore.getLifecycle(
        context.id,
      )
    const storedDelivery =
      await trustedStore.getDelivery(
        context.id,
      )
    if (
      !isAssignmentLifecycleRecord(
        storedLifecycle,
      ) ||
      !sameAssignmentAuthority(
        storedLifecycle.assignment,
        context.prepared.assignment,
      ) ||
      storedLifecycle.state !==
        nextLifecycle.state ||
      storedLifecycle.stateChangedAt !==
        nextLifecycle.stateChangedAt ||
      storedLifecycle.revokedAt !==
        nextLifecycle.revokedAt
    ) {
      throw new Error(
        'secure delivery lifecycle acknowledgement mismatch.',
      )
    }
    if (deliveryAfter === null) {
      if (storedDelivery !== null) {
        throw new Error(
          'secure delivery revoke acknowledgement mismatch.',
        )
      }
    } else {
      assertExactDelivery(
        storedDelivery,
        context.prepared,
        teacherId,
      )
      if (
        storedDelivery.deliveredAt !==
          deliveryAfter.deliveredAt ||
        storedDelivery.revokedAt !==
          deliveryAfter.revokedAt
      ) {
        throw new Error(
          'secure delivery revoke acknowledgement mismatch.',
        )
      }
    }

    return Object.freeze({
      lifecycle: storedLifecycle,
      delivery: storedDelivery,
    })
  }

  return Object.freeze({
    deliverBatch,
    listDeliveries,
    applyAssignmentAction,
  })
}
