import crypto from 'node:crypto'
import express from 'express'
import cors from 'cors'
import {
  deleteApp,
  initializeApp,
} from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

import {
  createSecureDeliveryAuthorization,
} from '../authorization/secureDeliveryAuthorization.js'
import {
  createSecureDeliveryRouter,
} from '../http/router.js'
import {
  createStudentDeliveryReadService,
} from '../services/studentDeliveryReadService.js'
import {
  createSecureDeliveryIdentityMapping,
} from '../../../src/services/secureDeliveryIdentity.js'
import {
  createDeliveryRecord,
} from '../../../src/services/deliveryRecord.js'
import {
  createPreparedAssignmentRecord,
} from '../../../src/services/preparedAssignmentRecord.js'
import {
  createStudentPrivatePracticePackageV1,
} from '../../../src/services/studentPracticePackageV1.js'
import {
  createPoolItem,
  POOL_AUDIENCE_MODE,
} from '../../../src/services/poolItem.js'
import {
  createActivePoolPublicationRecord,
} from '../../../src/services/poolPublicationRecord.js'
import {
  restorePrivateAssignmentV1,
} from '../../../src/services/teacherDeliveryWireCodec.js'
import {
  fingerprintPracticePackage,
} from '../integrity/packageFingerprint.js'

const CREATED_AT = '2026-09-23T12:00:00Z'
const ASSIGNED_AT = '2026-09-23T12:01:00Z'
const PREPARED_AT = '2026-09-23T12:02:00Z'
const DELIVERED_AT = '2026-09-23T12:03:00Z'
const TEACHER_ID = 'pilot-teacher'
const PILOT_PREFIX = /^[a-f0-9]{16}$/u

const PILOT_MUSIC_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<score-partwise version="4.0">' +
  '<part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>' +
  '<part id="P1"><measure number="1">' +
  '<attributes><divisions>1</divisions><key><fifths>0</fifths></key>' +
  '<time><beats>4</beats><beat-type>4</beat-type></time>' +
  '<clef><sign>G</sign><line>2</line></clef></attributes>' +
  '<note><pitch><step>C</step><octave>4</octave></pitch>' +
  '<duration>4</duration><type>whole</type></note>' +
  '</measure></part></score-partwise>'

function hashSubject(value) {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new TypeError(
      'pilot provider subject must be non-empty text.',
    )
  }

  return crypto
    .createHash('sha256')
    .update(value.trim(), 'utf8')
    .digest('hex')
    .slice(0, 16)
}

function studentIdForSubject(subject) {
  return 'pilot-student-' + hashSubject(subject)
}

function suffixFromId(value, prefix) {
  if (
    typeof value !== 'string' ||
    !value.startsWith(prefix)
  ) {
    return null
  }

  const suffix = value.slice(prefix.length)
  return PILOT_PREFIX.test(suffix)
    ? suffix
    : null
}

function fixtureForSuffix(suffix) {
  if (!PILOT_PREFIX.test(suffix)) {
    throw new TypeError(
      'pilot fixture suffix is invalid.',
    )
  }

  const studentId = 'pilot-student-' + suffix
  const assignmentId =
    'pilot-assignment-' + suffix
  const packageId =
    'pilot-package-' + suffix
  const revisionId =
    'pilot-revision-' + suffix

  const assignment =
    restorePrivateAssignmentV1({
      schemaVersion: 1,
      assignmentId,
      studentId,
      practiceType: 'SCORE',
      teacherNote:
        'Pilot çalışma: notayı açın, dinleyin ve çevrimdışı tekrar deneyin.',
      state: 'ACTIVE',
      assignedAt: ASSIGNED_AT,
      revokedAt: null,
      sourceRef: {
        schemaVersion: 1,
        sourceKind: 'score_exact_revision',
        studentId,
        sourceId:
          'pilot-source-' + suffix,
        sourceRevisionId:
          'pilot-root-' + suffix,
        revisionId,
        revisionKind: 'automatic',
        contentFingerprint:
          'pilot-content-' + suffix,
        lineageFingerprint:
          'pilot-lineage-' + suffix,
        approvalId:
          'pilot-approval-' + suffix,
        authorizationId:
          'pilot-authorization-' + suffix,
        qualityEvidenceId:
          'pilot-quality-' + suffix,
        revalidationEvidenceId: null,
        readinessRoute: 'package12',
        package12Status: 'PASS',
        boundAt: CREATED_AT,
      },
    })

  const pkg =
    createStudentPrivatePracticePackageV1({
      packageId,
      workId: 'pilot-work-' + suffix,
      title: 'S08-3 Pilot Etüt',
      revisionId,
      approvedAt: CREATED_AT,
      studentId,
      musicXml: PILOT_MUSIC_XML,
      canonicalEvents: [],
      practice: {
        tempoBpm: 60,
      },
    })

  const prepared =
    createPreparedAssignmentRecord({
      teacherId: TEACHER_ID,
      assignment,
      packageId,
      packageFingerprint:
        fingerprintPracticePackage(pkg),
      preparedAt: PREPARED_AT,
    })

  const delivery =
    createDeliveryRecord({
      assignmentId,
      packageId,
      teacherId: TEACHER_ID,
      studentId,
      deliveredAt: DELIVERED_AT,
    })

  return Object.freeze({
    studentId,
    assignment,
    pkg,
    prepared,
    delivery,
  })
}

