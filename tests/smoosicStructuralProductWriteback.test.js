import test from 'node:test'
import assert from 'node:assert/strict'
import '../scripts/runOmrQualityReport.js'

import { parseMusicXmlToNotes } from '../src/services/musicEngine.js'
import {
  approveTeacherWorkspace,
  getTeacherWorkspaceApplicableApproval,
  getTeacherWorkspaceCurrentRevision,
} from '../src/services/teacherWorkspaceModel.js'
import { resolvePrDProductMusicXml } from '../src/services/editorPrDRevisionMusicXmlRegistry.js'
import { createSmoosicCeStructIdentityBridge } from '../src/services/smoosicCeStructIdentityBridge.js'
import {
  SMOOSIC_WRITEBACK_STATUS,
  applySmoosicProductWriteback,
  createSmoosicProductAuthority,
} from '../src/services/smoosicProductWriteback.js'
import { SmoosicTestDOMParser, SmoosicTestXMLSerializer } from './support/smoosicXmlDom.js'

globalThis.DOMParser = SmoosicTestDOMParser
globalThis.XMLSerializer = SmoosicTestXMLSerializer

const SOURCE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Structural</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff><type>quarter</type></note>
    <forward><duration>1</duration></forward>
    <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff><type>half</type></note>
  </measure></part>
