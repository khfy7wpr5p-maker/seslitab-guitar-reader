import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createStudentPrivatePracticePackageV1,
} from '../src/services/studentPracticePackageV1.js'
import { getChordBoardVoicings } from '../src/services/chordBoardCatalog.js'
import { createChordBoardAssignmentSourceBinding } from '../src/services/chordBoardAssignmentSourceBinding.js'
import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  createPrivateAssignment,
} from '../src/services/privateAssignment.js'

let chordPackageApi = null
let unionApi = null
let fingerprintApi = null
try {
  chordPackageApi = await import(
    '../src/services/studentChordBoardPackageV1.js'
  )
} catch {}
try {
  unionApi = await import(
    '../src/services/secureDeliveryPackage.js'
  )
} catch {}
try {
  fingerprintApi = await import(
    '../backend/delivery/integrity/packageFingerprint.js'
  )
} catch {}

function requireApis() {
  assert.ok(
    chordPackageApi,
    'TD-07 chord package module must exist',
  )
  assert.ok(
    unionApi,
    'TD-07 secure delivery package union module must exist',
  )
  assert.ok(
    fingerprintApi,
    'TD-07 package fingerprint module must exist',
  )
  return {
    ...chordPackageApi,
    ...unionApi,
    ...fingerprintApi,
  }
}

function chordAssignment() {
  const studentId = 'student-a'
  const assignedAt = '2026-09-23T13:00:00Z'
  const snapshot =
    getChordBoardVoicings('Am')[0]
  return createPrivateAssignment({
    assignmentId: 'assignment-chord-a',
    studentId,
    practiceType:
      PRIVATE_ASSIGNMENT_PRACTICE_TYPE.CHORD_BOARD,
    teacherNote: 'Akoru temiz çalış.',
    assignedAt,
    sourceRef:
      createChordBoardAssignmentSourceBinding({
        studentId,
        snapshot,
        boundAt: assignedAt,
      }),
  })
}

function scoreAssignment() {
  return createPrivateAssignment({
    assignmentId: 'assignment-score-a',
    studentId: 'student-a',
    practiceType:
      PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE,
    teacherNote: '',
    assignedAt: '2026-09-23T13:00:00Z',
    sourceRef: Object.freeze({
      schemaVersion: 1,
      sourceKind: 'score_exact_revision',
      studentId: 'student-a',
      sourceId: 'score-a',
      sourceRevisionId: 'source-r1',
      revisionId: 'revision-a',
      revisionKind: 'automatic',
      contentFingerprint: 'content-a',
      lineageFingerprint: 'lineage-a',
      approvalId: 'approval-a',
      authorizationId: 'auth-a',
      qualityEvidenceId: 'quality-a',
      revalidationEvidenceId: null,
      readinessRoute: 'package12_t2',
      package12Status: 'eligible_exact_revision',
      boundAt: '2026-09-23T13:00:00Z',
    }),
  })
}

function scorePackage() {
  return createStudentPrivatePracticePackageV1({
    packageId: 'assignment-score-a',
    workId: 'score-a',
    title: 'Etüt',
    revisionId: 'revision-a',
    approvedAt: '2026-09-23T13:00:00Z',
    studentId: 'student-a',
    musicXml:
      '<score-partwise version="4.0"></score-partwise>',
    canonicalEvents: [],
    practice: {},
  })
}

test('TD-07 secure package union preserves SCORE and accepts CHORD_BOARD without ambiguity', () => {
  const {
    createStudentPrivateChordBoardPackageV1,
    restoreSecureDeliveryPackage,
    secureDeliveryPackageKind,
    SECURE_DELIVERY_PACKAGE_KIND,
  } = requireApis()

  const score =
    restoreSecureDeliveryPackage(
      structuredClone(scorePackage()),
    )
  const chord =
    restoreSecureDeliveryPackage(
      structuredClone(
        createStudentPrivateChordBoardPackageV1({
          assignment: chordAssignment(),
          practice: {},
        }),
      ),
    )

  assert.equal(
    secureDeliveryPackageKind(score),
    SECURE_DELIVERY_PACKAGE_KIND.SCORE,
  )
  assert.equal(
    secureDeliveryPackageKind(chord),
    SECURE_DELIVERY_PACKAGE_KIND.CHORD_BOARD,
  )
  assert.equal(Object.isFrozen(score), true)
  assert.equal(Object.isFrozen(chord), true)
})

test('TD-07 package union matches exact assignment authority per variant', () => {
  const {
    createStudentPrivateChordBoardPackageV1,
    assertSecureDeliveryPackageMatchesAssignment,
  } = requireApis()

  const scoreA = scoreAssignment()
  const scorePkg = scorePackage()
  assert.equal(
    assertSecureDeliveryPackageMatchesAssignment(
      scorePkg,
      scoreA,
    ),
    scorePkg,
  )

  const chordA = chordAssignment()
  const chordPkg =
    createStudentPrivateChordBoardPackageV1({
      assignment: chordA,
      practice: {},
    })
  assert.equal(
    assertSecureDeliveryPackageMatchesAssignment(
      chordPkg,
      chordA,
    ),
    chordPkg,
  )

  const wrongRecipient =
    structuredClone(chordPkg)
  wrongRecipient.publication.recipientStudentId =
    'student-other'
  assert.throws(
    () =>
      assertSecureDeliveryPackageMatchesAssignment(
        wrongRecipient,
        chordA,
      ),
    /recipient|student|mismatch/i,
  )
})

test('TD-07 secure package union rejects mixed SCORE and CHORD_BOARD fields', () => {
  const {
    restoreSecureDeliveryPackage,
    createStudentPrivateChordBoardPackageV1,
  } = requireApis()

  const mixedScore = {
    ...structuredClone(scorePackage()),
    packageType: 'CHORD_BOARD',
  }
  assert.throws(
    () => restoreSecureDeliveryPackage(mixedScore),
    /invalid|unsupported|CHORD_BOARD/i,
  )

  const mixedChord = {
    ...structuredClone(
      createStudentPrivateChordBoardPackageV1({
        assignment: chordAssignment(),
        practice: {},
      }),
    ),
    approvedRevision: {
      revisionId: 'revision-a',
      state: 'teacher_approved',
      approvedAt: '2026-09-23T13:00:00Z',
    },
  }
  assert.throws(
    () => restoreSecureDeliveryPackage(mixedChord),
    /invalid|unsupported|CHORD_BOARD/i,
  )
})

test('TD-07 generic package fingerprint covers SCORE and CHORD_BOARD while SCORE fingerprint stays compatible', () => {
  const {
    createStudentPrivateChordBoardPackageV1,
    fingerprintSecureDeliveryPackage,
    fingerprintPracticePackage,
  } = requireApis()

  const score = scorePackage()
  assert.equal(
    fingerprintSecureDeliveryPackage(score),
    fingerprintPracticePackage(score),
  )

  const chord =
    createStudentPrivateChordBoardPackageV1({
      assignment: chordAssignment(),
      practice: {},
    })
  assert.match(
    fingerprintSecureDeliveryPackage(chord),
    /^[a-f0-9]{64}$/u,
  )

  const changed = structuredClone(chord)
  changed.practice.repeatCount = 4
  assert.notEqual(
    fingerprintSecureDeliveryPackage(chord),
    fingerprintSecureDeliveryPackage(changed),
  )
})
