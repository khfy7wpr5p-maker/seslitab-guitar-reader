import assert from 'node:assert/strict'
import test from 'node:test'

import { getChordBoardVoicings } from '../src/services/chordBoardCatalog.js'
import { createChordBoardAssignmentSourceBinding } from '../src/services/chordBoardAssignmentSourceBinding.js'
import { createStudentPrivateChordBoardPackageV1 } from '../src/services/studentChordBoardPackageV1.js'
import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  createPrivateAssignment,
} from '../src/services/privateAssignment.js'
import { createSecureDeliveryIdentityMapping } from '../src/services/secureDeliveryIdentity.js'
import { createTeacherStudentGrant } from '../src/services/teacherStudentGrant.js'
import { createSecureDeliveryAuthorization } from '../backend/delivery/authorization/secureDeliveryAuthorization.js'
import { createInMemorySecureDeliveryStore } from '../backend/delivery/repositories/inMemorySecureDeliveryStore.js'
import { createPreparedAssignmentService } from '../backend/delivery/services/preparedAssignmentService.js'
import { createTeacherSecureDeliveryService } from '../backend/delivery/services/teacherDeliveryService.js'
import { createStudentDeliveryReadService } from '../backend/delivery/services/studentDeliveryReadService.js'

function mapping({
  providerSubject,
  role,
  teacherId = null,
  studentId = null,
}) {
  return createSecureDeliveryIdentityMapping({
    providerSubject,
    role,
    teacherId,
    studentId,
    active: true,
    createdAt: '2026-09-23T13:00:00Z',
    disabledAt: null,
  })
}

function chordAssignment({
  assignmentId = 'assignment-chord-a',
  studentId = 'student-a',
} = {}) {
  const assignedAt = '2026-09-23T13:01:00Z'
  const snapshot = getChordBoardVoicings('Am')[0]
  return createPrivateAssignment({
    assignmentId,
    studentId,
    practiceType: PRIVATE_ASSIGNMENT_PRACTICE_TYPE.CHORD_BOARD,
    teacherNote: '60 BPM ile çalış.',
    assignedAt,
    sourceRef: createChordBoardAssignmentSourceBinding({
      studentId,
      snapshot,
      boundAt: assignedAt,
    }),
  })
}

function chordItem(options = {}) {
  const assignment = chordAssignment(options)
  const pkg = createStudentPrivateChordBoardPackageV1({
    assignment,
    practice: { repeatCount: 4 },
  })
  return {
    assignment: structuredClone(assignment),
    package: structuredClone(pkg),
  }
}

function harness() {
  const store = createInMemorySecureDeliveryStore({
    identityMappings: [
      mapping({
        providerSubject: 'uid-teacher',
        role: 'TEACHER',
        teacherId: 'teacher-a',
      }),
      mapping({
        providerSubject: 'uid-student-a',
        role: 'STUDENT',
        studentId: 'student-a',
      }),
      mapping({
        providerSubject: 'uid-student-b',
        role: 'STUDENT',
        studentId: 'student-b',
      }),
    ],
    grants: [
      createTeacherStudentGrant({
        teacherId: 'teacher-a',
        studentId: 'student-a',
        active: true,
        createdAt: '2026-09-23T13:00:00Z',
        revokedAt: null,
      }),
    ],
  })
  const authorization = createSecureDeliveryAuthorization({ store })
  return { store, authorization }
}

test('TD-07 CHORD_BOARD prepares delivers and reads exact package without SCORE fields', async () => {
  const h = harness()
  const preparedService = createPreparedAssignmentService({
    authorization: h.authorization,
    store: h.store,
    now: () => '2026-09-23T13:02:00Z',
  })
  const teacher = createTeacherSecureDeliveryService({
    authorization: h.authorization,
    store: h.store,
    now: () => '2026-09-23T13:03:00Z',
    createHistoryEventId: () => 'history-chord-a',
  })
  const student = createStudentDeliveryReadService({
    authorization: h.authorization,
    store: h.store,
  })
  const item = chordItem()

  const prepared = await preparedService.prepareBatch({
    providerSubject: 'uid-teacher',
    items: [item],
  })
  assert.equal(prepared.length, 1)
  assert.equal(prepared[0].assignment.practiceType, 'CHORD_BOARD')
  assert.equal(
    prepared[0].assignment.sourceRef.voicingFingerprint,
    item.assignment.sourceRef.voicingFingerprint,
  )

  const delivered = await teacher.deliverBatch({
    providerSubject: 'uid-teacher',
    assignmentIds: ['assignment-chord-a'],
  })
  assert.equal(delivered[0].deliveryId, 'assignment-chord-a')

  const visible = await student.getAssignment({
    providerSubject: 'uid-student-a',
    deliveryId: 'assignment-chord-a',
  })
  assert.equal(visible.package.packageType, 'CHORD_BOARD')
  assert.deepEqual(
    visible.package.content.chordBoard.voicing.frets,
    item.package.content.chordBoard.voicing.frets,
  )
  assert.equal('approvedRevision' in visible.package, false)
})

test('TD-07 backend rejects tampered exact chord snapshot with stale fingerprint before durable write', async () => {
  const h = harness()
  const service = createPreparedAssignmentService({
    authorization: h.authorization,
    store: h.store,
    now: () => '2026-09-23T13:02:00Z',
  })
  const bad = chordItem()
  bad.assignment.sourceRef.snapshot.voicing.frets =
    [-1, 0, 2, 2, 1, 3]
  bad.assignment.sourceRef.snapshot.voicing.fingers =
    [-1, 0, 2, 3, 1, 4]
  bad.package.content.chordBoard.voicing.frets =
    [-1, 0, 2, 2, 1, 3]
  bad.package.content.chordBoard.voicing.fingers =
    [-1, 0, 2, 3, 1, 4]

  await assert.rejects(
    () => service.prepareBatch({
      providerSubject: 'uid-teacher',
      items: [bad],
    }),
    /fingerprint|voicing|mismatch/i,
  )
  assert.equal(
    await h.store.getPreparedAssignment('assignment-chord-a'),
    null,
  )
})

test('TD-07 CHORD_BOARD student read preserves IDOR isolation', async () => {
  const h = harness()
  const preparedService = createPreparedAssignmentService({
    authorization: h.authorization,
    store: h.store,
    now: () => '2026-09-23T13:02:00Z',
  })
  const teacher = createTeacherSecureDeliveryService({
    authorization: h.authorization,
    store: h.store,
    now: () => '2026-09-23T13:03:00Z',
    createHistoryEventId: () => 'history-chord-a',
  })
  const student = createStudentDeliveryReadService({
    authorization: h.authorization,
    store: h.store,
  })

  await preparedService.prepareBatch({
    providerSubject: 'uid-teacher',
    items: [chordItem()],
  })
  await teacher.deliverBatch({
    providerSubject: 'uid-teacher',
    assignmentIds: ['assignment-chord-a'],
  })

  await assert.rejects(
    () => student.getAssignment({
      providerSubject: 'uid-student-b',
      deliveryId: 'assignment-chord-a',
    }),
    (error) => {
      assert.match(error.message, /not-found|forbidden/i)
      assert.doesNotMatch(error.message, /student-a|teacher-a/i)
      return true
    },
  )
})
