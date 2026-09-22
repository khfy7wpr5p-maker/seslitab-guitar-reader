import assert from 'node:assert/strict'
import test from 'node:test'

import '../scripts/runOmrQualityReport.js'

import {
  CANONICAL_NOTE_SCHEMA_VERSION,
  CANONICAL_VERIFICATION_STATUS,
} from '../noteTheory.js'
import { prepareMusicXmlQualityGate } from '../src/services/appQualityGate.js'
import {
  applyTeacherWorkspaceCorrection,
  approveTeacherWorkspace,
  createTeacherWorkspace,
} from '../src/services/teacherWorkspaceModel.js'
import {
  createScoreAssignmentSourceBinding,
  isScoreAssignmentSourceBinding,
} from '../src/services/scoreAssignmentSourceBinding.js'

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

function verifiedNotes() {
  return ['Do', 'Re', 'Mi', 'Fa'].map((noteName, index) => ({
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
}

function workspaceFor(notes) {
  return createTeacherWorkspace({
    content: notes,
    actorId: 'teacher-1',
    sourceId: 'score-1',
    automaticRevisionId: 'auto-1',
    historyId: 'history-1',
    createdAt: '2026-09-22T16:10:00Z',
  })
}

function approve(workspace, approvalId = 'approval-1') {
  return approveTeacherWorkspace({
    workspace,
    approvalId,
    createdAt: '2026-09-22T16:11:00Z',
  })
}

function bind(workspace, notes) {
  return createScoreAssignmentSourceBinding({
    workspace,
    sourceNotes: notes,
    studentId: 'student-1',
    authorizationId: 'td01-auth-1',
    rootQualityEvidenceId: 'td01-quality-1',
    revalidationEvidenceId: 'td01-revalidation-1',
    createdAt: '2026-09-22T16:12:00Z',
  })
}

test('TD-01 creates a frozen SCORE source binding only from current ready exact revision', () => {
  const notes = verifiedNotes()
  prepareMusicXmlQualityGate(notes, VALID_XML)
  const workspace = approve(workspaceFor(notes))

  const binding = bind(workspace, notes)

  assert.equal(Object.isFrozen(binding), true)
  assert.equal(binding.sourceKind, 'score_exact_revision')
  assert.equal(binding.studentId, 'student-1')
  assert.equal(binding.sourceId, 'score-1')
  assert.equal(binding.revisionId, 'auto-1')
  assert.equal(binding.approvalId, 'approval-1')
  assert.equal(binding.authorizationId, 'td01-auth-1')
  assert.equal(isScoreAssignmentSourceBinding(binding), true)

  for (const forbidden of [
    'content',
    'payload',
    'bytes',
    'musicXml',
    'token',
    'url',
    'deliveryAllowed',
    'studentContent',
  ]) {
    assert.equal(Object.hasOwn(binding, forbidden), false)
  }
})

test('TD-01 exact approval alone is insufficient without live Package 12 readiness', () => {
  const notes = verifiedNotes()
  const workspace = approve(workspaceFor(notes))

  assert.throws(
    () => bind(workspace, notes),
    /score-assignment-readiness-not-eligible/,
  )
})

test('TD-01 refuses SCORE binding before exact current teacher approval', () => {
  const notes = verifiedNotes()
  prepareMusicXmlQualityGate(notes, VALID_XML)

  assert.throws(
    () => bind(workspaceFor(notes), notes),
    /score-assignment-approval-required/,
  )
})

test('TD-01 old approval does not survive a later correction', () => {
  const notes = verifiedNotes()
  prepareMusicXmlQualityGate(notes, VALID_XML)
  const approved = approve(workspaceFor(notes))
  const corrected = applyTeacherWorkspaceCorrection({
    workspace: approved,
    fieldKey: '0:beats',
    value: 2,
    revisionId: 'corrected-1',
    eventId: 'correction-1',
    operationId: 'operation-1',
    createdAt: '2026-09-22T16:13:00Z',
  })

  assert.throws(
    () => bind(corrected, notes),
    /score-assignment-approval-required/,
  )
})

test('TD-01 source binding cannot be forged by clone or extra delivery field', () => {
  const notes = verifiedNotes()
  prepareMusicXmlQualityGate(notes, VALID_XML)
  const valid = bind(approve(workspaceFor(notes)), notes)

  assert.equal(isScoreAssignmentSourceBinding(structuredClone(valid)), false)
  assert.equal(
    isScoreAssignmentSourceBinding(Object.freeze({ ...valid, delivered: true })),
    false,
  )
})
