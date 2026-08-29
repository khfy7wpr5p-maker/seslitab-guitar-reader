import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

// Package 2B/2C MusicXML validation uses DOMParser in Node tests.
import '../scripts/runOmrQualityReport.js'

import { createCanonicalNote } from '../canonicalNoteModel.js'
import {
  CANONICAL_NOTE_SCHEMA_VERSION,
  CANONICAL_VERIFICATION_STATUS,
  midiToFrequency,
} from '../noteTheory.js'
import { prepareMusicXmlQualityGate } from '../src/services/appQualityGate.js'
import { createTeacherApprovalRecord } from '../src/services/teacherApprovalModel.js'
import {
  TEACHER_CORRECTION_OPERATION_KIND,
  applyTeacherCorrectionBatch,
} from '../src/services/teacherCorrectionOperations.js'
import {
  appendTeacherCorrectionToHistory,
  createTeacherRevisionHistory,
  getCurrentTeacherRevision,
  undoTeacherRevisionHistory,
} from '../src/services/teacherRevisionHistory.js'
import { createAutomaticRevision } from '../src/services/teacherRevisionModel.js'
import {
  createTeacherShareAuthorization,
  createTeacherShareRevocation,
} from '../src/services/teacherShareAuthorization.js'
import { createTeacherShareQualityEvidence } from '../src/services/teacherShareEligibility.js'
import {
  TEACHER_STRUCTURALLY_CORRECTED_SHARE_ELIGIBILITY_STATUS,
  TEACHER_STRUCTURAL_REVALIDATION_SCHEMA_VERSION,
  TEACHER_STRUCTURAL_REVALIDATION_SCOPE,
  TEACHER_STRUCTURAL_REVALIDATION_STATE,
  TEACHER_STRUCTURAL_REVALIDATION_SUPPORTED_FIELDS,
  createTeacherStructuralCorrectionRevalidationEvidence,
  evaluateTeacherStructurallyCorrectedShareEligibility,
  isTeacherStructuralCorrectionRevalidationEvidence,
} from '../src/services/teacherStructuralCorrectionRevalidation.js'

