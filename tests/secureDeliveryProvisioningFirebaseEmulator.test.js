import assert from 'node:assert/strict'
import test, {
  after,
  before,
} from 'node:test'

import {
  createSecureDeliveryIdentityMapping,
} from '../src/services/secureDeliveryIdentity.js'
import {
  SECURE_DELIVERY_PROVISIONING_ACTION,
  createSecureDeliveryProvisioningCommand,
} from '../src/services/secureDeliveryProvisioning.js'
import {
  createSecureDeliveryAuthorization,
} from '../backend/delivery/authorization/secureDeliveryAuthorization.js'
import {
  createSecureDeliveryProvisioningService,
} from '../backend/delivery/provisioning/secureDeliveryProvisioningService.js'

const PROJECT_ID =
  'demo-seslitab-td06'
const EMULATOR_AVAILABLE =
  Boolean(
    process.env
      .FIRESTORE_EMULATOR_HOST &&
    process.env
      .FIREBASE_AUTH_EMULATOR_HOST,
  )

let admin
let db
let runtimeStore
let provisioningStore

function id(value) {
  return Buffer.from(
    value,
    'utf8',
  ).toString('base64url')
}

function plain(value) {
  return JSON.parse(
    JSON.stringify(value),
  )
}

function command(input) {
  return createSecureDeliveryProvisioningCommand({
    operatorId:
      'operator-ses14-emulator',
    reason:
      'SES-14 emulator acceptance',
    timestamp:
      '2026-09-25T10:00:00Z',
    ...input,
  })
}

before(async () => {
  if (!EMULATOR_AVAILABLE) {
    return
  }

  const {
    createFirebaseAdminServices,
  } = await import(
    '../backend/delivery/firebase/firebaseAdmin.js'
  )
  const runtimeModule =
    await import(
      '../backend/delivery/firebase/firestoreSecureDeliveryStore.js'
    )
  const provisioningModule =
    await import(
      '../backend/delivery/provisioning/firestoreSecureDeliveryProvisioningStore.js'
    )

  admin =
    createFirebaseAdminServices({
      emulator: true,
      projectId:
        PROJECT_ID,
      appName:
        'ses14-provisioning-emulator-tests',
    })
  db = admin.firestore
  runtimeStore =
    runtimeModule
      .createFirestoreSecureDeliveryStore({
        firestore: db,
      })
  provisioningStore =
    provisioningModule
      .createFirestoreSecureDeliveryProvisioningStore({
        firestore: db,
      })
})

after(async () => {
  await admin?.delete()
})

test(
  'SES-14 Firestore dry-run writes nothing and apply creates identities plus grant atomically',
  {
    skip:
      !EMULATOR_AVAILABLE,
  },
  async () => {
    const teacher =
      command({
        operationId:
          'ses14-emu-teacher',
        action:
          SECURE_DELIVERY_PROVISIONING_ACTION.CREATE_IDENTITY,
        providerSubject:
          'uid-ses14-teacher',
        role: 'TEACHER',
        teacherId:
          'teacher-ses14',
        studentId: null,
      })
    const student =
      command({
        operationId:
          'ses14-emu-student',
        action:
          SECURE_DELIVERY_PROVISIONING_ACTION.CREATE_IDENTITY,
        providerSubject:
          'uid-ses14-student',
        role: 'STUDENT',
        teacherId: null,
        studentId:
          'student-ses14',
      })
    const grant =
      command({
        operationId:
          'ses14-emu-grant',
        action:
          SECURE_DELIVERY_PROVISIONING_ACTION.CREATE_GRANT,
        teacherId:
          'teacher-ses14',
        studentId:
          'student-ses14',
      })

    const service =
      createSecureDeliveryProvisioningService({
        store:
          provisioningStore,
        applyEnabled: true,
      })

    const dry =
      await service.execute({
        commands: [
          teacher,
          student,
          grant,
        ],
      })

    assert.equal(
      dry.mode,
      'DRY_RUN',
    )
    assert.equal(
      await runtimeStore
        .getIdentityMapping(
          'uid-ses14-student',
        ),
      null,
    )
    assert.equal(
      await provisioningStore
        .getProvisioningAudit(
          'ses14-emu-grant',
        ),
      null,
    )

    const applied =
      await service.execute({
        apply: true,
        commands: [
          teacher,
          student,
          grant,
        ],
      })

    assert.equal(
      applied.mode,
      'APPLIED',
    )
    assert.deepEqual(
      applied.operations.map(
        (item) => item.result,
      ),
      [
        'APPLIED',
        'APPLIED',
        'APPLIED',
      ],
    )

    const authorization =
      createSecureDeliveryAuthorization({
        store:
          runtimeStore,
      })

    assert.equal(
      (
        await authorization
          .resolvePrincipal(
            'uid-ses14-teacher',
            'TEACHER',
          )
      ).teacherId,
      'teacher-ses14',
    )
    assert.equal(
      (
        await authorization
          .resolvePrincipal(
            'uid-ses14-student',
            'STUDENT',
          )
      ).studentId,
      'student-ses14',
    )
    assert.equal(
      (
        await authorization
          .requireTeacherStudent(
            'teacher-ses14',
            'student-ses14',
          )
      ).active,
      true,
    )

    assert.equal(
      (
        await db.collection(
          'identityDomainBindings',
        ).get()
      ).docs.filter(
        (item) =>
          item.data()
            .providerSubject
            .startsWith(
              'uid-ses14-',
            ),
      ).length,
      2,
    )
  },
)

