import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { createAutomaticRevision } from '../src/services/teacherRevisionModel.js'
import { createTeacherApprovalRecord } from '../src/services/teacherApprovalModel.js'
import { createTeacherRevisionHistory } from '../src/services/teacherRevisionHistory.js'
import {
  TEACHER_CONCURRENCY_CONFLICT,
  TEACHER_CONCURRENCY_SCHEMA_VERSION,
  TEACHER_CONCURRENCY_STATUS,
  appendTeacherApprovalWithExpectation,
  applyTeacherCorrectionWithExpectation,
  createTeacherHistoryExpectation,
  evaluateTeacherHistoryExpectation,
  isTeacherHistoryExpectation,
  undoTeacherRevisionHistoryWithExpectation,
} from '../src/services/teacherRevisionConcurrency.js'

function createBase({ historyId = 'history-1', sourceId = 'score-1' } = {}) {
  const automaticRevision = createAutomaticRevision({
    revisionId: `${sourceId}-auto`,
    sourceId,
    createdAt: '2026-08-28T10:00:00Z',
    content: {
      score: { title: 'Example' },
      notes: [
        { pitch: 'C4', beats: 1 },
        { pitch: 'D4', beats: 1 },
      ],
    },
  })
  const history = createTeacherRevisionHistory({
    historyId,
    automaticRevision,
    createdAt: '2026-08-28T10:01:00Z',
  })
  return { automaticRevision, history }
}

function correction({
  history,
  expectation,
  suffix,
  path = ['notes', 0, 'pitch'],
  value,
}) {
  return applyTeacherCorrectionWithExpectation({
    history,
    expectation,
    eventId: `event-${suffix}`,
    actorId: 'teacher-1',
    revisionId: `revision-${suffix}`,
    createdAt: `2026-08-28T11:${suffix.padStart(2, '0')}:00Z`,
    operations: [
      {
        operationId: `operation-${suffix}`,
        kind: 'replace_value',
        path,
        value,
      },
    ],
  })
}

test('Package 8-T5 exports explicit immutable concurrency vocabulary', () => {
  assert.equal(TEACHER_CONCURRENCY_SCHEMA_VERSION, 1)
  assert.deepEqual(TEACHER_CONCURRENCY_STATUS, {
    CURRENT: 'current',
    APPLIED: 'applied',
    CONFLICT: 'conflict',
  })
  assert.deepEqual(TEACHER_CONCURRENCY_CONFLICT, {
    HISTORY_MISMATCH: 'history_mismatch',
    SOURCE_MISMATCH: 'source_mismatch',
    STALE_HISTORY: 'stale_history',
  })
  assert.ok(Object.isFrozen(TEACHER_CONCURRENCY_STATUS))
  assert.ok(Object.isFrozen(TEACHER_CONCURRENCY_CONFLICT))
})

test('expectation is deterministic, immutable, and binds the full history state', () => {
  const { history } = createBase()
  const first = createTeacherHistoryExpectation(history)
  const second = createTeacherHistoryExpectation(history)

  assert.deepEqual(first, second)
  assert.ok(Object.isFrozen(first))
  assert.ok(isTeacherHistoryExpectation(first))
  assert.equal(first.currentRevisionId, 'score-1-auto')
  assert.equal(first.revisionCount, 1)
  assert.equal(first.correctionEventCount, 0)
  assert.equal(first.undoEventCount, 0)
  assert.equal(first.approvalCount, 0)
  assert.match(first.historyStateFingerprint, /^teacher-history-fnv1a64-v1:/)
  assert.equal(Object.hasOwn(first, 'createdAt'), false)
})

test('fresh expectation evaluates as CURRENT without mutating history', () => {
  const { history } = createBase()
  const expectation = createTeacherHistoryExpectation(history)
  const result = evaluateTeacherHistoryExpectation({ history, expectation })

  assert.equal(result.status, TEACHER_CONCURRENCY_STATUS.CURRENT)
  assert.equal(result.conflictReason, null)
  assert.deepEqual(result.currentExpectation, expectation)
  assert.ok(Object.isFrozen(result))
  assert.equal(history.revisions.length, 1)
})

test('fresh guarded correction applies once and returns a new immutable history', () => {
  const { history } = createBase()
  const expectation = createTeacherHistoryExpectation(history)
  const result = correction({ history, expectation, suffix: '01', value: 'C#4' })

  assert.equal(result.status, TEACHER_CONCURRENCY_STATUS.APPLIED)
  assert.equal(result.conflictReason, null)
  assert.notEqual(result.history, history)
  assert.equal(history.revisions.length, 1)
  assert.equal(result.history.revisions.length, 2)
  assert.equal(result.revision.content.notes[0].pitch, 'C#4')
  assert.equal(result.auditEvent.parentRevisionId, 'score-1-auto')
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.history))
  assert.ok(isTeacherHistoryExpectation(result.expectation))
})

