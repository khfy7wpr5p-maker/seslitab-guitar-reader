import {
  describe,
  test,
} from 'node:test'

import assert from 'node:assert/strict'

import {
  TEACHER_REVISION_KIND,
  TEACHER_REVISION_SCHEMA_VERSION,
  createAutomaticRevision,
  createTeacherCorrectedRevision,
  isTeacherRevision,
} from '../src/services/teacherRevisionModel.js'

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
      },
    },
  ]
}

describe('Package 8-T1 teacher revision domain', () => {
  test('exports immutable revision vocabulary', () => {
    assert.equal(TEACHER_REVISION_SCHEMA_VERSION, 2)
    assert.equal(Object.isFrozen(TEACHER_REVISION_KIND), true)
    assert.deepEqual(TEACHER_REVISION_KIND, {
      AUTOMATIC: 'automatic',
      TEACHER_CORRECTED: 'teacher_corrected',
    })
  })

  test('creates an immutable automatic snapshot without mutating caller data', () => {
    const content = noteSnapshot(60)
    const before = structuredClone(content)

    const revision = createAutomaticRevision({
      revisionId: 'rev-auto-1',
      sourceId: 'score-1',
      createdAt: '2026-08-28T08:45:00Z',
      content,
    })

    assert.equal(isTeacherRevision(revision), true)
    assert.equal(revision.revisionKind, 'automatic')
    assert.equal(revision.revisionId, 'rev-auto-1')
    assert.equal(revision.sourceRevisionId, 'rev-auto-1')
    assert.equal(revision.parentRevisionId, null)
    assert.equal(revision.parentLineageFingerprint, null)
    assert.match(
      revision.lineageFingerprint,
      /^lineage-fnv1a64-v1:[0-9a-f]{16}:\d+$/,
    )
    assert.equal(Object.isFrozen(revision), true)
    assert.equal(Object.isFrozen(revision.content), true)
    assert.equal(Object.isFrozen(revision.content[0]), true)
    assert.equal(Object.isFrozen(revision.content[0].metadata), true)
    assert.notEqual(revision.content, content)
    assert.deepEqual(content, before)

    content[0].midi = 72
    content[0].metadata.source = 'changed-outside'

    assert.equal(revision.content[0].midi, 60)
    assert.equal(revision.content[0].metadata.source, 'test')
    assert.equal('teacherApproved' in revision, false)
    assert.equal('approvalId' in revision, false)
  })

  test('uses deterministic content and lineage fingerprints independent of object key order', () => {
    const first = createAutomaticRevision({
      revisionId: 'auto-a',
      sourceId: 'score-1',
      content: {
        notes: [{ midi: 60, beats: 1 }],
        title: 'Etüt',
      },
    })

    const second = createAutomaticRevision({
      revisionId: 'auto-a',
      sourceId: 'score-1',
      content: {
        title: 'Etüt',
        notes: [{ beats: 1, midi: 60 }],
      },
    })

    assert.equal(first.contentFingerprint, second.contentFingerprint)
    assert.equal(first.lineageFingerprint, second.lineageFingerprint)
    assert.match(first.contentFingerprint, /^fnv1a64-v1:[0-9a-f]{16}:\d+$/)
    assert.match(
      first.lineageFingerprint,
      /^lineage-fnv1a64-v1:[0-9a-f]{16}:\d+$/,
    )
  })

  test('preserves an own __proto__ data key without changing object prototypes', () => {
    const payload = JSON.parse('{"__proto__":{"polluted":true},"midi":60}')

    const revision = createAutomaticRevision({
      revisionId: 'auto-proto',
      sourceId: 'score-1',
      content: { payload },
    })

    assert.equal(isTeacherRevision(revision), true)
    assert.equal(Object.getPrototypeOf(revision.content.payload), Object.prototype)
    assert.equal(
      Object.prototype.hasOwnProperty.call(revision.content.payload, '__proto__'),
      true,
    )
    assert.deepEqual(revision.content.payload.__proto__, { polluted: true })
    assert.equal({}.polluted, undefined)
  })

  test('creates a corrected revision with exact immutable lineage', () => {
    const automatic = createAutomaticRevision({
      revisionId: 'auto-1',
      sourceId: 'score-1',
      content: noteSnapshot(60),
    })
    const parentBefore = structuredClone(automatic)

    const corrected = createTeacherCorrectedRevision({
      revisionId: 'teacher-1',
      parentRevision: automatic,
      content: noteSnapshot(61),
      createdAt: '2026-08-28T08:46:00Z',
    })

    assert.equal(isTeacherRevision(corrected), true)
    assert.equal(corrected.revisionKind, 'teacher_corrected')
    assert.equal(corrected.parentRevisionId, 'auto-1')
    assert.equal(corrected.parentLineageFingerprint, automatic.lineageFingerprint)
    assert.equal(corrected.sourceRevisionId, 'auto-1')
    assert.equal(corrected.sourceId, 'score-1')
    assert.equal(corrected.content[0].midi, 61)
    assert.notEqual(corrected.contentFingerprint, automatic.contentFingerprint)
    assert.notEqual(corrected.lineageFingerprint, automatic.lineageFingerprint)
    assert.deepEqual(automatic, parentBefore)
    assert.equal(automatic.content[0].midi, 60)
  })

  test('preserves the original automatic source identity through correction chains', () => {
    const automatic = createAutomaticRevision({
      revisionId: 'auto-1',
      sourceId: 'score-1',
      content: noteSnapshot(60),
    })
    const correction1 = createTeacherCorrectedRevision({
      revisionId: 'teacher-1',
      parentRevision: automatic,
      content: noteSnapshot(61),
    })
    const correction2 = createTeacherCorrectedRevision({
      revisionId: 'teacher-2',
      parentRevision: correction1,
      content: noteSnapshot(62),
    })

    assert.equal(correction2.parentRevisionId, 'teacher-1')
    assert.equal(correction2.parentLineageFingerprint, correction1.lineageFingerprint)
    assert.equal(correction2.sourceRevisionId, 'auto-1')
    assert.equal(correction2.sourceId, 'score-1')
  })

  test('recursive lineage changes when multi-hop revision ids and content are replayed', () => {
    const automatic = createAutomaticRevision({
      revisionId: 'auto-1',
      sourceId: 'score-1',
      createdAt: '2026-08-28T08:45:00Z',
      content: noteSnapshot(60),
    })
    const r1 = createTeacherCorrectedRevision({
      revisionId: 'r1',
      parentRevision: automatic,
      createdAt: '2026-08-28T08:46:00Z',
      content: noteSnapshot(61),
    })
    const r2 = createTeacherCorrectedRevision({
      revisionId: 'r2',
      parentRevision: r1,
      createdAt: '2026-08-28T08:47:00Z',
      content: noteSnapshot(62),
    })
    const replayR1 = createTeacherCorrectedRevision({
      revisionId: 'r1',
      parentRevision: r2,
      createdAt: r1.createdAt,
      content: structuredClone(r1.content),
    })
    const replayR2 = createTeacherCorrectedRevision({
      revisionId: 'r2',
      parentRevision: replayR1,
      createdAt: r2.createdAt,
      content: structuredClone(r2.content),
    })

    assert.equal(replayR2.revisionId, r2.revisionId)
    assert.equal(replayR2.parentRevisionId, r2.parentRevisionId)
    assert.equal(replayR2.createdAt, r2.createdAt)
    assert.equal(replayR2.contentFingerprint, r2.contentFingerprint)
    assert.notEqual(replayR1.lineageFingerprint, r1.lineageFingerprint)
    assert.notEqual(replayR2.lineageFingerprint, r2.lineageFingerprint)
    assert.equal(replayR2.parentLineageFingerprint, replayR1.lineageFingerprint)
  })

  test('rejects reusing the original automatic revision identity later in a chain', () => {
    const automatic = createAutomaticRevision({
      revisionId: 'auto-1',
      sourceId: 'score-1',
      content: noteSnapshot(60),
    })
    const correction = createTeacherCorrectedRevision({
      revisionId: 'teacher-1',
      parentRevision: automatic,
      content: noteSnapshot(61),
    })

    assert.throws(
      () =>
        createTeacherCorrectedRevision({
          revisionId: 'auto-1',
          parentRevision: correction,
          content: noteSnapshot(62),
        }),
      /distinct from parent and source revisions/,
    )
  })

  test('rejects reusing the parent revision identity', () => {
    const automatic = createAutomaticRevision({
      revisionId: 'auto-1',
      sourceId: 'score-1',
      content: noteSnapshot(),
    })

    assert.throws(
      () =>
        createTeacherCorrectedRevision({
          revisionId: 'auto-1',
          parentRevision: automatic,
          content: noteSnapshot(61),
        }),
      /new revisionId/,
    )
  })

  test('rejects visible, hidden, accessor, or mutable revision injection', () => {
    const automatic = createAutomaticRevision({
      revisionId: 'auto-1',
      sourceId: 'score-1',
      content: noteSnapshot(),
    })

    const injectedApproval = Object.freeze({
      ...automatic,
      teacherApproved: true,
    })

    const hiddenApproval = { ...automatic }
    Object.defineProperty(hiddenApproval, 'teacherApproved', {
      value: true,
      enumerable: false,
    })
    Object.freeze(hiddenApproval)

    const accessorRevision = { ...automatic }
    delete accessorRevision.revisionId
    Object.defineProperty(accessorRevision, 'revisionId', {
      enumerable: true,
      get() {
        return 'auto-1'
      },
    })
    Object.freeze(accessorRevision)

    const mutableContent = Object.freeze({
      ...automatic,
      content: structuredClone(automatic.content),
    })

    assert.equal(isTeacherRevision(injectedApproval), false)
    assert.equal(isTeacherRevision(hiddenApproval), false)
    assert.equal(isTeacherRevision(accessorRevision), false)
    assert.equal(isTeacherRevision(mutableContent), false)

    assert.throws(
      () =>
        createTeacherCorrectedRevision({
          revisionId: 'teacher-1',
          parentRevision: injectedApproval,
          content: noteSnapshot(61),
        }),
      /valid immutable teacher revision/,
    )
  })

  test('rejects forged lineage metadata', () => {
    const automatic = createAutomaticRevision({
      revisionId: 'auto-1',
      sourceId: 'score-1',
      content: noteSnapshot(),
    })
    const corrected = createTeacherCorrectedRevision({
      revisionId: 'teacher-1',
      parentRevision: automatic,
      content: noteSnapshot(61),
    })

    assert.equal(
      isTeacherRevision(
        Object.freeze({
          ...corrected,
          parentLineageFingerprint: 'lineage-fnv1a64-v1:0000000000000000:0',
        }),
      ),
      false,
    )
    assert.equal(
      isTeacherRevision(
        Object.freeze({
          ...corrected,
          lineageFingerprint: 'lineage-fnv1a64-v1:0000000000000000:0',
        }),
      ),
      false,
    )
  })

  test('fails closed for unsafe or non-deterministic snapshot shapes', () => {
    const circular = {}
    circular.self = circular

    const sparse = []
    sparse[1] = { midi: 60 }

    const accessor = {}
    Object.defineProperty(accessor, 'midi', {
      enumerable: true,
      get() {
        return 60
      },
    })

    const unsafeContents = [
      [{ midi: undefined }],
      [{ midi: Number.NaN }],
      [{ midi: Number.POSITIVE_INFINITY }],
      [{ created: new Date('2026-08-28T00:00:00Z') }],
      [circular],
      sparse,
      accessor,
    ]

    for (const content of unsafeContents) {
      assert.throws(() =>
        createAutomaticRevision({
          revisionId: 'auto-unsafe',
          sourceId: 'score-1',
          content,
        }),
      )
    }
  })

  test('does not invent timestamps or identifiers', () => {
    const revision = createAutomaticRevision({
      revisionId: ' auto-1 ',
      sourceId: ' score-1 ',
      content: noteSnapshot(),
    })

    assert.equal(revision.revisionId, 'auto-1')
    assert.equal(revision.sourceId, 'score-1')
    assert.equal(revision.createdAt, null)
  })

  test('rejects missing identity and malformed timestamps', () => {
    assert.throws(
      () => createAutomaticRevision({ sourceId: 'score-1', content: [] }),
      /revisionId/,
    )
    assert.throws(
      () => createAutomaticRevision({ revisionId: 'auto-1', content: [] }),
      /sourceId/,
    )
    assert.throws(
      () =>
        createAutomaticRevision({
          revisionId: 'auto-1',
          sourceId: 'score-1',
          content: [],
          createdAt: 123,
        }),
      /createdAt/,
    )
  })

  test('recognizes only strict frozen revision records', () => {
    const revision = createAutomaticRevision({
      revisionId: 'auto-1',
      sourceId: 'score-1',
      content: noteSnapshot(),
    })

    assert.equal(isTeacherRevision(revision), true)
    assert.equal(isTeacherRevision(structuredClone(revision)), false)
    assert.equal(isTeacherRevision(null), false)
    assert.equal(isTeacherRevision([]), false)
  })
})
