import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SECURE_DELIVERY_PROVISIONING_ACTION,
  createSecureDeliveryProvisioningCommand,
} from '../src/services/secureDeliveryProvisioning.js'
import {
  createInMemorySecureDeliveryStore,
} from '../backend/delivery/repositories/inMemorySecureDeliveryStore.js'
import {
  createSecureDeliveryProvisioningService,
} from '../backend/delivery/provisioning/secureDeliveryProvisioningService.js'
import {
  normalizeSecureDeliveryProvisioningManifest,
  parseSecureDeliveryProvisioningCliArgs,
} from '../backend/delivery/provisioning/secureDeliveryProvisioningManifest.js'
import {
  createSecureDeliveryAuthorization,
} from '../backend/delivery/authorization/secureDeliveryAuthorization.js'

const T0 = '2026-09-25T09:00:00Z'

function createIdentity({
  operationId,
  providerSubject,
  role,
  teacherId = null,
  studentId = null,
  timestamp = T0,
} = {}) {
  return createSecureDeliveryProvisioningCommand({
    operationId,
    action:
      SECURE_DELIVERY_PROVISIONING_ACTION.CREATE_IDENTITY,
    operatorId: 'operator-test',
    reason: 'SES-14 acceptance',
    timestamp,
    providerSubject,
    role,
    teacherId,
    studentId,
  })
}

function disableIdentity({
  operationId,
  providerSubject,
  timestamp = '2026-09-25T09:10:00Z',
} = {}) {
  return createSecureDeliveryProvisioningCommand({
    operationId,
    action:
      SECURE_DELIVERY_PROVISIONING_ACTION.DISABLE_IDENTITY,
    operatorId: 'operator-test',
    reason: 'SES-14 acceptance',
    timestamp,
    providerSubject,
  })
}

function grantCommand({
  operationId,
  action =
    SECURE_DELIVERY_PROVISIONING_ACTION.CREATE_GRANT,
  teacherId = 'teacher-a',
  studentId = 'student-a',
  timestamp = '2026-09-25T09:05:00Z',
} = {}) {
  return createSecureDeliveryProvisioningCommand({
    operationId,
    action,
    operatorId: 'operator-test',
    reason: 'SES-14 acceptance',
    timestamp,
    teacherId,
    studentId,
  })
}

async function appliedService(store) {
  return createSecureDeliveryProvisioningService({
    store,
    applyEnabled: true,
  })
}

test('SES-14 provisioning command contract is strict and role-aware', () => {
  assert.throws(
    () =>
      createSecureDeliveryProvisioningCommand({
        operationId: 'op-unknown',
        action:
          SECURE_DELIVERY_PROVISIONING_ACTION.CREATE_IDENTITY,
        operatorId: 'operator-test',
        reason: 'test',
        timestamp: T0,
        providerSubject: 'uid-a',
        role: 'STUDENT',
        teacherId: null,
        studentId: 'student-a',
        unexpected: true,
      }),
    /unsupported field/i,
  )

  assert.throws(
    () =>
      createIdentity({
        operationId: 'op-role-shape',
        providerSubject: 'uid-a',
        role: 'TEACHER',
        studentId: 'student-a',
      }),
    /role|teacherId|studentId/i,
  )

  const command = createIdentity({
    operationId: 'op-normalized',
    providerSubject: ' uid-student-a ',
    role: 'STUDENT',
    studentId: ' student-a ',
  })

  assert.equal(command.providerSubject, 'uid-student-a')
  assert.equal(command.studentId, 'student-a')
  assert.equal(Object.isFrozen(command), true)
})

test('SES-14 defaults to dry-run and performs zero writes', async () => {
  const store = createInMemorySecureDeliveryStore()
  const service =
    createSecureDeliveryProvisioningService({
      store,
      applyEnabled: true,
    })

  const result = await service.execute({
    commands: [
      createIdentity({
        operationId: 'op-dry-student',
        providerSubject: 'uid-student-a',
        role: 'STUDENT',
        studentId: 'student-a',
      }),
    ],
  })

  assert.equal(result.mode, 'DRY_RUN')
  assert.equal(
    await store.getIdentityMapping('uid-student-a'),
    null,
  )
  assert.equal(
    await store.getProvisioningAudit(
      'op-dry-student',
    ),
    null,
  )
})

