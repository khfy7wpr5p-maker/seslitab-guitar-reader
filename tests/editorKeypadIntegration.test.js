import assert from 'node:assert/strict'
import test from 'node:test'

import { buildStageS06SelectionIdentity } from '../src/services/stageS06SelectionIdentity.js'
import { createAutomaticRevision } from '../src/services/teacherRevisionModel.js'
import {
  ADVANCED_EDITOR_KEYPAD_ACTION_IDS,
  BASIC_EDITOR_KEYPAD_ACTION_IDS,
  commitBasicEditorKeypadAction,
  createBasicEditorKeypadContext,
  normalizeProjectedEditorTiming,
  sesliTabBeatRationalToEditorWholeNoteRational,
  verifyEditorKeypadManifest,
} from '../src/services/editorKeypadIntegration.js'

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

function currentRevision(content = [note()]) {
  return createAutomaticRevision({ revisionId: 'rev-1', sourceId: 'source-1', content })
}

function exactSnapshot(revision, { interaction = 'score-editor-current-hit', noteIndex = 0 } = {}) {
  const revisionIdentity = Object.freeze({
    sourceId: revision.sourceId,
    sourceRevisionId: revision.sourceRevisionId,
    revisionId: revision.revisionId,
    contentFingerprint: revision.contentFingerprint,
  })
  const selectedNoteIdentity = buildStageS06SelectionIdentity({
    notes: revision.content,
    measureKey: revision.content[noteIndex].measureKey,
    noteIndex,
    revisionIdentity,
    interaction,
  })
  return Object.freeze({
    notes: revision.content,
    selectionNotes: revision.content,
    selectedMeasureKey: revision.content[noteIndex].measureKey,
    selectedNoteIndex: noteIndex,
    revisionIdentity,
    selectedNoteIdentity,
  })
}

function fakeDomParser() {
  return class FakeDOMParser {
    parseFromString() {
      const name = { localName: 'part-name', children: [], textContent: 'Guitar' }
      const scorePart = { localName: 'score-part', children: [name], getAttribute: (key) => key === 'id' ? 'P1' : null }
      const partList = { localName: 'part-list', children: [scorePart] }
      return {
        getElementsByTagNameNS(_ns, localName) {
          if (localName === 'parsererror') return []
          if (localName === 'part-list') return [partList]
          return []
        },
      }
    }
  }
}

function editorManifest() {
  const glyphNames = {
    'duration.whole': 'noteWhole',
    'duration.half': 'noteHalfUp',
    'duration.quarter': 'noteQuarterUp',
    'duration.eighth': 'note8thUp',
    'duration.16th': 'note16thUp',
    'duration.32nd': 'note32ndUp',
    'rest.whole': 'restWhole',
    'rest.half': 'restHalf',
    'rest.quarter': 'restQuarter',
    'rest.eighth': 'rest8th',
    'rest.16th': 'rest16th',
    'rest.32nd': 'rest32nd',
    'accidental.flat': 'accidentalFlat',
    'accidental.natural': 'accidentalNatural',
    'accidental.sharp': 'accidentalSharp',
    'dot.set.1': 'augmentationDot',
    'dot.set.2': 'augmentationDot',
    'dot.set.3': 'augmentationDot',
    'tuplet.triplet': 'tuplet3',
  }
  const repeat = { 'dot.set.2': 2, 'dot.set.3': 3 }
  const descriptor = (actionId) => Object.freeze({
    actionId,
    accessibleLabelKey: `keypad.${actionId}`,
    glyph: glyphNames[actionId]
      ? Object.freeze({ smuflGlyphName: glyphNames[actionId], repeat: repeat[actionId] ?? 1 })
      : null,
    hostPrimitiveHint: actionId === 'tie.edit' ? 'tie' : actionId === 'slur.edit' ? 'slur' : null,
  })
  return Object.freeze({
    version: '1.0.0',
    mode: 'EXISTING_SCORE_CORRECTION',
    semanticAuthority: 'ACTION_ID_ONLY',
    glyphMetadataAuthority: false,
    rawGlyphCodepointsIncluded: false,
    fontAssetsIncluded: false,
    groups: Object.freeze([
      Object.freeze({ id: 'basic', actions: Object.freeze(BASIC_EDITOR_KEYPAD_ACTION_IDS.map(descriptor)) }),
      Object.freeze({ id: 'advanced', actions: Object.freeze(ADVANCED_EDITOR_KEYPAD_ACTION_IDS.map(descriptor)) }),
    ]),
  })
}

