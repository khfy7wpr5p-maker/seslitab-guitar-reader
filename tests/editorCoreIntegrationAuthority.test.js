import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createAutomaticRevision,
  createTeacherCorrectedRevision,
} from '../src/services/teacherRevisionModel.js'
import {
  EDITOR_CORE_AUTHORITY_PROFILE,
  EDITOR_CORE_KEYPAD_WRITE_AUTHORITY,
  assertEditorCoreSessionInitialization,
  auditEditorCoreUndoPolicy,
  createEditorCoreRevisionBinding,
} from '../src/services/editorCoreIntegrationAuthority.js'

function notes(step = 'C') {
  return [{
    measureKey: 'part:P1:measure:0',
    partId: 'P1',
    partIndex: 0,
    measureIndex: 0,
    voice: 1,
    staff: 1,
    startBeat: 0,
    isRest: false,
    isGrace: false,
    isChordNote: false,
    step,
    alter: 0,
    octave: 4,
  }]
}

function currentRevision() {
  const automatic = createAutomaticRevision({
    revisionId: 'source-rev-1',
    sourceId: 'source-1',
    content: notes('C'),
  })
  return createTeacherCorrectedRevision({
    revisionId: 'teacher-rev-2',
    parentRevision: automatic,
    content: notes('D'),
  })
}

function snapshotFor(revision) {
  return {
    selectionNotes: revision.content,
    revisionIdentity: {
      sourceId: revision.sourceId,
      sourceRevisionId: revision.sourceRevisionId,
      revisionId: revision.revisionId,
      contentFingerprint: revision.contentFingerprint,
    },
  }
}

test('STI-02 binds Package 3 current projection to exact Package 8 revision identity', () => {
  const revision = currentRevision()
  const binding = createEditorCoreRevisionBinding({
    package3Snapshot: snapshotFor(revision),
    teacherRevision: revision,
    editorDocumentId: 'editor-doc-1',
  })

  assert.equal(binding.editorRevisionId, revision.revisionId)
  assert.equal(binding.editorParentRevisionId, revision.parentRevisionId)
  assert.equal(binding.contentFingerprint, revision.contentFingerprint)
  assert.equal(binding.keypadWriteAuthority, EDITOR_CORE_KEYPAD_WRITE_AUTHORITY)
  assert.equal(binding.legacySesliTabKeypadMutationAuthority, false)
  assert.equal(binding.editorUndoBridgeEnabled, false)
})

test('STI-02 fails closed on stale Package 3 revision or any projected-content drift', () => {
  const revision = currentRevision()
  const stale = snapshotFor(revision)
  stale.revisionIdentity = { ...stale.revisionIdentity, revisionId: 'stale-revision' }
  assert.throws(
    () => createEditorCoreRevisionBinding({ package3Snapshot: stale, teacherRevision: revision, editorDocumentId: 'editor-doc-1' }),
    /revision mismatch: revisionId/,
  )

  const structuralDrift = snapshotFor(revision)
  structuralDrift.selectionNotes = [{ ...revision.content[0], measureIndex: 9 }]
  assert.throws(
    () => createEditorCoreRevisionBinding({ package3Snapshot: structuralDrift, teacherRevision: revision, editorDocumentId: 'editor-doc-1' }),
    /selection projection does not match/,
  )

  const musicalDrift = snapshotFor(revision)
  musicalDrift.selectionNotes = [{ ...revision.content[0], step: 'C' }]
  assert.throws(
    () => createEditorCoreRevisionBinding({ package3Snapshot: musicalDrift, teacherRevision: revision, editorDocumentId: 'editor-doc-1' }),
    /selection projection does not match/,
  )

  const extraFieldDrift = snapshotFor(revision)
  extraFieldDrift.selectionNotes = [{ ...revision.content[0], staleDerivedValue: 1 }]
  assert.throws(
    () => createEditorCoreRevisionBinding({ package3Snapshot: extraFieldDrift, teacherRevision: revision, editorDocumentId: 'editor-doc-1' }),
    /selection projection does not match/,
  )
})

test('STI-02 proves Editor Core session starts on the exact bound document and revision', () => {
  const revision = currentRevision()
  const binding = createEditorCoreRevisionBinding({
    package3Snapshot: snapshotFor(revision),
    teacherRevision: revision,
    editorDocumentId: 'editor-doc-1',
  })
  const session = {
    history: {
      present: {
        score: {
          id: 'editor-doc-1',
          revision: { id: revision.revisionId, parentId: revision.parentRevisionId },
        },
      },
    },
  }
  assert.equal(assertEditorCoreSessionInitialization(binding, session), true)
  session.history.present.score.revision = { id: 'other-revision', parentId: revision.parentRevisionId }
  assert.throws(() => assertEditorCoreSessionInitialization(binding, session), /revision identity does not match/)
})

test('STI-02 freezes one keypad writer and keeps direct Editor undo out of product audit authority', () => {
  const policy = auditEditorCoreUndoPolicy()
  assert.equal(policy, EDITOR_CORE_AUTHORITY_PROFILE)
  assert.deepEqual(policy, {
    contractVersion: '1.0.0',
    keypadWriteAuthority: 'st-score-editor-core',
    legacySesliTabKeypadMutationAuthority: false,
    rendererMutationAuthority: false,
    productRevisionAuditAuthority: 'seslitab-package-8',
    directEditorUndoProductAuthority: false,
    editorUndoBridgeEnabled: false,
  })
})
