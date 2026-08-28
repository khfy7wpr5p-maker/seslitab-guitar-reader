import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createAutomaticRevision,
  createTeacherCorrectedRevision,
} from '../src/services/teacherRevisionModel.js'
import {
  TEACHER_CORRECTION_OPERATION_KIND,
  applyTeacherCorrectionBatch,
} from '../src/services/teacherCorrectionOperations.js'
import {
  TEACHER_APPROVAL_APPLICABILITY,
  createTeacherApprovalRecord,
  evaluateTeacherApprovalForRevision,
} from '../src/services/teacherApprovalModel.js'
import {
  TEACHER_HISTORY_SCHEMA_VERSION,
  TEACHER_UNDO_AUDIT_EVENT_TYPE,
  TEACHER_UNDO_SCHEMA_VERSION,
  appendTeacherApprovalToHistory,
  appendTeacherCorrectionToHistory,
  createTeacherRevisionHistory,
  getCurrentTeacherRevision,
  getTeacherRevisionFromHistory,
  isTeacherRevisionHistory,
  isTeacherUndoAuditEvent,
  undoTeacherRevisionHistory,
} from '../src/services/teacherRevisionHistory.js'

function automaticRevision({
  revisionId = 'auto-1',
  sourceId = 'score-1',
  createdAt = '2026-08-28T10:00:00Z',
} = {}) {
  return createAutomaticRevision({
    revisionId,
    sourceId,
    createdAt,
    content: {
      title: 'Etude',
      notes: [
        { pitch: 'C4', duration: 1 },
        { pitch: 'D4', duration: 1 },
      ],
    },
  })
}

function correction({
  parentRevision,
  revisionId,
  eventId,
  operationId,
  path,
  value,
  createdAt,
} = {}) {
  return applyTeacherCorrectionBatch({
    eventId,
    actorId: 'teacher-1',
    revisionId,
    parentRevision,
    createdAt,
    operations: [
      {
        operationId,
        kind: TEACHER_CORRECTION_OPERATION_KIND.REPLACE_VALUE,
        path,
        value,
      },
    ],
  })
}

function historyWithTwoCorrectionsAndApproval() {
  const automatic = automaticRevision()
  let history = createTeacherRevisionHistory({
    historyId: 'history-1',
    automaticRevision: automatic,
    createdAt: '2026-08-28T10:00:01Z',
  })

  const first = correction({
    parentRevision: automatic,
    revisionId: 'rev-1',
    eventId: 'correction-1',
    operationId: 'op-1',
    path: ['notes', 0, 'pitch'],
    value: 'E4',
    createdAt: '2026-08-28T10:01:00Z',
  })
  history = appendTeacherCorrectionToHistory({
    history,
    revision: first.revision,
    auditEvent: first.auditEvent,
  })

  const approval = createTeacherApprovalRecord({
    approvalId: 'approval-1',
    actorId: 'teacher-1',
    revision: first.revision,
    createdAt: '2026-08-28T10:01:30Z',
  })
  history = appendTeacherApprovalToHistory({ history, approval })

  const second = correction({
    parentRevision: first.revision,
    revisionId: 'rev-2',
    eventId: 'correction-2',
    operationId: 'op-2',
    path: ['notes', 1, 'duration'],
    value: 2,
    createdAt: '2026-08-28T10:02:00Z',
  })
  history = appendTeacherCorrectionToHistory({
    history,
    revision: second.revision,
    auditEvent: second.auditEvent,
  })

  return { automatic, first, second, approval, history }
}

test('Package 8-T4 exports explicit immutable history and undo vocabulary', () => {
  assert.equal(TEACHER_HISTORY_SCHEMA_VERSION, 1)
  assert.equal(TEACHER_UNDO_SCHEMA_VERSION, 1)
  assert.equal(TEACHER_UNDO_AUDIT_EVENT_TYPE, 'teacher_undo')
})

test('creates an immutable history rooted in the exact automatic revision', () => {
  const automatic = automaticRevision()
  const history = createTeacherRevisionHistory({
    historyId: 'history-1',
    automaticRevision: automatic,
    createdAt: '2026-08-28T10:00:01Z',
  })

  assert.equal(isTeacherRevisionHistory(history), true)
  assert.equal(Object.isFrozen(history), true)
  assert.equal(Object.isFrozen(history.revisions), true)
  assert.equal(Object.isFrozen(history.correctionAuditEvents), true)
  assert.equal(Object.isFrozen(history.undoAuditEvents), true)
  assert.equal(Object.isFrozen(history.approvalRecords), true)
  assert.equal(history.revisions.length, 1)
  assert.equal(history.revisions[0], automatic)
  assert.equal(getCurrentTeacherRevision(history), automatic)
})

