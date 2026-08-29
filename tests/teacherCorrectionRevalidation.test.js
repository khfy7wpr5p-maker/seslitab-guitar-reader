import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { readFile } from 'node:fs/promises'

// Package 2B/2C MusicXML validation uses DOMParser in Node tests. Reuse the
// repository's established test-only bootstrap.
import '../scripts/runOmrQualityReport.js'

import { createCanonicalNote } from '../canonicalNoteModel.js'
import {
  CANONICAL_NOTE_SCHEMA_VERSION,
  CANONICAL_VERIFICATION_STATUS,
  midiToFrequency,
} from '../noteTheory.js'
import { prepareMusicXmlQualityGate } from '../src/services/appQualityGate.js'
import { unregisterQualityReportForNotes } from '../src/services/qualityGateIntegration.js'
import { clearMusicXmlSourceForNotes } from '../src/services/musicXmlSourceRegistry.js'
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
  TEACHER_CORRECTED_SHARE_ELIGIBILITY_STATUS,
  TEACHER_CORRECTION_REVALIDATION_SCHEMA_VERSION,
  TEACHER_CORRECTION_REVALIDATION_SCOPE,
  TEACHER_CORRECTION_REVALIDATION_STATE,
  TEACHER_CORRECTION_REVALIDATION_SUPPORTED_FIELDS,
  createTeacherCorrectionRevalidationEvidence,
  evaluateTeacherCorrectedShareEligibility,
  isTeacherCorrectionRevalidationEvidence,
} from '../src/services/teacherCorrectionRevalidation.js'

