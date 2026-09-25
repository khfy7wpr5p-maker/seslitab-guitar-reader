import {
  isDeepStrictEqual,
} from 'node:util'

import {
  createSecureDeliveryIdentityMapping,
} from '../../../src/services/secureDeliveryIdentity.js'
import {
  createTeacherStudentGrant,
} from '../../../src/services/teacherStudentGrant.js'
import {
  SECURE_DELIVERY_PROVISIONING_ACTION,
} from '../../../src/services/secureDeliveryProvisioning.js'
import {
  normalizeRequiredId,
} from '../../../src/services/teacherDeliveryContractValidation.js'
import {
  createProvisioningState,
  provisioningDomainBindingKey,
  provisioningGrantKey,
  simulateSecureDeliveryProvisioningBatch,
} from './secureDeliveryProvisioningDomain.js'

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

function same(left, right) {
  return isDeepStrictEqual(
    plain(left),
    plain(right),
  )
}

function documentId(value) {
  return Buffer.from(
    normalizeRequiredId(
      value,
      'documentId',
    ),
    'utf8',
  ).toString('base64url')
}

function pairDocumentId(
  teacherId,
  studentId,
) {
  const teacher =
    normalizeRequiredId(
      teacherId,
      'teacherId',
    )
  const student =
    normalizeRequiredId(
      studentId,
      'studentId',
    )

  return Buffer.from(
    JSON.stringify([
      teacher,
      student,
    ]),
    'utf8',
  ).toString('base64url')
}

function assertFirestore(firestore) {
  if (
    !firestore ||
    typeof firestore.collection !==
      'function' ||
    typeof firestore.runTransaction !==
      'function' ||
    typeof firestore.getAll !==
      'function'
  ) {
    throw new TypeError(
      'firestore must provide Admin Firestore provisioning methods.',
    )
  }
  return firestore
}