test('SES-14 apply requires both explicit apply request and environment safety gate', async () => {
  const store = createInMemorySecureDeliveryStore()
  const service =
    createSecureDeliveryProvisioningService({
      store,
      applyEnabled: false,
    })

  await assert.rejects(
    () =>
      service.execute({
        apply: true,
        commands: [
          createIdentity({
            operationId: 'op-gate',
            providerSubject: 'uid-student-a',
            role: 'STUDENT',
            studentId: 'student-a',
          }),
        ],
      }),
    /apply.*disabled|safety.*gate/i,
  )

  assert.equal(
    await store.getIdentityMapping('uid-student-a'),
    null,
  )
})

test('SES-14 create identities and grant makes existing authorization pass', async () => {
  const store = createInMemorySecureDeliveryStore()
  const service = await appliedService(store)

  await service.execute({
    apply: true,
    commands: [
      createIdentity({
        operationId: 'op-teacher',
        providerSubject: 'uid-teacher-a',
        role: 'TEACHER',
        teacherId: 'teacher-a',
      }),
      createIdentity({
        operationId: 'op-student',
        providerSubject: 'uid-student-a',
        role: 'STUDENT',
        studentId: 'student-a',
      }),
      grantCommand({
        operationId: 'op-grant',
      }),
    ],
  })

  const authorization =
    createSecureDeliveryAuthorization({ store })

  assert.deepEqual(
    await authorization.resolvePrincipal(
      'uid-teacher-a',
      'TEACHER',
    ),
    Object.freeze({
      role: 'TEACHER',
      teacherId: 'teacher-a',
      studentId: null,
    }),
  )
  assert.equal(
    (
      await authorization.requireTeacherStudent(
        'teacher-a',
        'student-a',
      )
    ).active,
    true,
  )

  assert.equal(
    (
      await store.getProvisioningAudit('op-grant')
    ).result,
    'APPLIED',
  )
})

test('SES-14 rejects same provider UID mapped to a different stable identity', async () => {
  const store = createInMemorySecureDeliveryStore()
  const service = await appliedService(store)

  await service.execute({
    apply: true,
    commands: [
      createIdentity({
        operationId: 'op-first',
        providerSubject: 'uid-shared',
        role: 'STUDENT',
        studentId: 'student-a',
      }),
    ],
  })

  await assert.rejects(
    () =>
      service.execute({
        apply: true,
        commands: [
          createIdentity({
            operationId: 'op-second',
            providerSubject: 'uid-shared',
            role: 'STUDENT',
            studentId: 'student-b',
          }),
        ],
      }),
    /provider|identity.*conflict|binding/i,
  )

  assert.equal(
    (
      await store.getIdentityMapping('uid-shared')
    ).studentId,
    'student-a',
  )
})

test('SES-14 rejects different provider UIDs mapped to the same stable domain identity', async () => {
  const store = createInMemorySecureDeliveryStore()
  const service = await appliedService(store)

  await service.execute({
    apply: true,
    commands: [
      createIdentity({
        operationId: 'op-domain-first',
        providerSubject: 'uid-a',
        role: 'STUDENT',
        studentId: 'student-42',
      }),
    ],
  })

  await assert.rejects(
    () =>
      service.execute({
        apply: true,
        commands: [
          createIdentity({
            operationId: 'op-domain-second',
            providerSubject: 'uid-b',
            role: 'STUDENT',
            studentId: 'student-42',
          }),
        ],
      }),
    /domain|binding|identity.*conflict/i,
  )

  assert.equal(
    await store.getIdentityMapping('uid-b'),
    null,
  )
})