test(
  'SES-14 Firestore exact operation replay is idempotent and audit is append-only',
  {
    skip:
      !EMULATOR_AVAILABLE,
  },
  async () => {
    const service =
      createSecureDeliveryProvisioningService({
        store:
          provisioningStore,
        applyEnabled: true,
      })
    const replay =
      command({
        operationId:
          'ses14-emu-replay',
        action:
          SECURE_DELIVERY_PROVISIONING_ACTION.CREATE_IDENTITY,
        providerSubject:
          'uid-ses14-replay',
        role: 'STUDENT',
        teacherId: null,
        studentId:
          'student-ses14-replay',
      })

    await service.execute({
      apply: true,
      commands: [replay],
    })
    const second =
      await service.execute({
        apply: true,
        commands: [replay],
      })

    assert.equal(
      second.operations[0].result,
      'IDEMPOTENT_REPLAY',
    )

    const snap =
      await db.collection(
        'secureDeliveryProvisioningAudit',
      )
        .doc(
          id(
            replay.operationId,
          ),
        )
        .get()

    assert.equal(
      snap.exists,
      true,
    )
    assert.equal(
      snap.data().operationId,
      replay.operationId,
    )
  },
)

test(
  'SES-14 Firestore revoke and regrant change existing authorization state explicitly',
  {
    skip:
      !EMULATOR_AVAILABLE,
  },
  async () => {
    const teacherId =
      'teacher-ses14-life'
    const studentId =
      'student-ses14-life'
    const service =
      createSecureDeliveryProvisioningService({
        store:
          provisioningStore,
        applyEnabled: true,
      })

    await service.execute({
      apply: true,
      commands: [
        command({
          operationId:
            'ses14-life-teacher',
          action:
            SECURE_DELIVERY_PROVISIONING_ACTION.CREATE_IDENTITY,
          providerSubject:
            'uid-ses14-life-teacher',
          role: 'TEACHER',
          teacherId,
          studentId: null,
        }),
        command({
          operationId:
            'ses14-life-student',
          action:
            SECURE_DELIVERY_PROVISIONING_ACTION.CREATE_IDENTITY,
          providerSubject:
            'uid-ses14-life-student',
          role: 'STUDENT',
          teacherId: null,
          studentId,
        }),
        command({
          operationId:
            'ses14-life-grant',
          action:
            SECURE_DELIVERY_PROVISIONING_ACTION.CREATE_GRANT,
          teacherId,
          studentId,
        }),
      ],
    })

    const authorization =
      createSecureDeliveryAuthorization({
        store:
          runtimeStore,
      })

    await authorization
      .requireTeacherStudent(
        teacherId,
        studentId,
      )

    await service.execute({
      apply: true,
      commands: [
        command({
          operationId:
            'ses14-life-revoke',
          action:
            SECURE_DELIVERY_PROVISIONING_ACTION.REVOKE_GRANT,
          teacherId,
          studentId,
          timestamp:
            '2026-09-25T10:10:00Z',
        }),
      ],
    })

    await assert.rejects(
      () =>
        authorization
          .requireTeacherStudent(
            teacherId,
            studentId,
          ),
      /grant|inactive/i,
    )

    await service.execute({
      apply: true,
      commands: [
        command({
          operationId:
            'ses14-life-regrant',
          action:
            SECURE_DELIVERY_PROVISIONING_ACTION.REGRANT,
          teacherId,
          studentId,
          timestamp:
            '2026-09-25T10:20:00Z',
        }),
      ],
    })

    assert.equal(
      (
        await authorization
          .requireTeacherStudent(
            teacherId,
            studentId,
          )
      ).active,
      true,
    )
  },
)

