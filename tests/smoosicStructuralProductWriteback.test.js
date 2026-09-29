import test from 'node:test'
import assert from 'node:assert/strict'

import { parseMusicXmlToNotes } from '../src/services/musicEngine.js'
import {
  approveTeacherWorkspace,
  getTeacherWorkspaceApplicableApproval,
  getTeacherWorkspaceCurrentRevision,
} from '../src/services/teacherWorkspaceModel.js'
import { resolvePrDProductMusicXml } from '../src/services/editorPrDRevisionMusicXmlRegistry.js'
import { createSmoosicCeStructIdentityBridge } from '../src/services/smoosicCeStructIdentityBridge.js'
import { SmoosicTestDOMParser, SmoosicTestXMLSerializer } from './support/smoosicXmlDom.js'

globalThis.DOMParser = SmoosicTestDOMParser
globalThis.XMLSerializer = SmoosicTestXMLSerializer

const SOURCE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
<part-list><score-part id="P1"><part-name>Structural</part-name></score-part></part-list>
<part id="P1"><measure number="1">
<attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff><type>eighth</type></note>
<forward><duration>1</duration></forward>
<note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff><type>quarter</type></note>
<note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff><type>half</type></note>
</measure></part></score-partwise>`

const CANDIDATE = SOURCE
  .replace('<duration>1</duration><voice>1</voice><staff>1</staff><type>eighth</type>', '<duration>2</duration><voice>1</voice><staff>1</staff><type>quarter</type>')
  .replace('<forward><duration>1</duration></forward>', '')

const emptyProof = (xml, sourceRevision = 7) => ({
  version: 1,
  sourceRevision,
  rawNoteCount: (xml.match(/<note\b/g) ?? []).length,
  entries: [],
})

function notes(xml) {
  const parsed = parseMusicXmlToNotes(xml)
  assert.equal(Boolean(parsed.error), false)
  return parsed.notes
}

async function rootAuthority() {
  const { createSmoosicProductAuthority } = await import('../src/services/smoosicProductWriteback.js')
  return createSmoosicProductAuthority({
    notes: notes(SOURCE),
    musicXml: SOURCE,
    sourceId: 'ce-bridge-source',
    automaticRevisionId: 'ce-bridge-auto',
    historyId: 'ce-bridge-history',
    actorId: 'teacher-1',
    createdAt: '2026-09-29T12:00:00Z',
  })
}

function fakeRuntime({ projectionOk = true, authorityExpansion = false } = {}) {
  const runtime = {
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
      return Object.freeze({ sourceId, measures: Object.freeze([...measures]), events: Object.freeze([...events]) })
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
    fingerprintScoreGraph() { return 'b'.repeat(64) },
    processSesliTabTeacherStructuralEdit({ scoreGraph, patchSet }) {
      if (!projectionOk) {
        return Object.freeze({
          mode: 'TEACHER_AUTHORIZED_STRUCTURAL_EDIT',
          sourceGraph: scoreGraph,
          patchSet,
          projection: Object.freeze({ ok: false, code: 'STRUCTURAL_PATCH_BEFORE_MISMATCH', graph: scoreGraph }),
          revalidation: null,
          teacherCorrectedRevisionEligible: false,
          automaticApplyAuthority: false,
          finalTeacherApproval: false,
          studentShareEligible: false,
          musicXmlWriteBackAuthority: false,
          learningAuthority: false,
        })
      }
      const patch = patchSet.patches[0]
      const events = scoreGraph.events.map((event) =>
        event.id === patch.eventId
          ? runtime.createScoreEvent({ ...event, duration: patch.after })
          : event
      )
      return Object.freeze({
        mode: 'TEACHER_AUTHORIZED_STRUCTURAL_EDIT',
        sourceGraph: scoreGraph,
        patchSet,
        projection: Object.freeze({
          ok: true,
          code: 'TEACHER_STRUCTURAL_PROJECTED',
          graph: runtime.createScoreGraph({ sourceId: scoreGraph.sourceId, measures: scoreGraph.measures, events }),
        }),
        revalidation: Object.freeze({ integrityDecision: 'PASS' }),
        teacherCorrectedRevisionEligible: true,
        automaticApplyAuthority: authorityExpansion,
        finalTeacherApproval: false,
        studentShareEligible: false,
        musicXmlWriteBackAuthority: false,
        learningAuthority: false,
      })
    },
  }
  return runtime
}

function manifestFor(authority, { sourceRevision = 7 } = {}) {
  const revision = getTeacherWorkspaceCurrentRevision(authority.workspace)
  const identity = createSmoosicCeStructIdentityBridge({
    currentRevision: revision,
    currentMusicXml: SOURCE,
  })
  return {
    version: 1,
    sourceRevision,
    editorSessionId: 'editor-session-1',
    actionId: 'apply-action-1',
    operations: [{
      order: 0,
      operation: 'CHANGE_EVENT_DURATION',
      rawNoteOrdinal: 0,
      staffIndex: 0,
      measureIndex: 0,
      voiceIndex: 0,
      noteIndex: 0,
      noteIdentity: 'smo-note-1',
      before: 1,
      after: 2,
    }],
    baseMappingFingerprint: identity.baseMappingFingerprint,
    createdFromExplicitTeacherApply: true,
  }
}

function structuralArgs(authority, overrides = {}) {
  return {
    authority,
    musicXml: CANDIDATE,
    paddingRestProvenance: emptyProof(CANDIDATE),
    structuralActionManifest: manifestFor(authority),
    ceStructRuntime: fakeRuntime(),
    structuralPatchSetId: 'ce-patchset-1',
    sourceRevision: 7,
    revisionId: 'ce-bridge-edit-1',
    eventId: 'ce-bridge-event-1',
    operationIdPrefix: 'ce-bridge-op',
    createdAt: '2026-09-29T12:01:00Z',
    DOMParserCtor: SmoosicTestDOMParser,
    XMLSerializerCtor: SmoosicTestXMLSerializer,
    ...overrides,
  }
}

test('structural duration Apply commits exactly one immutable teacher-corrected revision after CE conformance', async () => {
  const {
    SMOOSIC_WRITEBACK_STATUS,
    applySmoosicProductWriteback,
  } = await import('../src/services/smoosicProductWriteback.js')
  const original = await rootAuthority()
  const approvedWorkspace = approveTeacherWorkspace({
    workspace: original.workspace,
    approvalId: 'approval-before-structural-edit',
    createdAt: '2026-09-29T12:00:30Z',
  })
  const authority = Object.freeze({ workspace: approvedWorkspace })
  assert.ok(getTeacherWorkspaceApplicableApproval(approvedWorkspace))

  const result = applySmoosicProductWriteback(structuralArgs(authority))

  assert.equal(result.status, SMOOSIC_WRITEBACK_STATUS.APPLIED_STRUCTURAL)
  assert.equal(result.revision.revisionKind, 'teacher_corrected')
  assert.equal(result.revision.revisionId, 'ce-bridge-edit-1')
  assert.equal(result.authority.workspace.history.revisions.length, 2)
  assert.equal(result.revision.content[0].durationValue, 2)
  assert.equal(result.revision.content[0].beats, 1)
  assert.deepEqual(result.changedIndexes, [0])
  assert.equal(resolvePrDProductMusicXml(result.revision)?.musicXml, result.musicXml)
  assert.equal(getTeacherWorkspaceApplicableApproval(result.authority.workspace), null)
  assert.equal(Object.prototype.hasOwnProperty.call(result.revision, 'teacherStructuralCorrectionRevalidation'), false)
})

test('structural failure before commit preserves exact authority and current revision', async () => {
  const {
    SMOOSIC_WRITEBACK_STATUS,
    applySmoosicProductWriteback,
  } = await import('../src/services/smoosicProductWriteback.js')
  const authority = await rootAuthority()
  const current = getTeacherWorkspaceCurrentRevision(authority.workspace)
  const before = JSON.stringify(authority)

  const ceFail = applySmoosicProductWriteback(structuralArgs(authority, {
    ceStructRuntime: fakeRuntime({ projectionOk: false }),
    revisionId: 'must-not-exist-1',
  }))
  assert.equal(ceFail.status, SMOOSIC_WRITEBACK_STATUS.CE_PROJECTION_FAILED)

  const mixed = applySmoosicProductWriteback(structuralArgs(authority, {
    musicXml: CANDIDATE.replace('<step>C</step>', '<step>F</step>'),
    paddingRestProvenance: emptyProof(CANDIDATE.replace('<step>C</step>', '<step>F</step>')),
    revisionId: 'must-not-exist-2',
  }))
  assert.equal(mixed.status, SMOOSIC_WRITEBACK_STATUS.CONFORMANCE_FAILED)

  assert.equal(getTeacherWorkspaceCurrentRevision(authority.workspace), current)
  assert.equal(authority.workspace.history.revisions.length, 1)
  assert.equal(JSON.stringify(authority), before)
  assert.equal(resolvePrDProductMusicXml(current)?.musicXml, SOURCE)
})

test('stale or malformed structural action provenance fails closed before CE', async () => {
  const {
    SMOOSIC_WRITEBACK_STATUS,
    applySmoosicProductWriteback,
  } = await import('../src/services/smoosicProductWriteback.js')
  const authority = await rootAuthority()

  const stale = applySmoosicProductWriteback(structuralArgs(authority, {
    structuralActionManifest: manifestFor(authority, { sourceRevision: 6 }),
  }))
  assert.equal(stale.status, SMOOSIC_WRITEBACK_STATUS.STALE_SOURCE)

  const malformed = applySmoosicProductWriteback(structuralArgs(authority, {
    structuralActionManifest: { version: 1 },
  }))
  assert.equal(malformed.status, SMOOSIC_WRITEBACK_STATUS.INVALID_ACTION_PROVENANCE)

  assert.equal(authority.workspace.history.revisions.length, 1)
})

test('no structural manifest retains the exact existing S15 nonstructural path', async () => {
  const {
    SMOOSIC_WRITEBACK_STATUS,
    applySmoosicProductWriteback,
  } = await import('../src/services/smoosicProductWriteback.js')
  const authority = await rootAuthority()
  const pitchCandidate = SOURCE.replace('<step>C</step>', '<step>G</step>')

  const result = applySmoosicProductWriteback({
    authority,
    musicXml: pitchCandidate,
    paddingRestProvenance: emptyProof(pitchCandidate),
    sourceRevision: 7,
    revisionId: 'legacy-pitch-edit',
    eventId: 'legacy-pitch-event',
    operationIdPrefix: 'legacy-pitch-op',
    DOMParserCtor: SmoosicTestDOMParser,
  })

  assert.equal(result.status, SMOOSIC_WRITEBACK_STATUS.APPLIED)
  assert.deepEqual(result.changedIndexes, [0])
  assert.equal(result.revision.content[0].step, 'G')
})

test('CE authority expansion is rejected before immutable commit', async () => {
  const {
    SMOOSIC_WRITEBACK_STATUS,
    applySmoosicProductWriteback,
  } = await import('../src/services/smoosicProductWriteback.js')
  const authority = await rootAuthority()
  const result = applySmoosicProductWriteback(structuralArgs(authority, {
    ceStructRuntime: fakeRuntime({ authorityExpansion: true }),
    revisionId: 'must-not-exist-authority',
  }))
  assert.equal(result.status, SMOOSIC_WRITEBACK_STATUS.CE_CONTRACT_MISMATCH)
  assert.equal(authority.workspace.history.revisions.length, 1)
})