test('appends an exact T2 correction without rewriting the prior history snapshot', () => {
  const automatic = automaticRevision()
  const originalHistory = createTeacherRevisionHistory({
    historyId: 'history-1',
    automaticRevision: automatic,
  })
  const result = correction({
    parentRevision: automatic,
    revisionId: 'rev-1',
    eventId: 'correction-1',
    operationId: 'op-1',
    path: ['notes', 0, 'pitch'],
    value: 'E4',
    createdAt: '2026-08-28T10:01:00Z',
  })

  const nextHistory = appendTeacherCorrectionToHistory({
    history: originalHistory,
    revision: result.revision,
    auditEvent: result.auditEvent,
  })

  assert.equal(originalHistory.revisions.length, 1)
  assert.equal(originalHistory.correctionAuditEvents.length, 0)
  assert.equal(nextHistory.revisions.length, 2)
  assert.equal(nextHistory.revisions[0], automatic)
  assert.equal(nextHistory.revisions[1], result.revision)
  assert.equal(nextHistory.correctionAuditEvents[0], result.auditEvent)
  assert.equal(getCurrentTeacherRevision(nextHistory), result.revision)
  assert.equal(isTeacherRevisionHistory(nextHistory), true)
})

test('preserves historical T3 approval evidence after later corrections', () => {
  const { first, second, approval, history } = historyWithTwoCorrectionsAndApproval()

  assert.equal(history.approvalRecords.length, 1)
  assert.equal(history.approvalRecords[0], approval)
  assert.equal(
    evaluateTeacherApprovalForRevision({ approval, revision: first.revision }),
    TEACHER_APPROVAL_APPLICABILITY.APPROVED_EXACT_REVISION,
  )
  assert.equal(
    evaluateTeacherApprovalForRevision({ approval, revision: second.revision }),
    TEACHER_APPROVAL_APPLICABILITY.NOT_APPLICABLE_TO_REVISION,
  )
  assert.equal(isTeacherRevisionHistory(history), true)
})

test('undo creates a new immutable revision instead of deleting or rewriting history', () => {
  const { first, second, approval, history } = historyWithTwoCorrectionsAndApproval()

  const undo = undoTeacherRevisionHistory({
    history,
    targetRevisionId: first.revision.revisionId,
    revisionId: 'rev-3',
    eventId: 'undo-1',
    actorId: 'teacher-1',
    createdAt: '2026-08-28T10:03:00Z',
  })

  assert.equal(history.revisions.length, 3)
  assert.equal(undo.history.revisions.length, 4)
  assert.equal(undo.history.revisions[0], history.revisions[0])
  assert.equal(undo.history.revisions[1], first.revision)
  assert.equal(undo.history.revisions[2], second.revision)
  assert.equal(undo.history.revisions[3], undo.revision)
  assert.equal(undo.history.approvalRecords[0], approval)
  assert.equal(undo.history.undoAuditEvents[0], undo.auditEvent)
  assert.equal(Object.isFrozen(undo.revision), true)
  assert.equal(Object.isFrozen(undo.auditEvent), true)
  assert.equal(isTeacherUndoAuditEvent(undo.auditEvent), true)
  assert.equal(isTeacherRevisionHistory(undo.history), true)
})

test('undo restores exact historical content but receives new recursive lineage', () => {
  const { first, history } = historyWithTwoCorrectionsAndApproval()
  const undo = undoTeacherRevisionHistory({
    history,
    targetRevisionId: first.revision.revisionId,
    revisionId: 'rev-3',
    eventId: 'undo-1',
    actorId: 'teacher-1',
    createdAt: '2026-08-28T10:03:00Z',
  })

  assert.deepEqual(undo.revision.content, first.revision.content)
  assert.equal(undo.revision.contentFingerprint, first.revision.contentFingerprint)
  assert.notEqual(undo.revision.lineageFingerprint, first.revision.lineageFingerprint)
  assert.equal(undo.revision.parentRevisionId, 'rev-2')
  assert.equal(undo.auditEvent.targetRevisionId, first.revision.revisionId)
  assert.equal(undo.auditEvent.targetLineageFingerprint, first.revision.lineageFingerprint)
  assert.equal(undo.auditEvent.resultLineageFingerprint, undo.revision.lineageFingerprint)
})

test('undo never silently resurrects approval for the restored historical content', () => {
  const { first, approval, history } = historyWithTwoCorrectionsAndApproval()
  const undo = undoTeacherRevisionHistory({
    history,
    targetRevisionId: first.revision.revisionId,
    revisionId: 'rev-3',
    eventId: 'undo-1',
    actorId: 'teacher-1',
    createdAt: '2026-08-28T10:03:00Z',
  })

  assert.equal(
    evaluateTeacherApprovalForRevision({ approval, revision: undo.revision }),
    TEACHER_APPROVAL_APPLICABILITY.NOT_APPLICABLE_TO_REVISION,
  )
  assert.equal(undo.history.approvalRecords[0], approval)
})