function mockEditorRuntime({ rejectCommit = false } = {}) {
  let commitCalls = 0
  let lastCommit = null
  let createdScore = null
  return {
    commitCalls: () => commitCalls,
    lastCommit: () => lastCommit,
    createdScore: () => createdScore,
    getEditorKeypadManifest: () => editorManifest(),
    createScoreDocument(input) { createdScore = input; return input },
    emptyNotationDocument(score) { return { version: '1.0.0', documentId: score.id, revisionId: score.revision.id } },
    createEditorSessionWithRendererProfile(score, notation, renderer) {
      const entries = []
      for (const part of score.parts) for (const staff of part.staves) for (const measure of staff.measures) for (const voice of measure.voices) {
        for (const event of voice.events) {
          const notes = event.kind === 'note' ? [event.note] : event.kind === 'chord' ? event.notes : []
          for (const atom of notes) entries.push({ token: `token-${atom.id}`, address: { kind: 'note', noteId: atom.id, revisionId: score.revision.id } })
        }
      }
      return {
        history: { present: { score, notation } },
        selection: null,
        renderRequest: {
          contractVersion: '1.0.0', documentId: score.id, revisionId: score.revision.id,
          renderer: { ...renderer },
          manifest: { contractVersion: '1.0.0', entries },
        },
      }
    },
    selectRendererHit(session, externalHit) {
      const entry = session.renderRequest.manifest.entries.find((item) => item.token === externalHit.opaqueHitToken)
      if (!entry) throw new Error('token miss')
      return { ...session, selection: { primary: { ...entry.address } } }
    },
    commitKeypadAction(session, action, identity) {
      commitCalls += 1
      lastCommit = { session, action, identity }
      if (rejectCommit) return { ok: false, error: { version: '1.0.0', code: 'TEST_REJECT', message: 'rejected' } }
      const score = {
        ...session.history.present.score,
        revision: { id: identity.nextRevisionId, parentId: session.history.present.score.revision.id },
      }
      const selection = action.actionId.startsWith('rest.')
        ? null
        : { primary: { ...session.selection.primary, revisionId: identity.nextRevisionId } }
      return {
        ok: true,
        session: {
          ...session,
          history: { present: { ...session.history.present, score } },
          selection,
        },
      }
    },
  }
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note></measure></part></score-partwise>`

test('STI-09 converts SesliTab quarter-beat timing to Editor whole-note Rational exactly', () => {
  assert.deepEqual(sesliTabBeatRationalToEditorWholeNoteRational({ numerator: 1, denominator: 1 }), { numerator: 1, denominator: 4 })
  assert.deepEqual(sesliTabBeatRationalToEditorWholeNoteRational({ numerator: 1, denominator: 2 }), { numerator: 1, denominator: 8 })
  const score = normalizeProjectedEditorTiming({ parts: [{ staves: [{ measures: [{ voices: [{ events: [{ kind: 'note', onset: { numerator: 1, denominator: 1 }, duration: { numerator: 1, denominator: 2 } }] }] }] }] }] })
  assert.deepEqual(score.parts[0].staves[0].measures[0].voices[0].events[0].onset, { numerator: 1, denominator: 4 })
  assert.deepEqual(score.parts[0].staves[0].measures[0].voices[0].events[0].duration, { numerator: 1, denominator: 8 })
})

test('STI-08/09 admits the exact Editor manifest while keeping actionId as the only semantic authority', () => {
  const manifest = verifyEditorKeypadManifest(editorManifest())
  assert.equal(manifest.semanticAuthority, 'ACTION_ID_ONLY')
  assert.equal(manifest.rawGlyphCodepointsIncluded, false)
  assert.equal(manifest.fontAssetsIncluded, false)
})

test('STI-09 creates a keypad context only from a PR-B exact current selection and corrected Editor timing', async () => {
  const revision = currentRevision([note({ startBeat: 0, durationValue: 1, divisions: 1 })])
  const runtime = mockEditorRuntime()
  const context = await createBasicEditorKeypadContext({
    package3Snapshot: exactSnapshot(revision), teacherRevision: revision, musicXml: xml,
    editorRuntime: runtime, DOMParserCtor: fakeDomParser(),
  })
  assert.equal(context.session.selection.primary.kind, 'note')
  assert.equal(context.productSyncPending, false)
  const event = runtime.createdScore().parts[0].staves[0].measures[0].voices[0].events[0]
  assert.deepEqual(event.onset, { numerator: 0, denominator: 1 })
  assert.deepEqual(event.duration, { numerator: 1, denominator: 4 })
})

test('STI-09 rejects legacy/canonical-control selection instead of granting keypad write authority', async () => {
  const revision = currentRevision()
  const runtime = mockEditorRuntime()
  await assert.rejects(() => createBasicEditorKeypadContext({
    package3Snapshot: exactSnapshot(revision, { interaction: 'canonical-control' }),
    teacherRevision: revision, musicXml: xml, editorRuntime: runtime, DOMParserCtor: fakeDomParser(),
  }), /PR-B/)
})

test('STI-09 sends one basic user action to commitKeypadAction exactly once and then freezes for STI-11 product sync', async () => {
  const revision = currentRevision()
  const runtime = mockEditorRuntime()
  const context = await createBasicEditorKeypadContext({
    package3Snapshot: exactSnapshot(revision), teacherRevision: revision, musicXml: xml,
    editorRuntime: runtime, DOMParserCtor: fakeDomParser(),
  })
  const identity = Object.freeze({ version: '1.0.0', transactionId: 'tx-1', nextRevisionId: 'rev-2' })
  const result = commitBasicEditorKeypadAction(context, 'duration.eighth', { identity })
  assert.equal(result.kind, 'COMMITTED')
  assert.equal(runtime.commitCalls(), 1)
  assert.deepEqual(runtime.lastCommit().action, { version: '1.0.0', actionId: 'duration.eighth' })
  assert.equal(runtime.lastCommit().identity, identity)
  assert.equal(result.nextRevisionId, 'rev-2')
  assert.equal(result.context.productSyncPending, true)
  assert.equal(context.productSyncPending, false)

  const second = commitBasicEditorKeypadAction(result.context, 'accidental.sharp', {
    identity: { version: '1.0.0', transactionId: 'tx-2', nextRevisionId: 'rev-3' },
  })
  assert.deepEqual(second, { kind: 'FAIL', code: 'ST_KEYPAD_PRODUCT_SYNC_PENDING' })
  assert.equal(runtime.commitCalls(), 1)
})

test('STI-09 advanced action and rejected basic commit never trigger a legacy fallback or second Editor call', async () => {
  const revision = currentRevision()
  const runtime = mockEditorRuntime({ rejectCommit: true })
  const context = await createBasicEditorKeypadContext({
    package3Snapshot: exactSnapshot(revision), teacherRevision: revision, musicXml: xml,
    editorRuntime: runtime, DOMParserCtor: fakeDomParser(),
  })
  assert.deepEqual(commitBasicEditorKeypadAction(context, 'tuplet.triplet', {
    identity: { version: '1.0.0', transactionId: 'tx-a', nextRevisionId: 'rev-a' },
  }), { kind: 'FAIL', code: 'ST_KEYPAD_ACTION_NOT_BASIC' })
  assert.equal(runtime.commitCalls(), 0)

  const failed = commitBasicEditorKeypadAction(context, 'dot.set.1', {
    identity: { version: '1.0.0', transactionId: 'tx-b', nextRevisionId: 'rev-b' },
  })
  assert.equal(failed.kind, 'FAIL')
  assert.equal(failed.code, 'TEST_REJECT')
  assert.equal(runtime.commitCalls(), 1)
  assert.equal(context.productSyncPending, false)
  assert.equal(context.session.history.present.score.revision.id, 'rev-1')
})
