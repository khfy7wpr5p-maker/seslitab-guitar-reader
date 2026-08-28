import {
  describe,
  test,
} from 'node:test'

import assert from 'node:assert/strict'

import {
  createAutomaticRevision,
  createTeacherCorrectedRevision,
} from '../src/services/teacherRevisionModel.js'

import {
  TEACHER_CORRECTION_AUDIT_EVENT_TYPE,
  TEACHER_CORRECTION_OPERATION_KIND,
  TEACHER_CORRECTION_SCHEMA_VERSION,
  applyTeacherCorrectionBatch,
  isTeacherCorrectionAuditEvent,
} from '../src/services/teacherCorrectionOperations.js'

function noteSnapshot(midi = 60) {
  return [
    {
      partId: 'P1',
      measureKey: 'P1:m0',
      measureIndex: 0,
      midi,
      beats: 1,
      metadata: {
        source: 'test',
        confidence: 0.7,
      },
    },
    {
      partId: 'P1',
      measureKey: 'P1:m0',
      measureIndex: 0,
      midi: 64,
      beats: 1,
      metadata: {
        source: 'test',
        confidence: 0.8,
      },
    },
  ]
}

function automaticRevision(content = noteSnapshot()) {
  return createAutomaticRevision({
    revisionId: 'auto-1',
    sourceId: 'score-1',
    createdAt: '2026-08-28T09:00:00Z',
    content,
  })
}

function replaceOperation(operationId, path, value) {
  return {
    operationId,
    kind: TEACHER_CORRECTION_OPERATION_KIND.REPLACE_VALUE,
    path,
    value,
  }
}