test('SES-14 operationId exact replay is idempotent and payload reuse is a hard conflict', async () => {
  const store = createInMemorySecureDeliveryStore()
  const service = await appliedService(store)
  const command = createIdentity({
    operationId: 'op-replay',
    providerSubject: 'uid-a',
    role: 'STUDENT',
    studentId: 'student-a',
  })

  const first = await service.execute({
    apply: true,
    commands: [command],
  })
  const second = await service.execute({
    apply: true,
    commands: [command],
  })

  assert.equal(first.operations[0].result, 'APPLIED')
  assert.equal(second.operations[0].result, 'IDEMPOTENT_REPLAY')
  assert.equal(
    (await store.listProvisioningAudit()).length,
    1,
  )

  await assert.rejects(
    () =>
      service.execute({
        apply: true,
        commands: [
          createIdentity({
            operationId: 'op-replay',
            providerSubject: 'uid-b',
            role: 'STUDENT',
            studentId: 'student-b',
          }),
        ],
      }),
    /operationId|payload.*conflict/i,
  )
})

test('SES-14 revoke and explicit regrant drive authorization FAIL then PASS', async () => {
  const store = createInMemorySecureDeliveryStore()
  const service = await appliedService(store)

  await service.execute({
    apply: true,
    commands: [
      createIdentity({
        operationId: 'op-teacher-r',
        providerSubject: 'uid-teacher-r',
        role: 'TEACHER',
        teacherId: 'teacher-a',
      }),
      createIdentity({
        operationId: 'op-student-r',
        providerSubject: 'uid-student-r',
        role: 'STUDENT',
        studentId: 'student-a',
      }),
      grantCommand({
        operationId: 'op-grant-r',
      }),
    ],
  })

  const authorization =
    createSecureDeliveryAuthorization({ store })
  await authorization.requireTeacherStudent(
    'teacher-a',
    'student-a',
  )

  await service.execute({
    apply: true,
    commands: [
      grantCommand({
        operationId: 'op-revoke',
        action:
          SECURE_DELIVERY_PROVISIONING_ACTION.REVOKE_GRANT,
        timestamp: '2026-09-25T09:20:00Z',
      }),
    ],
  })

  await assert.rejects(
    () =>
      authorization.requireTeacherStudent(
        'teacher-a',
        'student-a',
      ),
    /inactive|grant/i,
  )

  await service.execute({
    apply: true,
    commands: [
      grantCommand({
        operationId: 'op-regrant',
        action:
          SECURE_DELIVERY_PROVISIONING_ACTION.REGRANT,
        timestamp: '2026-09-25T09:30:00Z',
      }),
    ],
  })

  assert.equal(
    (
      await authorization.requireTeacherStudent(
        'teacher-a',
        'student-a',
      )
    ).active,
    true,
  )
  assert.equal(
    (
      await store.getProvisioningAudit(
        'op-revoke',
      )
    ).action,
    'REVOKE_GRANT',
  )
})

test('SES-14 disabling identity makes principal resolution fail closed without deleting mapping', async () => {
  const store = createInMemorySecureDeliveryStore()
  const service = await appliedService(store)

  await service.execute({
    apply: true,
    commands: [
      createIdentity({
        operationId: 'op-student-disable',
        providerSubject: 'uid-disable',
        role: 'STUDENT',
        studentId: 'student-disable',
      }),
      disableIdentity({
        operationId: 'op-disable',
        providerSubject: 'uid-disable',
      }),
    ],
  })

  const mapping =
    await store.getIdentityMapping('uid-disable')
  assert.equal(mapping.active, false)
  assert.equal(
    mapping.disabledAt,
    '2026-09-25T09:10:00Z',
  )

  const authorization =
    createSecureDeliveryAuthorization({ store })
  await assert.rejects(
    () =>
      authorization.resolvePrincipal(
        'uid-disable',
        'STUDENT',
      ),
    /disabled|inactive/i,
  )
})