const VALID_4_4_XML = `<?xml version="1.0" encoding="UTF-8"?>
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
  Object.freeze({ step: 'D', noteName: 'Re', midi: 62, stringLetter: 'D', stringNumber: 4, fret: 0 }),
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
      durationValue: 1,
      divisions: 1,
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

function baseContext({ historyId = 'history-1' } = {}) {
  const notes = sourceNotes()
  const automatic = createAutomaticRevision({
    revisionId: 'auto-1',
    sourceId: 'score-1',
    content: notes,
    createdAt: '2026-08-29T16:00:00Z',
  })
  const history = createTeacherRevisionHistory({
    historyId,
    automaticRevision: automatic,
    createdAt: '2026-08-29T16:00:01Z',
  })
  const report = prepareMusicXmlQualityGate(notes, VALID_4_4_XML)
  assert.equal(report.sourceVerified, true)
  assert.equal(report.structurallyValid, true)
  const rootQualityEvidence = createTeacherShareQualityEvidence({
    evidenceId: 'root-quality-1',
    revision: automatic,
    sourceNotes: notes,
    createdAt: '2026-08-29T16:00:02Z',
  })
  return { notes, automatic, history, rootQualityEvidence }
}

function appendCorrection(context, {
  revisionId = 'corrected-1',
  eventId = 'correction-1',
  actorId = 'teacher-1',
  createdAt = '2026-08-29T16:01:00Z',
  operations,
} = {}) {
  const parentRevision = getCurrentTeacherRevision(context.history)
  const result = applyTeacherCorrectionBatch({
    eventId,
    actorId,
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

function correctFirstNoteToCSharp(context, ids = {}) {
  return appendCorrection(context, {
    revisionId: ids.revisionId ?? 'corrected-1',
    eventId: ids.eventId ?? 'correction-1',
    createdAt: ids.createdAt ?? '2026-08-29T16:01:00Z',
    operations: [
      { path: [0, 'alter'], value: 1 },
      { path: [0, 'noteName'], value: 'Do#' },
      { path: [0, 'midi'], value: 61 },
      { path: [0, 'frequency'], value: midiToFrequency(61) },
      { path: [0, 'fret'], value: 4 },
    ],
  })
}

function revalidation(context, overrides = {}) {
  return createTeacherCorrectionRevalidationEvidence({
    evidenceId: 'revalidation-1',
    history: context.history,
    sourceNotes: context.notes,
    rootQualityEvidence: context.rootQualityEvidence,
    createdAt: '2026-08-29T16:02:00Z',
    ...overrides,
  })
}

function approvalAndAuthorization(revision, overrides = {}) {
  const approval = createTeacherApprovalRecord({
    approvalId: overrides.approvalId ?? 'approval-1',
    actorId: 'teacher-1',
    revision,
    createdAt: '2026-08-29T16:03:00Z',
  })
  const authorization = createTeacherShareAuthorization({
    authorizationId: overrides.authorizationId ?? 'authorization-1',
    issuerActorId: 'teacher-1',
    recipientId: overrides.recipientId ?? 'student-1',
    revision,
    approval,
    createdAt: '2026-08-29T16:04:00Z',
  })
  return { approval, authorization }
}

describe('Package 12-T3 bounded teacher-corrected revalidation provenance', () => {
  test('exports explicit immutable T3 vocabulary and bounded fields', () => {
    assert.equal(TEACHER_CORRECTION_REVALIDATION_SCHEMA_VERSION, 1)
    assert.equal(TEACHER_CORRECTION_REVALIDATION_STATE, 'teacher_corrected_revalidated')
    assert.equal(TEACHER_CORRECTION_REVALIDATION_SCOPE, 'pitch_position_v1')
    assert.equal(Object.isFrozen(TEACHER_CORRECTION_REVALIDATION_SUPPORTED_FIELDS), true)
    assert.deepEqual(TEACHER_CORRECTION_REVALIDATION_SUPPORTED_FIELDS, [
      'step', 'alter', 'octave', 'noteName', 'midi', 'frequency', 'fret',
    ])
    assert.equal(Object.isFrozen(TEACHER_CORRECTED_SHARE_ELIGIBILITY_STATUS), true)
  })

  test('creates immutable evidence from live root quality plus exact correction history', () => {
    const context = baseContext()
    const beforeNotes = structuredClone(context.notes)
    const beforeRoot = structuredClone(context.rootQualityEvidence)
    const revision = correctFirstNoteToCSharp(context)
    const evidence = revalidation(context)

    assert.equal(Object.isFrozen(evidence), true)
    assert.equal(Object.isFrozen(evidence.correctedTargets), true)
    assert.equal(isTeacherCorrectionRevalidationEvidence(evidence), true)
    assert.equal(evidence.historyId, 'history-1')
    assert.equal(evidence.targetRevisionId, revision.revisionId)
    assert.equal(evidence.correctionEventCount, 1)
    assert.equal(evidence.correctionOperationCount, 5)
    assert.deepEqual(evidence.correctedTargets, [
      '0/alter', '0/frequency', '0/fret', '0/midi', '0/noteName',
    ])
    assert.match(evidence.correctionChainFingerprint, /^teacher-correction-chain-fnv1a64-v1:/)
    assert.match(evidence.revalidationFingerprint, /^teacher-correction-revalidation-fnv1a64-v1:/)
    assert.deepEqual(context.notes, beforeNotes)
    assert.deepEqual(context.rootQualityEvidence, beforeRoot)
  })

  test('exact authorization plus live T3 evidence is eligible and exposes no student payload', () => {
    const context = baseContext()
    const revision = correctFirstNoteToCSharp(context)
    const evidence = revalidation(context)
    const { approval, authorization } = approvalAndAuthorization(revision)

    const result = evaluateTeacherCorrectedShareEligibility({
      authorization,
      revision,
      approval,
      recipientId: 'student-1',
      history: context.history,
      sourceNotes: context.notes,
      revalidationEvidence: evidence,
    })

    assert.equal(result.status, TEACHER_CORRECTED_SHARE_ELIGIBILITY_STATUS.ELIGIBLE_CORRECTED_REVISION)
    assert.equal(result.eligible, true)
    assert.equal(result.revalidationEvidenceId, evidence.evidenceId)
    for (const forbidden of ['content', 'payload', 'bytes', 'token', 'url', 'link', 'musicXml']) {
      assert.equal(Object.hasOwn(result, forbidden), false)
    }
  })

  test('inherited verification metadata is never enough for an internally inconsistent correction', () => {
    const context = baseContext()
    appendCorrection(context, {
      operations: [{ path: [0, 'alter'], value: 1 }],
    })
    assert.throws(
      () => revalidation(context),
      /corrected-pitch-position-state-invalid/,
    )
  })

  test('corrected fret must remain a real candidate for the final written pitch', () => {
    const context = baseContext()
    appendCorrection(context, {
      operations: [{ path: [0, 'fret'], value: 20 }],
    })
    assert.throws(
      () => revalidation(context),
      /corrected-pitch-position-state-invalid/,
    )
  })

  test('multiple pitch-only correction revisions remain revalidatable as one exact chain', () => {
    const context = baseContext()
    correctFirstNoteToCSharp(context)
    const finalRevision = appendCorrection(context, {
      revisionId: 'corrected-2',
      eventId: 'correction-2',
      createdAt: '2026-08-29T16:01:30Z',
      operations: [
        { path: [2, 'step'], value: 'F' },
        { path: [2, 'noteName'], value: 'Fa' },
        { path: [2, 'midi'], value: 65 },
        { path: [2, 'frequency'], value: midiToFrequency(65) },
        { path: [2, 'fret'], value: 3 },
      ],
    })
    const evidence = revalidation(context)
    assert.equal(evidence.targetRevisionId, finalRevision.revisionId)
    assert.equal(evidence.correctionEventCount, 2)
    assert.equal(evidence.correctionOperationCount, 10)
    assert.equal(isTeacherCorrectionRevalidationEvidence(evidence), true)
  })

  test('duration/rhythm/voice/staff/tie correction classes fail closed', () => {
    const cases = [
      ['duration', 'half'],
      ['beats', 2],
      ['durationValue', 2],
      ['dotCount', 1],
      ['voice', 2],
      ['staff', 2],
      ['tieStart', true],
    ]

    for (const [field, value] of cases) {
      const context = baseContext()
      appendCorrection(context, { operations: [{ path: [0, field], value }] })
      assert.throws(
        () => revalidation(context),
        /unsupported-correction-field/,
        field,
      )
    }
  })

  test('undo-created histories require the later structural revalidation stage', () => {
    const context = baseContext()
    correctFirstNoteToCSharp(context)
    const undone = undoTeacherRevisionHistory({
      history: context.history,
      targetRevisionId: context.automatic.revisionId,
      revisionId: 'undo-result-1',
      eventId: 'undo-1',
      actorId: 'teacher-1',
      createdAt: '2026-08-29T16:01:30Z',
    })
    context.history = undone.history

    assert.throws(
      () => revalidation(context),
      /undo-revalidation-not-supported/,
    )
  })

  test('removed root Package 7C or 2D evidence invalidates previously issued T3 evidence', () => {
    for (const removeEvidence of [clearMusicXmlSourceForNotes, unregisterQualityReportForNotes]) {
      const context = baseContext()
      const revision = correctFirstNoteToCSharp(context)
      const evidence = revalidation(context)
      const { approval, authorization } = approvalAndAuthorization(revision)
      removeEvidence(context.notes)

      const result = evaluateTeacherCorrectedShareEligibility({
        authorization,
        revision,
        approval,
        recipientId: 'student-1',
        history: context.history,
        sourceNotes: context.notes,
        revalidationEvidence: evidence,
      })
      assert.equal(result.status, TEACHER_CORRECTED_SHARE_ELIGIBILITY_STATUS.ROOT_QUALITY_NOT_ELIGIBLE)
      assert.equal(result.eligible, false)
    }
  })

  test('automatic source-array mutation after T3 issuance fails live root replay', () => {
    const context = baseContext()
    const revision = correctFirstNoteToCSharp(context)
    const evidence = revalidation(context)
    const { approval, authorization } = approvalAndAuthorization(revision)
    context.notes[0].noteName = 'Fa#'

    const result = evaluateTeacherCorrectedShareEligibility({
      authorization,
      revision,
      approval,
      recipientId: 'student-1',
      history: context.history,
      sourceNotes: context.notes,
      revalidationEvidence: evidence,
    })
    assert.equal(result.status, TEACHER_CORRECTED_SHARE_ELIGIBILITY_STATUS.ROOT_QUALITY_NOT_ELIGIBLE)
  })

  test('another history id cannot reuse exact-looking T3 evidence', () => {
    const first = baseContext({ historyId: 'history-1' })
    correctFirstNoteToCSharp(first)
    const evidence = revalidation(first)

    const second = baseContext({ historyId: 'history-2' })
    const revision = correctFirstNoteToCSharp(second)
    const { approval, authorization } = approvalAndAuthorization(revision)

    const result = evaluateTeacherCorrectedShareEligibility({
      authorization,
      revision,
      approval,
      recipientId: 'student-1',
      history: second.history,
      sourceNotes: second.notes,
      revalidationEvidence: evidence,
    })
    assert.equal(result.status, TEACHER_CORRECTED_SHARE_ELIGIBILITY_STATUS.REVALIDATION_EVIDENCE_NOT_APPLICABLE)
  })

  test('older revision/evidence cannot survive a later correction', () => {
    const context = baseContext()
    const oldRevision = correctFirstNoteToCSharp(context)
    const oldEvidence = revalidation(context)
    const { approval, authorization } = approvalAndAuthorization(oldRevision)
    appendCorrection(context, {
      revisionId: 'corrected-2',
      eventId: 'correction-2',
      operations: [{ path: [1, 'fret'], value: 12 }],
    })

    const result = evaluateTeacherCorrectedShareEligibility({
      authorization,
      revision: oldRevision,
      approval,
      recipientId: 'student-1',
      history: context.history,
      sourceNotes: context.notes,
      revalidationEvidence: oldEvidence,
    })
    assert.equal(result.status, TEACHER_CORRECTED_SHARE_ELIGIBILITY_STATUS.HISTORY_NOT_CURRENT)
  })

  test('recipient mismatch and exact revocation take precedence', () => {
    const context = baseContext()
    const revision = correctFirstNoteToCSharp(context)
    const evidence = revalidation(context)
    const { approval, authorization } = approvalAndAuthorization(revision)

    const mismatch = evaluateTeacherCorrectedShareEligibility({
      authorization,
      revision,
      approval,
      recipientId: 'student-2',
      history: context.history,
      sourceNotes: context.notes,
      revalidationEvidence: evidence,
    })
    assert.equal(mismatch.status, TEACHER_CORRECTED_SHARE_ELIGIBILITY_STATUS.RECIPIENT_MISMATCH)

    const revocation = createTeacherShareRevocation({
      revocationId: 'revoke-1',
      authorization,
      actorId: 'teacher-1',
      createdAt: '2026-08-29T16:05:00Z',
    })
    const revoked = evaluateTeacherCorrectedShareEligibility({
      authorization,
      revision,
      approval,
      recipientId: 'student-1',
      history: context.history,
      sourceNotes: context.notes,
      revalidationEvidence: evidence,
      revocation,
    })
    assert.equal(revoked.status, TEACHER_CORRECTED_SHARE_ELIGIBILITY_STATUS.REVOKED)
  })

  test('missing, mutable, injected, and fingerprint-forged T3 evidence fails closed', () => {
    const context = baseContext()
    const revision = correctFirstNoteToCSharp(context)
    const evidence = revalidation(context)
    const { approval, authorization } = approvalAndAuthorization(revision)

    const missing = evaluateTeacherCorrectedShareEligibility({
      authorization,
      revision,
      approval,
      recipientId: 'student-1',
      history: context.history,
      sourceNotes: context.notes,
    })
    assert.equal(missing.status, TEACHER_CORRECTED_SHARE_ELIGIBILITY_STATUS.REVALIDATION_EVIDENCE_MISSING)

    assert.equal(isTeacherCorrectionRevalidationEvidence({ ...evidence }), false)
    assert.equal(isTeacherCorrectionRevalidationEvidence(Object.freeze({ ...evidence, safeToShare: true })), false)

    const replacement = evidence.revalidationFingerprint.endsWith('0') ? '1' : '0'
    const forged = Object.freeze({
      ...evidence,
      revalidationFingerprint: `${evidence.revalidationFingerprint.slice(0, -1)}${replacement}`,
    })
    assert.equal(isTeacherCorrectionRevalidationEvidence(forged), false)

    const invalid = evaluateTeacherCorrectedShareEligibility({
      authorization,
      revision,
      approval,
      recipientId: 'student-1',
      history: context.history,
      sourceNotes: context.notes,
      revalidationEvidence: forged,
    })
    assert.equal(invalid.status, TEACHER_CORRECTED_SHARE_ELIGIBILITY_STATUS.REVALIDATION_EVIDENCE_INVALID)
  })

  test('caller owns evidence identity/time and malformed inputs fail closed', () => {
    const context = baseContext()
    correctFirstNoteToCSharp(context)
    const evidence = revalidation(context, {
      evidenceId: ' evidence-x ',
      createdAt: ' 2026-08-29T16:06:00Z ',
    })
    assert.equal(evidence.evidenceId, 'evidence-x')
    assert.equal(evidence.createdAt, '2026-08-29T16:06:00Z')

    assert.throws(
      () => revalidation(context, { evidenceId: ' ' }),
      /evidenceId/,
    )
    assert.throws(
      () => createTeacherCorrectionRevalidationEvidence({
        evidenceId: 'x',
        history: Object.freeze({}),
        sourceNotes: context.notes,
        rootQualityEvidence: context.rootQualityEvidence,
      }),
      /invalid-history/,
    )
    assert.throws(
      () => evaluateTeacherCorrectedShareEligibility({
        revision: context.automatic,
        recipientId: 'student-1',
      }),
      /teacher-corrected revision/,
    )
  })

  test('T3 source remains isolated from payload, persistence, network, and deployment wiring', async () => {
    const source = await readFile(
      new URL('../src/services/teacherCorrectionRevalidation.js', import.meta.url),
      'utf8',
    )
    for (const forbidden of [
      'fetch(',
      'axios',
      'node:fs',
      "from 'fs'",
      'omrProvider',
      'Audiveris',
      'render.yaml',
      'Dockerfile',
      'studentPayload',
      'shareToken',
      'localStorage',
      'database',
    ]) {
      assert.equal(source.includes(forbidden), false, forbidden)
    }
  })
})
