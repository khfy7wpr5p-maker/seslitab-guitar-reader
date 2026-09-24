import { isDeepStrictEqual } from 'node:util'

import {
  createInitialAssignmentLifecycleRecord,
  isAssignmentLifecycleRecord,
} from '../../../src/services/assignmentLifecycleRecord.js'
import {
  createPieceAssignment,
  isPieceAssignment,
} from '../../../src/services/pieceAssignment.js'
import {
  createInitialPieceLifecycleRecord,
  isPieceAssignmentLifecycleRecord,
} from '../../../src/services/pieceAssignmentLifecycleRecord.js'
import {
  createDeliveryRecord,
  isDeliveryRecord,
  revokeDeliveryRecord,
} from '../../../src/services/deliveryRecord.js'
import {
  isPoolPublicationRecord,
} from '../../../src/services/poolPublicationRecord.js'
import {
  createPreparedAssignmentRecord,
  isPreparedAssignmentRecord,
} from '../../../src/services/preparedAssignmentRecord.js'
import {
  createSecureDeliveryIdentityMapping,
} from '../../../src/services/secureDeliveryIdentity.js'
import {
  createStudentRosterEntry,
  isStudentRosterEntry,
} from '../../../src/services/studentRosterEntry.js'
import {
  createTeacherStudentGrant,
} from '../../../src/services/teacherStudentGrant.js'
import {
  restoreAssignmentLifecycleRecordV1,
  restorePoolPublicationRecordV1,
  restorePrivateAssignmentV1,
} from '../../../src/services/teacherDeliveryWireCodec.js'
import {
  assertSecureDeliveryPackageMatchesAssignment,
  restoreSecureDeliveryPackage,
} from '../../../src/services/secureDeliveryPackage.js'
import {
  assertStrictInputObject,
  normalizeRequiredId,
} from '../../../src/services/teacherDeliveryContractValidation.js'
import {
  canonicalPackageJson,
  fingerprintSecureDeliveryPackage,
} from '../integrity/packageFingerprint.js'

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

function documentId(value) {
  return Buffer.from(
    normalizeRequiredId(value, 'documentId'),
    'utf8',
  ).toString('base64url')
}

function pairDocumentId(teacherId, studentId) {
  const teacher = normalizeRequiredId(
    teacherId,
    'teacherId',
  )
  const student = normalizeRequiredId(
    studentId,
    'studentId',
  )
  return Buffer.from(
    JSON.stringify([teacher, student]),
    'utf8',
  ).toString('base64url')
}

function restoreIdentity(raw) {
  return createSecureDeliveryIdentityMapping({
    providerSubject: raw.providerSubject,
    role: raw.role,
    teacherId: raw.teacherId,
    studentId: raw.studentId,
    active: raw.active,
    createdAt: raw.createdAt,
    disabledAt: raw.disabledAt,
  })
}

function restoreGrant(raw) {
  return createTeacherStudentGrant({
    teacherId: raw.teacherId,
    studentId: raw.studentId,
    active: raw.active,
    createdAt: raw.createdAt,
    revokedAt: raw.revokedAt,
  })
}

function restorePrepared(raw) {
  const assignment =
    restorePrivateAssignmentV1(raw.assignment)
  return createPreparedAssignmentRecord({
    teacherId: raw.teacherId,
    assignment,
    packageId: raw.packageId,
    packageFingerprint: raw.packageFingerprint,
    preparedAt: raw.preparedAt,
  })
}

function restoreDelivery(raw) {
  let record = createDeliveryRecord({
    assignmentId: raw.assignmentId,
    packageId: raw.packageId,
    teacherId: raw.teacherId,
    studentId: raw.studentId,
    deliveredAt: raw.deliveredAt,
  })
  if (raw.revokedAt !== null) {
    record = revokeDeliveryRecord(
      record,
      raw.revokedAt,
    )
  }
  return record
}