test('two concurrent edits from one expectation: first applies and second conflicts with zero partial write', () => {
  const { history } = createBase()
  const sharedExpectation = createTeacherHistoryExpectation(history)

  const first = correction({
    history,
    expectation: sharedExpectation,
    suffix: '02',
    value: 'C#4',
  })
  const second = correction({
    history: first.history,
    expectation: sharedExpectation,
    suffix: '03',
    value: 'E4',
  })

  assert.equal(first.status, TEACHER_CONCURRENCY_STATUS.APPLIED)
  assert.equal(second.status, TEACHER_CONCURRENCY_STATUS.CONFLICT)
  assert.equal(second.conflictReason, TEACHER_CONCURRENCY_CONFLICT.STALE_HISTORY)
  assert.equal(second.history, first.history)
  assert.equal(second.revision, null)
  assert.equal(second.auditEvent, null)
  assert.equal(second.approval, null)
  assert.equal(first.history.revisions.length, 2)
  assert.equal(first.history.correctionAuditEvents.length, 1)
  assert.deepEqual(second.expectation, createTeacherHistoryExpectation(first.history))
})

test('approval-only history change makes an older expectation stale even though current revision is unchanged', () => {
  const { automaticRevision, history } = createBase()
  const expectationBeforeApproval = createTeacherHistoryExpectation(history)
  const approval = createTeacherApprovalRecord({
    approvalId: 'approval-1',
    actorId: 'teacher-1',
    revision: automaticRevision,
    createdAt: '2026-08-28T12:00:00Z',
  })

  const approvalResult = appendTeacherApprovalWithExpectation({
    history,
    expectation: expectationBeforeApproval,
    approval,
  })
  assert.equal(approvalResult.status, TEACHER_CONCURRENCY_STATUS.APPLIED)
  assert.equal(approvalResult.history.revisions.at(-1), automaticRevision)

  const staleCorrection = correction({
    history: approvalResult.history,
    expectation: expectationBeforeApproval,
    suffix: '04',
    value: 'C#4',
  })

  assert.equal(staleCorrection.status, TEACHER_CONCURRENCY_STATUS.CONFLICT)
  assert.equal(
    staleCorrection.conflictReason,
    TEACHER_CONCURRENCY_CONFLICT.STALE_HISTORY,
  )
  assert.equal(staleCorrection.history.revisions.length, 1)
  assert.equal(staleCorrection.history.approvalRecords.length, 1)
})

test('full history fingerprint detects different valid approval evidence even with identical counts and current revision', () => {
  const { automaticRevision, history } = createBase()
  const baseExpectation = createTeacherHistoryExpectation(history)
  const approvalA = createTeacherApprovalRecord({
    approvalId: 'approval-a',
    actorId: 'teacher-a',
    revision: automaticRevision,
    createdAt: '2026-08-28T12:01:00Z',
  })
  const approvalB = createTeacherApprovalRecord({
    approvalId: 'approval-b',
    actorId: 'teacher-b',
    revision: automaticRevision,
    createdAt: '2026-08-28T12:02:00Z',
  })

  const historyA = appendTeacherApprovalWithExpectation({
    history,
    expectation: baseExpectation,
    approval: approvalA,
  }).history
  const historyB = appendTeacherApprovalWithExpectation({
    history,
    expectation: baseExpectation,
    approval: approvalB,
  }).history

  const expectationA = createTeacherHistoryExpectation(historyA)
  const expectationB = createTeacherHistoryExpectation(historyB)
  assert.equal(expectationA.approvalCount, expectationB.approvalCount)
  assert.equal(expectationA.currentRevisionId, expectationB.currentRevisionId)
  assert.notEqual(expectationA.historyStateFingerprint, expectationB.historyStateFingerprint)

  const evaluation = evaluateTeacherHistoryExpectation({
    history: historyB,
    expectation: expectationA,
  })
  assert.equal(evaluation.status, TEACHER_CONCURRENCY_STATUS.CONFLICT)
  assert.equal(evaluation.conflictReason, TEACHER_CONCURRENCY_CONFLICT.STALE_HISTORY)
})

test('undo changes history state and makes the pre-undo expectation stale', () => {
  const { history } = createBase()
  const r1 = correction({
    history,
    expectation: createTeacherHistoryExpectation(history),
    suffix: '05',
    value: 'C#4',
  })
  const r2 = correction({
    history: r1.history,
    expectation: r1.expectation,
    suffix: '06',
    value: 'E4',
  })
  const preUndoExpectation = r2.expectation

  const undo = undoTeacherRevisionHistoryWithExpectation({
    history: r2.history,
    expectation: preUndoExpectation,
    targetRevisionId: r1.revision.revisionId,
    revisionId: 'revision-undo-1',
    eventId: 'event-undo-1',
    actorId: 'teacher-1',
    createdAt: '2026-08-28T13:00:00Z',
  })
  assert.equal(undo.status, TEACHER_CONCURRENCY_STATUS.APPLIED)

  const stale = correction({
    history: undo.history,
    expectation: preUndoExpectation,
    suffix: '07',
    value: 'F4',
  })
  assert.equal(stale.status, TEACHER_CONCURRENCY_STATUS.CONFLICT)
  assert.equal(stale.conflictReason, TEACHER_CONCURRENCY_CONFLICT.STALE_HISTORY)
})

