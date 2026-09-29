import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SmoosicTestDOMParser } from './support/smoosicXmlDom.js'
import { createSmoosicCeStructIdentityBridge } from '../src/services/smoosicCeStructIdentityBridge.js'
import { buildCeStructBaseGraph } from '../src/services/smoosicCeStructBridge.js'

globalThis.DOMParser = SmoosicTestDOMParser

const moduleUrl = new URL('../src/services/smoosicCeStructConformance.js', import.meta.url)

async function api() {
  assert.equal(existsSync(fileURLToPath(moduleUrl)), true)
  return import(moduleUrl)
}

function runtime() {
  return {
    contract: 'ST_OMR_CORRECTION_ENGINE_CE_STRUCT_BROWSER',
    contractVersion: '1.0.0',
    runtimeVersion: '1.0.0',
    patchSchemaVersion: 'teacher-structural-patch-set-v1',
    createMeasure(value) {
      return Object.freeze({ ...value, expectedQuarterBeats: value.beats * (4 / value.beatType) })
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
    createTeacherEditAuthorization() {},
    createTeacherStructuralPatch() {},
    createTeacherStructuralPatchSet() {},
    fingerprintScoreGraph() { return 'a'.repeat(64) },
    processSesliTabTeacherStructuralEdit() {},
  }
}

const sourceXml = `<score-partwise version="4.0">
<part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>8</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff><type>eighth</type></note>
<forward><duration>4</duration></forward>
<note><pitch><step>D</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><staff>1</staff><type>quarter</type></note>
</measure></part></score-partwise>`

function candidate({
  divisions = 8,
  firstDuration = divisions,
  firstStep = 'C',
  firstVoice = 1,
  firstStaff = 1,
  between = '',
  meterBeats = 4,
  tie = '',
  includeSecond = true,
  extra = '',
} = {}) {
  return `<score-partwise version="4.0">
<part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>${divisions}</divisions><time><beats>${meterBeats}</beats><beat-type>4</beat-type></time></attributes>
<note><pitch><step>${firstStep}</step><octave>4</octave></pitch><duration>${firstDuration}</duration><voice>${firstVoice}</voice><staff>${firstStaff}</staff><type>quarter</type>${tie}</note>
${between}
${includeSecond ? `<note><pitch><step>D</step><octave>4</octave></pitch><duration>${divisions}</duration><voice>1</voice><staff>1</staff><type>quarter</type></note>` : ''}
${extra}
</measure></part></score-partwise>`
}

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

function context() {
  const currentRevision = revision()
  const identityBridge = createSmoosicCeStructIdentityBridge({
    currentRevision,
    currentMusicXml: sourceXml,
  })
  const ce = runtime()
  const baseGraph = buildCeStructBaseGraph({
    currentRevision,
    currentMusicXml: sourceXml,
    identityBridge,
    runtime: ce,
  })
  const first = baseGraph.events[0]
  const projectedGraph = ce.createScoreGraph({
    sourceId: baseGraph.sourceId,
    measures: baseGraph.measures,
    events: [
      ce.createScoreEvent({ ...first, duration: 1 }),
      baseGraph.events[1],
    ],
  })
  const manifest = {
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
    baseMappingFingerprint: identityBridge.baseMappingFingerprint,
    createdFromExplicitTeacherApply: true,
  }
  return { ce, baseGraph, projectedGraph, identityBridge, manifest }
}

async function assertCandidateFails(xml, expected = /conformance|identity|candidate|structure/i) {
  const { buildCandidateCeStructGraph, verifyCeStructCandidateConformance } = await api()
  const ctx = context()
  assert.throws(() => {
    const candidateGraph = buildCandidateCeStructGraph({
      candidateMusicXml: xml,
      baseGraph: ctx.baseGraph,
      identityBridge: ctx.identityBridge,
      manifest: ctx.manifest,
      runtime: ctx.ce,
    })
    verifyCeStructCandidateConformance({
      projectedGraph: ctx.projectedGraph,
      candidateGraph,
    })
  }, expected)
}

test('candidate duration-only result exactly conforms to the CE projected graph', async () => {
  const { buildCandidateCeStructGraph, verifyCeStructCandidateConformance } = await api()
  const ctx = context()
  const candidateGraph = buildCandidateCeStructGraph({
    candidateMusicXml: candidate(),
    baseGraph: ctx.baseGraph,
    identityBridge: ctx.identityBridge,
    manifest: ctx.manifest,
    runtime: ctx.ce,
  })
  assert.equal(candidateGraph.events[0].duration, 1)
  assert.equal(candidateGraph.events[1].onset, 1)
  assert.equal(verifyCeStructCandidateConformance({
    projectedGraph: ctx.projectedGraph,
    candidateGraph,
  }), true)
})

test('representation-only divisions changes pass when the semantic graph is identical', async () => {
  const { buildCandidateCeStructGraph, verifyCeStructCandidateConformance } = await api()
  const ctx = context()
  const candidateGraph = buildCandidateCeStructGraph({
    candidateMusicXml: candidate({ divisions: 16, firstDuration: 16 }),
    baseGraph: ctx.baseGraph,
    identityBridge: ctx.identityBridge,
    manifest: ctx.manifest,
    runtime: ctx.ce,
  })
  assert.equal(candidateGraph.events[0].duration, 1)
  assert.equal(candidateGraph.events[1].duration, 1)
  assert.equal(verifyCeStructCandidateConformance({
    projectedGraph: ctx.projectedGraph,
    candidateGraph,
  }), true)
})

test('undeclared pitch, voice, staff, tie, onset and meter changes fail closed', async () => {
  await assertCandidateFails(candidate({ firstStep: 'E' }))
  await assertCandidateFails(candidate({ firstVoice: 2 }))
  await assertCandidateFails(candidate({ firstStaff: 2 }))
  await assertCandidateFails(candidate({ tie: '<tie type="start"/>' }))
  await assertCandidateFails(candidate({ between: '<forward><duration>4</duration></forward>' }))
  await assertCandidateFails(candidate({ meterBeats: 3 }))
})

test('missing or extra event identity fails closed without ordinal fallback', async () => {
  await assertCandidateFails(candidate({ includeSecond: false }))
  await assertCandidateFails(candidate({
    extra: '<note><pitch><step>E</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><staff>1</staff><type>quarter</type></note>',
  }))
})

test('mixed pitch plus declared duration is rejected rather than split into S15 and CE', async () => {
  await assertCandidateFails(candidate({ firstStep: 'F' }))
})
