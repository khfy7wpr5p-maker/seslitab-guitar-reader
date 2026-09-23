import assert from 'node:assert/strict'
import test from 'node:test'

import '../scripts/runOmrQualityReport.js'

import {
  CANONICAL_NOTE_SCHEMA_VERSION,
  CANONICAL_VERIFICATION_STATUS,
} from '../noteTheory.js'
import { prepareMusicXmlQualityGate } from '../src/services/appQualityGate.js'
import {
  approveTeacherWorkspace,
  createTeacherWorkspace,
} from '../src/services/teacherWorkspaceModel.js'
import { createScoreAssignmentSourceBinding } from '../src/services/scoreAssignmentSourceBinding.js'
import { getChordBoardVoicings } from '../src/services/chordBoardCatalog.js'

let chordBindingApi = null
try {
  chordBindingApi = await import('../src/services/chordBoardAssignmentSourceBinding.js')
} catch {}
import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  PRIVATE_ASSIGNMENT_STATE,
  createPrivateAssignment,
  isAllowedTeacherAssignmentTransition,
  isPrivateAssignment,
} from '../src/services/privateAssignment.js'

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
    pitch: { valid: true, status: CANONICAL_VERIFICATION_STATUS.VERIFIED },
    time: { valid: true, status: CANONICAL_VERIFICATION_STATUS.VERIFIED },
  }
}

function scoreSource(studentId = 'student-1') {
  const notes = ['Do', 'Re', 'Mi', 'Fa'].map((noteName, index) => ({
    partId: 'P1',
    measureNumber: 1,
    measureKey: 'P1:0',
    measureIndex: 0,
    voice: 1,
    staff: 1,
    startBeat: index,
    beats: 1,
    noteName,
    sourceVerificationState: verificationState(),
  }))
  prepareMusicXmlQualityGate(notes, VALID_XML)
  let workspace = createTeacherWorkspace({
    content: notes,
    actorId: 'teacher-1',
    sourceId: 'score-1',
    automaticRevisionId: 'auto-1',
    historyId: 'history-1',
    createdAt: '2026-09-22T16:20:00Z',
  })
  workspace = approveTeacherWorkspace({
    workspace,
    approvalId: 'approval-1',
    createdAt: '2026-09-22T16:21:00Z',
  })
  return createScoreAssignmentSourceBinding({
    workspace,
    sourceNotes: notes,
    studentId,
    authorizationId: `auth-${studentId}`,
    rootQualityEvidenceId: `quality-${studentId}`,
    revalidationEvidenceId: `revalidation-${studentId}`,
    createdAt: '2026-09-22T16:22:00Z',
  })
}

test('TD-01 creates exactly one ACTIVE SCORE assignment for exactly one student', () => {
  const assignment = createPrivateAssignment({
    assignmentId: 'assignment-1',
    studentId: 'student-1',
    practiceType: PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE,
    teacherNote: 'Ölçü 1-4 yavaş çalış.',
    assignedAt: '2026-09-22T16:23:00Z',
    sourceRef: scoreSource('student-1'),
  })

  assert.equal(Object.isFrozen(assignment), true)
  assert.equal(assignment.studentId, 'student-1')
  assert.equal(assignment.state, PRIVATE_ASSIGNMENT_STATE.ACTIVE)
  assert.equal(assignment.revokedAt, null)
  assert.equal(assignment.sourceRef.studentId, 'student-1')
  assert.equal(isPrivateAssignment(assignment), true)
  assert.equal(Object.hasOwn(assignment, 'recipientStudentIds'), false)
})

test('TD-01 assignment studentId must match exact SCORE source recipient', () => {
  assert.throws(
    () => createPrivateAssignment({
      assignmentId: 'assignment-2',
      studentId: 'student-2',
      practiceType: PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE,
      teacherNote: '',
      assignedAt: '2026-09-22T16:24:00Z',
      sourceRef: scoreSource('student-1'),
    }),
    /studentId.*sourceRef/i,
  )
})

test('TD-01 caller cannot pre-mark assignment completed, repertoire or revoked', () => {
  for (const extra of [
    { state: PRIVATE_ASSIGNMENT_STATE.COMPLETED },
    { state: PRIVATE_ASSIGNMENT_STATE.REPERTOIRE },
    { revokedAt: '2026-09-22T16:25:00Z' },
  ]) {
    assert.throws(
      () => createPrivateAssignment({
        assignmentId: 'assignment-3',
        studentId: 'student-1',
        practiceType: PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE,
        teacherNote: '',
        assignedAt: '2026-09-22T16:24:00Z',
        sourceRef: scoreSource('student-1'),
        ...extra,
      }),
      /unsupported field/,
    )
  }
})