test('revision lookup returns exact preserved references and null for unknown IDs', () => {
  const { first, history } = historyWithTwoCorrectionsAndApproval()
  assert.equal(
    getTeacherRevisionFromHistory({ history, revisionId: 'rev-1' }),
    first.revision,
  )
  assert.equal(
    getTeacherRevisionFromHistory({ history, revisionId: 'does-not-exist' }),
    null,
  )
})

test('rejects non-linear correction append and ancestor revisionId reuse', () => {
  const { automatic, first, second, history } = historyWithTwoCorrectionsAndApproval()

  const stale = correction({
    parentRevision: first.revision,
    revisionId: 'stale-child',
    eventId: 'stale-event',
    operationId: 'stale-op',
    path: ['title'],
    value: 'Stale edit',
    createdAt: '2026-08-28T10:04:00Z',
  })
  assert.throws(
    () =>
      appendTeacherCorrectionToHistory({
        history,
        revision: stale.revision,
        auditEvent: stale.auditEvent,
      }),
    /exact current history revision/,
  )

  const reusedId = createTeacherCorrectedRevision({
    revisionId: first.revision.revisionId,
    parentRevision: second.revision,
    content: { ...second.revision.content, title: 'Replay' },
    createdAt: '2026-08-28T10:05:00Z',
  })
  assert.throws(
    () =>
      appendTeacherCorrectionToHistory({
        history,
        revision: reusedId,
        auditEvent: stale.auditEvent,
      }),
    /Duplicate revisionId/,
  )

  assert.equal(automatic.content.title, 'Etude')
})

test('rejects correction evidence that does not bind the exact parent and result', () => {
  const automatic = automaticRevision()
  const history = createTeacherRevisionHistory({
    historyId: 'history-1',
    automaticRevision: automatic,
  })
  const first = correction({
    parentRevision: automatic,
    revisionId: 'rev-1',
    eventId: 'correction-1',
    operationId: 'op-1',
    path: ['notes', 0, 'pitch'],
    value: 'E4',
  })
  const other = correction({
    parentRevision: automatic,
    revisionId: 'rev-other',
    eventId: 'correction-other',
    operationId: 'op-other',
    path: ['notes', 1, 'pitch'],
    value: 'F4',
  })

  assert.throws(
    () =>
      appendTeacherCorrectionToHistory({
        history,
        revision: first.revision,
        auditEvent: other.auditEvent,
      }),
    /does not bind the exact history transition/,
  )
})

test('rejects duplicate correction/undo event IDs and duplicate approval IDs', () => {
  const { first, approval, history } = historyWithTwoCorrectionsAndApproval()

  assert.throws(
    () => appendTeacherApprovalToHistory({ history, approval }),
    /Duplicate approvalId/,
  )

  assert.throws(
    () =>
      undoTeacherRevisionHistory({
        history,
        targetRevisionId: first.revision.revisionId,
        revisionId: 'rev-3',
        eventId: 'correction-1',
        actorId: 'teacher-1',
      }),
    /Duplicate teacher history eventId/,
  )
})

test('rejects missing, current, and no-op undo targets', () => {
  const { second, history } = historyWithTwoCorrectionsAndApproval()

  assert.throws(
    () =>
      undoTeacherRevisionHistory({
        history,
        targetRevisionId: 'missing',
        revisionId: 'rev-3',
        eventId: 'undo-1',
        actorId: 'teacher-1',
      }),
    /not preserved/,
  )
  assert.throws(
    () =>
      undoTeacherRevisionHistory({
        history,
        targetRevisionId: second.revision.revisionId,
        revisionId: 'rev-3',
        eventId: 'undo-1',
        actorId: 'teacher-1',
      }),
    /earlier preserved revision/,
  )

  const automatic = automaticRevision({ revisionId: 'same-auto' })
  let sameHistory = createTeacherRevisionHistory({
    historyId: 'same-history',
    automaticRevision: automatic,
  })
  const away = correction({
    parentRevision: automatic,
    revisionId: 'same-r1',
    eventId: 'same-e1',
    operationId: 'same-op1',
    path: ['title'],
    value: 'Changed',
  })
  sameHistory = appendTeacherCorrectionToHistory({
    history: sameHistory,
    revision: away.revision,
    auditEvent: away.auditEvent,
  })
  const back = correction({
    parentRevision: away.revision,
    revisionId: 'same-r2',
    eventId: 'same-e2',
    operationId: 'same-op2',
    path: ['title'],
    value: 'Etude',
  })
  sameHistory = appendTeacherCorrectionToHistory({
    history: sameHistory,
    revision: back.revision,
    auditEvent: back.auditEvent,
  })

  assert.throws(
    () =>
      undoTeacherRevisionHistory({
        history: sameHistory,
        targetRevisionId: automatic.revisionId,
        revisionId: 'same-r3',
        eventId: 'same-undo',
        actorId: 'teacher-1',
      }),
    /same content/,
  )
})