function fixtureForStudentId(studentId) {
  const suffix = suffixFromId(
    studentId,
    'pilot-student-',
  )
  return suffix === null
    ? null
    : fixtureForSuffix(suffix)
}

function readOnlyFailure() {
  throw new Error('pilot-read-only')
}

export function createStudent08PilotStore() {
  return Object.freeze({
    async getIdentityMapping(
      providerSubject,
    ) {
      return createSecureDeliveryIdentityMapping({
        providerSubject,
        role: 'STUDENT',
        teacherId: null,
        studentId:
          studentIdForSubject(
            providerSubject,
          ),
        active: true,
        createdAt: CREATED_AT,
        disabledAt: null,
      })
    },

    async getTeacherStudentGrant() {
      return null
    },

    async getPreparedAssignment(
      assignmentId,
    ) {
      const suffix = suffixFromId(
        assignmentId,
        'pilot-assignment-',
      )
      return suffix === null
        ? null
        : fixtureForSuffix(suffix)
            .prepared
    },

    async getPracticePackage(packageId) {
      const suffix = suffixFromId(
        packageId,
        'pilot-package-',
      )
      return suffix === null
        ? null
        : fixtureForSuffix(suffix).pkg
    },

    async getLifecycle() {
      return null
    },

    async getDelivery(assignmentId) {
      const suffix = suffixFromId(
        assignmentId,
        'pilot-assignment-',
      )
      return suffix === null
        ? null
        : fixtureForSuffix(suffix)
            .delivery
    },

    async listDeliveriesForTeacher() {
      return Object.freeze([])
    },

    async listActiveDeliveriesForStudent(
      studentId,
    ) {
      const fixture =
        fixtureForStudentId(studentId)
      return Object.freeze(
        fixture === null
          ? []
          : [fixture.delivery],
      )
    },

    async listPoolPublicationsForStudent(
      studentId,
    ) {
      const fixture =
        fixtureForStudentId(studentId)
      if (fixture === null) {
        return Object.freeze([])
      }

      const all =
        createActivePoolPublicationRecord(
          createPoolItem({
            poolItemId:
              'pilot-pool-all',
            title:
              'S08-3 Pilot Havuz',
            shortDescription:
              'Genel pilot duyurusu',
            detailText:
              'Bu kayıt yalnız STUDENT-08 fiziksel kabul testi içindir.',
            publishedAt: CREATED_AT,
            audienceMode:
              POOL_AUDIENCE_MODE.ALL,
            recipientStudentIds: [],
          }),
        )

      const selected =
        createActivePoolPublicationRecord(
          createPoolItem({
            poolItemId:
              'pilot-pool-selected',
            title:
              'Size özel pilot çalışma',
            shortDescription:
              'SELECTED görünürlük testi',
            detailText:
              'Bu kart sunucu tarafındaki exact student eşleşmesiyle görünür.',
            publishedAt: CREATED_AT,
            audienceMode:
              POOL_AUDIENCE_MODE.SELECTED,
            recipientStudentIds: [
              fixture.studentId,
            ],
          }),
        )

      return Object.freeze([
        all,
        selected,
      ])
    },

    async commitPreparedBatch() {
      return readOnlyFailure()
    },

    async commitDeliveryBatch() {
      return readOnlyFailure()
    },

    async commitLifecycleMutation() {
      return readOnlyFailure()
    },

    async putRosterEntriesForProvisioning() {
      return readOnlyFailure()
    },

    async putPoolPublicationsForProvisioning() {
      return readOnlyFailure()
    },
  })
}

