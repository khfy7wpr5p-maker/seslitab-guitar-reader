import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createAutomaticRevision } from '../src/services/teacherRevisionModel.js'
import {
  applyTeacherCorrectionBatch,
  isTeacherCorrectionAuditEvent,
} from '../src/services/teacherCorrectionOperations.js'

function parentRevision() {
  return createAutomaticRevision({
    revisionId: 'auto-review',
    sourceId: 'score-review',
    createdAt: null,
    content: [{ midi: 60 }],
  })
}

function replace(operationId, path, value) {
  return {
    operationId,
    kind: 'replace_value',
    path,
    value,
  }
}

function deeplyFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deeplyFreeze(child)
  return Object.freeze(value)
}

test('Package 8-T2 review regression: -0 and 0 are one array target', () => {
  assert.throws(
    () =>
      applyTeacherCorrectionBatch({
        eventId: 'event-negative-zero',
        actorId: 'teacher-1',
        revisionId: 'teacher-negative-zero',
        parentRevision: parentRevision(),
        operations: [
          replace('negative-zero', [-0, 'midi'], 61),
          replace('zero', [0, 'midi'], 62),
        ],
      }),
    /independent paths/,
  )
})

test('Package 8-T2 review regression: audit validator rejects unsupported primitive values', () => {
  const { auditEvent } = applyTeacherCorrectionBatch({
    eventId: 'event-audit-base',
    actorId: 'teacher-1',
    revisionId: 'teacher-audit-base',
    parentRevision: parentRevision(),
    operations: [replace('replace-midi', [0, 'midi'], 61)],
  })

  const unsupportedValues = [
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    1n,
    Symbol('unsafe'),
    () => 61,
  ]

  for (const unsupported of unsupportedValues) {
    const forged = {
      ...auditEvent,
      operations: [
        {
          ...auditEvent.operations[0],
          after: unsupported,
        },
      ],
    }
    deeplyFreeze(forged)
    assert.equal(isTeacherCorrectionAuditEvent(forged), false)
  }
})
