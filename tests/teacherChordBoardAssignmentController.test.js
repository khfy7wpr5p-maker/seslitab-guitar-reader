import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getChordBoardVoicings,
  listChordBoardSymbols,
} from '../src/services/chordBoardCatalog.js'

let controllerApi = null
try {
  controllerApi = await import(
    '../src/services/teacherChordBoardAssignmentController.js'
  )
} catch {}

function requireApi() {
  assert.ok(
    controllerApi,
    'TD-07 teacher chord assignment controller module must exist',
  )
  return controllerApi
}

function assignment(studentId, index = 0) {
  const snapshot = getChordBoardVoicings('Am')[0]
  return Object.freeze({
    schemaVersion: 1,
    assignmentId: `assignment-${studentId}-${index}`,
    studentId,
    practiceType: 'CHORD_BOARD',
    teacherNote: '',
    state: 'ACTIVE',
    assignedAt: '2026-09-23T13:00:00Z',
    revokedAt: null,
    sourceRef: Object.freeze({
      studentId,
      snapshot,
      voicingFingerprint: snapshot.voicingFingerprint,
    }),
  })
}

function harness({
  prepareError = null,
  deliveryError = null,
  preparedAck = null,
  deliveryAck = null,
} = {}) {
  const calls = {
    assignment: [],
    prepare: [],
    deliver: [],
    package: [],
  }
  const assignments = Object.freeze([
    assignment('student-a', 0),
  ])

  const controller =
    requireApi().createTeacherChordBoardAssignmentController({
      catalog: {
        listSymbols: () => listChordBoardSymbols(),
        getVoicings: (symbol) =>
          getChordBoardVoicings(symbol),
      },
      rosterService: {
        listStudents({ includeInactive }) {
          assert.equal(includeInactive, false)
          return Object.freeze([
            Object.freeze({
              studentId: 'student-a',
              displayNameOrNickname: 'Ada',
              active: true,
            }),
          ])
        },
      },
      assignmentService: {
        prepareChordBoardAssignments(input) {
          calls.assignment.push(input)
          if (prepareError) throw prepareError
          return assignments
        },
      },
      createChordPackage({ assignment: row }) {
        calls.package.push(row.assignmentId)
        return Object.freeze({
          packageType: 'CHORD_BOARD',
          packageId: row.assignmentId,
          publication: Object.freeze({
            scope: 'student_private',
            recipientStudentId: row.studentId,
          }),
        })
      },
      secureDeliveryClient: {
        async prepareAssignments(items) {
          calls.prepare.push(items)
          if (preparedAck instanceof Error) {
            throw preparedAck
          }
          return (
            preparedAck ??
            Object.freeze(
              assignments.map((row) =>
                Object.freeze({
                  assignment: row,
                  packageId: row.assignmentId,
                }),
              ),
            )
          )
        },
        async deliverAssignments(ids) {
          calls.deliver.push(ids)
          if (deliveryError) throw deliveryError
          return (
            deliveryAck ??
            Object.freeze(
              assignments.map((row) =>
                Object.freeze({
                  deliveryId: row.assignmentId,
                  assignmentId: row.assignmentId,
                  packageId: row.assignmentId,
                  studentId: row.studentId,
                  revokedAt: null,
                }),
              ),
            )
          )
        },
      },
    })

  return { controller, calls, assignments }
}

test('TD-07 controller exposes active roster and pinned chord catalog', () => {
  const { controller } = harness()
  const initial = controller.getViewModel()

  assert.equal(Object.isFrozen(initial), true)
  assert.equal(initial.students.length, 1)
  assert.equal(initial.students[0].studentId, 'student-a')
  assert.equal(initial.symbols.length, 180)

  const selected = controller.selectChord('Am')
  assert.equal(selected.selectedSymbol, 'Am')
  assert.equal(selected.voicings.length >= 1, true)
  assert.deepEqual(
    selected.voicings[0].voicing.frets,
    [-1, 0, 2, 2, 1, 0],
  )
})

test('TD-07 controller reports delivered only after exact prepare and delivery acknowledgements', async () => {
  const { controller, calls, assignments } = harness()
  controller.selectChord('Am')

  const result = await controller.assignAndDeliver({
    snapshot: getChordBoardVoicings('Am')[0],
    studentIds: ['student-a'],
    commonTeacherNote: '',
    teacherNoteOverrides: [],
  })

  assert.equal(result.ok, true)
  assert.equal(
    result.phase,
    requireApi().TEACHER_CHORD_DELIVERY_PHASE
      .DELIVERED_TO_STUDENT,
  )
  assert.equal(
    result.message,
    '1 akor ödevi gönderildi.',
  )
  assert.equal(result.assignments, assignments)
  assert.deepEqual(calls.package, [
    'assignment-student-a-0',
  ])
  assert.equal(calls.prepare.length, 1)
  assert.deepEqual(calls.deliver, [[
    'assignment-student-a-0',
  ]])
})