function restorePieceAssignment(raw) {
  const restored = createPieceAssignment({
    pieceAssignmentId:
      raw.pieceAssignmentId,
    pieceId: raw.pieceId,
    arrangementId: raw.arrangementId,
    studentId: raw.studentId,
    title: raw.title,
    teacherNote: raw.teacherNote,
    assignedAt: raw.assignedAt,
    contentRefs: raw.contentRefs,
  })

  if (!same(restored, raw)) {
    throw new TypeError(
      'invalid PieceAssignment persistence snapshot.',
    )
  }

  return restored
}

function restorePieceLifecycle(
  raw,
  piece,
) {
  const restored = Object.freeze({
    schemaVersion: raw.schemaVersion,
    piece,
    state: raw.state,
    stateChangedAt: raw.stateChangedAt,
    revokedAt: raw.revokedAt,
  })

  if (
    !isPieceAssignmentLifecycleRecord(
      restored,
    ) ||
    !same(restored, raw)
  ) {
    throw new TypeError(
      'invalid Piece lifecycle persistence snapshot.',
    )
  }

  return restored
}

function same(left, right) {
  return isDeepStrictEqual(
    plain(left),
    plain(right),
  )
}

function samePackage(left, right) {
  try {
    return (
      canonicalPackageJson(left) ===
      canonicalPackageJson(right)
    )
  } catch {
    return false
  }
}

function assertFirestore(firestore) {
  if (
    !firestore ||
    typeof firestore.collection !== 'function' ||
    typeof firestore.runTransaction !== 'function' ||
    typeof firestore.batch !== 'function'
  ) {
    throw new TypeError(
      'firestore must provide Admin Firestore methods.',
    )
  }
  return firestore
}

function validatePreparedRow(row) {
  if (
    !row ||
    typeof row !== 'object' ||
    !isPreparedAssignmentRecord(row.prepared)
  ) {
    throw new TypeError(
      'prepared batch row must contain a valid PreparedAssignmentRecord.',
    )
  }

  let pkg
  try {
    pkg = restoreSecureDeliveryPackage(
      row.package,
    )
    assertSecureDeliveryPackageMatchesAssignment(
      pkg,
      row.prepared.assignment,
    )
  } catch {
    throw new TypeError(
      'prepared batch row must contain a valid secure delivery package.',
    )
  }

  if (
    row.prepared.packageId !==
      pkg.packageId ||
    row.prepared.packageFingerprint !==
      fingerprintSecureDeliveryPackage(
        pkg,
      )
  ) {
    throw new Error(
      'prepared assignment package conflict.',
    )
  }
}

