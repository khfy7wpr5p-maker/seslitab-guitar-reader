import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SmoosicTestDOMParser } from './support/smoosicXmlDom.js'
import { createSmoosicCeStructIdentityBridge } from '../src/services/smoosicCeStructIdentityBridge.js'

globalThis.DOMParser = SmoosicTestDOMParser

const moduleUrl = new URL('../src/services/smoosicCeStructBridge.js', import.meta.url)

async function api() {
  assert.equal(existsSync(fileURLToPath(moduleUrl)), true)
  return import(moduleUrl)
}

const xml = `<score-partwise version="4.0">
<part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>8</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff><type>eighth</type></note>
<forward><duration>4</duration></forward>
<note><pitch><step>D</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><staff>1</staff><type>quarter</type></note>
</measure></part></score-partwise>`

function revision() {
  return {
    revisionId: 'rev-1',
    sourceId: 'source-1',
    content: [
      {
        partId: 'P1', partIndex: 0, measureIndex: 0, measureKey: 'P1:0',
        voice: 1, staff: 1, isRest: false, isChordNote: false, durationValue: 4,
      },
      {
        partId: 'P1', partIndex: 0, measureIndex: 0, measureKey: 'P1:0',
        voice: 1, staff: 1, isRest: false, isChordNote: false, durationValue: 8,
      },
    ],
  }
}

function fakeRuntime() {
  let lastProcessInput = null
  const runtime = {
    contract: 'ST_OMR_CORRECTION_ENGINE_CE_STRUCT_BROWSER',
    contractVersion: '1.0.0',
    runtimeVersion: '1.0.0',
    patchSchemaVersion: 'teacher-structural-patch-set-v1',
    createMeasure(value) {
      return Object.freeze({
        ...value,
        expectedQuarterBeats: value.beats * (4 / value.beatType),
      })
    },
    createScoreEvent(value) {
      return Object.freeze({ ...value, end: value.onset + value.duration })
    },
    createScoreGraph({ measures, events, sourceId }) {
      return Object.freeze({
        sourceId,
        measures: Object.freeze([...measures]),
        events: Object.freeze([...events]),
      })
    },
    createTeacherEditAuthorization({ actionId }) {
      return Object.freeze({ mode: 'EXPLICIT_TEACHER_EDIT', actionId })
    },
    createTeacherStructuralPatch(value) {
      return Object.freeze({ eventIndex: null, ...value })
    },
    createTeacherStructuralPatchSet(value) {
      return Object.freeze({
        schemaVersion: 'teacher-structural-patch-set-v1',
        ...value,
        automaticApplyAuthority: false,
        finalTeacherApproval: false,
        studentShareEligible: false,
      })
    },
    fingerprintScoreGraph() {
      return 'a'.repeat(64)
    },
    processSesliTabTeacherStructuralEdit(input) {
      lastProcessInput = input
      const patch = input.patchSet.patches[0]
      const events = input.scoreGraph.events.map((event) =>
        event.id === patch.eventId
          ? runtime.createScoreEvent({ ...event, duration: patch.after })
          : event
      )
      const graph = runtime.createScoreGraph({
        sourceId: input.scoreGraph.sourceId,
        measures: input.scoreGraph.measures,
        events,
      })
      return Object.freeze({
        mode: 'TEACHER_AUTHORIZED_STRUCTURAL_EDIT',
        sourceGraph: input.scoreGraph,
        patchSet: input.patchSet,
        projection: Object.freeze({ ok: true, code: 'TEACHER_STRUCTURAL_PROJECTED', graph }),
        revalidation: Object.freeze({ integrityDecision: 'PASS' }),
        teacherCorrectedRevisionEligible: true,
        automaticApplyAuthority: false,
        finalTeacherApproval: false,
        studentShareEligible: false,
        musicXmlWriteBackAuthority: false,
        learningAuthority: false,
      })
    },
    get lastProcessInput() { return lastProcessInput },
  }
  return runtime
}

function manifest(identity) {
  return {
    version: 1,
    sourceRevision: 7,
    editorSessionId: 'session-1',
    actionId: 'apply-1',
    operations: [{
      order: 0,
      operation: 'CHANGE_EVENT_DURATION',
      rawNoteOrdinal: 0,
      staffIndex: 0,
      measureIndex: 0,
      voiceIndex: 0,
      noteIndex: 0,
      noteIdentity: 'editor-a',
      before: 4,
      after: 8,
    }],
    baseMappingFingerprint: identity.baseMappingFingerprint,
    createdFromExplicitTeacherApply: true,
  }
}

test('CE bridge admits only the exact reviewed runtime contract', async () => {
  const { resolveCeStructRuntime } = await api()
  const runtime = fakeRuntime()
  assert.equal(resolveCeStructRuntime({ STOmrCorrectionCeStructRuntime: runtime }), runtime)

  const wrong = { ...runtime, contract: 'OTHER' }
  assert.equal(resolveCeStructRuntime({ STOmrCorrectionCeStructRuntime: wrong }), null)

  const missing = { ...runtime }
  delete missing.processSesliTabTeacherStructuralEdit
  assert.equal(resolveCeStructRuntime({ STOmrCorrectionCeStructRuntime: missing }), null)
})

