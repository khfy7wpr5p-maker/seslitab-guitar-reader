import assert from 'node:assert/strict'
import test from 'node:test'

import { createAutomaticRevision } from '../src/services/teacherRevisionModel.js'
import {
  EDITOR_EXTERNAL_HIT_CONTRACT_VERSION,
  EDITOR_SELECTION_DIAGNOSTIC,
  ST_RENDERING_LAYER_EDITOR_PROFILE,
  createEditorSelectionContext,
  projectTeacherRevisionToEditorScore,
  selectDetailedRendererHitWithEditor,
} from '../src/services/editorRendererSelectionBridge.js'

function note(overrides = {}) {
  return {
    measure: 1,
    measureKey: 'P1:0',
    partId: 'P1',
    partIndex: 0,
    measureIndex: 0,
    isRest: false,
    isGrace: false,
    isChordNote: false,
    duration: 'quarter',
    beats: 1,
    durationValue: 1,
    divisions: 1,
    startBeat: 0,
    voice: 1,
    staff: 1,
    step: 'C',
    alter: 0,
    octave: 4,
    ...overrides,
  }
}

function revision(content = [note()]) {
  return createAutomaticRevision({ revisionId: 'rev-1', sourceId: 'source-1', content })
}

function snapshotFor(current) {
  return {
    selectionNotes: current.content,
    revisionIdentity: {
      sourceId: current.sourceId,
      sourceRevisionId: current.sourceRevisionId,
      revisionId: current.revisionId,
      contentFingerprint: current.contentFingerprint,
    },
  }
}

function mockEditorRuntime() {
  let observedExternalHit = null
  return {
    observedExternalHit: () => observedExternalHit,
    createScoreDocument(input) { return input },
    emptyNotationDocument() { return { version: '1.0.0' } },
    createEditorSessionWithRendererProfile(score, notation, profile) {
      const entries = []
      let counter = 0
      for (const part of score.parts) for (const staff of part.staves) for (const measure of staff.measures) for (const voice of measure.voices) {
        for (const event of voice.events) {
          const notes = event.kind === 'note' ? [event.note] : event.kind === 'chord' ? event.notes : []
          for (const atom of notes) {
            counter += 1
            entries.push({
              token: `stse-r1-token-${counter}`,
              address: {
                contractVersion: '1.0.0', kind: 'note', documentId: score.id, revisionId: score.revision.id,
                partId: part.id, staffId: staff.id, measureId: measure.id, voiceId: voice.id, eventId: event.id, noteId: atom.id,
              },
            })
          }
        }
      }
      return {
        rendererFamily: profile.family,
        history: { present: { score, notation } },
        selection: null,
        renderRequest: {
          contractVersion: '1.0.0',
          documentId: score.id,
          revisionId: score.revision.id,
          renderer: { ...profile },
          manifest: { contractVersion: '1.0.0', documentId: score.id, revisionId: score.revision.id, entries },
        },
      }
    },
    selectRendererHit(session, externalHit) {
      observedExternalHit = externalHit
      const entry = session.renderRequest.manifest.entries.find((candidate) => candidate.token === externalHit.opaqueHitToken)
      if (!entry) throw new Error('unknown token')
      return { ...session, selection: { primary: entry.address } }
    },
  }
}

test('STI-06 projects current Package 8 notes to exact Editor entities without using ScoreNoteRef as identity', async () => {
  const current = revision([
    note({ step: 'C', startBeat: 0 }),
    note({ step: 'E', startBeat: 0, isChordNote: true }),
    note({ isRest: true, startBeat: 1, step: undefined, alter: undefined, octave: undefined }),
  ])
  const projection = await projectTeacherRevisionToEditorScore(current)
  const voice = projection.scoreInput.parts[0].staves[0].measures[0].voices[0]
  assert.equal(voice.events[0].kind, 'chord')
  assert.equal(voice.events[0].notes.length, 2)
  assert.equal(voice.events[1].kind, 'rest')
  assert.equal(typeof projection.noteIds[0], 'string')
  assert.equal(typeof projection.noteIds[1], 'string')
  assert.equal(projection.noteIds[2], null)
  assert.doesNotMatch(projection.noteIds[0], /P1|measureIndex|voice/i)
})

