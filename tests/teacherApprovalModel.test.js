import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  createAutomaticRevision,
  createTeacherCorrectedRevision,
} from '../src/services/teacherRevisionModel.js'
import { applyTeacherCorrectionBatch } from '../src/services/teacherCorrectionOperations.js'
import {
  TEACHER_APPROVAL_APPLICABILITY,
  TEACHER_APPROVAL_SCHEMA_VERSION,
  TEACHER_APPROVAL_STATE,
  createTeacherApprovalRecord,
  evaluateTeacherApprovalForRevision,
  isTeacherApprovalRecord,
} from '../src/services/teacherApprovalModel.js'

function automatic({ revisionId = 'auto-1', sourceId = 'score-1', midi = 60 } = {}) {
  return createAutomaticRevision({
    revisionId,
    sourceId,
    createdAt: '2026-08-28T10:00:00Z',
    content: [{ midi, beats: 1 }],
  })
}

function corrected(parent = automatic(), revisionId = 'teacher-1', midi = 61) {
  return createTeacherCorrectedRevision({
    revisionId,
    parentRevision: parent,
    createdAt: '2026-08-28T10:05:00Z',
    content: [{ midi, beats: 1 }],
  })
}

function approve(revision, overrides = {}) {
  return createTeacherApprovalRecord({
    approvalId: 'approval-1',
    actorId: 'teacher-1',
    revision,
    createdAt: '2026-08-28T10:10:00Z',
    ...overrides,
  })
}