test('TD-07 controller distinguishes durable preparation from failed delivery', async () => {
  const { controller } = harness({
    deliveryError: new Error(
      'firebase provider secret diagnostic',
    ),
  })
  controller.selectChord('Am')

  const result = await controller.assignAndDeliver({
    snapshot: getChordBoardVoicings('Am')[0],
    studentIds: ['student-a'],
    commonTeacherNote: '',
    teacherNoteOverrides: [],
  })

  assert.equal(result.ok, false)
  assert.equal(
    result.phase,
    requireApi().TEACHER_CHORD_DELIVERY_PHASE
      .DURABLY_PREPARED,
  )
  assert.equal(
    result.message,
    '1 akor ödevi hazırlandı ancak gönderilemedi.',
  )
  assert.doesNotMatch(
    JSON.stringify(result),
    /secret|firebase|provider/i,
  )
})

test('TD-07 controller never reports delivery when secure preparation fails', async () => {
  const { controller } = harness({
    preparedAck: new Error(
      'authorization token=secret',
    ),
  })
  controller.selectChord('Am')

  const result = await controller.assignAndDeliver({
    snapshot: getChordBoardVoicings('Am')[0],
    studentIds: ['student-a'],
    commonTeacherNote: '',
    teacherNoteOverrides: [],
  })

  assert.equal(result.ok, false)
  assert.equal(
    result.phase,
    requireApi().TEACHER_CHORD_DELIVERY_PHASE
      .LOCAL_ASSIGNMENT_ONLY,
  )
  assert.equal(
    result.message,
    '1 akor ödevi oluşturuldu ancak güvenli teslimata hazırlanamadı.',
  )
  assert.doesNotMatch(
    result.message,
    /gönderildi/i,
  )
  assert.doesNotMatch(
    JSON.stringify(result),
    /secret|authorization/i,
  )
})

test('TD-07 controller rejects stale exact-voicing fingerprint before local assignment creation', async () => {
  const { controller, calls } = harness()
  controller.selectChord('Am')
  const stale = structuredClone(
    getChordBoardVoicings('Am')[0],
  )
  stale.voicing.frets =
    [-1, 0, 2, 2, 1, 3]
  stale.voicing.fingers =
    [-1, 0, 2, 3, 1, 4]

  const result = await controller.assignAndDeliver({
    snapshot: stale,
    studentIds: ['student-a'],
    commonTeacherNote: '',
    teacherNoteOverrides: [],
  })

  assert.equal(result.ok, false)
  assert.equal(
    result.phase,
    requireApi().TEACHER_CHORD_DELIVERY_PHASE
      .LOCAL_ASSIGNMENT_ONLY,
  )
  assert.equal(
    result.message,
    'Akor şeması doğrulanamadı.',
  )
  assert.deepEqual(calls.assignment, [])
  assert.deepEqual(calls.prepare, [])
  assert.deepEqual(calls.deliver, [])
})

test('TD-07 controller rejects substituted prepare acknowledgement before delivery', async () => {
  const { controller, calls } = harness({
    preparedAck: Object.freeze([
      Object.freeze({
        assignment: Object.freeze({
          assignmentId: 'assignment-other',
          studentId: 'student-a',
        }),
        packageId: 'assignment-other',
      }),
    ]),
  })
  controller.selectChord('Am')

  const result = await controller.assignAndDeliver({
    snapshot: getChordBoardVoicings('Am')[0],
    studentIds: ['student-a'],
    commonTeacherNote: '',
    teacherNoteOverrides: [],
  })

  assert.equal(result.ok, false)
  assert.equal(
    result.phase,
    requireApi().TEACHER_CHORD_DELIVERY_PHASE
      .LOCAL_ASSIGNMENT_ONLY,
  )
  assert.equal(calls.deliver.length, 0)
  assert.match(result.message, /hazırlanamadı/i)
})

test('TD-07 controller maps local roster/domain failures to bounded copy', async () => {
  const { controller } = harness({
    prepareError: new Error(
      'teacher-roster-student-inactive:student-secret',
    ),
  })
  controller.selectChord('Am')

  const result = await controller.assignAndDeliver({
    snapshot: getChordBoardVoicings('Am')[0],
    studentIds: ['student-a'],
    commonTeacherNote: '',
    teacherNoteOverrides: [],
  })

  assert.equal(result.ok, false)
  assert.equal(
    result.message,
    'Seçilen öğrencilerden biri aktif değil.',
  )
  assert.doesNotMatch(
    JSON.stringify(result),
    /student-secret/i,
  )
})