test('STI-06 creates current session with exact Rendering Layer 2.1.2 profile and selects one opaque manifest token', async () => {
  const current = revision([note({ step: 'C' }), note({ step: 'D', startBeat: 1 })])
  const snapshot = snapshotFor(current)
  const runtime = mockEditorRuntime()
  const context = await createEditorSelectionContext({ package3Snapshot: snapshot, teacherRevision: current, editorRuntime: runtime })
  assert.deepEqual(context.session.renderRequest.renderer, ST_RENDERING_LAYER_EDITOR_PROFILE)

  const result = selectDetailedRendererHitWithEditor({
    context,
    package3Snapshot: snapshot,
    teacherRevision: current,
    detailedHit: { kind: 'HIT', renderEpoch: 'render-1', sourceId: 'workstation:1', target: { partId: 'P1', measureIndex: 0, noteIndex: 1, voice: 1 } },
    editorRuntime: runtime,
  })
  assert.equal(result.kind, 'SELECTED')
  assert.equal(result.resolved.noteIndex, 1)
  assert.equal(result.context.session.selection.primary.noteId, context.noteIds[1])

  const envelope = runtime.observedExternalHit()
  assert.deepEqual(Object.keys(envelope).sort(), [
    'contractVersion', 'documentId', 'opaqueHitToken', 'renderManifestVersion', 'renderRequestVersion', 'rendererFamily', 'revisionId',
  ])
  assert.equal(envelope.contractVersion, EDITOR_EXTERNAL_HIT_CONTRACT_VERSION)
  assert.match(envelope.opaqueHitToken, /^stse-r1-token-/)
  assert.equal('target' in envelope, false)
  assert.equal('clientX' in envelope, false)
  assert.equal('noteIndex' in envelope, false)
})

test('STI-06 fails closed for stale revision context, canonical miss and ambiguous current manifest token', async () => {
  const current = revision([note()])
  const snapshot = snapshotFor(current)
  const runtime = mockEditorRuntime()
  const context = await createEditorSelectionContext({ package3Snapshot: snapshot, teacherRevision: current, editorRuntime: runtime })

  const staleSnapshot = { ...snapshot, revisionIdentity: { ...snapshot.revisionIdentity, revisionId: 'other' } }
  assert.deepEqual(selectDetailedRendererHitWithEditor({
    context, package3Snapshot: staleSnapshot, teacherRevision: current,
    detailedHit: { kind: 'HIT', target: { partId: 'P1', measureIndex: 0, noteIndex: 0, voice: 1 } }, editorRuntime: runtime,
  }), { kind: 'FAIL', diagnosticCode: EDITOR_SELECTION_DIAGNOSTIC.STALE_CONTEXT })

  assert.deepEqual(selectDetailedRendererHitWithEditor({
    context, package3Snapshot: snapshot, teacherRevision: current,
    detailedHit: { kind: 'HIT', target: { partId: 'P1', measureIndex: 0, noteIndex: 99, voice: 1 } }, editorRuntime: runtime,
  }), { kind: 'FAIL', diagnosticCode: EDITOR_SELECTION_DIAGNOSTIC.CANONICAL_MISS })

  const noteEntry = context.session.renderRequest.manifest.entries.find((entry) => entry.address.kind === 'note')
  context.session.renderRequest.manifest.entries.push?.(noteEntry)
  // Frozen production manifests cannot be mutated; construct a bounded forged
  // session only to prove the bridge rejects multiple matches before Editor Core.
  const forged = {
    ...context,
    session: {
      ...context.session,
      renderRequest: {
        ...context.session.renderRequest,
        manifest: { ...context.session.renderRequest.manifest, entries: [...context.session.renderRequest.manifest.entries, noteEntry] },
      },
    },
  }
  assert.deepEqual(selectDetailedRendererHitWithEditor({
    context: forged, package3Snapshot: snapshot, teacherRevision: current,
    detailedHit: { kind: 'HIT', target: { partId: 'P1', measureIndex: 0, noteIndex: 0, voice: 1 } }, editorRuntime: runtime,
  }), { kind: 'FAIL', diagnosticCode: EDITOR_SELECTION_DIAGNOSTIC.TOKEN_AMBIGUOUS })
})

test('STI-06 abstains instead of inventing unsupported grace timing', async () => {
  const current = revision([note({ isGrace: true, durationValue: null, beats: 0 })])
  await assert.rejects(() => projectTeacherRevisionToEditorScore(current), /grace-note timing/)
})
