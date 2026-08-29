import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  createAutomaticRevision,
  createTeacherCorrectedRevision,
} from '../src/services/teacherRevisionModel.js'
import { createTeacherApprovalRecord } from '../src/services/teacherApprovalModel.js'
import {
  TEACHER_SHARE_AUTHORIZATION_APPLICABILITY,
  TEACHER_SHARE_AUTHORIZATION_SCHEMA_VERSION,
  TEACHER_SHARE_AUTHORIZATION_STATE,
  TEACHER_SHARE_REVOCATION_SCHEMA_VERSION,
  TEACHER_SHARE_REVOCATION_STATE,
  createTeacherShareAuthorization,
  createTeacherShareRevocation,
  evaluateTeacherShareAuthorization,
  isTeacherShareAuthorizationRecord,
  isTeacherShareRevocationRecord,
} from '../src/services/teacherShareAuthorization.js'

function automatic({
  revisionId = 'auto-1',
  sourceId = 'score-1',
  midi = 60,
  createdAt = '2026-08-29T15:00:00Z',
} = {}) {
  return createAutomaticRevision({
    revisionId,
    sourceId,
    createdAt,
    content: [{ midi, beats: 1 }],
  })
}

function corrected({
  parentRevision = automatic(),
  revisionId = 'teacher-1',
  midi = 61,
  createdAt = '2026-08-29T15:05:00Z',
} = {}) {
  return createTeacherCorrectedRevision({
    revisionId,
    parentRevision,
    createdAt,
    content: [{ midi, beats: 1 }],
  })
}

function approve(revision, overrides = {}) {
  return createTeacherApprovalRecord({
    approvalId: 'approval-1',
    actorId: 'teacher-1',
    revision,
    createdAt: '2026-08-29T15:10:00Z',
    ...overrides,
  })
}

function authorize(revision, approval = approve(revision), overrides = {}) {
  return createTeacherShareAuthorization({
    authorizationId: 'share-auth-1',
    issuerActorId: 'teacher-1',
    recipientId: 'student-1',
    revision,
    approval,
    createdAt: '2026-08-29T15:15:00Z',
    ...overrides,
  })
}