describe('Package 8-T2 controlled teacher correction operations', () => {
  test('exports a bounded immutable correction vocabulary', () => {
    assert.equal(TEACHER_CORRECTION_SCHEMA_VERSION, 1)
    assert.equal(TEACHER_CORRECTION_AUDIT_EVENT_TYPE, 'teacher_correction')
    assert.equal(Object.isFrozen(TEACHER_CORRECTION_OPERATION_KIND), true)
    assert.deepEqual(TEACHER_CORRECTION_OPERATION_KIND, {
      REPLACE_VALUE: 'replace_value',
    })
  })

  test('replaces an existing leaf without overwriting the automatic parent', () => {
    const parent = automaticRevision()
    const parentBefore = structuredClone(parent)

    const result = applyTeacherCorrectionBatch({
      eventId: 'event-1',
      actorId: 'teacher-1',
      revisionId: 'teacher-rev-1',
      parentRevision: parent,
      createdAt: '2026-08-28T09:05:00Z',
      operations: [
        replaceOperation('op-1', [0, 'midi'], 61),
      ],
    })

    assert.equal(result.revision.revisionId, 'teacher-rev-1')
    assert.equal(result.revision.parentRevisionId, 'auto-1')
    assert.equal(result.revision.sourceRevisionId, 'auto-1')
    assert.equal(result.revision.content[0].midi, 61)
    assert.equal(parent.content[0].midi, 60)
    assert.deepEqual(parent, parentBefore)

    assert.equal(result.auditEvent.parentRevisionId, 'auto-1')
    assert.equal(
      result.auditEvent.parentContentFingerprint,
      parent.contentFingerprint,
    )
    assert.equal(
      result.auditEvent.resultContentFingerprint,
      result.revision.contentFingerprint,
    )
    assert.deepEqual(result.auditEvent.operations[0].before, 60)
    assert.deepEqual(result.auditEvent.operations[0].after, 61)
  })

  test('applies multiple independent replacements deterministically', () => {
    const parent = automaticRevision()

    const first = applyTeacherCorrectionBatch({
      eventId: 'event-a',
      actorId: 'teacher-1',
      revisionId: 'teacher-a',
      parentRevision: parent,
      operations: [
        replaceOperation('op-midi', [0, 'midi'], 62),
        replaceOperation('op-beats', [1, 'beats'], 2),
      ],
    })

    const second = applyTeacherCorrectionBatch({
      eventId: 'event-b',
      actorId: 'teacher-1',
      revisionId: 'teacher-b',
      parentRevision: parent,
      operations: [
        replaceOperation('op-beats-2', [1, 'beats'], 2),
        replaceOperation('op-midi-2', [0, 'midi'], 62),
      ],
    })

    assert.deepEqual(first.revision.content, second.revision.content)
    assert.equal(
      first.revision.contentFingerprint,
      second.revision.contentFingerprint,
    )
    assert.equal(parent.content[0].midi, 60)
    assert.equal(parent.content[1].beats, 1)
  })

  test('creates a new exact child when correcting an already corrected revision', () => {
    const parent = createTeacherCorrectedRevision({
      revisionId: 'teacher-1',
      parentRevision: automaticRevision(),
      content: noteSnapshot(61),
      createdAt: '2026-08-28T09:05:00Z',
    })

    const result = applyTeacherCorrectionBatch({
      eventId: 'event-2',
      actorId: 'teacher-1',
      revisionId: 'teacher-2',
      parentRevision: parent,
      operations: [
        replaceOperation('op-2', [0, 'midi'], 62),
      ],
    })

    assert.equal(result.revision.parentRevisionId, 'teacher-1')
    assert.equal(result.revision.sourceRevisionId, 'auto-1')
    assert.equal(result.revision.sourceId, 'score-1')
    assert.equal(parent.content[0].midi, 61)
    assert.equal(result.revision.content[0].midi, 62)
  })

  test('supports existing array-element replacement without structural insertion', () => {
    const parent = automaticRevision({
      labels: ['automatic', 'review'],
    })

    const result = applyTeacherCorrectionBatch({
      eventId: 'event-array',
      actorId: 'teacher-1',
      revisionId: 'teacher-array',
      parentRevision: parent,
      operations: [
        replaceOperation('op-array', ['labels', 1], 'teacher-corrected'),
      ],
    })

    assert.deepEqual(result.revision.content.labels, [
      'automatic',
      'teacher-corrected',
    ])
    assert.deepEqual(parent.content.labels, ['automatic', 'review'])
  })

  test('rejects missing, out-of-range, type-mismatched, or empty paths', () => {
    const parent = automaticRevision()

    const invalidOperations = [
      replaceOperation('missing-key', [0, 'pitchThatDoesNotExist'], 61),
      replaceOperation('missing-index', [9, 'midi'], 61),
      replaceOperation('array-string-index', ['0', 'midi'], 61),
      replaceOperation('object-number-key', [0, 0], 61),
      replaceOperation('empty-path', [], 61),
      replaceOperation('negative-index', [-1, 'midi'], 61),
      replaceOperation('fractional-index', [0.5, 'midi'], 61),
    ]

    for (const operation of invalidOperations) {
      assert.throws(() =>
        applyTeacherCorrectionBatch({
          eventId: `event-${operation.operationId}`,
          actorId: 'teacher-1',
          revisionId: `revision-${operation.operationId}`,
          parentRevision: parent,
          operations: [operation],
        }),
      )
    }
  })

  test('rejects prototype-related path keys and never pollutes prototypes', () => {
    const parent = automaticRevision({
      safe: {
        value: 1,
      },
      payload: JSON.parse('{"__proto__":{"polluted":false}}'),
    })

    for (const protectedKey of ['__proto__', 'constructor', 'prototype']) {
      assert.throws(
        () =>
          applyTeacherCorrectionBatch({
            eventId: `event-${protectedKey}`,
            actorId: 'teacher-1',
            revisionId: `revision-${protectedKey}`,
            parentRevision: parent,
            operations: [
              replaceOperation('protected-op', ['safe', protectedKey], {
                polluted: true,
              }),
            ],
          }),
        /protected key/,
      )
    }

    assert.throws(
      () =>
        applyTeacherCorrectionBatch({
          eventId: 'event-owned-proto',
          actorId: 'teacher-1',
          revisionId: 'revision-owned-proto',
          parentRevision: parent,
          operations: [
            replaceOperation('owned-proto', ['payload', '__proto__'], {
              polluted: true,
            }),
          ],
        }),
      /protected key/,
    )

    assert.equal({}.polluted, undefined)
    assert.deepEqual(parent.content.payload.__proto__, { polluted: false })
  })

  test('rejects duplicate operation ids and overlapping correction paths', () => {
    const parent = automaticRevision()

    assert.throws(
      () =>
        applyTeacherCorrectionBatch({
          eventId: 'event-duplicate',
          actorId: 'teacher-1',
          revisionId: 'revision-duplicate',
          parentRevision: parent,
          operations: [
            replaceOperation('same-id', [0, 'midi'], 61),
            replaceOperation('same-id', [1, 'midi'], 65),
          ],
        }),
      /Duplicate correction operationId/,
    )

    assert.throws(
      () =>
        applyTeacherCorrectionBatch({
          eventId: 'event-overlap',
          actorId: 'teacher-1',
          revisionId: 'revision-overlap',
          parentRevision: parent,
          operations: [
            replaceOperation('whole-note', [0], {
              ...structuredClone(parent.content[0]),
              midi: 61,
            }),
            replaceOperation('nested-midi', [0, 'midi'], 61),
          ],
        }),
      /independent paths/,
    )

    assert.throws(
      () =>
        applyTeacherCorrectionBatch({
          eventId: 'event-same-path',
          actorId: 'teacher-1',
          revisionId: 'revision-same-path',
          parentRevision: parent,
          operations: [
            replaceOperation('first', [0, 'midi'], 61),
            replaceOperation('second', [0, 'midi'], 62),
          ],
        }),
      /independent paths/,
    )
  })

  test('rejects no-op corrections instead of fabricating an audit change', () => {
    const parent = automaticRevision()

    assert.throws(
      () =>
        applyTeacherCorrectionBatch({
          eventId: 'event-noop',
          actorId: 'teacher-1',
          revisionId: 'revision-noop',
          parentRevision: parent,
          operations: [
            replaceOperation('noop', [0, 'midi'], 60),
          ],
        }),
      /no-op correction/,
    )
  })

  test('fails closed for unsafe replacement values', () => {
    const circular = {}
    circular.self = circular

    const sparse = []
    sparse[1] = 'value'

    const accessor = {}
    Object.defineProperty(accessor, 'midi', {
      enumerable: true,
      get() {
        return 61
      },
    })

    const unsafeValues = [
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      new Date('2026-08-28T00:00:00Z'),
      circular,
      sparse,
      accessor,
    ]

    for (let index = 0; index < unsafeValues.length; index++) {
      assert.throws(() =>
        applyTeacherCorrectionBatch({
          eventId: `event-unsafe-${index}`,
          actorId: 'teacher-1',
          revisionId: `revision-unsafe-${index}`,
          parentRevision: automaticRevision(),
          operations: [
            replaceOperation(`unsafe-${index}`, [0, 'midi'], unsafeValues[index]),
          ],
        }),
      )
    }
  })

  test('rejects operation field injection, accessors, sparse batches, and unsupported kinds', () => {
    const parent = automaticRevision()

    assert.throws(() =>
      applyTeacherCorrectionBatch({
        eventId: 'event-extra',
        actorId: 'teacher-1',
        revisionId: 'revision-extra',
        parentRevision: parent,
        operations: [
          {
            ...replaceOperation('extra', [0, 'midi'], 61),
            teacherApproved: true,
          },
        ],
      }),
    )

    const accessorOperation = {
      operationId: 'accessor',
      kind: 'replace_value',
      path: [0, 'midi'],
    }
    Object.defineProperty(accessorOperation, 'value', {
      enumerable: true,
      get() {
        return 61
      },
    })

    assert.throws(() =>
      applyTeacherCorrectionBatch({
        eventId: 'event-accessor',
        actorId: 'teacher-1',
        revisionId: 'revision-accessor',
        parentRevision: parent,
        operations: [accessorOperation],
      }),
    )

    const sparseBatch = []
    sparseBatch[1] = replaceOperation('sparse', [0, 'midi'], 61)

    assert.throws(() =>
      applyTeacherCorrectionBatch({
        eventId: 'event-sparse',
        actorId: 'teacher-1',
        revisionId: 'revision-sparse',
        parentRevision: parent,
        operations: sparseBatch,
      }),
    )

    assert.throws(() =>
      applyTeacherCorrectionBatch({
        eventId: 'event-kind',
        actorId: 'teacher-1',
        revisionId: 'revision-kind',
        parentRevision: parent,
        operations: [
          {
            operationId: 'delete',
            kind: 'delete',
            path: [0, 'midi'],
            value: null,
          },
        ],
      }),
    )
  })

  test('requires caller-supplied identities and never invents a timestamp', () => {
    const parent = automaticRevision()

    assert.throws(
      () =>
        applyTeacherCorrectionBatch({
          actorId: 'teacher-1',
          revisionId: 'teacher-1',
          parentRevision: parent,
          operations: [replaceOperation('op', [0, 'midi'], 61)],
        }),
      /eventId/,
    )

    assert.throws(
      () =>
        applyTeacherCorrectionBatch({
          eventId: 'event-1',
          revisionId: 'teacher-1',
          parentRevision: parent,
          operations: [replaceOperation('op', [0, 'midi'], 61)],
        }),
      /actorId/,
    )

    assert.throws(
      () =>
        applyTeacherCorrectionBatch({
          eventId: 'event-1',
          actorId: 'teacher-1',
          parentRevision: parent,
          operations: [replaceOperation('op', [0, 'midi'], 61)],
        }),
      /revisionId/,
    )

    const result = applyTeacherCorrectionBatch({
      eventId: ' event-1 ',
      actorId: ' teacher-1 ',
      revisionId: ' teacher-1 ',
      parentRevision: parent,
      operations: [replaceOperation(' op-1 ', [0, 'midi'], 61)],
    })

    assert.equal(result.auditEvent.eventId, 'event-1')
    assert.equal(result.auditEvent.actorId, 'teacher-1')
    assert.equal(result.auditEvent.createdAt, null)
    assert.equal(result.revision.createdAt, null)
    assert.equal(result.revision.revisionId, 'teacher-1')
    assert.equal(result.auditEvent.operations[0].operationId, 'op-1')
  })

  test('returns a strict deeply immutable separate audit event with no approval claim', () => {
    const result = applyTeacherCorrectionBatch({
      eventId: 'event-audit',
      actorId: 'teacher-1',
      revisionId: 'teacher-audit',
      parentRevision: automaticRevision(),
      createdAt: '2026-08-28T09:10:00Z',
      operations: [
        replaceOperation('op-audit', [0, 'metadata', 'confidence'], 0.95),
      ],
    })

    assert.equal(isTeacherCorrectionAuditEvent(result.auditEvent), true)
    assert.equal(Object.isFrozen(result), true)
    assert.equal(Object.isFrozen(result.auditEvent), true)
    assert.equal(Object.isFrozen(result.auditEvent.operations), true)
    assert.equal(Object.isFrozen(result.auditEvent.operations[0]), true)
    assert.equal(Object.isFrozen(result.auditEvent.operations[0].path), true)
    assert.equal('teacherApproved' in result.auditEvent, false)
    assert.equal('approvalId' in result.auditEvent, false)
    assert.equal('teacherApproved' in result.revision, false)
    assert.equal('approvalId' in result.revision, false)

    assert.throws(() => {
      result.auditEvent.operations[0].path[0] = 99
    })
  })

  test('audit-event validator rejects mutable or injected records', () => {
    const { auditEvent } = applyTeacherCorrectionBatch({
      eventId: 'event-valid',
      actorId: 'teacher-1',
      revisionId: 'teacher-valid',
      parentRevision: automaticRevision(),
      operations: [
        replaceOperation('op-valid', [0, 'midi'], 61),
      ],
    })

    assert.equal(isTeacherCorrectionAuditEvent(auditEvent), true)
    assert.equal(
      isTeacherCorrectionAuditEvent(structuredClone(auditEvent)),
      false,
    )
    assert.equal(
      isTeacherCorrectionAuditEvent(
        Object.freeze({
          ...auditEvent,
          teacherApproved: true,
        }),
      ),
      false,
    )
    assert.equal(isTeacherCorrectionAuditEvent(null), false)
  })

  test('rejects an invalid or approval-injected parent revision', () => {
    const parent = automaticRevision()
    const injectedParent = Object.freeze({
      ...parent,
      teacherApproved: true,
    })

    assert.throws(
      () =>
        applyTeacherCorrectionBatch({
          eventId: 'event-invalid-parent',
          actorId: 'teacher-1',
          revisionId: 'teacher-invalid-parent',
          parentRevision: injectedParent,
          operations: [
            replaceOperation('op-invalid-parent', [0, 'midi'], 61),
          ],
        }),
      /valid immutable teacher revision/,
    )
  })
})