describe('Package 8-T3 exact-revision teacher approval binding', () => {
  test('exports explicit immutable approval/applicability vocabulary', () => {
    assert.equal(TEACHER_APPROVAL_SCHEMA_VERSION, 2)
    assert.equal(TEACHER_APPROVAL_STATE, 'teacher_approved')
    assert.equal(Object.isFrozen(TEACHER_APPROVAL_APPLICABILITY), true)
    assert.deepEqual(TEACHER_APPROVAL_APPLICABILITY, {
      APPROVED_EXACT_REVISION: 'approved_exact_revision',
      NOT_APPLICABLE_TO_REVISION: 'not_applicable_to_revision',
    })
  })

  test('creates a strict immutable approval bound to the full exact corrected revision identity', () => {
    const revision = corrected()
    const revisionBefore = structuredClone(revision)
    const approval = approve(revision)

    assert.equal(Object.isFrozen(approval), true)
    assert.equal(isTeacherApprovalRecord(approval), true)
    assert.equal(approval.approvalState, 'teacher_approved')
    assert.equal(approval.sourceId, revision.sourceId)
    assert.equal(approval.sourceRevisionId, revision.sourceRevisionId)
    assert.equal(approval.approvedRevisionId, revision.revisionId)
    assert.equal(approval.approvedRevisionKind, revision.revisionKind)
    assert.equal(approval.approvedParentRevisionId, revision.parentRevisionId)
    assert.equal(approval.approvedRevisionCreatedAt, revision.createdAt)
    assert.equal(
      approval.approvedContentFingerprint,
      revision.contentFingerprint,
    )
    assert.deepEqual(revision, revisionBefore)
  })

  test('allows explicit teacher approval of a valid automatic revision', () => {
    const revision = automatic()
    const approval = approve(revision)

    assert.equal(approval.approvedRevisionId, 'auto-1')
    assert.equal(approval.sourceRevisionId, 'auto-1')
    assert.equal(approval.approvedRevisionKind, 'automatic')
    assert.equal(approval.approvedParentRevisionId, null)
    assert.equal(approval.approvedRevisionCreatedAt, revision.createdAt)
    assert.equal(
      evaluateTeacherApprovalForRevision({ approval, revision }),
      TEACHER_APPROVAL_APPLICABILITY.APPROVED_EXACT_REVISION,
    )
  })

  test('exact approved revision evaluates as approved without mutating either record', () => {
    const revision = corrected()
    const approval = approve(revision)
    const approvalBefore = structuredClone(approval)
    const revisionBefore = structuredClone(revision)

    const result = evaluateTeacherApprovalForRevision({ approval, revision })

    assert.equal(
      result,
      TEACHER_APPROVAL_APPLICABILITY.APPROVED_EXACT_REVISION,
    )
    assert.deepEqual(approval, approvalBefore)
    assert.deepEqual(revision, revisionBefore)
  })

  test('a later correction makes the old approval non-applicable while preserving history', () => {
    const firstRevision = corrected()
    const approval = approve(firstRevision)
    const approvalBefore = structuredClone(approval)

    const { revision: secondRevision } = applyTeacherCorrectionBatch({
      eventId: 'correction-after-approval',
      actorId: 'teacher-1',
      revisionId: 'teacher-2',
      parentRevision: firstRevision,
      createdAt: '2026-08-28T10:15:00Z',
      operations: [
        {
          operationId: 'change-midi',
          kind: 'replace_value',
          path: [0, 'midi'],
          value: 62,
        },
      ],
    })

    assert.equal(
      evaluateTeacherApprovalForRevision({ approval, revision: secondRevision }),
      TEACHER_APPROVAL_APPLICABILITY.NOT_APPLICABLE_TO_REVISION,
    )
    assert.equal(
      evaluateTeacherApprovalForRevision({ approval, revision: firstRevision }),
      TEACHER_APPROVAL_APPLICABILITY.APPROVED_EXACT_REVISION,
    )
    assert.deepEqual(approval, approvalBefore)
  })

  test('a new revision with identical content does not inherit the old approval', () => {
    const source = automatic()
    const firstRevision = corrected(source, 'teacher-1', 61)
    const sameContentNewRevision = createTeacherCorrectedRevision({
      revisionId: 'teacher-2',
      parentRevision: firstRevision,
      createdAt: '2026-08-28T10:15:00Z',
      content: structuredClone(firstRevision.content),
    })
    const approval = approve(firstRevision)

    assert.equal(
      sameContentNewRevision.contentFingerprint,
      firstRevision.contentFingerprint,
    )
    assert.equal(
      evaluateTeacherApprovalForRevision({
        approval,
        revision: sameContentNewRevision,
      }),
      TEACHER_APPROVAL_APPLICABILITY.NOT_APPLICABLE_TO_REVISION,
    )
  })

  test('ancestor revisionId reuse cannot revive an old approval after content is restored', () => {
    const source = automatic()
    const firstRevision = corrected(source, 'teacher-1', 61)
    const approval = approve(firstRevision)
    const secondRevision = createTeacherCorrectedRevision({
      revisionId: 'teacher-2',
      parentRevision: firstRevision,
      createdAt: '2026-08-28T10:15:00Z',
      content: [{ midi: 62, beats: 1 }],
    })
    const reusedAncestorIdRevision = createTeacherCorrectedRevision({
      revisionId: firstRevision.revisionId,
      parentRevision: secondRevision,
      // Deliberately reuse the old timestamp too: parent lineage must still
      // distinguish this later revision from the originally approved record.
      createdAt: firstRevision.createdAt,
      content: structuredClone(firstRevision.content),
    })

    assert.equal(reusedAncestorIdRevision.sourceId, firstRevision.sourceId)
    assert.equal(
      reusedAncestorIdRevision.sourceRevisionId,
      firstRevision.sourceRevisionId,
    )
    assert.equal(reusedAncestorIdRevision.revisionId, firstRevision.revisionId)
    assert.equal(
      reusedAncestorIdRevision.contentFingerprint,
      firstRevision.contentFingerprint,
    )
    assert.notEqual(
      reusedAncestorIdRevision.parentRevisionId,
      firstRevision.parentRevisionId,
    )
    assert.equal(
      evaluateTeacherApprovalForRevision({
        approval,
        revision: reusedAncestorIdRevision,
      }),
      TEACHER_APPROVAL_APPLICABILITY.NOT_APPLICABLE_TO_REVISION,
    )
    assert.equal(
      evaluateTeacherApprovalForRevision({ approval, revision: firstRevision }),
      TEACHER_APPROVAL_APPLICABILITY.APPROVED_EXACT_REVISION,
    )
  })

  test('same revision-like identifiers from another source cannot reuse approval', () => {
    const approvedRevision = corrected(automatic(), 'teacher-1', 61)
    const approval = approve(approvedRevision)

    const otherSource = automatic({
      revisionId: 'other-auto',
      sourceId: 'score-2',
      midi: 60,
    })
    const otherRevision = corrected(otherSource, 'teacher-1', 61)

    assert.equal(
      otherRevision.contentFingerprint,
      approvedRevision.contentFingerprint,
    )
    assert.equal(
      evaluateTeacherApprovalForRevision({ approval, revision: otherRevision }),
      TEACHER_APPROVAL_APPLICABILITY.NOT_APPLICABLE_TO_REVISION,
    )
  })

  test('approval binding requires exact revision id, lineage metadata, timestamp, and content fingerprint', () => {
    const revision = corrected()
    const approval = approve(revision)

    for (const replacement of [
      { approvedContentFingerprint: 'fnv1a64-v1:0000000000000000:0' },
      { approvedRevisionId: 'teacher-other' },
      { approvedParentRevisionId: 'teacher-other-parent' },
      { approvedRevisionCreatedAt: '2026-08-28T10:06:00Z' },
    ]) {
      const forgedApproval = Object.freeze({ ...approval, ...replacement })
      assert.equal(isTeacherApprovalRecord(forgedApproval), true)
      assert.equal(
        evaluateTeacherApprovalForRevision({
          approval: forgedApproval,
          revision,
        }),
        TEACHER_APPROVAL_APPLICABILITY.NOT_APPLICABLE_TO_REVISION,
      )
    }
  })

  test('requires caller-supplied approval/actor identity and does not invent timestamp', () => {
    const revision = corrected()

    assert.throws(
      () => createTeacherApprovalRecord({ actorId: 'teacher-1', revision }),
      /approvalId/,
    )
    assert.throws(
      () => createTeacherApprovalRecord({ approvalId: 'approval-1', revision }),
      /actorId/,
    )

    const approval = createTeacherApprovalRecord({
      approvalId: ' approval-1 ',
      actorId: ' teacher-1 ',
      revision,
    })

    assert.equal(approval.approvalId, 'approval-1')
    assert.equal(approval.actorId, 'teacher-1')
    assert.equal(approval.createdAt, null)
  })

  test('rejects malformed timestamps and invalid/injected revision records', () => {
    const revision = corrected()

    assert.throws(
      () => approve(revision, { createdAt: '' }),
      /createdAt/,
    )

    const injectedRevision = Object.freeze({
      ...revision,
      teacherApproved: true,
    })
    assert.throws(
      () => approve(injectedRevision),
      /valid immutable teacher revision/,
    )
  })

  test('strict validator rejects mutable, extra-field, symbol, hidden, and accessor records', () => {
    const valid = approve(corrected())

    assert.equal(isTeacherApprovalRecord(valid), true)
    assert.equal(isTeacherApprovalRecord(structuredClone(valid)), false)
    assert.equal(
      isTeacherApprovalRecord(
        Object.freeze({
          ...valid,
          shareAllowed: true,
        }),
      ),
      false,
    )

    const withSymbol = { ...valid }
    withSymbol[Symbol('unsafe')] = true
    Object.freeze(withSymbol)
    assert.equal(isTeacherApprovalRecord(withSymbol), false)

    const hidden = { ...valid }
    Object.defineProperty(hidden, 'hidden', {
      value: true,
      enumerable: false,
    })
    Object.freeze(hidden)
    assert.equal(isTeacherApprovalRecord(hidden), false)

    const accessor = { ...valid }
    Object.defineProperty(accessor, 'actorId', {
      enumerable: true,
      configurable: true,
      get() {
        return 'teacher-1'
      },
    })
    Object.freeze(accessor)
    assert.equal(isTeacherApprovalRecord(accessor), false)
  })

  test('strict validator rejects unsupported state/schema and malformed binding metadata', () => {
    const valid = approve(corrected())

    for (const replacement of [
      { schemaVersion: 3 },
      { approvalState: 'automatic' },
      { approvalId: ' ' },
      { actorId: '' },
      { sourceId: '' },
      { sourceRevisionId: '' },
      { approvedRevisionId: '' },
      { approvedRevisionKind: 'unsupported' },
      { approvedParentRevisionId: '' },
      { approvedRevisionCreatedAt: 123 },
      { approvedContentFingerprint: '' },
      { createdAt: 123 },
    ]) {
      assert.equal(
        isTeacherApprovalRecord(Object.freeze({ ...valid, ...replacement })),
        false,
      )
    }

    const automaticApproval = approve(automatic())
    assert.equal(
      isTeacherApprovalRecord(
        Object.freeze({
          ...automaticApproval,
          approvedParentRevisionId: 'unexpected-parent',
        }),
      ),
      false,
    )
  })

  test('applicability evaluator fails closed for invalid approval or revision inputs', () => {
    const revision = corrected()
    const approval = approve(revision)

    assert.throws(
      () =>
        evaluateTeacherApprovalForRevision({
          approval: structuredClone(approval),
          revision,
        }),
      /valid immutable teacher approval record/,
    )
    assert.throws(
      () =>
        evaluateTeacherApprovalForRevision({
          approval,
          revision: structuredClone(revision),
        }),
      /valid immutable teacher revision/,
    )
  })

  test('approval record contains no quality, authorization, or sharing claim', () => {
    const approval = approve(corrected())

    for (const forbidden of [
      'qualityStatus',
      'qualityAccepted',
      'authorized',
      'shareAllowed',
      'safeToShare',
      'studentShared',
    ]) {
      assert.equal(forbidden in approval, false)
    }
  })
})