test('restored same content remains concurrency-distinct because history and recursive lineage changed', () => {
  const { history } = createBase()
  const r1 = correction({
    history,
    expectation: createTeacherHistoryExpectation(history),
    suffix: '08',
    value: 'C#4',
  })
  const r2 = correction({
    history: r1.history,
    expectation: r1.expectation,
    suffix: '09',
    value: 'E4',
  })
  const beforeUndo = r2.expectation
  const undo = undoTeacherRevisionHistoryWithExpectation({
    history: r2.history,
    expectation: beforeUndo,
    targetRevisionId: r1.revision.revisionId,
    revisionId: 'revision-undo-2',
    eventId: 'event-undo-2',
    actorId: 'teacher-1',
    createdAt: '2026-08-28T13:01:00Z',
  })

  assert.equal(undo.revision.contentFingerprint, r1.revision.contentFingerprint)
  assert.notEqual(undo.revision.lineageFingerprint, r1.revision.lineageFingerprint)
  assert.notEqual(undo.expectation.historyStateFingerprint, beforeUndo.historyStateFingerprint)
  assert.notEqual(undo.expectation.currentLineageFingerprint, beforeUndo.currentLineageFingerprint)
})

test('history identity and source mismatch return explicit conflicts instead of applying mutation', () => {
  const first = createBase({ historyId: 'history-a', sourceId: 'score-a' })
  const secondHistoryId = createBase({ historyId: 'history-b', sourceId: 'score-a' })
  const secondSource = createBase({ historyId: 'history-a', sourceId: 'score-b' })
  const expectation = createTeacherHistoryExpectation(first.history)

  const historyMismatch = evaluateTeacherHistoryExpectation({
    history: secondHistoryId.history,
    expectation,
  })
  assert.equal(historyMismatch.status, TEACHER_CONCURRENCY_STATUS.CONFLICT)
  assert.equal(
    historyMismatch.conflictReason,
    TEACHER_CONCURRENCY_CONFLICT.HISTORY_MISMATCH,
  )

  const sourceMismatch = evaluateTeacherHistoryExpectation({
    history: secondSource.history,
    expectation,
  })
  assert.equal(sourceMismatch.status, TEACHER_CONCURRENCY_STATUS.CONFLICT)
  assert.equal(
    sourceMismatch.conflictReason,
    TEACHER_CONCURRENCY_CONFLICT.SOURCE_MISMATCH,
  )
})

test('malformed, mutable, injected, or forged expectations fail closed', () => {
  const { history } = createBase()
  const expectation = createTeacherHistoryExpectation(history)

  assert.equal(isTeacherHistoryExpectation({ ...expectation }), false)
  assert.equal(
    isTeacherHistoryExpectation(Object.freeze({ ...expectation, extra: true })),
    false,
  )
  assert.equal(
    isTeacherHistoryExpectation(
      Object.freeze({ ...expectation, historyStateFingerprint: 'fake' }),
    ),
    false,
  )

  const accessor = {}
  for (const [key, value] of Object.entries(expectation)) {
    Object.defineProperty(accessor, key, {
      enumerable: true,
      configurable: false,
      get: () => value,
    })
  }
  Object.freeze(accessor)
  assert.equal(isTeacherHistoryExpectation(accessor), false)

  assert.throws(
    () => evaluateTeacherHistoryExpectation({ history, expectation: { ...expectation } }),
    /valid immutable teacher history expectation/,
  )
})

test('fresh guarded mutation requires caller-supplied audit and revision identity; T5 invents none', () => {
  const { history } = createBase()
  const expectation = createTeacherHistoryExpectation(history)

  assert.throws(
    () =>
      applyTeacherCorrectionWithExpectation({
        history,
        expectation,
        operations: [
          {
            operationId: 'operation-missing-ids',
            kind: 'replace_value',
            path: ['notes', 0, 'pitch'],
            value: 'C#4',
          },
        ],
      }),
    /eventId|actorId|revisionId/,
  )
})

test('T5 source stays isolated from persistence, backend, UI, OMR/Audiveris, and deployment wiring', () => {
  const source = readFileSync(
    new URL('../src/services/teacherRevisionConcurrency.js', import.meta.url),
    'utf8',
  )

  assert.equal(source.includes("from '../../backend"), false)
  assert.equal(source.includes("from '../backend"), false)
  assert.equal(source.includes('AudiverisProvider'), false)
  assert.equal(source.includes('render.yaml'), false)
  assert.equal(source.includes('Dockerfile'), false)
  assert.equal(source.includes('document.querySelector'), false)
  assert.equal(source.includes('localStorage'), false)
  assert.equal(source.includes('fetch('), false)
  assert.equal(source.includes('Date.now('), false)
  assert.equal(source.includes('crypto.randomUUID'), false)
})