</score-partwise>`

const CANDIDATE_XML = SOURCE_XML
  .replace(
    '<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff><type>quarter</type></note>\n    <forward><duration>1</duration></forward>',
    '<note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff><type>half</type></note>',
  )

function notes(xml) {
  const parsed = parseMusicXmlToNotes(xml)
  assert.equal(parsed.error, undefined)
  return parsed.notes
}

function paddingProof(xml, sourceRevision = 7) {
  return {
    version: 1,
    sourceRevision,
    rawNoteCount: (xml.match(/<note\b/g) ?? []).length,
    entries: [],
  }
}

function runtime() {
  let lastInput = null
  const api = {
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
      lastInput = input
      const patch = input.patchSet.patches[0]
      const events = input.scoreGraph.events.map((event) =>
        event.id === patch.eventId
          ? api.createScoreEvent({ ...event, duration: patch.after })
          : event
      )
      const graph = api.createScoreGraph({
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
    get lastInput() { return lastInput },
  }
  return api
}

function rootAuthority() {
  return createSmoosicProductAuthority({
    notes: notes(SOURCE_XML),
    musicXml: SOURCE_XML,
    sourceId: 'struct-source-1',
    automaticRevisionId: 'struct-auto-1',
    historyId: 'struct-history-1',
    actorId: 'smoosic-local-editor',
    createdAt: '2026-09-29T16:40:00Z',
  })
}

function manifestFor(authority) {
  const currentRevision = getTeacherWorkspaceCurrentRevision(authority.workspace)
  const identity = createSmoosicCeStructIdentityBridge({
    currentRevision,
    currentMusicXml: SOURCE_XML,
  })
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
      noteIdentity: 'editor-note-1',
      before: 1,
      after: 2,
    }],
    baseMappingFingerprint: identity.baseMappingFingerprint,
    createdFromExplicitTeacherApply: true,
  }
}

function applyStructural(authority, overrides = {}) {
  return applySmoosicProductWriteback({
    authority,
    musicXml: CANDIDATE_XML,
    paddingRestProvenance: paddingProof(CANDIDATE_XML),
    structuralActionManifest: manifestFor(authority),
    ceStructRuntime: runtime(),
    sourceRevision: 7,
    revisionId: 'struct-edit-1',
    eventId: 'struct-event-1',
    operationIdPrefix: 'struct-op-1',
    structuralPatchSetId: 'struct-patch-set-1',
    createdAt: '2026-09-29T16:41:00Z',
    DOMParserCtor: SmoosicTestDOMParser,
    XMLSerializerCtor: SmoosicTestXMLSerializer,
    ...overrides,
  })
}

test('CE + conformance PASS commits exactly one immutable teacher-corrected structural revision', () => {
  const root = rootAuthority()
  const approvedWorkspace = approveTeacherWorkspace({
    workspace: root.workspace,
    approvalId: 'approval-before-structural-edit',
    createdAt: '2026-09-29T16:40:30Z',
  })
  const authority = Object.freeze({ workspace: approvedWorkspace })
  const before = getTeacherWorkspaceCurrentRevision(authority.workspace)

  const result = applyStructural(authority)

  assert.equal(result.status, SMOOSIC_WRITEBACK_STATUS.APPLIED_STRUCTURAL)
  assert.equal(result.revision.revisionKind, 'teacher_corrected')
  assert.equal(result.revision.parentRevisionId, before.revisionId)
  assert.equal(result.authority.workspace.history.revisions.length, 2)
  assert.equal(result.authority.workspace.history.correctionAuditEvents.length, 1)
  assert.equal(result.revision.content[0].durationValue, 2)
  assert.equal(result.revision.content[0].beats, 2)
  assert.deepEqual(result.changedIndexes, [0])
  assert.equal(result.musicXml, CANDIDATE_XML)
  assert.equal(resolvePrDProductMusicXml(result.revision)?.musicXml, CANDIDATE_XML)
  assert.equal(getTeacherWorkspaceApplicableApproval(result.authority.workspace), null)
  assert.equal(authority.workspace.history.revisions.length, 1)
  assert.equal(resolvePrDProductMusicXml(before)?.musicXml, SOURCE_XML)
  assert.equal(Object.hasOwn(result, 'studentShareEligible'), false)
  assert.equal(Object.hasOwn(result, 'teacherStructuralRevalidation'), false)
})

test('structural failure before commit preserves exact authority and registered source revision', () => {
  const root = rootAuthority()
  const current = getTeacherWorkspaceCurrentRevision(root.workspace)
  const before = JSON.stringify(root)
  const badRuntime = runtime()
  badRuntime.processSesliTabTeacherStructuralEdit = () => ({
    automaticApplyAuthority: false,
    finalTeacherApproval: false,
    studentShareEligible: false,
    musicXmlWriteBackAuthority: false,
    learningAuthority: false,
    projection: { ok: false, code: 'STRUCTURAL_PATCH_BEFORE_MISMATCH' },
  })

  const result = applyStructural(root, { ceStructRuntime: badRuntime })

  assert.equal(result.status, SMOOSIC_WRITEBACK_STATUS.CE_PROJECTION_FAILED)
  assert.equal(result.authority, root)
  assert.equal(JSON.stringify(root), before)
  assert.equal(getTeacherWorkspaceCurrentRevision(root.workspace), current)
  assert.equal(root.workspace.history.revisions.length, 1)
  assert.equal(resolvePrDProductMusicXml(current)?.musicXml, SOURCE_XML)
})

test('malformed action provenance fails closed before immutable commit', () => {
  const root = rootAuthority()
  const malformed = { ...manifestFor(root), createdFromExplicitTeacherApply: false }
  const result = applyStructural(root, { structuralActionManifest: malformed })

  assert.equal(result.status, SMOOSIC_WRITEBACK_STATUS.INVALID_ACTION_PROVENANCE)
  assert.equal(result.authority, root)
  assert.equal(root.workspace.history.revisions.length, 1)
})

test('no structural manifest remains on the existing S15 nonstructural APPLIED lane', () => {
  const root = rootAuthority()
  const pitchCandidate = SOURCE_XML.replace('<step>C</step>', '<step>G</step>')
  const result = applySmoosicProductWriteback({
    authority: root,
    musicXml: pitchCandidate,
    paddingRestProvenance: paddingProof(pitchCandidate),
    sourceRevision: 7,
    revisionId: 'pitch-edit-1',
    eventId: 'pitch-event-1',
    operationIdPrefix: 'pitch-op-1',
    createdAt: '2026-09-29T16:42:00Z',
    DOMParserCtor: SmoosicTestDOMParser,
    XMLSerializerCtor: SmoosicTestXMLSerializer,
  })

  assert.equal(result.status, SMOOSIC_WRITEBACK_STATUS.APPLIED)
  assert.equal(result.revision.revisionKind, 'teacher_corrected')
})


test('mixed pitch plus declared duration fails conformance before immutable commit', () => {
  const root = rootAuthority()
  const mixed = CANDIDATE_XML.replace('<step>C</step>', '<step>E</step>')
  const result = applyStructural(root, { musicXml: mixed, paddingRestProvenance: paddingProof(mixed) })

  assert.equal(result.status, SMOOSIC_WRITEBACK_STATUS.CONFORMANCE_FAILED)
  assert.equal(result.authority, root)
  assert.equal(root.workspace.history.revisions.length, 1)
})

test('missing CE runtime fails closed before immutable commit', () => {
  const root = rootAuthority()
  const result = applyStructural(root, { ceStructRuntime: null })

  assert.equal(result.status, SMOOSIC_WRITEBACK_STATUS.CE_RUNTIME_UNAVAILABLE)
  assert.equal(result.authority, root)
  assert.equal(root.workspace.history.revisions.length, 1)
})


test('invalid immutable commit identity returns typed CONFLICT without mutation', () => {
  const root = rootAuthority()
  const current = getTeacherWorkspaceCurrentRevision(root.workspace)
  const before = JSON.stringify(root)

  const result = applyStructural(root, { revisionId: '' })

  assert.equal(result.status, SMOOSIC_WRITEBACK_STATUS.CONFLICT)
  assert.equal(result.authority, root)
  assert.equal(JSON.stringify(root), before)
  assert.equal(getTeacherWorkspaceCurrentRevision(root.workspace), current)
  assert.equal(root.workspace.history.revisions.length, 1)
  assert.equal(resolvePrDProductMusicXml(current)?.musicXml, SOURCE_XML)
})
