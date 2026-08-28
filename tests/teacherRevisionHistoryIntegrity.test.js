import test from 'node:test'
import assert from 'node:assert/strict'

import { createAutomaticRevision } from '../src/services/teacherRevisionModel.js'
import {
  TEACHER_CORRECTION_OPERATION_KIND,
  applyTeacherCorrectionBatch,
  isTeacherCorrectionAuditEvent,
} from '../src/services/teacherCorrectionOperations.js'
import {
  appendTeacherCorrectionToHistory,
  createTeacherRevisionHistory,
} from '../src/services/teacherRevisionHistory.js'

test('Package 8-T4 review regression: shape-valid forged correction audit semantics are rejected', () => {
  const automatic = createAutomaticRevision({
    revisionId: 'auto-integrity',
    sourceId: 'score-integrity',
    createdAt: '2026-08-28T10:00:00Z',
    content: {
      notes: [
        { pitch: 'C4', duration: 1 },
        { pitch: 'D4', duration: 1 },
      ],
    },
  })

  const history = createTeacherRevisionHistory({
    historyId: 'history-integrity',
    automaticRevision: automatic,
  })

  const correction = applyTeacherCorrectionBatch({
    eventId: 'correction-integrity',
    actorId: 'teacher-1',
    revisionId: 'rev-integrity',
    parentRevision: automatic,
    createdAt: '2026-08-28T10:01:00Z',
    operations: [
      {
        operationId: 'op-integrity',
        kind: TEACHER_CORRECTION_OPERATION_KIND.REPLACE_VALUE,
        path: ['notes', 0, 'pitch'],
        value: 'E4',
      },
    ],
  })

  // Keep every top-level parent/result identity and fingerprint valid while
  // lying only about the audit operation's observed previous value.
  const forgedOperation = Object.freeze({
    ...correction.auditEvent.operations[0],
    before: 'B4',
  })
  const forgedAuditEvent = Object.freeze({
    ...correction.auditEvent,
    operations: Object.freeze([forgedOperation]),
  })

  assert.equal(isTeacherCorrectionAuditEvent(forgedAuditEvent), true)
  assert.throws(
    () =>
      appendTeacherCorrectionToHistory({
        history,
        revision: correction.revision,
        auditEvent: forgedAuditEvent,
      }),
    /operations do not reproduce the exact history transition/,
  )
})