test('TD-01 teacher assignment state machine allows only ACTIVE -> COMPLETED -> REPERTOIRE', () => {
  assert.equal(
    isAllowedTeacherAssignmentTransition(
      PRIVATE_ASSIGNMENT_STATE.ACTIVE,
      PRIVATE_ASSIGNMENT_STATE.COMPLETED,
    ),
    true,
  )
  assert.equal(
    isAllowedTeacherAssignmentTransition(
      PRIVATE_ASSIGNMENT_STATE.COMPLETED,
      PRIVATE_ASSIGNMENT_STATE.REPERTOIRE,
    ),
    true,
  )

  for (const [fromState, toState] of [
    [PRIVATE_ASSIGNMENT_STATE.ACTIVE, PRIVATE_ASSIGNMENT_STATE.REPERTOIRE],
    [PRIVATE_ASSIGNMENT_STATE.COMPLETED, PRIVATE_ASSIGNMENT_STATE.ACTIVE],
    [PRIVATE_ASSIGNMENT_STATE.REPERTOIRE, PRIVATE_ASSIGNMENT_STATE.COMPLETED],
    [PRIVATE_ASSIGNMENT_STATE.REPERTOIRE, PRIVATE_ASSIGNMENT_STATE.ACTIVE],
  ]) {
    assert.equal(isAllowedTeacherAssignmentTransition(fromState, toState), false)
  }
})

test('TD-07 PrivateAssignment accepts strict CHORD_BOARD source and keeps exact snapshot authority', () => {
  assert.ok(chordBindingApi, 'TD-07 chord source binding module must exist')
  const sourceRef =
    chordBindingApi.createChordBoardAssignmentSourceBinding({
      studentId: 'student-1',
      snapshot: getChordBoardVoicings('Am')[0],
      boundAt: '2026-09-22T16:26:00Z',
    })

  const assignment = createPrivateAssignment({
    assignmentId: 'assignment-chord-1',
    studentId: 'student-1',
    practiceType: PRIVATE_ASSIGNMENT_PRACTICE_TYPE.CHORD_BOARD,
    teacherNote: 'Am akorunu temiz çalış.',
    assignedAt: '2026-09-22T16:26:00Z',
    sourceRef,
  })

  assert.equal(assignment.practiceType, 'CHORD_BOARD')
  assert.equal(assignment.sourceRef, sourceRef)
  assert.equal(
    assignment.sourceRef.snapshot.voicingFingerprint,
    getChordBoardVoicings('Am')[0].voicingFingerprint,
  )
  assert.equal(isPrivateAssignment(assignment), true)
})

test('TD-07 PrivateAssignment rejects source variant swaps and recipient mismatch', () => {
  assert.ok(chordBindingApi, 'TD-07 chord source binding module must exist')
  const chordSource =
    chordBindingApi.createChordBoardAssignmentSourceBinding({
      studentId: 'student-1',
      snapshot: getChordBoardVoicings('Am')[0],
      boundAt: '2026-09-22T16:26:00Z',
    })

  assert.throws(
    () => createPrivateAssignment({
      assignmentId: 'assignment-chord-mismatch',
      studentId: 'student-2',
      practiceType: PRIVATE_ASSIGNMENT_PRACTICE_TYPE.CHORD_BOARD,
      teacherNote: '',
      assignedAt: '2026-09-22T16:26:00Z',
      sourceRef: chordSource,
    }),
    /studentId.*sourceRef/i,
  )

  assert.throws(
    () => createPrivateAssignment({
      assignmentId: 'assignment-score-wrong-source',
      studentId: 'student-1',
      practiceType: PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE,
      teacherNote: '',
      assignedAt: '2026-09-22T16:26:00Z',
      sourceRef: chordSource,
    }),
    /sourceRef|SCORE/i,
  )

  assert.throws(
    () => createPrivateAssignment({
      assignmentId: 'assignment-chord-wrong-source',
      studentId: 'student-1',
      practiceType: PRIVATE_ASSIGNMENT_PRACTICE_TYPE.CHORD_BOARD,
      teacherNote: '',
      assignedAt: '2026-09-22T16:26:00Z',
      sourceRef: scoreSource('student-1'),
    }),
    /sourceRef|CHORD_BOARD/i,
  )
})

test('TD-01 PrivateAssignment validator rejects clone and recipient-list leakage', () => {
  const valid = createPrivateAssignment({
    assignmentId: 'assignment-4',
    studentId: 'student-1',
    practiceType: PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE,
    teacherNote: '',
    assignedAt: '2026-09-22T16:27:00Z',
    sourceRef: scoreSource('student-1'),
  })

  assert.equal(isPrivateAssignment(structuredClone(valid)), false)
  assert.equal(
    isPrivateAssignment(Object.freeze({ ...valid, recipientStudentIds: ['student-2'] })),
    false,
  )
})