test(
  'SES-14 Firestore disable keeps mapping but principal resolution fails',
  {
    skip:
      !EMULATOR_AVAILABLE,
  },
  async () => {
    const service =
      createSecureDeliveryProvisioningService({
        store:
          provisioningStore,
        applyEnabled: true,
      })

    await service.execute({
      apply: true,
      commands: [
        command({
          operationId:
            'ses14-disable-create',
          action:
            SECURE_DELIVERY_PROVISIONING_ACTION.CREATE_IDENTITY,
          providerSubject:
            'uid-ses14-disable',
          role: 'STUDENT',
          teacherId: null,
          studentId:
            'student-ses14-disable',
        }),
        command({
          operationId:
            'ses14-disable-apply',
          action:
            SECURE_DELIVERY_PROVISIONING_ACTION.DISABLE_IDENTITY,
          providerSubject:
            'uid-ses14-disable',
          timestamp:
            '2026-09-25T10:30:00Z',
        }),
      ],
    })

    const mapping =
      await runtimeStore
        .getIdentityMapping(
          'uid-ses14-disable',
        )
    assert.equal(
      mapping.active,
      false,
    )

    const authorization =
      createSecureDeliveryAuthorization({
        store:
          runtimeStore,
      })
    await assert.rejects(
      () =>
        authorization
          .resolvePrincipal(
            'uid-ses14-disable',
            'STUDENT',
          ),
      /disabled|inactive/i,
    )
  },
)

test(
  'SES-14 Firestore batch conflict commits zero identities and zero audit events',
  {
    skip:
      !EMULATOR_AVAILABLE,
  },
  async () => {
    const service =
      createSecureDeliveryProvisioningService({
        store:
          provisioningStore,
        applyEnabled: true,
      })

    await assert.rejects(
      () =>
        service.execute({
          apply: true,
          commands: [
            command({
              operationId:
                'ses14-zero-a',
              action:
                SECURE_DELIVERY_PROVISIONING_ACTION.CREATE_IDENTITY,
              providerSubject:
                'uid-ses14-zero-a',
              role:
                'STUDENT',
              teacherId:
                null,
              studentId:
                'student-ses14-zero',
            }),
            command({
              operationId:
                'ses14-zero-b',
              action:
                SECURE_DELIVERY_PROVISIONING_ACTION.CREATE_IDENTITY,
              providerSubject:
                'uid-ses14-zero-b',
              role:
                'STUDENT',
              teacherId:
                null,
              studentId:
                'student-ses14-zero',
            }),
          ],
        }),
      /domain|binding|conflict/i,
    )

    for (const subject of [
      'uid-ses14-zero-a',
      'uid-ses14-zero-b',
    ]) {
      assert.equal(
        await runtimeStore
          .getIdentityMapping(
            subject,
          ),
        null,
      )
    }

    for (const operationId of [
      'ses14-zero-a',
      'ses14-zero-b',
    ]) {
      assert.equal(
        await provisioningStore
          .getProvisioningAudit(
            operationId,
          ),
        null,
      )
    }
  },
)

test(
  'SES-14 Firestore detects a legacy stable-identity collision even before reverse binding exists',
  {
    skip:
      !EMULATOR_AVAILABLE,
  },
  async () => {
    const legacy =
      createSecureDeliveryIdentityMapping({
        providerSubject:
          'uid-ses14-legacy-a',
        role: 'STUDENT',
        teacherId: null,
        studentId:
          'student-ses14-legacy',
        active: true,
        createdAt:
          '2026-09-25T09:00:00Z',
        disabledAt: null,
      })

    await db.collection(
      'identityMappings',
    )
      .doc(
        id(
          legacy.providerSubject,
        ),
      )
      .set(
        plain(legacy),
      )

    const service =
      createSecureDeliveryProvisioningService({
        store:
          provisioningStore,
        applyEnabled: true,
      })

    await assert.rejects(
      () =>
        service.execute({
          apply: true,
          commands: [
            command({
              operationId:
                'ses14-legacy-conflict',
              action:
                SECURE_DELIVERY_PROVISIONING_ACTION.CREATE_IDENTITY,
              providerSubject:
                'uid-ses14-legacy-b',
              role:
                'STUDENT',
              teacherId:
                null,
              studentId:
                'student-ses14-legacy',
            }),
          ],
        }),
      /domain|binding|conflict/i,
    )

    assert.equal(
      await runtimeStore
        .getIdentityMapping(
          'uid-ses14-legacy-b',
        ),
      null,
    )
  },
)