test('SES-14 batch conflict produces zero partial writes and zero audit rows', async () => {
  const store = createInMemorySecureDeliveryStore()
  const service = await appliedService(store)

  await assert.rejects(
    () =>
      service.execute({
        apply: true,
        commands: [
          createIdentity({
            operationId: 'op-batch-a',
            providerSubject: 'uid-batch-a',
            role: 'STUDENT',
            studentId: 'student-shared',
          }),
          createIdentity({
            operationId: 'op-batch-b',
            providerSubject: 'uid-batch-b',
            role: 'STUDENT',
            studentId: 'student-shared',
          }),
        ],
      }),
    /domain|binding|conflict/i,
  )

  assert.equal(
    await store.getIdentityMapping('uid-batch-a'),
    null,
  )
  assert.equal(
    await store.getIdentityMapping('uid-batch-b'),
    null,
  )
  assert.deepEqual(
    await store.listProvisioningAudit(),
    Object.freeze([]),
  )
})

test('SES-14 manifest and CLI contracts are strict and dry-run-first', () => {
  const manifest =
    normalizeSecureDeliveryProvisioningManifest({
      commands: [
        {
          operationId:
            'op-manifest',
          action:
            SECURE_DELIVERY_PROVISIONING_ACTION.CREATE_IDENTITY,
          operatorId:
            'operator-test',
          reason:
            'manifest validation',
          timestamp: T0,
          providerSubject:
            'uid-manifest',
          role: 'STUDENT',
          teacherId: null,
          studentId:
            'student-manifest',
        },
      ],
    })

  assert.equal(
    manifest.commands.length,
    1,
  )
  assert.equal(
    Object.isFrozen(
      manifest.commands,
    ),
    true,
  )

  assert.throws(
    () =>
      normalizeSecureDeliveryProvisioningManifest({
        commands: manifest.commands,
        productionProjectId:
          'must-not-be-accepted',
      }),
    /unsupported field/i,
  )

  assert.deepEqual(
    parseSecureDeliveryProvisioningCliArgs([
      '--manifest',
      'manifest.json',
    ]),
    Object.freeze({
      manifestPath:
        'manifest.json',
      apply: false,
      emulator: false,
      production: false,
    }),
  )

  assert.throws(
    () =>
      parseSecureDeliveryProvisioningCliArgs([
        '--manifest',
        'manifest.json',
        '--apply',
      ]),
    /requires.*emulator|requires.*production/i,
  )

  assert.deepEqual(
    parseSecureDeliveryProvisioningCliArgs([
      '--manifest',
      'manifest.json',
      '--production',
    ]),
    Object.freeze({
      manifestPath:
        'manifest.json',
      apply: false,
      emulator: false,
      production: true,
    }),
  )

  assert.deepEqual(
    parseSecureDeliveryProvisioningCliArgs([
      '--manifest',
      'manifest.json',
      '--production',
      '--apply',
    ]),
    Object.freeze({
      manifestPath:
        'manifest.json',
      apply: true,
      emulator: false,
      production: true,
    }),
  )

  assert.throws(
    () =>
      parseSecureDeliveryProvisioningCliArgs([
        '--manifest',
        'manifest.json',
        '--emulator',
        '--production',
      ]),
    /mutually exclusive/i,
  )

  assert.deepEqual(
    parseSecureDeliveryProvisioningCliArgs([
      '--manifest',
      'manifest.json',
      '--emulator',
      '--apply',
    ]),
    Object.freeze({
      manifestPath:
        'manifest.json',
      apply: true,
      emulator: true,
      production: false,
    }),
  )

  assert.throws(
    () =>
      parseSecureDeliveryProvisioningCliArgs([
        '--manifest',
        'manifest.json',
        '--unknown',
      ]),
    /unsupported.*argument/i,
  )
})

test('SES-14 rejects provider role collision for the same UID', async () => {
  const store =
    createInMemorySecureDeliveryStore()
  const service =
    await appliedService(store)

  await service.execute({
    apply: true,
    commands: [
      createIdentity({
        operationId:
          'op-role-teacher',
        providerSubject:
          'uid-role-collision',
        role: 'TEACHER',
        teacherId:
          'teacher-role',
      }),
    ],
  })

  await assert.rejects(
    () =>
      service.execute({
        apply: true,
        commands: [
          createIdentity({
            operationId:
              'op-role-student',
            providerSubject:
              'uid-role-collision',
            role: 'STUDENT',
            studentId:
              'student-role',
          }),
        ],
      }),
    /provider|identity.*conflict|role/i,
  )
})