test('base ScoreGraph uses quarter-beat timing and exact immutable identities', async () => {
  const { buildCeStructBaseGraph } = await api()
  const currentRevision = revision()
  const identityBridge = createSmoosicCeStructIdentityBridge({
    currentRevision,
    currentMusicXml: xml,
  })
  const graph = buildCeStructBaseGraph({
    currentRevision,
    currentMusicXml: xml,
    identityBridge,
    runtime: fakeRuntime(),
  })

  assert.equal(graph.sourceId, 'source-1')
  assert.deepEqual(
    graph.measures.map(({ key, beats, beatType, implicit, pickup }) =>
      ({ key, beats, beatType, implicit, pickup })),
    [{ key: 'P1:0', beats: 4, beatType: 4, implicit: false, pickup: false }],
  )
  assert.equal(graph.events[0].id, 'seslitab:rev-1:event:0')
  assert.equal(graph.events[0].onset, 0)
  assert.equal(graph.events[0].duration, 0.5)
  assert.equal(graph.events[1].onset, 1)
  assert.equal(graph.events[1].duration, 1)
})

test('explicit duration action is converted to CE units and independently revalidated', async () => {
  const { processSmoosicStructuralEdit } = await api()
  const currentRevision = revision()
  const identityBridge = createSmoosicCeStructIdentityBridge({
    currentRevision,
    currentMusicXml: xml,
  })
  const runtime = fakeRuntime()
  const result = processSmoosicStructuralEdit({
    runtime,
    currentRevision,
    currentMusicXml: xml,
    manifest: manifest(identityBridge),
    identityBridge,
    ids: { patchSetId: 'patch-set-1' },
  })

  assert.equal(result.ok, true)
  assert.equal(result.status, 'CE_REVALIDATED')
  assert.equal(result.patchSet.baseGraphFingerprint, 'a'.repeat(64))
  assert.equal(result.patchSet.authorization.actionId, 'apply-1')
  assert.equal(result.patchSet.patches.length, 1)
  assert.equal(result.patchSet.patches[0].before, 0.5)
  assert.equal(result.patchSet.patches[0].after, 1)
  assert.equal(result.projectedGraph.events[0].duration, 1)
  for (const field of [
    'automaticApplyAuthority',
    'finalTeacherApproval',
    'studentShareEligible',
    'musicXmlWriteBackAuthority',
    'learningAuthority',
  ]) {
    assert.equal(result.engineResult[field], false)
  }
})

test('CE bridge fails closed on stale before-state, projection failure and authority expansion', async () => {
  const { processSmoosicStructuralEdit } = await api()
  const currentRevision = revision()
  const identityBridge = createSmoosicCeStructIdentityBridge({
    currentRevision,
    currentMusicXml: xml,
  })

  const stale = manifest(identityBridge)
  stale.operations[0].before = 99
  assert.equal(processSmoosicStructuralEdit({
    runtime: fakeRuntime(), currentRevision, currentMusicXml: xml,
    manifest: stale, identityBridge, ids: { patchSetId: 'stale' },
  }).status, 'STALE_SOURCE')

  const projectionRuntime = fakeRuntime()
  projectionRuntime.processSesliTabTeacherStructuralEdit = (input) => ({
    mode: 'TEACHER_AUTHORIZED_STRUCTURAL_EDIT',
    sourceGraph: input.scoreGraph,
    patchSet: input.patchSet,
    projection: { ok: false, code: 'STRUCTURAL_PATCH_BEFORE_MISMATCH', graph: input.scoreGraph },
    revalidation: null,
    teacherCorrectedRevisionEligible: false,
    automaticApplyAuthority: false,
    finalTeacherApproval: false,
    studentShareEligible: false,
    musicXmlWriteBackAuthority: false,
    learningAuthority: false,
  })
  assert.equal(processSmoosicStructuralEdit({
    runtime: projectionRuntime, currentRevision, currentMusicXml: xml,
    manifest: manifest(identityBridge), identityBridge, ids: { patchSetId: 'projection-fail' },
  }).status, 'CE_PROJECTION_FAILED')

  const authorityRuntime = fakeRuntime()
  authorityRuntime.processSesliTabTeacherStructuralEdit = (input) => ({
    mode: 'TEACHER_AUTHORIZED_STRUCTURAL_EDIT',
    sourceGraph: input.scoreGraph,
    patchSet: input.patchSet,
    projection: { ok: true, graph: input.scoreGraph },
    revalidation: { integrityDecision: 'PASS' },
    teacherCorrectedRevisionEligible: true,
    automaticApplyAuthority: true,
    finalTeacherApproval: false,
    studentShareEligible: false,
    musicXmlWriteBackAuthority: false,
    learningAuthority: false,
  })
  assert.equal(processSmoosicStructuralEdit({
    runtime: authorityRuntime, currentRevision, currentMusicXml: xml,
    manifest: manifest(identityBridge), identityBridge, ids: { patchSetId: 'authority-fail' },
  }).status, 'CE_CONTRACT_MISMATCH')
})