function restoreIdentity(raw) {
  return createSecureDeliveryIdentityMapping({
    providerSubject:
      raw.providerSubject,
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

function restoreBinding(raw) {
  if (
    !raw ||
    typeof raw !== 'object'
  ) {
    throw new Error(
      'secure-delivery-provisioning-domain-binding-invalid',
    )
  }

  const role = raw.role
  const stableId =
    normalizeRequiredId(
      raw.stableId,
      'stableId',
    )
  const providerSubject =
    normalizeRequiredId(
      raw.providerSubject,
      'providerSubject',
    )

  if (
    provisioningDomainBindingKey(
      role,
      stableId,
    ) === ''
  ) {
    throw new Error(
      'secure-delivery-provisioning-domain-binding-invalid',
    )
  }

  return Object.freeze({
    role,
    stableId,
    providerSubject,
  })
}

function restoreAudit(raw) {
  if (
    !raw ||
    typeof raw !== 'object' ||
    typeof raw.commandFingerprint !==
      'string'
  ) {
    throw new Error(
      'secure-delivery-provisioning-audit-invalid',
    )
  }

  return Object.freeze({
    ...raw,
  })
}

function identityStableId(command) {
  return command.role === 'TEACHER'
    ? command.teacherId
    : command.studentId
}

export function createFirestoreSecureDeliveryProvisioningStore({
  firestore,
} = {}) {
  const db = assertFirestore(
    firestore,
  )

  const collections =
    Object.freeze({
      identities: db.collection(
        'identityMappings',
      ),
      bindings: db.collection(
        'identityDomainBindings',
      ),
      grants: db.collection(
        'teacherStudentGrants',
      ),
      audits: db.collection(
        'secureDeliveryProvisioningAudit',
      ),
    })

  function identityRef(
    providerSubject,
  ) {
    return collections.identities.doc(
      documentId(providerSubject),
    )
  }

  function bindingRef(domainKey) {
    return collections.bindings.doc(
      documentId(domainKey),
    )
  }

  function grantRef(
    teacherId,
    studentId,
  ) {
    return collections.grants.doc(
      pairDocumentId(
        teacherId,
        studentId,
      ),
    )
  }

  function auditRef(operationId) {
    return collections.audits.doc(
      documentId(operationId),
    )
  }

  function addDescriptor(
    descriptors,
    token,
    descriptor,
  ) {
    if (!descriptors.has(token)) {
      descriptors.set(
        token,
        descriptor,
      )
    }
  }

  function primaryDescriptors(
    commands,
  ) {
    const descriptors = new Map()

    for (const command of commands) {
      addDescriptor(
        descriptors,
        'audit:' +
          command.operationId,
        {
          kind: 'audit',
          key: command.operationId,
          ref: auditRef(
            command.operationId,
          ),
        },
      )

      if (
        command.action ===
          SECURE_DELIVERY_PROVISIONING_ACTION.CREATE_IDENTITY
      ) {
        const domainKey =
          provisioningDomainBindingKey(
            command.role,
            identityStableId(
              command,
            ),
          )

        addDescriptor(
          descriptors,
          'identity:' +
            command.providerSubject,
          {
            kind: 'identity',
            key:
              command.providerSubject,
            ref: identityRef(
              command.providerSubject,
            ),
          },
        )
        addDescriptor(
          descriptors,
          'binding:' +
            domainKey,
          {
            kind: 'binding',
            key: domainKey,
            ref: bindingRef(
              domainKey,
            ),
          },
        )
        continue
      }

      if (
        command.action ===
          SECURE_DELIVERY_PROVISIONING_ACTION.DISABLE_IDENTITY
      ) {
        addDescriptor(
          descriptors,
          'identity:' +
            command.providerSubject,
          {
            kind: 'identity',
            key:
              command.providerSubject,
            ref: identityRef(
              command.providerSubject,
            ),
          },
        )
        continue
      }

      const teacherDomainKey =
        provisioningDomainBindingKey(
          'TEACHER',
          command.teacherId,
        )
      const studentDomainKey =
        provisioningDomainBindingKey(
          'STUDENT',
          command.studentId,
        )
      const pairKey =
        provisioningGrantKey(
          command.teacherId,
          command.studentId,
        )

      addDescriptor(
        descriptors,
        'binding:' +
          teacherDomainKey,
        {
          kind: 'binding',
          key: teacherDomainKey,
          ref: bindingRef(
            teacherDomainKey,
          ),
        },
      )
      addDescriptor(
        descriptors,
        'binding:' +
          studentDomainKey,
        {
          kind: 'binding',
          key: studentDomainKey,
          ref: bindingRef(
            studentDomainKey,
          ),
        },
      )
      addDescriptor(
        descriptors,
        'grant:' + pairKey,
        {
          kind: 'grant',
          key: pairKey,
          teacherId:
            command.teacherId,
          studentId:
            command.studentId,
          ref: grantRef(
            command.teacherId,
            command.studentId,
          ),
        },
      )
    }

    return descriptors
  }

  function applySnapshot(
    maps,
    descriptor,
    snap,
  ) {
    if (!snap.exists) {
      return
    }

    if (
      descriptor.kind ===
        'identity'
    ) {
      maps.identities.set(
        descriptor.key,
        restoreIdentity(
          snap.data(),
        ),
      )
      return
    }

    if (
      descriptor.kind ===
        'binding'
    ) {
      maps.bindings.set(
        descriptor.key,
        restoreBinding(
          snap.data(),
        ),
      )
      return
    }

    if (
      descriptor.kind === 'grant'
    ) {
      maps.grants.set(
        descriptor.key,
        restoreGrant(
          snap.data(),
        ),
      )
      return
    }

    maps.audits.set(
      descriptor.key,
      restoreAudit(
        snap.data(),
      ),
    )
  }

  async function loadState(
    commands,
    getAll,
    getIdentityCollection,
  ) {
    const descriptors =
      primaryDescriptors(commands)
    const primary =
      [...descriptors.values()]
    const primarySnaps =
      primary.length === 0
        ? []
        : await getAll(
            primary.map(
              (item) => item.ref,
            ),
          )

    const maps = {
      identities: new Map(),
      bindings: new Map(),
      grants: new Map(),
      audits: new Map(),
    }

    primary.forEach(
      (descriptor, index) => {
        applySnapshot(
          maps,
          descriptor,
          primarySnaps[index],
        )
      },
    )

    for (
      const command of commands
    ) {
      if (
        command.action !==
          SECURE_DELIVERY_PROVISIONING_ACTION.DISABLE_IDENTITY
      ) {
        continue
      }

      const mapping =
        maps.identities.get(
          command.providerSubject,
        ) ?? null

      if (mapping === null) {
        continue
      }

      const domainKey =
        provisioningDomainBindingKey(
          mapping.role,
          mapping.role ===
              'TEACHER'
            ? mapping.teacherId
            : mapping.studentId,
        )

      addDescriptor(
        descriptors,
        'binding:' +
          domainKey,
        {
          kind: 'binding',
          key: domainKey,
          ref: bindingRef(
            domainKey,
          ),
        },
      )
    }

    const missing =
      [...descriptors.entries()]
        .filter(
          ([token]) =>
            !primary.some(
              (item) =>
                (
                  item.kind +
                  ':' +
                  item.key
                ) === token,
            ),
        )
        .map(([, item]) => item)

    if (missing.length > 0) {
      const snaps =
        await getAll(
          missing.map(
            (item) => item.ref,
          ),
        )
      missing.forEach(
        (descriptor, index) => {
          applySnapshot(
            maps,
            descriptor,
            snaps[index],
          )
        },
      )
    }

    const extraIdentities =
      new Map()

    for (
      const binding
      of maps.bindings.values()
    ) {
      if (
        !maps.identities.has(
          binding.providerSubject,
        )
      ) {
        extraIdentities.set(
          binding.providerSubject,
          {
            kind: 'identity',
            key:
              binding.providerSubject,
            ref: identityRef(
              binding.providerSubject,
            ),
          },
        )
      }
    }

    if (
      extraIdentities.size > 0
    ) {
      const items =
        [...extraIdentities.values()]
      const snaps =
        await getAll(
          items.map(
            (item) => item.ref,
          ),
        )
      items.forEach(
        (descriptor, index) => {
          applySnapshot(
            maps,
            descriptor,
            snaps[index],
          )
        },
      )
    }

    if (
      commands.some(
        (command) =>
          command.action ===
          SECURE_DELIVERY_PROVISIONING_ACTION.CREATE_IDENTITY,
      )
    ) {
      const identitySnap =
        await getIdentityCollection()
      for (
        const item
        of identitySnap.docs
      ) {
        const mapping =
          restoreIdentity(
            item.data(),
          )
        maps.identities.set(
          mapping.providerSubject,
          mapping,
        )
      }
    }

    return createProvisioningState(
      maps,
    )
  }

  async function previewProvisioningBatch(
    commands,
  ) {
    const state = await loadState(
      commands,
      async (refs) =>
        db.getAll(...refs),
      async () =>
        collections.identities.get(),
    )

    return simulateSecureDeliveryProvisioningBatch({
      state,
      commands,
    }).operations
  }

  function splitGrantKey(key) {
    const parts =
      key.split('\u0001')
    if (parts.length !== 2) {
      throw new Error(
        'secure-delivery-provisioning-grant-key-invalid',
      )
    }
    return parts
  }

  async function commitProvisioningBatch(
    commands,
  ) {
    return db.runTransaction(
      async (tx) => {
        const before =
          await loadState(
            commands,
            async (refs) =>
              tx.getAll(...refs),
            async () =>
              tx.get(
                collections.identities,
              ),
          )

        const simulated =
          simulateSecureDeliveryProvisioningBatch({
            state: before,
            commands,
          })
        const after =
          simulated.state

        for (
          const [
            providerSubject,
            mapping,
          ] of after.identities
        ) {
          const prior =
            before.identities.get(
              providerSubject,
            ) ?? null
          if (!same(prior, mapping)) {
            tx.set(
              identityRef(
                providerSubject,
              ),
              plain(mapping),
            )
          }
        }

        for (
          const [
            domainKey,
            binding,
          ] of after.bindings
        ) {
          const prior =
            before.bindings.get(
              domainKey,
            ) ?? null
          if (!same(prior, binding)) {
            tx.set(
              bindingRef(
                domainKey,
              ),
              plain(binding),
            )
          }
        }

        for (
          const [key, grant]
          of after.grants
        ) {
          const prior =
            before.grants.get(
              key,
            ) ?? null
          if (!same(prior, grant)) {
            const [
              teacherId,
              studentId,
            ] = splitGrantKey(key)
            tx.set(
              grantRef(
                teacherId,
                studentId,
              ),
              plain(grant),
            )
          }
        }

        for (
          const [
            operationId,
            audit,
          ] of after.audits
        ) {
          if (
            !before.audits.has(
              operationId,
            )
          ) {
            tx.create(
              auditRef(
                operationId,
              ),
              plain(audit),
            )
          }
        }

        return simulated.operations
      },
    )
  }

  async function getProvisioningAudit(
    operationId,
  ) {
    const id =
      normalizeRequiredId(
        operationId,
        'operationId',
      )
    const snap =
      await auditRef(id).get()
    return snap.exists
      ? restoreAudit(
          snap.data(),
        )
      : null
  }

  async function listProvisioningAudit() {
    const snap =
      await collections.audits.get()
    const records =
      snap.docs.map((item) =>
        restoreAudit(item.data()),
      )

    records.sort(
      (left, right) =>
        left.timestamp.localeCompare(
          right.timestamp,
        ) ||
        left.operationId.localeCompare(
          right.operationId,
        ),
    )

    return Object.freeze(
      records,
    )
  }

  return Object.freeze({
    previewProvisioningBatch,
    commitProvisioningBatch,
    getProvisioningAudit,
    listProvisioningAudit,
  })
}
