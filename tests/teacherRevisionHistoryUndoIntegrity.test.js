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
  TEACHER_HISTORY_SCHEMA_VERSION,
  TEACHER_UNDO_AUDIT_EVENT_TYPE,
  TEACHER_UNDO_SCHEMA_VERSION,
  isTeacherRevisionHistory,
  isTeacherUndoAuditEvent,
} from '../src/services/teacherRevisionHistory.js'

test('Package 8-T4 review regression: reconstructed history cannot undo to its current parent', () => {
  const automatic = createAutomaticRevision({
    revisionId: 'auto-undo-integrity',
    sourceId: 'score-undo-integrity',
    content: { title: 'Original' },
  })

  const correction = applyTeacherCorrectionBatch({
    eventId: 'correction-undo-integrity',
    actorId: 'teacher-1',
    revisionId: 'rev-undo-parent',
    parentRevision: automatic,
    operations: [
      {
        operationId: 'op-undo-integrity',
        kind: TEACHER_CORRECTION_OPERATION_KIND.REPLACE_VALUE,
        path: ['title'],
        value: 'Changed',
      },
    ],
  })

  const impossibleUndoResult = createTeacherCorrectedRevision({
    revisionId: 'rev-impossible-undo',
    parentRevision: correction.revision,
    content: correction.revision.content,
  })

  const forgedUndo = Object.freeze({
    schemaVersion: TEACHER_UNDO_SCHEMA_VERSION,
    eventType: TEACHER_UNDO_AUDIT_EVENT_TYPE,
    eventId: 'undo-impossible',
    actorId: 'teacher-1',
    sourceId: automatic.sourceId,
    sourceRevisionId: automatic.sourceRevisionId,
    parentRevisionId: correction.revision.revisionId,
    parentContentFingerprint: correction.revision.contentFingerprint,
    parentLineageFingerprint: correction.revision.lineageFingerprint,
    targetRevisionId: correction.revision.revisionId,
    targetContentFingerprint: correction.revision.contentFingerprint,
    targetLineageFingerprint: correction.revision.lineageFingerprint,
    resultRevisionId: impossibleUndoResult.revisionId,
    resultContentFingerprint: impossibleUndoResult.contentFingerprint,
    resultLineageFingerprint: impossibleUndoResult.lineageFingerprint,
    createdAt: null,
  })

  const forgedHistory = Object.freeze({
    schemaVersion: TEACHER_HISTORY_SCHEMA_VERSION,
    historyId: 'history-undo-integrity',
    sourceId: automatic.sourceId,
    sourceRevisionId: automatic.sourceRevisionId,
    createdAt: null,
    revisions: Object.freeze([automatic, correction.revision, impossibleUndoResult]),
    correctionAuditEvents: Object.freeze([correction.auditEvent]),
    undoAuditEvents: Object.freeze([forgedUndo]),
    approvalRecords: Object.freeze([]),
  })

  assert.equal(isTeacherUndoAuditEvent(forgedUndo), true)
  assert.equal(isTeacherRevisionHistory(forgedHistory), false)
})