const VALID_4_4_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`

const VOICE_MISMATCH_XML = VALID_4_4_XML.replaceAll(
  '<voice>1</voice>',
  '<voice>2</voice>',
)

function verifiedState() {
  return {
    schemaVersion: CANONICAL_NOTE_SCHEMA_VERSION,
    status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
    pitch: {
      valid: true,
      status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
      authority: 'test-source',
      source: 'musicxml',
      reason: null,
    },
    time: {
      valid: true,
      status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
      authority: 'test-source',
      source: 'musicxml',
      reason: null,
    },
  }
}

const NOTE_FIXTURES = Object.freeze([
  Object.freeze({ step: 'C', noteName: 'Do', midi: 60, stringLetter: 'A', stringNumber: 5, fret: 3 }),
  Object.freeze({ step: 'C', noteName: 'Do', midi: 60, stringLetter: 'A', stringNumber: 5, fret: 3 }),
  Object.freeze({ step: 'E', noteName: 'Mi', midi: 64, stringLetter: 'D', stringNumber: 4, fret: 2 }),
  Object.freeze({ step: 'F', noteName: 'Fa', midi: 65, stringLetter: 'D', stringNumber: 4, fret: 3 }),
])

function sourceNotes() {
  return NOTE_FIXTURES.map((fixture, index) => {
    const note = createCanonicalNote({
      measureNumber: 1,
      measureKey: 'P1:0',
      measureIndex: 0,
      partId: 'P1',
      partIndex: 0,
      startBeat: index,
      duration: 'quarter',
      beats: 1,
      durationValue: 2,
      divisions: 2,
      dotCount: 0,
      voice: 1,
      staff: 1,
      isRest: false,
      isGrace: false,
      isChordNote: false,
      step: fixture.step,
      alter: 0,
      octave: 4,
      noteName: fixture.noteName,
      midi: fixture.midi,
      frequency: midiToFrequency(fixture.midi),
      stringLetter: fixture.stringLetter,
      stringNumber: fixture.stringNumber,
      fret: fixture.fret,
      tieStart: false,
      tieStop: false,
      tieContinue: false,
    })
    note.sourceVerificationState = verifiedState()
    return note
  })
}

function baseContext({
  historyId = 'history-1',
  musicXml = VALID_4_4_XML,
} = {}) {
  const notes = sourceNotes()
  const automatic = createAutomaticRevision({
    revisionId: 'auto-1',
    sourceId: 'score-1',
    content: notes,
    createdAt: '2026-08-29T16:30:00Z',
  })
  const history = createTeacherRevisionHistory({
    historyId,
    automaticRevision: automatic,
    createdAt: '2026-08-29T16:30:01Z',
  })
  const report = prepareMusicXmlQualityGate(notes, musicXml)
  assert.equal(report.sourceVerified, true)
  assert.equal(report.structurallyValid, true)
  const rootQualityEvidence = createTeacherShareQualityEvidence({
    evidenceId: 'root-quality-1',
    revision: automatic,
    sourceNotes: notes,
    createdAt: '2026-08-29T16:30:02Z',
  })
  return { notes, automatic, history, rootQualityEvidence }
}

function appendCorrection(context, {
  revisionId = 'corrected-1',
  eventId = 'correction-1',
  createdAt = '2026-08-29T16:31:00Z',
  operations,
} = {}) {
  const parentRevision = getCurrentTeacherRevision(context.history)
  const result = applyTeacherCorrectionBatch({
    eventId,
    actorId: 'teacher-1',
    revisionId,
    parentRevision,
    createdAt,
    operations: operations.map((operation, index) => ({
      operationId: operation.operationId ?? `${eventId}-op-${index + 1}`,
      kind: TEACHER_CORRECTION_OPERATION_KIND.REPLACE_VALUE,
      path: operation.path,
      value: operation.value,
    })),
  })
  context.history = appendTeacherCorrectionToHistory({
    history: context.history,
    revision: result.revision,
    auditEvent: result.auditEvent,
  })
  return result.revision
}

function validDurationCorrection(context, ids = {}) {
  return appendCorrection(context, {
    revisionId: ids.revisionId ?? 'corrected-rhythm-1',
    eventId: ids.eventId ?? 'correction-rhythm-1',
    createdAt: ids.createdAt ?? '2026-08-29T16:31:00Z',
    operations: [
      { path: [0, 'duration'], value: 'half' },
      { path: [0, 'beats'], value: 2 },
      { path: [0, 'durationValue'], value: 4 },
      { path: [1, 'duration'], value: 'eighth' },
      { path: [1, 'beats'], value: 0.5 },
      { path: [1, 'durationValue'], value: 1 },
      { path: [1, 'startBeat'], value: 2 },
      { path: [2, 'duration'], value: 'eighth' },
      { path: [2, 'beats'], value: 0.5 },
      { path: [2, 'durationValue'], value: 1 },
      { path: [2, 'startBeat'], value: 2.5 },
    ],
  })
}

function revalidation(context, overrides = {}) {
  return createTeacherStructuralCorrectionRevalidationEvidence({
    evidenceId: 'structural-revalidation-1',
    history: context.history,
    sourceNotes: context.notes,
    rootQualityEvidence: context.rootQualityEvidence,
    createdAt: '2026-08-29T16:32:00Z',
    ...overrides,
  })
}

function approvalAndAuthorization(revision, overrides = {}) {
  const approval = createTeacherApprovalRecord({
    approvalId: overrides.approvalId ?? 'approval-1',
    actorId: 'teacher-1',
    revision,
    createdAt: '2026-08-29T16:33:00Z',
  })
  const authorization = createTeacherShareAuthorization({
    authorizationId: overrides.authorizationId ?? 'authorization-1',
    issuerActorId: 'teacher-1',
    recipientId: overrides.recipientId ?? 'student-1',
    revision,
    approval,
    createdAt: '2026-08-29T16:34:00Z',
  })
  return { approval, authorization }
}

describe('Package 12-T4 bounded structural/rhythmic corrected revalidation', () => {
  test('exports explicit T4 vocabulary and bounded field set', () => {
    assert.equal(TEACHER_STRUCTURAL_REVALIDATION_SCHEMA_VERSION, 1)
    assert.equal(
      TEACHER_STRUCTURAL_REVALIDATION_STATE,
      'teacher_corrected_structural_revalidated',
    )
    assert.equal(
      TEACHER_STRUCTURAL_REVALIDATION_SCOPE,
      'pitch_position_structural_rhythm_v1',
    )
    assert.equal(Object.isFrozen(TEACHER_STRUCTURAL_REVALIDATION_SUPPORTED_FIELDS), true)
    for (const field of [
      'step', 'fret', 'duration', 'beats', 'durationValue', 'dotCount',
      'startBeat', 'voice', 'staff', 'tieStart', 'tieStop', 'tieContinue',
      'isChordNote',
    ]) {
      assert.equal(TEACHER_STRUCTURAL_REVALIDATION_SUPPORTED_FIELDS.includes(field), true)
    }
    for (const field of [
      'isGrace', 'isRest', 'divisions', 'tuplet', 'beam',
      'stringLetter', 'stringNumber',
    ]) {
      assert.equal(TEACHER_STRUCTURAL_REVALIDATION_SUPPORTED_FIELDS.includes(field), false)
    }
  })

  test('issues immutable evidence for a coherent duration/timeline correction', () => {
    const context = baseContext()
    const revision = validDurationCorrection(context)
    const evidence = revalidation(context)

    assert.equal(Object.isFrozen(evidence), true)
    assert.equal(Object.isFrozen(evidence.correctedTargets), true)
    assert.equal(isTeacherStructuralCorrectionRevalidationEvidence(evidence), true)
    assert.equal(evidence.targetRevisionId, revision.revisionId)
    assert.equal(evidence.correctionEventCount, 1)
    assert.equal(evidence.undoEventCount, 0)
    assert.equal(evidence.correctionOperationCount, 11)
    assert.match(evidence.historyChainFingerprint, /^teacher-structural-history-chain-fnv1a64-v1:/)
    assert.match(evidence.structuralContextFingerprint, /^teacher-structural-context-fnv1a64-v1:/)
    assert.match(evidence.structuralValidationFingerprint, /^teacher-structural-validation-fnv1a64-v1:/)
  })

  test('exact authorization plus live T4 evidence is eligible and exposes no payload', () => {
    const context = baseContext()
    const revision = validDurationCorrection(context)
    const evidence = revalidation(context)
    const { approval, authorization } = approvalAndAuthorization(revision)

    const result = evaluateTeacherStructurallyCorrectedShareEligibility({
      authorization,
      revision,
      approval,
      recipientId: 'student-1',
      history: context.history,
      sourceNotes: context.notes,
      revalidationEvidence: evidence,
    })

    assert.equal(
      result.status,
      TEACHER_STRUCTURALLY_CORRECTED_SHARE_ELIGIBILITY_STATUS
        .ELIGIBLE_STRUCTURALLY_REVALIDATED_REVISION,
    )
    assert.equal(result.eligible, true)
    for (const forbidden of [
      'content', 'payload', 'bytes', 'token', 'url', 'link', 'musicXml',
    ]) {
      assert.equal(Object.hasOwn(result, forbidden), false)
    }
  })

  test('durationValue alone cannot create internally inconsistent timing evidence', () => {
    const context = baseContext()
    appendCorrection(context, {
      operations: [{ path: [0, 'durationValue'], value: 4 }],
    })
    assert.throws(
      () => revalidation(context),
      /corrected-structural-fields-invalid/,
    )
  })

  test('coherent but overfilled duration correction fails structural validation', () => {
    const context = baseContext()
    appendCorrection(context, {
      operations: [
        { path: [3, 'duration'], value: 'half' },
        { path: [3, 'beats'], value: 2 },
        { path: [3, 'durationValue'], value: 4 },
      ],
    })
    assert.throws(
      () => revalidation(context),
      /corrected-structural-validation-failed/,
    )
  })

  test('stale derived startBeat values fail after an otherwise coherent timing correction', () => {
    const context = baseContext()
    appendCorrection(context, {
      operations: [
        { path: [0, 'duration'], value: 'half' },
        { path: [0, 'beats'], value: 2 },
        { path: [0, 'durationValue'], value: 4 },
        { path: [1, 'duration'], value: 'eighth' },
        { path: [1, 'beats'], value: 0.5 },
        { path: [1, 'durationValue'], value: 1 },
        { path: [2, 'duration'], value: 'eighth' },
        { path: [2, 'beats'], value: 0.5 },
        { path: [2, 'durationValue'], value: 1 },
      ],
    })
    assert.throws(
      () => revalidation(context),
      /corrected-start-beat-mismatch/,
    )
  })

  test('positive voice/staff edits can be revalidated when structure remains clean', () => {
    const context = baseContext()
    appendCorrection(context, {
      operations: [
        { path: [0, 'voice'], value: 2 },
        { path: [0, 'staff'], value: 2 },
      ],
    })
    const evidence = revalidation(context)
    assert.equal(isTeacherStructuralCorrectionRevalidationEvidence(evidence), true)
  })

  test('invalid voice or multi-dot correction values fail closed at scope validation', () => {
    for (const [field, value] of [['voice', 0], ['dotCount', 2]]) {
      const context = baseContext()
      appendCorrection(context, {
        operations: [{ path: [0, field], value }],
      })
      assert.throws(
        () => revalidation(context),
        /invalid-correction-value/,
        field,
      )
    }
  })

  test('valid tie start/stop correction is accepted while orphan tie is rejected', () => {
    const valid = baseContext()
    appendCorrection(valid, {
      operations: [
        { path: [0, 'tieStart'], value: true },
        { path: [1, 'tieStop'], value: true },
      ],
    })
    assert.equal(
      isTeacherStructuralCorrectionRevalidationEvidence(revalidation(valid)),
      true,
    )

    const invalid = baseContext()
    appendCorrection(invalid, {
      operations: [{ path: [0, 'tieStart'], value: true }],
    })
    assert.throws(
      () => revalidation(invalid),
      /corrected-structural-fields-invalid/,
    )
  })

  test('tieContinue must equal tieStart && tieStop', () => {
    const context = baseContext()
    appendCorrection(context, {
      operations: [
        { path: [0, 'tieStart'], value: true },
        { path: [0, 'tieContinue'], value: true },
      ],
    })
    assert.throws(
      () => revalidation(context),
      /corrected-structural-fields-invalid/,
    )
  })

  test('bounded chord-state edit can pass only when timing and derived onset remain valid', () => {
    const context = baseContext()
    appendCorrection(context, {
      operations: [
        { path: [0, 'duration'], value: 'half' },
        { path: [0, 'beats'], value: 2 },
        { path: [0, 'durationValue'], value: 4 },
        { path: [1, 'isChordNote'], value: true },
        { path: [1, 'startBeat'], value: 0 },
      ],
    })
    const evidence = revalidation(context)
    assert.equal(isTeacherStructuralCorrectionRevalidationEvidence(evidence), true)
  })

  test('unsupported grace/string/nested correction paths remain fail-closed', () => {
    const cases = [
      { path: [0, 'isGrace'], value: true },
      { path: [0, 'stringNumber'], value: 6 },
      { path: [0, 'tuplet', 'actualNotes'], value: 3 },
    ]

    for (const operation of cases) {
      const context = baseContext()
      appendCorrection(context, { operations: [operation] })
      assert.throws(
        () => revalidation(context),
        /unsupported-correction-field/,
      )
    }
  })

  test('raw MusicXML structural context must genuinely match the automatic root snapshot', () => {
    const context = baseContext({ musicXml: VOICE_MISMATCH_XML })
    appendCorrection(context, {
      operations: [{ path: [0, 'fret'], value: 4 }],
    })
    assert.throws(
      () => revalidation(context),
      /source-structural-context-mismatch/,
    )
  })

  test('mixed T3 pitch and T4 structural corrections remain mechanically bounded', () => {
    const context = baseContext()
    appendCorrection(context, {
      operations: [
        { path: [0, 'alter'], value: 1 },
        { path: [0, 'noteName'], value: 'Do#' },
        { path: [0, 'midi'], value: 61 },
        { path: [0, 'frequency'], value: midiToFrequency(61) },
        { path: [0, 'fret'], value: 4 },
        { path: [0, 'voice'], value: 2 },
      ],
    })
    const evidence = revalidation(context)
    assert.equal(isTeacherStructuralCorrectionRevalidationEvidence(evidence), true)
  })

  test('undo-created current revision gets fresh T4 evidence bound to exact undo chain', () => {
    const context = baseContext()
    validDurationCorrection(context)
    const undone = undoTeacherRevisionHistory({
      history: context.history,
      targetRevisionId: context.automatic.revisionId,
      revisionId: 'undo-result-1',
      eventId: 'undo-1',
      actorId: 'teacher-1',
      createdAt: '2026-08-29T16:31:30Z',
    })
    context.history = undone.history

    const evidence = revalidation(context)
    assert.equal(evidence.undoEventCount, 1)
    assert.equal(evidence.targetRevisionId, undone.revision.revisionId)
    assert.equal(isTeacherStructuralCorrectionRevalidationEvidence(evidence), true)

    const { approval, authorization } = approvalAndAuthorization(undone.revision)
    const result = evaluateTeacherStructurallyCorrectedShareEligibility({
      authorization,
      revision: undone.revision,
      approval,
      recipientId: 'student-1',
      history: context.history,
      sourceNotes: context.notes,
      revalidationEvidence: evidence,
    })
    assert.equal(result.eligible, true)
  })

  test('missing evidence, recipient mismatch and revocation fail closed before delivery', () => {
    const context = baseContext()
    const revision = validDurationCorrection(context)
    const evidence = revalidation(context)
    const { approval, authorization } = approvalAndAuthorization(revision)

    const missing = evaluateTeacherStructurallyCorrectedShareEligibility({
      authorization,
      revision,
      approval,
      recipientId: 'student-1',
      history: context.history,
      sourceNotes: context.notes,
    })
    assert.equal(
      missing.status,
      TEACHER_STRUCTURALLY_CORRECTED_SHARE_ELIGIBILITY_STATUS
        .REVALIDATION_EVIDENCE_MISSING,
    )

    const mismatch = evaluateTeacherStructurallyCorrectedShareEligibility({
      authorization,
      revision,
      approval,
      recipientId: 'student-2',
      history: context.history,
      sourceNotes: context.notes,
      revalidationEvidence: evidence,
    })
    assert.equal(
      mismatch.status,
      TEACHER_STRUCTURALLY_CORRECTED_SHARE_ELIGIBILITY_STATUS.RECIPIENT_MISMATCH,
    )

    const revocation = createTeacherShareRevocation({
      revocationId: 'revocation-1',
      issuerActorId: 'teacher-1',
      authorization,
      createdAt: '2026-08-29T16:35:00Z',
    })
    const revoked = evaluateTeacherStructurallyCorrectedShareEligibility({
      authorization,
      revision,
      approval,
      recipientId: 'student-1',
      history: context.history,
      sourceNotes: context.notes,
      revalidationEvidence: evidence,
      revocation,
    })
    assert.equal(
      revoked.status,
      TEACHER_STRUCTURALLY_CORRECTED_SHARE_ELIGIBILITY_STATUS.REVOKED,
    )
  })
})