describe('Package 12-T1 exact teacher-to-student share authorization', () => {
  test('exports explicit immutable authorization/revocation vocabulary', () => {
    assert.equal(TEACHER_SHARE_AUTHORIZATION_SCHEMA_VERSION, 1)
    assert.equal(TEACHER_SHARE_AUTHORIZATION_STATE, 'share_authorized')
    assert.equal(TEACHER_SHARE_REVOCATION_SCHEMA_VERSION, 1)
    assert.equal(TEACHER_SHARE_REVOCATION_STATE, 'share_revoked')
    assert.equal(Object.isFrozen(TEACHER_SHARE_AUTHORIZATION_APPLICABILITY), true)
    assert.deepEqual(TEACHER_SHARE_AUTHORIZATION_APPLICABILITY, {
      AUTHORIZED_EXACT_BINDING: 'authorized_exact_binding',
      NOT_APPLICABLE: 'not_applicable',
      RECIPIENT_MISMATCH: 'recipient_mismatch',
      REVOKED: 'revoked',
    })
  })

  test('creates a strict immutable authorization bound to exact revision, approval and recipient', () => {
    const revision = corrected()
    const approval = approve(revision)
    const revisionBefore = structuredClone(revision)
    const approvalBefore = structuredClone(approval)

    const authorization = authorize(revision, approval)

    assert.equal(Object.isFrozen(authorization), true)
    assert.equal(isTeacherShareAuthorizationRecord(authorization), true)
    assert.equal(authorization.authorizationState, 'share_authorized')
    assert.equal(authorization.recipientId, 'student-1')
    assert.equal(authorization.sourceId, revision.sourceId)
    assert.equal(authorization.sourceRevisionId, revision.sourceRevisionId)
    assert.equal(authorization.revisionId, revision.revisionId)
    assert.equal(authorization.revisionKind, revision.revisionKind)
    assert.equal(authorization.parentRevisionId, revision.parentRevisionId)
    assert.equal(authorization.revisionCreatedAt, revision.createdAt)
    assert.equal(authorization.contentFingerprint, revision.contentFingerprint)
    assert.equal(authorization.lineageFingerprint, revision.lineageFingerprint)
    assert.equal(authorization.approvalId, approval.approvalId)
    assert.equal(authorization.approvalActorId, approval.actorId)
    assert.equal(authorization.approvalCreatedAt, approval.createdAt)
    assert.deepEqual(revision, revisionBefore)
    assert.deepEqual(approval, approvalBefore)
  })

  test('exact binding evaluates as authorized without claiming final safe-to-share status', () => {
    const revision = corrected()
    const approval = approve(revision)
    const authorization = authorize(revision, approval)

    assert.equal(
      evaluateTeacherShareAuthorization({
        authorization,
        revision,
        approval,
        recipientId: 'student-1',
      }),
      TEACHER_SHARE_AUTHORIZATION_APPLICABILITY.AUTHORIZED_EXACT_BINDING,
    )

    assert.equal(Object.hasOwn(authorization, 'safeToShare'), false)
    assert.equal(Object.hasOwn(authorization, 'shareAllowed'), false)
    assert.equal(Object.hasOwn(authorization, 'token'), false)
    assert.equal(Object.hasOwn(authorization, 'content'), false)
  })

  test('teacher approval alone is insufficient: authorization must be explicitly created', () => {
    const revision = corrected()
    const approval = approve(revision)

    assert.equal(Object.hasOwn(approval, 'authorizationId'), false)
    assert.equal(Object.hasOwn(approval, 'recipientId'), false)
    assert.equal(Object.hasOwn(approval, 'shareAllowed'), false)
  })

  test('rejects approval that does not apply to the exact revision being authorized', () => {
    const first = corrected()
    const approval = approve(first)
    const second = corrected({
      parentRevision: first,
      revisionId: 'teacher-2',
      midi: 62,
      createdAt: '2026-08-29T15:20:00Z',
    })

    assert.throws(
      () => authorize(second, approval),
      /approval must apply to the exact revision/,
    )
  })

  test('later correction makes prior authorization stale even if recipient and approval are unchanged', () => {
    const first = corrected()
    const approval = approve(first)
    const authorization = authorize(first, approval)
    const later = corrected({
      parentRevision: first,
      revisionId: 'teacher-2',
      midi: 62,
      createdAt: '2026-08-29T15:20:00Z',
    })

    assert.equal(
      evaluateTeacherShareAuthorization({
        authorization,
        revision: later,
        approval,
        recipientId: 'student-1',
      }),
      TEACHER_SHARE_AUTHORIZATION_APPLICABILITY.NOT_APPLICABLE,
    )
  })

  test('new identical-content revision does not inherit prior authorization', () => {
    const first = corrected()
    const approval = approve(first)
    const authorization = authorize(first, approval)
    const sameContentLater = createTeacherCorrectedRevision({
      revisionId: 'teacher-2',
      parentRevision: first,
      createdAt: '2026-08-29T15:20:00Z',
      content: structuredClone(first.content),
    })

    assert.equal(sameContentLater.contentFingerprint, first.contentFingerprint)
    assert.notEqual(sameContentLater.lineageFingerprint, first.lineageFingerprint)
    assert.equal(
      evaluateTeacherShareAuthorization({
        authorization,
        revision: sameContentLater,
        approval,
        recipientId: 'student-1',
      }),
      TEACHER_SHARE_AUTHORIZATION_APPLICABILITY.NOT_APPLICABLE,
    )
  })

  test('a different approval record for the same revision does not satisfy the authorization binding', () => {
    const revision = corrected()
    const originalApproval = approve(revision)
    const authorization = authorize(revision, originalApproval)
    const otherApproval = approve(revision, {
      approvalId: 'approval-2',
      createdAt: '2026-08-29T15:11:00Z',
    })

    assert.equal(
      evaluateTeacherShareAuthorization({
        authorization,
        revision,
        approval: otherApproval,
        recipientId: 'student-1',
      }),
      TEACHER_SHARE_AUTHORIZATION_APPLICABILITY.NOT_APPLICABLE,
    )
  })

  test('recipient identity is exact and is never invented or widened by the domain model', () => {
    const revision = corrected()
    const approval = approve(revision)
    const authorization = authorize(revision, approval)

    assert.equal(
      evaluateTeacherShareAuthorization({
        authorization,
        revision,
        approval,
        recipientId: 'student-2',
      }),
      TEACHER_SHARE_AUTHORIZATION_APPLICABILITY.RECIPIENT_MISMATCH,
    )
    assert.throws(
      () =>
        createTeacherShareAuthorization({
          authorizationId: 'share-auth-x',
          issuerActorId: 'teacher-1',
          revision,
          approval,
        }),
      /recipientId/,
    )
  })

  test('same-looking revision from another source cannot reuse authorization', () => {
    const revision = corrected()
    const approval = approve(revision)
    const authorization = authorize(revision, approval)

    const otherSource = automatic({
      revisionId: 'auto-2',
      sourceId: 'score-2',
      midi: 60,
    })
    const otherRevision = corrected({
      parentRevision: otherSource,
      revisionId: 'teacher-1',
      midi: 61,
    })
    const otherApproval = approve(otherRevision)

    assert.equal(otherRevision.contentFingerprint, revision.contentFingerprint)
    assert.equal(
      evaluateTeacherShareAuthorization({
        authorization,
        revision: otherRevision,
        approval: otherApproval,
        recipientId: 'student-1',
      }),
      TEACHER_SHARE_AUTHORIZATION_APPLICABILITY.NOT_APPLICABLE,
    )
  })

  test('creates immutable exact revocation and revoked authorization fails closed', () => {
    const revision = corrected()
    const approval = approve(revision)
    const authorization = authorize(revision, approval)
    const revocation = createTeacherShareRevocation({
      revocationId: 'share-revoke-1',
      actorId: 'teacher-1',
      authorization,
      createdAt: '2026-08-29T15:30:00Z',
    })

    assert.equal(Object.isFrozen(revocation), true)
    assert.equal(isTeacherShareRevocationRecord(revocation), true)
    assert.equal(revocation.authorizationId, authorization.authorizationId)
    assert.equal(revocation.recipientId, authorization.recipientId)
    assert.equal(revocation.sourceId, authorization.sourceId)
    assert.equal(revocation.revisionId, authorization.revisionId)
    assert.equal(
      evaluateTeacherShareAuthorization({
        authorization,
        revision,
        approval,
        recipientId: 'student-1',
        revocation,
      }),
      TEACHER_SHARE_AUTHORIZATION_APPLICABILITY.REVOKED,
    )
  })

  test('revocation requires the exact issuer actor label and mismatched revocation evidence cannot authorize', () => {
    const revision = corrected()
    const approval = approve(revision)
    const authorization = authorize(revision, approval)

    assert.throws(
      () =>
        createTeacherShareRevocation({
          revocationId: 'share-revoke-1',
          actorId: 'teacher-2',
          authorization,
        }),
      /must match the authorization issuerActorId/,
    )

    const validRevocation = createTeacherShareRevocation({
      revocationId: 'share-revoke-1',
      actorId: 'teacher-1',
      authorization,
    })
    const mismatched = Object.freeze({
      ...validRevocation,
      authorizationId: 'other-authorization',
    })

    assert.equal(isTeacherShareRevocationRecord(mismatched), true)
    assert.equal(
      evaluateTeacherShareAuthorization({
        authorization,
        revision,
        approval,
        recipientId: 'student-1',
        revocation: mismatched,
      }),
      TEACHER_SHARE_AUTHORIZATION_APPLICABILITY.NOT_APPLICABLE,
    )
  })

  test('caller owns identifiers and timestamps; the domain layer generates none', () => {
    const revision = corrected()
    const approval = approve(revision)

    assert.throws(
      () => authorize(revision, approval, { authorizationId: undefined }),
      /authorizationId/,
    )
    assert.throws(
      () => authorize(revision, approval, { issuerActorId: undefined }),
      /issuerActorId/,
    )

    const authorization = createTeacherShareAuthorization({
      authorizationId: ' share-auth-1 ',
      issuerActorId: ' teacher-1 ',
      recipientId: ' student-1 ',
      revision,
      approval,
    })
    assert.equal(authorization.authorizationId, 'share-auth-1')
    assert.equal(authorization.issuerActorId, 'teacher-1')
    assert.equal(authorization.recipientId, 'student-1')
    assert.equal(authorization.createdAt, null)

    const revocation = createTeacherShareRevocation({
      revocationId: ' revoke-1 ',
      actorId: ' teacher-1 ',
      authorization,
    })
    assert.equal(revocation.revocationId, 'revoke-1')
    assert.equal(revocation.createdAt, null)
  })

  test('strict validators reject mutable, extra-field, symbol, hidden and accessor records', () => {
    const revision = corrected()
    const approval = approve(revision)
    const valid = authorize(revision, approval)

    assert.equal(isTeacherShareAuthorizationRecord(valid), true)
    assert.equal(isTeacherShareAuthorizationRecord(structuredClone(valid)), false)
    assert.equal(
      isTeacherShareAuthorizationRecord(
        Object.freeze({ ...valid, safeToShare: true }),
      ),
      false,
    )

    const withSymbol = { ...valid }
    withSymbol[Symbol('unsafe')] = true
    Object.freeze(withSymbol)
    assert.equal(isTeacherShareAuthorizationRecord(withSymbol), false)

    const hidden = { ...valid }
    Object.defineProperty(hidden, 'hidden', {
      value: true,
      enumerable: false,
    })
    Object.freeze(hidden)
    assert.equal(isTeacherShareAuthorizationRecord(hidden), false)

    const accessor = { ...valid }
    Object.defineProperty(accessor, 'recipientId', {
      enumerable: true,
      configurable: true,
      get() {
        return 'student-1'
      },
    })
    Object.freeze(accessor)
    assert.equal(isTeacherShareAuthorizationRecord(accessor), false)
  })

  test('strict authorization validator rejects unsupported schema/state/kind and malformed fields', () => {
    const valid = authorize(corrected())

    for (const replacement of [
      { schemaVersion: 2 },
      { authorizationState: 'teacher_approved' },
      { authorizationId: '' },
      { issuerActorId: ' ' },
      { recipientId: '' },
      { sourceId: '' },
      { sourceRevisionId: '' },
      { revisionId: '' },
      { revisionKind: 'unsupported' },
      { contentFingerprint: '' },
      { lineageFingerprint: '' },
      { approvalId: '' },
      { approvalActorId: '' },
      { revisionCreatedAt: 123 },
      { approvalCreatedAt: 123 },
      { createdAt: 123 },
    ]) {
      assert.equal(
        isTeacherShareAuthorizationRecord(Object.freeze({ ...valid, ...replacement })),
        false,
      )
    }
  })

  test('strict revocation validator rejects unsupported/malformed records and evaluator rejects mutable revocation', () => {
    const revision = corrected()
    const approval = approve(revision)
    const authorization = authorize(revision, approval)
    const valid = createTeacherShareRevocation({
      revocationId: 'revoke-1',
      actorId: 'teacher-1',
      authorization,
    })

    assert.equal(isTeacherShareRevocationRecord(valid), true)
    assert.equal(isTeacherShareRevocationRecord(structuredClone(valid)), false)
    assert.equal(
      isTeacherShareRevocationRecord(
        Object.freeze({ ...valid, schemaVersion: 2 }),
      ),
      false,
    )
    assert.equal(
      isTeacherShareRevocationRecord(
        Object.freeze({ ...valid, revocationState: 'active' }),
      ),
      false,
    )

    assert.throws(
      () =>
        evaluateTeacherShareAuthorization({
          authorization,
          revision,
          approval,
          recipientId: 'student-1',
          revocation: structuredClone(valid),
        }),
      /valid immutable share revocation record/,
    )
  })

  test('invalid authorization/revision/approval inputs fail closed with explicit errors', () => {
    const revision = corrected()
    const approval = approve(revision)
    const authorization = authorize(revision, approval)

    assert.throws(
      () =>
        evaluateTeacherShareAuthorization({
          authorization: structuredClone(authorization),
          revision,
          approval,
          recipientId: 'student-1',
        }),
      /valid immutable teacher share authorization record/,
    )
    assert.throws(
      () =>
        evaluateTeacherShareAuthorization({
          authorization,
          revision: structuredClone(revision),
          approval,
          recipientId: 'student-1',
        }),
      /valid immutable teacher revision/,
    )
    assert.throws(
      () =>
        evaluateTeacherShareAuthorization({
          authorization,
          revision,
          approval: structuredClone(approval),
          recipientId: 'student-1',
        }),
      /valid immutable teacher approval record/,
    )
  })
})
