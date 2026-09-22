import assert from 'node:assert/strict'
import test from 'node:test'

import '../scripts/runOmrQualityReport.js'

import {
  CANONICAL_NOTE_SCHEMA_VERSION,
  CANONICAL_VERIFICATION_STATUS,
} from '../noteTheory.js'
import {
  prepareMusicXmlQualityGate,
} from '../src/services/appQualityGate.js'
import {
  approveTeacherWorkspace,
  createTeacherWorkspace,
} from '../src/services/teacherWorkspaceModel.js'
import {
  createStudentRosterEntry,
} from '../src/services/studentRosterEntry.js'
import {
  createInMemoryTeacherRosterRepository,
} from '../src/services/teacherRosterRepository.js'
import {
  createTeacherRosterService,
} from '../src/services/teacherRosterService.js'
import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  createPrivateAssignment,
} from '../src/services/privateAssignment.js'
import {
  createInMemoryTeacherScoreAssignmentRepository,
} from '../src/services/teacherScoreAssignmentRepository.js'
import {
  createTeacherScoreAssignmentService,
} from '../src/services/teacherScoreAssignmentService.js'

const VALID_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`

function verificationState() {
  return {
    schemaVersion: CANONICAL_NOTE_SCHEMA_VERSION,
    status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
    pitch: {
      valid: true,
      status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
    },
    time: {
      valid: true,
      status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
    },
  }
}

function verifiedNotes() {
  return ['Do', 'Re', 'Mi', 'Fa'].map(
    (noteName, index) => ({
      partId: 'P1',
      measureNumber: 1,
      measureKey: 'P1:0',
      measureIndex: 0,
      voice: 1,
      staff: 1,
      startBeat: index,
      beats: 1,
      noteName,
      sourceVerificationState:
        verificationState(),
    }),
  )
}

function approvedWorkspace(
  notes,
  {
    revisionId = 'auto-1',
    historyId = 'history-1',
    approvalId = 'approval-1',
    createdAt = '2026-09-22T20:00:00Z',
  } = {},
) {
  prepareMusicXmlQualityGate(notes, VALID_XML)

  return approveTeacherWorkspace({
    workspace: createTeacherWorkspace({
      content: notes,
      actorId: 'teacher-1',
      sourceId: 'score-1',
      automaticRevisionId: revisionId,
      historyId,
      createdAt,
    }),
    approvalId,
    createdAt: '2026-09-22T20:01:00Z',
  })
}

function roster() {
  return createTeacherRosterService({
    repository:
      createInMemoryTeacherRosterRepository([
        createStudentRosterEntry({
          studentId: 'student-a',
          displayNameOrNickname: 'Ada',
          active: true,
        }),
        createStudentRosterEntry({
          studentId: 'student-b',
          displayNameOrNickname: 'Bora',
          active: true,
        }),
        createStudentRosterEntry({
          studentId: 'student-c',
          displayNameOrNickname: 'Cem',
          active: true,
        }),
        createStudentRosterEntry({
          studentId: 'student-off',
          displayNameOrNickname: 'Pasif',
          active: false,
        }),
      ]),
  })
}

function service({
  repository =
    createInMemoryTeacherScoreAssignmentRepository(),
  rosterService = roster(),
  assignmentIds = [
    'assignment-a',
    'assignment-b',
    'assignment-c',
  ],
  time = '2026-09-22T20:02:00Z',
} = {}) {
  return createTeacherScoreAssignmentService({
    repository,
    rosterService,
    createAssignmentId({ index }) {
      return assignmentIds[index]
    },
    createReadinessIds({ studentId }) {
      return {
        authorizationId: `auth-${studentId}`,
        rootQualityEvidenceId:
          `quality-${studentId}`,
        revalidationEvidenceId:
          `revalidation-${studentId}`,
      }
    },
    now() {
      return time
    },
  })
}

function prepare(
  producer,
  workspace,
  notes,
  overrides = {},
) {
  return producer.prepareScoreAssignments({
    workspace,
    sourceNotes: notes,
    studentIds: ['student-a'],
    commonTeacherNote: '',
    teacherNoteOverrides: [],
    ...overrides,
  })
}

test('TD-04 one active student produces one ACTIVE SCORE assignment', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)

  const result = prepare(
    service(),
    workspace,
    notes,
    {
      commonTeacherNote: '1-8. ölçüler yavaş.',
    },
  )

  assert.equal(Object.isFrozen(result), true)
  assert.equal(result.length, 1)
  assert.equal(result[0].studentId, 'student-a')
  assert.equal(
    result[0].teacherNote,
    '1-8. ölçüler yavaş.',
  )
  assert.equal(
    result[0].practiceType,
    PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE,
  )
  assert.equal(result[0].state, 'ACTIVE')
  assert.equal(result[0].revokedAt, null)
  assert.equal(
    result[0].sourceRef.studentId,
    'student-a',
  )
})

test('TD-04 fan-out follows TD-02 first-selection order and deduplicates targets', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)

  const result = prepare(
    service(),
    workspace,
    notes,
    {
      studentIds: [
        ' student-c ',
        'student-a',
        'student-c',
        'student-b',
      ],
      commonTeacherNote: 'Ortak not',
    },
  )

  assert.deepEqual(
    result.map((row) => row.studentId),
    ['student-c', 'student-a', 'student-b'],
  )
  assert.deepEqual(
    result.map((row) => row.teacherNote),
    ['Ortak not', 'Ortak not', 'Ortak not'],
  )
  assert.equal(
    new Set(
      result.map((row) => row.assignmentId),
    ).size,
    3,
  )
})

test('TD-04 per-student override replaces common note only for that student', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)

  const result = prepare(
    service(),
    workspace,
    notes,
    {
      studentIds: [
        'student-a',
        'student-b',
        'student-c',
      ],
      commonTeacherNote: 'Ortak not',
      teacherNoteOverrides: [{
        studentId: 'student-b',
        teacherNote: 'Metronom 60 BPM.',
      }],
    },
  )

  assert.deepEqual(
    result.map((row) => row.teacherNote),
    [
      'Ortak not',
      'Metronom 60 BPM.',
      'Ortak not',
    ],
  )
})

test('TD-04 explicit empty override clears common note only for that student', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)

  const result = prepare(
    service(),
    workspace,
    notes,
    {
      studentIds: ['student-a', 'student-b'],
      commonTeacherNote: 'Ortak not',
      teacherNoteOverrides: [{
        studentId: 'student-b',
        teacherNote: '',
      }],
    },
  )

  assert.deepEqual(
    result.map((row) => row.teacherNote),
    ['Ortak not', ''],
  )
})

test('TD-04 unknown or inactive target causes zero repository writes', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)
  let createBatchCalls = 0
  const base =
    createInMemoryTeacherScoreAssignmentRepository()
  const repository = {
    ...base,
    createBatch(rows) {
      createBatchCalls += 1
      return base.createBatch(rows)
    },
  }
  const producer = service({ repository })

  assert.throws(
    () =>
      prepare(
        producer,
        workspace,
        notes,
        {
          studentIds: [
            'student-a',
            'student-off',
          ],
        },
      ),
    /student-inactive/i,
  )
  assert.equal(createBatchCalls, 0)

  assert.throws(
    () =>
      prepare(
        producer,
        workspace,
        notes,
        {
          studentIds: ['student-missing'],
        },
      ),
    /student-not-found/i,
  )
  assert.equal(createBatchCalls, 0)
})

test('TD-04 duplicate or unselected teacher-note override fails before write', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)
  let createBatchCalls = 0
  const base =
    createInMemoryTeacherScoreAssignmentRepository()
  const producer = service({
    repository: {
      ...base,
      createBatch(rows) {
        createBatchCalls += 1
        return base.createBatch(rows)
      },
    },
  })

  for (const teacherNoteOverrides of [
    [
      {
        studentId: 'student-a',
        teacherNote: 'A',
      },
      {
        studentId: 'student-a',
        teacherNote: 'B',
      },
    ],
    [{
      studentId: 'student-c',
      teacherNote: 'C',
    }],
  ]) {
    assert.throws(
      () =>
        prepare(
          producer,
          workspace,
          notes,
          {
            studentIds: [
              'student-a',
              'student-b',
            ],
            teacherNoteOverrides,
          },
        ),
      /override/i,
    )
  }

  assert.equal(createBatchCalls, 0)
})

test('TD-04 strict batch and override input rejects prototype accessor and symbol authority', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)
  const producer = service()
  const valid = {
    workspace,
    sourceNotes: notes,
    studentIds: ['student-a'],
    commonTeacherNote: '',
    teacherNoteOverrides: [],
  }

  const inherited = Object.assign(
    Object.create({ hidden: true }),
    valid,
  )
  assert.throws(
    () =>
      producer.prepareScoreAssignments(
        inherited,
      ),
    /plain object|unsupported/i,
  )

  const symbolInput = {
    ...valid,
    [Symbol('hidden')]: true,
  }
  assert.throws(
    () =>
      producer.prepareScoreAssignments(
        symbolInput,
      ),
    /unsupported/i,
  )

  const accessorOverride = {
    studentId: 'student-a',
    teacherNote: '',
  }
  Object.defineProperty(
    accessorOverride,
    'teacherNote',
    {
      enumerable: true,
      get() {
        return 'forged'
      },
    },
  )

  assert.throws(
    () =>
      producer.prepareScoreAssignments({
        ...valid,
        teacherNoteOverrides: [
          accessorOverride,
        ],
      }),
    /override|plain data/i,
  )
})

test('TD-04 binds exact SCORE readiness separately to each stable studentId', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)

  const result = prepare(
    service(),
    workspace,
    notes,
    {
      studentIds: [
        'student-a',
        'student-b',
      ],
    },
  )

  assert.deepEqual(
    result.map(
      (row) => row.sourceRef.studentId,
    ),
    ['student-a', 'student-b'],
  )
  assert.deepEqual(
    result.map(
      (row) =>
        row.sourceRef.authorizationId,
    ),
    [
      'auth-student-a',
      'auth-student-b',
    ],
  )
  assert.equal(
    result[0].sourceRef.revisionId,
    result[1].sourceRef.revisionId,
  )
})

test('TD-04 non-ready SCORE source prevents batch write', () => {
  const notes = verifiedNotes()
  const workspace =
    approveTeacherWorkspace({
      workspace: createTeacherWorkspace({
        content: notes,
        actorId: 'teacher-1',
        sourceId: 'score-1',
        automaticRevisionId: 'auto-1',
        historyId: 'history-unready',
        createdAt:
          '2026-09-22T20:00:00Z',
      }),
      approvalId: 'approval-unready',
      createdAt:
        '2026-09-22T20:01:00Z',
    })

  let writes = 0
  const base =
    createInMemoryTeacherScoreAssignmentRepository()
  const producer = service({
    repository: {
      ...base,
      createBatch(rows) {
        writes += 1
        return base.createBatch(rows)
      },
    },
  })

  assert.throws(
    () =>
      prepare(
        producer,
        workspace,
        notes,
        {
          studentIds: [
            'student-a',
            'student-b',
          ],
        },
      ),
    /readiness-not-eligible/i,
  )
  assert.equal(writes, 0)
})

test('TD-04 same student and same exact source revision rejects the whole batch', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)
  const repository =
    createInMemoryTeacherScoreAssignmentRepository()

  prepare(
    service({
      repository,
      assignmentIds: ['assignment-existing'],
    }),
    workspace,
    notes,
  )

  const before = repository.list()

  assert.throws(
    () =>
      prepare(
        service({
          repository,
          assignmentIds: [
            'assignment-new-b',
            'assignment-new-a',
          ],
        }),
        workspace,
        notes,
        {
          studentIds: [
            'student-b',
            'student-a',
          ],
        },
      ),
    /already-prepared|duplicate|exact SCORE/i,
  )

  assert.deepEqual(
    repository.list(),
    before,
  )
})

test('TD-04 same student may receive a different exact revision', () => {
  const notes = verifiedNotes()
  const repository =
    createInMemoryTeacherScoreAssignmentRepository()
  const workspace1 = approvedWorkspace(
    notes,
    {
      revisionId: 'auto-1',
      historyId: 'history-1',
      approvalId: 'approval-1',
    },
  )

  prepare(
    service({
      repository,
      assignmentIds: ['assignment-r1'],
    }),
    workspace1,
    notes,
  )

  const workspace2 = approvedWorkspace(
    notes,
    {
      revisionId: 'auto-2',
      historyId: 'history-2',
      approvalId: 'approval-2',
      createdAt:
        '2026-09-22T20:03:00Z',
    },
  )

  const result = prepare(
    service({
      repository,
      assignmentIds: ['assignment-r2'],
      time: '2026-09-22T20:05:00Z',
    }),
    workspace2,
    notes,
  )

  assert.equal(result.length, 1)
  assert.equal(
    result[0].sourceRef.sourceId,
    'score-1',
  )
  assert.equal(
    result[0].sourceRef.revisionId,
    'auto-2',
  )
  assert.equal(
    repository.list().length,
    2,
  )
})

test('TD-04 rejects substituted exact-lookup authority', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)
  const base =
    createInMemoryTeacherScoreAssignmentRepository()
  const otherSource = Object.freeze({
    schemaVersion: 1,
    sourceKind: 'score_exact_revision',
    studentId: 'student-b',
    sourceId: 'other-score',
    sourceRevisionId: 'source-r',
    revisionId: 'other-revision',
    revisionKind: 'automatic',
    contentFingerprint: 'content',
    lineageFingerprint: 'lineage',
    approvalId: 'approval',
    authorizationId: 'auth',
    qualityEvidenceId: 'quality',
    revalidationEvidenceId: null,
    readinessRoute: 'package12_t2',
    package12Status: 'eligible',
    boundAt: '2026-09-22T20:02:00Z',
  })
  const substituted = createPrivateAssignment({
    assignmentId: 'assignment-other',
    studentId: 'student-b',
    practiceType:
      PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE,
    teacherNote: '',
    assignedAt:
      '2026-09-22T20:02:00Z',
    sourceRef: otherSource,
  })

  const producer = service({
    repository: {
      ...base,
      findExactScoreAssignment() {
        return substituted
      },
    },
  })

  assert.throws(
    () =>
      prepare(
        producer,
        workspace,
        notes,
      ),
    /lookup mismatch/i,
  )
  assert.deepEqual(base.list(), [])
})

test('TD-04 calls batch time once and per-student factories once', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)
  let nowCalls = 0
  const assignmentCalls = []
  const readinessCalls = []

  const producer =
    createTeacherScoreAssignmentService({
      repository:
        createInMemoryTeacherScoreAssignmentRepository(),
      rosterService: roster(),
      createAssignmentId(input) {
        assignmentCalls.push(input)
        return `assignment-${input.studentId}`
      },
      createReadinessIds(input) {
        readinessCalls.push(input)
        return {
          authorizationId:
            `auth-${input.studentId}`,
          rootQualityEvidenceId:
            `quality-${input.studentId}`,
          revalidationEvidenceId:
            `revalidation-${input.studentId}`,
        }
      },
      now() {
        nowCalls += 1
        return '2026-09-22T20:02:00Z'
      },
    })

  prepare(
    producer,
    workspace,
    notes,
    {
      studentIds: [
        'student-a',
        'student-b',
      ],
    },
  )

  assert.equal(nowCalls, 1)
  assert.deepEqual(
    assignmentCalls.map(
      (row) => row.studentId,
    ),
    ['student-a', 'student-b'],
  )
  assert.deepEqual(
    readinessCalls.map(
      (row) => row.studentId,
    ),
    ['student-a', 'student-b'],
  )
})

test('TD-04 malformed generated authority fails before createBatch', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)
  let writes = 0
  const base =
    createInMemoryTeacherScoreAssignmentRepository()

  const badAssignmentId =
    createTeacherScoreAssignmentService({
      repository: {
        ...base,
        createBatch(rows) {
          writes += 1
          return base.createBatch(rows)
        },
      },
      rosterService: roster(),
      createAssignmentId() {
        return ''
      },
      createReadinessIds({ studentId }) {
        return {
          authorizationId:
            `auth-${studentId}`,
          rootQualityEvidenceId:
            `quality-${studentId}`,
          revalidationEvidenceId:
            `revalidation-${studentId}`,
        }
      },
      now() {
        return '2026-09-22T20:02:00Z'
      },
    })

  assert.throws(
    () =>
      prepare(
        badAssignmentId,
        workspace,
        notes,
      ),
    /assignmentId/i,
  )
  assert.equal(writes, 0)

  const badReadiness =
    createTeacherScoreAssignmentService({
      repository: base,
      rosterService: roster(),
      createAssignmentId() {
        throw new Error(
          'must not create assignment id',
        )
      },
      createReadinessIds() {
        return {
          authorizationId: '',
          rootQualityEvidenceId: 'quality',
          revalidationEvidenceId:
            'revalidation',
        }
      },
      now() {
        return '2026-09-22T20:02:00Z'
      },
    })

  assert.throws(
    () =>
      prepare(
        badReadiness,
        workspace,
        notes,
      ),
    /authorizationId/i,
  )
  assert.equal(writes, 0)
})

test('TD-04 rejects reordered batch acknowledgement', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)
  const base =
    createInMemoryTeacherScoreAssignmentRepository()

  const producer = service({
    repository: {
      ...base,
      createBatch(rows) {
        base.createBatch(rows)
        return Object.freeze(
          [...rows].reverse(),
        )
      },
    },
  })

  assert.throws(
    () =>
      prepare(
        producer,
        workspace,
        notes,
        {
          studentIds: [
            'student-a',
            'student-b',
          ],
        },
      ),
    /acknowledgement/i,
  )
})

test('TD-04 rejects substituted-note acknowledgement', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)
  const base =
    createInMemoryTeacherScoreAssignmentRepository()

  const producer = service({
    repository: {
      ...base,
      createBatch(rows) {
        base.createBatch(rows)
        return Object.freeze([
          Object.freeze({
            ...rows[0],
            teacherNote: 'Başka not',
          }),
        ])
      },
    },
    assignmentIds: ['assignment-a'],
  })

  assert.throws(
    () =>
      prepare(
        producer,
        workspace,
        notes,
        {
          commonTeacherNote:
            'Orijinal not',
        },
      ),
    /acknowledgement/i,
  )
})

test('TD-04 rejects mutable-clone acknowledgement', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)
  const base =
    createInMemoryTeacherScoreAssignmentRepository()

  const producer = service({
    repository: {
      ...base,
      createBatch(rows) {
        base.createBatch(rows)
        return Object.freeze(
          rows.map(
            (row) =>
              structuredClone(row),
          ),
        )
      },
    },
    assignmentIds: ['assignment-a'],
  })

  assert.throws(
    () =>
      prepare(
        producer,
        workspace,
        notes,
      ),
    /acknowledgement/i,
  )
})


test('TD-04 completes exact binding and duplicate preflight before generating any assignment IDs', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)
  const repository =
    createInMemoryTeacherScoreAssignmentRepository()

  prepare(
    service({
      repository,
      assignmentIds: ['assignment-existing'],
    }),
    workspace,
    notes,
    {
      studentIds: ['student-a'],
    },
  )

  const assignmentCalls = []
  const readinessCalls = []
  const producer =
    createTeacherScoreAssignmentService({
      repository,
      rosterService: roster(),
      createAssignmentId(input) {
        assignmentCalls.push(input.studentId)
        return `assignment-${input.studentId}`
      },
      createReadinessIds(input) {
        readinessCalls.push(input.studentId)
        return {
          authorizationId:
            `auth-second-${input.studentId}`,
          rootQualityEvidenceId:
            `quality-second-${input.studentId}`,
          revalidationEvidenceId:
            `revalidation-second-${input.studentId}`,
        }
      },
      now() {
        return '2026-09-22T20:10:00Z'
      },
    })

  assert.throws(
    () =>
      prepare(
        producer,
        workspace,
        notes,
        {
          studentIds: [
            'student-b',
            'student-a',
          ],
        },
      ),
    /already-prepared/i,
  )

  assert.deepEqual(
    readinessCalls,
    ['student-b', 'student-a'],
  )
  assert.deepEqual(assignmentCalls, [])
})