function pilotCorsOptions(allowedOrigin) {
  let origin
  try {
    const parsed = new URL(
      String(allowedOrigin ?? '').trim(),
    )
    if (
      parsed.protocol !== 'https:' ||
      parsed.origin === 'null' ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error('invalid')
    }
    origin = parsed.origin
  } catch {
    throw new TypeError(
      'pilot allowedOrigin must be one exact HTTPS origin.',
    )
  }

  return {
    origin(requestOrigin, callback) {
      callback(
        null,
        !requestOrigin ||
          requestOrigin === origin,
      )
    },
    credentials: false,
    methods: [
      'GET',
      'HEAD',
      'OPTIONS',
      'POST',
    ],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Accept',
    ],
    optionsSuccessStatus: 204,
    maxAge: 600,
  }
}

function readOnlyPreparedService() {
  return Object.freeze({
    async prepareBatch() {
      return readOnlyFailure()
    },
  })
}

function readOnlyTeacherService() {
  return Object.freeze({
    async deliverBatch() {
      return readOnlyFailure()
    },
    async listDeliveries() {
      return readOnlyFailure()
    },
    async applyAssignmentAction() {
      return readOnlyFailure()
    },
  })
}

export function createStudent08PilotApp({
  tokenVerifier,
  allowedOrigin,
} = {}) {
  if (
    !tokenVerifier ||
    typeof tokenVerifier.verifyIdToken !==
      'function'
  ) {
    throw new TypeError(
      'pilot tokenVerifier must provide verifyIdToken().',
    )
  }

  const store =
    createStudent08PilotStore()
  const authorization =
    createSecureDeliveryAuthorization({
      store,
    })
  const studentService =
    createStudentDeliveryReadService({
      authorization,
      store,
    })

  const app = express()
  app.disable('x-powered-by')
  app.use(
    cors(
      pilotCorsOptions(
        allowedOrigin,
      ),
    ),
  )
  app.use(express.json({
    limit: '16kb',
  }))

  app.get('/health', (_req, res) => {
    res.status(200).json({
      success: true,
      data: {
        status: 'ok',
        mode: 'student08-pilot',
        studentReadsEnabled: true,
        writesEnabled: false,
      },
    })
  })

  app.use(
    '/api/secure-delivery/v1',
    createSecureDeliveryRouter({
      tokenVerifier,
      preparedService:
        readOnlyPreparedService(),
      teacherService:
        readOnlyTeacherService(),
      studentService,
      config: Object.freeze({
        enabled: true,
        writesEnabled: false,
        studentReadsEnabled: true,
      }),
    }),
  )

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint bulunamadı.',
      },
    })
  })

  return app
}

export function createPilotFirebaseTokenVerifier({
  projectId,
  appName =
    'student08-s08-3-pilot',
} = {}) {
  if (
    typeof projectId !== 'string' ||
    projectId.trim().length === 0
  ) {
    throw new TypeError(
      'pilot Firebase projectId is required.',
    )
  }

  const app = initializeApp(
    {
      projectId: projectId.trim(),
    },
    appName,
  )
  const auth = getAuth(app)

  return Object.freeze({
    async verifyIdToken(token) {
      if (
        typeof token !== 'string' ||
        token.length === 0
      ) {
        throw new TypeError(
          'Firebase ID token must be non-empty text.',
        )
      }

      // Pilot only: no Admin credential is provisioned.
      // Signature/audience/expiry verification remains real,
      // while revocation lookup is deliberately disabled.
      const decoded =
        await auth.verifyIdToken(
          token,
          false,
        )

      if (
        !decoded ||
        typeof decoded.uid !== 'string' ||
        decoded.uid.trim().length === 0
      ) {
        throw new Error(
          'firebase-token-uid-missing',
        )
      }

      return Object.freeze({
        uid: decoded.uid.trim(),
      })
    },

    async close() {
      await deleteApp(app)
    },
  })
}