test('history validator fails closed for mutable, injected, or broken evidence', () => {
  const { history } = historyWithTwoCorrectionsAndApproval()

  assert.equal(isTeacherRevisionHistory({ ...history }), false)
  assert.equal(isTeacherRevisionHistory(Object.freeze({ ...history, extra: true })), false)
  assert.equal(
    isTeacherRevisionHistory(
      Object.freeze({
        ...history,
        revisions: [...history.revisions],
      }),
    ),
    false,
  )

  const forgedAudit = Object.freeze({
    ...history.correctionAuditEvents[0],
    resultContentFingerprint: 'fnv1a64-v1:forged:1',
  })
  const forgedHistory = Object.freeze({
    ...history,
    correctionAuditEvents: Object.freeze([
      forgedAudit,
      history.correctionAuditEvents[1],
    ]),
  })
  assert.equal(isTeacherRevisionHistory(forgedHistory), false)
})

test('history validator rejects a forged undo binding even when the undo record shape is valid', () => {
  const { first, history } = historyWithTwoCorrectionsAndApproval()
  const undo = undoTeacherRevisionHistory({
    history,
    targetRevisionId: first.revision.revisionId,
    revisionId: 'rev-3',
    eventId: 'undo-1',
    actorId: 'teacher-1',
  })
  const forgedAudit = Object.freeze({
    ...undo.auditEvent,
    targetLineageFingerprint: history.revisions[0].lineageFingerprint,
  })
  assert.equal(isTeacherUndoAuditEvent(forgedAudit), true)
  const forgedHistory = Object.freeze({
    ...undo.history,
    undoAuditEvents: Object.freeze([forgedAudit]),
  })
  assert.equal(isTeacherRevisionHistory(forgedHistory), false)
})

test('history rejects approval from another source or for a revision not preserved in history', () => {
  const automatic = automaticRevision()
  const history = createTeacherRevisionHistory({
    historyId: 'history-1',
    automaticRevision: automatic,
  })
  const foreign = automaticRevision({ revisionId: 'foreign-auto', sourceId: 'score-2' })
  const foreignApproval = createTeacherApprovalRecord({
    approvalId: 'foreign-approval',
    actorId: 'teacher-1',
    revision: foreign,
  })
  assert.throws(
    () => appendTeacherApprovalToHistory({ history, approval: foreignApproval }),
    /different teacher history source/,
  )

  const child = createTeacherCorrectedRevision({
    revisionId: 'unrecorded-child',
    parentRevision: automatic,
    content: { ...automatic.content, title: 'Unrecorded' },
  })
  const unrecordedApproval = createTeacherApprovalRecord({
    approvalId: 'unrecorded-approval',
    actorId: 'teacher-1',
    revision: child,
  })
  assert.throws(
    () => appendTeacherApprovalToHistory({ history, approval: unrecordedApproval }),
    /not preserved/,
  )
})

test('T4 does not invent history, undo, actor, revision, or timestamp identity', () => {
  const automatic = automaticRevision()
  assert.throws(
    () => createTeacherRevisionHistory({ automaticRevision: automatic }),
    /historyId/,
  )

  const history = createTeacherRevisionHistory({
    historyId: 'history-1',
    automaticRevision: automatic,
  })
  assert.equal(history.createdAt, null)
  assert.throws(
    () =>
      undoTeacherRevisionHistory({
        history,
        targetRevisionId: automatic.revisionId,
      }),
    /eventId|revisionId|earlier preserved revision/,
  )
})

test('T4 source remains isolated from persistence, OMR, Audiveris, deployment, UI, and concurrency wiring', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(
    new URL('../src/services/teacherRevisionHistory.js', import.meta.url),
    'utf8',
  )

  for (const forbidden of [
    "from 'node:fs'",
    'backend/',
    'AudiverisProvider',
    'OMR_PROVIDER',
    'render.yaml',
    'Dockerfile',
    'fetch(',
    'localStorage',
    'document.',
    'expectedRevisionId',
    'versionConflict',
  ]) {
    assert.equal(source.includes(forbidden), false, `unexpected T4 boundary token: ${forbidden}`)
  }
})