export function createFirestoreSecureDeliveryStore({
  firestore,
} = {}) {
  const db = assertFirestore(firestore)

  const collections = Object.freeze({
    identities: db.collection(
      'identityMappings',
    ),
    grants: db.collection(
      'teacherStudentGrants',
    ),
    prepared: db.collection(
      'privateAssignments',
    ),
    packages: db.collection(
      'practicePackages',
    ),
    lifecycle: db.collection(
      'assignmentLifecycle',
    ),
    deliveries: db.collection(
      'deliveries',
    ),
    roster: db.collection(
      'studentRoster',
    ),
    pool: db.collection(
      'poolPublications',
    ),
  })

  async function getPreparedAssignment(
    assignmentId,
  ) {
    const id = normalizeRequiredId(
      assignmentId,
      'assignmentId',
    )
    const snap = await collections.prepared
      .doc(documentId(id))
      .get()
    return snap.exists
      ? restorePrepared(snap.data())
      : null
  }

  async function getPracticePackage(packageId) {
    const id = normalizeRequiredId(
      packageId,
      'packageId',
    )
    const snap = await collections.packages
      .doc(documentId(id))
      .get()
    return snap.exists
      ? restoreSecureDeliveryPackage(
          snap.data(),
        )
      : null
  }

  async function getLifecycle(assignmentId) {
    const id = normalizeRequiredId(
      assignmentId,
      'assignmentId',
    )
    const [lifecycleSnap, prepared] =
      await Promise.all([
        collections.lifecycle
          .doc(documentId(id))
          .get(),
        getPreparedAssignment(id),
      ])
    if (!lifecycleSnap.exists) {
      return null
    }
    if (prepared === null) {
      throw new Error(
        'lifecycle prepared assignment missing.',
      )
    }
    return restoreAssignmentLifecycleRecordV1(
      lifecycleSnap.data(),
      prepared.assignment,
    )
  }

  async function getDelivery(assignmentId) {
    const id = normalizeRequiredId(
      assignmentId,
      'assignmentId',
    )
    const snap = await collections.deliveries
      .doc(documentId(id))
      .get()
    return snap.exists
      ? restoreDelivery(snap.data())
      : null
  }


  async function getPieceAssignment(
    pieceAssignmentId,
  ) {
    const id = normalizeRequiredId(
      pieceAssignmentId,
      'pieceAssignmentId',
    )
    const snap = await collections.pieces
      .doc(documentId(id))
      .get()

    return snap.exists
      ? restorePieceAssignment(
          snap.data(),
        )
      : null
  }

  async function getPieceLifecycle(
    pieceAssignmentId,
  ) {
    const id = normalizeRequiredId(
      pieceAssignmentId,
      'pieceAssignmentId',
    )
    const [piece, lifecycleSnap] =
      await Promise.all([
        getPieceAssignment(id),
        collections.pieceLifecycle
          .doc(documentId(id))
          .get(),
      ])

    if (!lifecycleSnap.exists) {
      return null
    }
    if (piece === null) {
      throw new Error(
        'Piece lifecycle authority missing.',
      )
    }

    return restorePieceLifecycle(
      lifecycleSnap.data(),
      piece,
    )
  }

  async function listPieceAssignmentsForStudent(
    studentId,
  ) {
    const id = normalizeRequiredId(
      studentId,
      'studentId',
    )
    const snap = await collections.pieces
      .where('studentId', '==', id)
      .get()

    return Object.freeze(
      snap.docs.map((item) => {
        const piece =
          restorePieceAssignment(
            item.data(),
          )
        if (piece.studentId !== id) {
          throw new Error(
            'Piece student scope conflict.',
          )
        }
        return piece
      }),
    )
  }

  async function putPieceAssignment(
    piece,
  ) {
    if (!isPieceAssignment(piece)) {
      throw new TypeError(
        'piece must be a valid immutable PieceAssignment.',
      )
    }

    const ref = collections.pieces.doc(
      documentId(
        piece.pieceAssignmentId,
      ),
    )

    return db.runTransaction(
      async (tx) => {
        const snap = await tx.get(ref)

        if (snap.exists) {
          const stored =
            restorePieceAssignment(
              snap.data(),
            )
          if (!same(stored, piece)) {
            throw new Error(
              'Piece assignment immutable conflict.',
            )
          }
          return stored
        }

        tx.create(ref, plain(piece))
        return piece
      },
    )
  }

  async function commitPieceLifecycleMutation(
    input = {},
  ) {
    assertStrictInputObject(
      input,
      [
        'currentLifecycle',
        'nextLifecycle',
      ],
      'PieceLifecycleMutation',
    )

    const {
      currentLifecycle,
      nextLifecycle,
    } = input

    if (
      !isPieceAssignmentLifecycleRecord(
        currentLifecycle,
      ) ||
      !isPieceAssignmentLifecycleRecord(
        nextLifecycle,
      )
    ) {
      throw new TypeError(
        'Piece lifecycle mutation requires valid lifecycle records.',
      )
    }

    const id =
      currentLifecycle.piece
        .pieceAssignmentId

    if (
      nextLifecycle.piece
        .pieceAssignmentId !== id ||
      !same(
        currentLifecycle.piece,
        nextLifecycle.piece,
      )
    ) {
      throw new Error(
        'Piece lifecycle mutation authority mismatch.',
      )
    }

    const pieceRef =
      collections.pieces.doc(
        documentId(id),
      )
    const lifecycleRef =
      collections.pieceLifecycle.doc(
        documentId(id),
      )

    return db.runTransaction(
      async (tx) => {
        const pieceSnap =
          await tx.get(pieceRef)
        const lifecycleSnap =
          await tx.get(lifecycleRef)

        if (!pieceSnap.exists) {
          throw new Error(
            'Piece lifecycle authority missing.',
          )
        }

        const storedPiece =
          restorePieceAssignment(
            pieceSnap.data(),
          )

        if (
          !same(
            storedPiece,
            currentLifecycle.piece,
          )
        ) {
          throw new Error(
            'Piece lifecycle stored authority conflict.',
          )
        }

        const storedLifecycle =
          lifecycleSnap.exists
            ? restorePieceLifecycle(
                lifecycleSnap.data(),
                storedPiece,
              )
            : null

        if (storedLifecycle === null) {
          const expectedInitial =
            createInitialPieceLifecycleRecord(
              storedPiece,
            )
          if (
            !same(
              expectedInitial,
              currentLifecycle,
            )
          ) {
            throw new Error(
              'Piece lifecycle current conflict.',
            )
          }
        } else if (
          !same(
            storedLifecycle,
            currentLifecycle,
          )
        ) {
          throw new Error(
            'Piece lifecycle current conflict.',
          )
        }

        if (
          same(
            currentLifecycle,
            nextLifecycle,
          )
        ) {
          return storedLifecycle ??
            currentLifecycle
        }

        tx.set(
          lifecycleRef,
          plain(nextLifecycle),
        )
        return nextLifecycle
      },
    )
  }

  async function commitPreparedBatch(rows) {
    if (
      !Array.isArray(rows) ||
      rows.length === 0
    ) {
      throw new TypeError(
        'prepared batch must be non-empty.',
      )
    }
    if (rows.length > 40) {
      throw new Error(
        'prepared batch maximum is 40.',
      )
    }
    const seenAssignments = new Set()
    for (const row of rows) {
      validatePreparedRow(row)
      const id =
        row.prepared.assignment.assignmentId
      if (seenAssignments.has(id)) {
        throw new Error(
          'duplicate prepared assignment conflict.',
        )
      }
      seenAssignments.add(id)
    }

    return db.runTransaction(async (tx) => {
      const descriptors = rows.map((row) => ({
        row,
        preparedRef:
          collections.prepared.doc(
            documentId(
              row.prepared.assignment
                .assignmentId,
            ),
          ),
        packageRef:
          collections.packages.doc(
            documentId(
              row.package.packageId,
            ),
          ),
      }))

      const snapshots = []
      for (const descriptor of descriptors) {
        snapshots.push({
          prepared:
            await tx.get(
              descriptor.preparedRef,
            ),
          package:
            await tx.get(
              descriptor.packageRef,
            ),
        })
      }

      const output = []
      for (
        let index = 0;
        index < descriptors.length;
        index += 1
      ) {
        const descriptor =
          descriptors[index]
        const snaps = snapshots[index]
        const { row } = descriptor

        let storedPrepared = null
        if (snaps.prepared.exists) {
          storedPrepared =
            restorePrepared(
              snaps.prepared.data(),
            )
          if (
            !same(
              storedPrepared,
              row.prepared,
            )
          ) {
            throw new Error(
              'prepared assignment conflict.',
            )
          }
        }

        if (snaps.package.exists) {
          const storedPackage =
            restoreSecureDeliveryPackage(
              snaps.package.data(),
            )
          if (
            !samePackage(
              storedPackage,
              row.package,
            ) ||
            fingerprintSecureDeliveryPackage(
              storedPackage,
            ) !==
              row.prepared
                .packageFingerprint
          ) {
            throw new Error(
              'PracticePackage content conflict.',
            )
          }
        }

        if (storedPrepared === null) {
          tx.create(
            descriptor.preparedRef,
            plain(row.prepared),
          )
        }
        if (!snaps.package.exists) {
          tx.create(
            descriptor.packageRef,
            plain(row.package),
          )
        }
        output.push(
          storedPrepared ?? row.prepared,
        )
      }

      return Object.freeze(output)
    })
  }

  async function commitDeliveryBatch(rows) {
    if (
      !Array.isArray(rows) ||
      rows.length === 0
    ) {
      throw new TypeError(
        'delivery batch must be non-empty.',
      )
    }
    if (rows.length > 40) {
      throw new Error(
        'delivery batch maximum is 40.',
      )
    }
    const seen = new Set()
    for (const row of rows) {
      if (!isDeliveryRecord(row)) {
        throw new TypeError(
          'delivery batch row must be valid.',
        )
      }
      if (seen.has(row.assignmentId)) {
        throw new Error(
          'duplicate delivery conflict.',
        )
      }
      seen.add(row.assignmentId)
    }

    return db.runTransaction(async (tx) => {
      const descriptors = rows.map((row) => {
        const key =
          documentId(row.assignmentId)
        return {
          row,
          preparedRef:
            collections.prepared.doc(key),
          lifecycleRef:
            collections.lifecycle.doc(key),
          deliveryRef:
            collections.deliveries.doc(key),
        }
      })

      const snapshots = []
      for (const descriptor of descriptors) {
        snapshots.push({
          prepared:
            await tx.get(
              descriptor.preparedRef,
            ),
          lifecycle:
            await tx.get(
              descriptor.lifecycleRef,
            ),
          delivery:
            await tx.get(
              descriptor.deliveryRef,
            ),
        })
      }

      const output = []
      for (
        let index = 0;
        index < descriptors.length;
        index += 1
      ) {
        const descriptor =
          descriptors[index]
        const snaps = snapshots[index]
        const { row } = descriptor

        if (!snaps.prepared.exists) {
          throw new Error(
            'delivery prepared assignment missing.',
          )
        }
        const prepared =
          restorePrepared(
            snaps.prepared.data(),
          )
        if (
          prepared.teacherId !==
            row.teacherId ||
          prepared.assignment.studentId !==
            row.studentId ||
          prepared.packageId !==
            row.packageId
        ) {
          throw new Error(
            'delivery prepared authority conflict.',
          )
        }

        if (snaps.lifecycle.exists) {
          const lifecycle =
            restoreAssignmentLifecycleRecordV1(
              snaps.lifecycle.data(),
              prepared.assignment,
            )
          if (
            lifecycle.revokedAt !== null
          ) {
            throw new Error(
              'delivery assignment revoked.',
            )
          }
        }

        if (snaps.delivery.exists) {
          const existing =
            restoreDelivery(
              snaps.delivery.data(),
            )
          if (
            existing.revokedAt !== null ||
            !same(existing, row)
          ) {
            throw new Error(
              'delivery conflict.',
            )
          }
          output.push(existing)
          continue
        }

        tx.create(
          descriptor.deliveryRef,
          plain(row),
        )
        output.push(row)
      }

      return Object.freeze(output)
    })
  }

  async function commitLifecycleMutation(
    input = {},
  ) {
    const {
      teacherId,
      assignment,
      currentLifecycle,
      nextLifecycle,
      deliveryBefore,
      deliveryAfter,
      historyEventId,
    } = input

    normalizeRequiredId(
      teacherId,
      'teacherId',
    )
    const eventId =
      normalizeRequiredId(
        historyEventId,
        'historyEventId',
      )
    if (
      !isAssignmentLifecycleRecord(
        currentLifecycle,
      ) ||
      !isAssignmentLifecycleRecord(
        nextLifecycle,
      )
    ) {
      throw new TypeError(
        'lifecycle records must be valid.',
      )
    }
    if (
      !same(
        currentLifecycle.assignment,
        assignment,
      ) ||
      !same(
        nextLifecycle.assignment,
        assignment,
      )
    ) {
      throw new Error(
        'lifecycle mutation assignment mismatch.',
      )
    }
    if (
      deliveryBefore !== null &&
      !isDeliveryRecord(deliveryBefore)
    ) {
      throw new TypeError(
        'deliveryBefore must be null or valid.',
      )
    }
    if (
      deliveryAfter !== null &&
      !isDeliveryRecord(deliveryAfter)
    ) {
      throw new TypeError(
        'deliveryAfter must be null or valid.',
      )
    }

    const assignmentId =
      assignment.assignmentId
    const key =
      documentId(assignmentId)
    const preparedRef =
      collections.prepared.doc(key)
    const lifecycleRef =
      collections.lifecycle.doc(key)
    const deliveryRef =
      collections.deliveries.doc(key)
    const historyRef =
      lifecycleRef
        .collection('history')
        .doc(documentId(eventId))

    return db.runTransaction(async (tx) => {
      const preparedSnap =
        await tx.get(preparedRef)
      const lifecycleSnap =
        await tx.get(lifecycleRef)
      const deliverySnap =
        await tx.get(deliveryRef)
      const historySnap =
        await tx.get(historyRef)

      if (!preparedSnap.exists) {
        throw new Error(
          'lifecycle prepared assignment missing.',
        )
      }
      const prepared =
        restorePrepared(
          preparedSnap.data(),
        )
      if (
        prepared.teacherId !==
          teacherId ||
        !same(
          prepared.assignment,
          assignment,
        )
      ) {
        throw new Error(
          'lifecycle prepared authority conflict.',
        )
      }

      const storedLifecycle =
        lifecycleSnap.exists
          ? restoreAssignmentLifecycleRecordV1(
              lifecycleSnap.data(),
              prepared.assignment,
            )
          : createInitialAssignmentLifecycleRecord(
              prepared.assignment,
            )

      if (
        !same(
          storedLifecycle,
          currentLifecycle,
        )
      ) {
        throw new Error(
          'lifecycle current conflict.',
        )
      }

      const storedDelivery =
        deliverySnap.exists
          ? restoreDelivery(
              deliverySnap.data(),
            )
          : null
      if (
        !same(
          storedDelivery,
          deliveryBefore,
        )
      ) {
        throw new Error(
          'delivery current conflict.',
        )
      }

      if (
        same(
          currentLifecycle,
          nextLifecycle,
        ) &&
        same(
          deliveryBefore,
          deliveryAfter,
        )
      ) {
        return Object.freeze({
          lifecycle: storedLifecycle,
          delivery: storedDelivery,
        })
      }

      if (historySnap.exists) {
        throw new Error(
          'lifecycle history event conflict.',
        )
      }

      tx.set(
        lifecycleRef,
        plain(nextLifecycle),
      )
      tx.create(historyRef, {
        schemaVersion: 1,
        teacherId,
        historyEventId: eventId,
        lifecycle:
          plain(nextLifecycle),
        deliveryRevokedAt:
          deliveryAfter?.revokedAt ??
          null,
      })

      if (deliveryAfter === null) {
        if (deliverySnap.exists) {
          tx.delete(deliveryRef)
        }
      } else {
        if (
          deliveryAfter.assignmentId !==
            assignmentId ||
          deliveryAfter.teacherId !==
            teacherId ||
          deliveryAfter.studentId !==
            assignment.studentId ||
          deliveryAfter.packageId !==
            prepared.packageId
        ) {
          throw new Error(
            'deliveryAfter authority conflict.',
          )
        }
        tx.set(
          deliveryRef,
          plain(deliveryAfter),
        )
      }

      return Object.freeze({
        lifecycle: nextLifecycle,
        delivery: deliveryAfter,
      })
    })
  }

  async function listPoolPublicationsForStudent(
    studentId,
  ) {
    const id = normalizeRequiredId(
      studentId,
      'studentId',
    )

    const [allSnap, selectedSnap] =
      await Promise.all([
        collections.pool
          .where(
            'item.audienceMode',
            '==',
            'ALL',
          )
          .get(),
        collections.pool
          .where(
            'item.recipientStudentIds',
            'array-contains',
            id,
          )
          .get(),
      ])

    const byId = new Map()
    for (const snap of [
      allSnap,
      selectedSnap,
    ]) {
      for (const item of snap.docs) {
        const record =
          restorePoolPublicationRecordV1(
            item.data(),
          )

        if (record.revokedAt !== null) {
          continue
        }

        const authorized =
          record.item.audienceMode ===
            'ALL' ||
          record.item.recipientStudentIds
            .includes(id)

        if (!authorized) {
          throw new Error(
            'Pool read authority conflict.',
          )
        }

        const poolItemId =
          record.item.poolItemId
        const existing =
          byId.get(poolItemId)
        if (
          existing !== undefined &&
          !same(existing, record)
        ) {
          throw new Error(
            'Pool read duplicate conflict.',
          )
        }
        byId.set(poolItemId, record)
      }
    }

    return Object.freeze(
      [...byId.values()],
    )
  }

  async function putRosterEntriesForProvisioning(
    entries,
  ) {
    if (!Array.isArray(entries)) {
      throw new TypeError(
        'roster provisioning input must be an array.',
      )
    }
    const batch = db.batch()
    for (const entry of entries) {
      if (!isStudentRosterEntry(entry)) {
        throw new TypeError(
          'roster provisioning row must be valid.',
        )
      }
      batch.set(
        collections.roster.doc(
          documentId(entry.studentId),
        ),
        plain(entry),
      )
    }
    await batch.commit()
    return Object.freeze([...entries])
  }

  async function putPoolPublicationsForProvisioning(
    records,
  ) {
    if (!Array.isArray(records)) {
      throw new TypeError(
        'Pool provisioning input must be an array.',
      )
    }
    const seen = new Set()
    for (const record of records) {
      if (!isPoolPublicationRecord(record)) {
        throw new TypeError(
          'Pool provisioning row must be valid.',
        )
      }
      const poolId =
        record.item.poolItemId
      if (seen.has(poolId)) {
        throw new Error(
          'duplicate Pool provisioning row.',
        )
      }
      seen.add(poolId)
    }

    return db.runTransaction(async (tx) => {
      const descriptors = []
      for (const record of records) {
        const ref =
          collections.pool.doc(
            documentId(
              record.item.poolItemId,
            ),
          )
        const recipientQuery =
          ref.collection('recipients')
        const recipientSnap =
          await tx.get(recipientQuery)
        descriptors.push({
          record,
          ref,
          recipientSnap,
        })
      }

      for (const descriptor of descriptors) {
        for (
          const existing
          of descriptor.recipientSnap.docs
        ) {
          tx.delete(existing.ref)
        }
        tx.set(
          descriptor.ref,
          plain(descriptor.record),
        )
        for (
          const studentId
          of descriptor.record.item
            .recipientStudentIds
        ) {
          tx.set(
            descriptor.ref
              .collection('recipients')
              .doc(documentId(studentId)),
            { studentId },
          )
        }
      }

      return Object.freeze([...records])
    })
  }

  return Object.freeze({
    async getIdentityMapping(
      providerSubject,
    ) {
      const subject =
        normalizeRequiredId(
          providerSubject,
          'providerSubject',
        )
      const snap =
        await collections.identities
          .doc(documentId(subject))
          .get()
      return snap.exists
        ? restoreIdentity(snap.data())
        : null
    },

    async getTeacherStudentGrant(
      teacherId,
      studentId,
    ) {
      const snap =
        await collections.grants
          .doc(
            pairDocumentId(
              teacherId,
              studentId,
            ),
          )
          .get()
      return snap.exists
        ? restoreGrant(snap.data())
        : null
    },

    getPreparedAssignment,
    getPracticePackage,
    getLifecycle,
    getDelivery,
    getPieceAssignment,
    getPieceLifecycle,
    listPieceAssignmentsForStudent,
    putPieceAssignment,
    commitPieceLifecycleMutation,

    async listDeliveriesForTeacher(
      teacherId,
    ) {
      const id =
        normalizeRequiredId(
          teacherId,
          'teacherId',
        )
      const snap =
        await collections.deliveries
          .where('teacherId', '==', id)
          .orderBy(
            'deliveredAt',
            'desc',
          )
          .get()
      return Object.freeze(
        snap.docs.map((item) =>
          restoreDelivery(item.data()),
        ),
      )
    },

    async listActiveDeliveriesForStudent(
      studentId,
    ) {
      const id =
        normalizeRequiredId(
          studentId,
          'studentId',
        )
      const snap =
        await collections.deliveries
          .where(
            'studentId',
            '==',
            id,
          )
          .where(
            'revokedAt',
            '==',
            null,
          )
          .get()
      return Object.freeze(
        snap.docs.map((item) =>
          restoreDelivery(item.data()),
        ),
      )
    },

    listPoolPublicationsForStudent,

    commitPreparedBatch,
    commitDeliveryBatch,
    commitLifecycleMutation,
    putRosterEntriesForProvisioning,
    putPoolPublicationsForProvisioning,
  })
}
